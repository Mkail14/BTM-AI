import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError, buildSystemPrompt, getAIProvider } from "@/lib/ai";
import { knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { ALL_APIS_CUT, flowCutStop, loadFlowCuts } from "@/lib/ai/flow-cuts";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { parseSiteReply, SITE_IDS, SITES, siteInstructions, type SiteId } from "@/lib/ai/sites";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import type { ChatTurn } from "@/lib/chat/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Awa pour les autres sites de GROUPE BTM (appel de serveur à serveur, par
 * exemple la fonction Supabase « assistant » de btm.yt). Même cerveau, même
 * personnalité et mêmes API que le chat de BTM AI ; le site garde ses
 * conversations, Awa ne fait que répondre. Rien n'est enregistré ici.
 */
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;

const requestSchema = z.strictObject({
  site: z.enum(SITE_IDS),
  messages: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
  /** Offres, fournisseurs… du site, au moment de la question. */
  data: z.string().max(30_000).optional(),
  page: z.string().max(200).optional(),
  clientName: z.string().max(80).optional(),
  /** Un conseiller humain a déjà été prévenu : Awa peut seulement annuler la demande. */
  waitingForAdvisor: z.boolean().optional(),
});

const digest = (value: string) => createHash("sha256").update(value).digest();

const CACHE_MS = 60_000;
const hashes = new Map<SiteId, { hash: Buffer | null; expiresAt: number }>();

/** Empreinte SHA-256 du secret du site (table awa_partner_keys, lisible par le serveur seulement). */
async function partnerHash(site: SiteId): Promise<Buffer | null> {
  const cached = hashes.get(site);
  if (cached && cached.expiresAt > Date.now()) return cached.hash;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("awa_partner_keys").select("secret_hash").eq("site", site).maybeSingle();
  if (error) console.error("[awa] Secrets des sites illisibles (migration awa_partner_keys appliquée ?)", error);
  const hash = typeof data?.secret_hash === "string" && /^[0-9a-f]{64}$/.test(data.secret_hash) ? Buffer.from(data.secret_hash, "hex") : null;
  hashes.set(site, { hash, expiresAt: Date.now() + CACHE_MS });
  return hash;
}

/** Secret partagé avec le site appelant ; sans secret enregistré pour ce site, la route lui est fermée. */
async function authorized(request: NextRequest, site: SiteId): Promise<boolean> {
  const expected = await partnerHash(site);
  if (!expected) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  return timingSafeEqual(digest(given), expected);
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Alternance stricte : messages consécutifs du même côté réunis, début et fin côté client. */
function toModelTurns(messages: readonly ChatTurn[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const last = turns.at(-1);
    if (last?.role === m.role) last.content += `\n\n${m.content}`;
    else turns.push({ ...m });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  while (turns.at(-1)?.role === "assistant") turns.pop();
  // Les échanges les plus récents d'abord, dans la limite du contexte du modèle.
  let total = 0;
  let start = turns.length;
  while (start > 0 && total + turns[start - 1].content.length <= CHAT_LIMITS.modelContextMaxChars) {
    total += turns[--start].content.length;
  }
  while (turns[start]?.role === "assistant") start++;
  return turns.slice(start);
}

export async function POST(request: NextRequest) {
  // Le site est lu avant tout, pour vérifier son secret ; rien n'est tracé avant cette vérification.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "invalid_request");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_request");
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "invalid_request");
  const body = parsed.data;
  if (!(await authorized(request, body.site))) return fail(401, "unauthorized");

  const flow = startFlowTrace();
  // Lien coupé sur le schéma de /admin/modele-ia : le message s'arrête là.
  const cuts = await loadFlowCuts();
  const cutAt = flowCutStop(cuts);
  if (cutAt) {
    flow.step(cutAt, false, "lien coupé");
    return fail(503, "flow_cut");
  }
  const ai = await getAIProvider(cuts);
  if (!ai.ok) {
    console.error(`[awa] Fournisseur d'IA non configuré : ${ai.reason}`);
    const cut = ai.reason === ALL_APIS_CUT;
    flow.step("input", false, cut ? "lien coupé" : "aucune API configurée");
    return fail(503, cut ? "flow_cut" : "ai_not_configured");
  }

  const messages = toModelTurns(body.messages);
  const question = messages.at(-1);
  if (!question) {
    flow.step("input", false, "aucun message du client");
    return fail(400, "invalid_request");
  }
  flow.step("input", true, body.site);
  // Le quota par visiteur est tenu par le site appelant (il connaît l'adresse du client).
  flow.step("guard", true);

  // Personnalité professionnelle : celle des visiteurs de BTM AI, réglée depuis /admin/personnalites.
  const [brain, personalityInstructions] = await Promise.all([
    loadAwaBrain(),
    loadPersonalityInstructions(DEFAULT_PERSONALITY),
  ]);
  const waitingForAdvisor = Boolean(body.waitingForAdvisor);
  const details = [
    body.page && `Page consultée par le client : ${body.page.replace(/\s+/g, " ")}.`,
    body.clientName && `Le client s'appelle ${body.clientName.replace(/\s+/g, " ")}.`,
  ].filter(Boolean);
  const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
    personalityInstructions,
    name: brain.name,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, DEFAULT_PERSONALITY),
    words: wordsFor(brain, question.content),
    knowledge: knowledgeFor(brain, question.content),
    site: {
      intro: SITES[body.site].intro,
      instructions: siteInstructions(body.site, { waitingForAdvisor }),
      data: [body.data, ...details].filter(Boolean).join("\n\n"),
    },
  });
  flow.step("prompt", true);

  let text = "";
  let answeredBy: string | null = null;
  try {
    for await (const chunk of ai.provider.stream({
      system,
      messages,
      maxOutputTokens: Math.min(ai.config.maxOutputTokens, 1024),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(ai.config.timeoutMs, 40_000))]),
      onAttempt: (slotId, error) => {
        if (!error) answeredBy = slotId;
        flow.step(`model-${slotId}`, !error, error ? (AI_ERROR_LABELS[error] ?? error) : undefined);
      },
    })) {
      if (chunk.type === "text") text += chunk.text;
    }
  } catch (error) {
    const code = error instanceof AIProviderError ? error.code : "unavailable";
    console.error(`[awa] Erreur du fournisseur (${code})`, error);
    if (answeredBy) flow.step("output", false, "réponse interrompue");
    // quota : toutes les API sont à court de crédits ; le site prévient alors son conseiller.
    return NextResponse.json({ error: code === "quota" || code === "rate_limited" ? "quota" : "provider_error" }, { status: 502 });
  }

  const reply = parseSiteReply(text, { waitingForAdvisor });
  if (!reply.text && !reply.action) {
    flow.step("output", false, "réponse vide");
    return fail(502, "provider_error");
  }
  flow.step("output", true);
  return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
}
