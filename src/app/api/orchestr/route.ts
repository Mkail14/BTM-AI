import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError, buildSystemPrompt, getAIProvider } from "@/lib/ai";
import { knowledgeFor, lexiconFor, loadTamilyaBrain, wordsFor } from "@/lib/ai/brain";
import { ALL_APIS_CUT, flowCutStop, loadFlowCuts } from "@/lib/ai/flow-cuts";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { ORCHESTR_LIMITS, toOrchestrTurns } from "@/lib/ai/orchestr";
import { isPartnerRequest } from "@/lib/ai/partner-key";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { SITES, siteInstructions } from "@/lib/ai/sites";

/**
 * API de Tamilya réservée à Orchestr AI, la messagerie privée du patron de
 * GROUPE BTM (appel de serveur à serveur, secret du site « orchestr-ai »).
 * Même cerveau et même personnalité que partout ailleurs, mais sans quota :
 * ni nombre de messages par minute ou par jour, ni longueur maximale d'un
 * message, ni réponse raccourcie. Les seules bornes sont techniques
 * (ORCHESTR_LIMITS). La réponse est renvoyée brute : ses balises (validation,
 * « je te laisse gérer ») sont lues par Orchestr AI. Rien n'est enregistré ici.
 */
export const maxDuration = 300;

const SITE = "orchestr-ai";
/** Un peu moins que maxDuration, pour rendre une erreur lisible plutôt qu'une coupure. */
const ANSWER_TIMEOUT_MS = 280_000;

const requestSchema = z.object({
  messages: z.array(z.strictObject({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1) })).min(1),
  /** Outils d'Orchestr AI (nom et rôle), au moment de la question. */
  data: z.string().optional(),
});

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  // Le secret est vérifié avant tout : rien n'est lu ni tracé sans lui.
  if (!(await isPartnerRequest(request, SITE))) return fail(401, "unauthorized");

  const raw = await request.text();
  if (raw.length > ORCHESTR_LIMITS.bodyChars) return fail(413, "too_large");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_request");
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "invalid_request");
  const body = parsed.data;

  const flow = startFlowTrace();
  // Lien coupé sur le schéma de /admin/circuit : le message s'arrête là, ici aussi.
  const cuts = await loadFlowCuts();
  const cutAt = flowCutStop(cuts);
  if (cutAt) {
    flow.step(cutAt, false, "lien coupé");
    return fail(503, "flow_cut");
  }
  const ai = await getAIProvider(cuts);
  if (!ai.ok) {
    console.error(`[orchestr] Fournisseur d'IA non configuré : ${ai.reason}`);
    const cut = ai.reason === ALL_APIS_CUT;
    flow.step("input", false, cut ? "lien coupé" : "aucune API configurée");
    return fail(503, cut ? "flow_cut" : "ai_not_configured");
  }

  const messages = toOrchestrTurns(body.messages);
  const question = messages.at(-1);
  if (!question) {
    flow.step("input", false, "aucun message du patron");
    return fail(400, "invalid_request");
  }
  flow.step("input", true, SITE);
  // Pas de quota : une seule personne écrit ici, et le secret du site garde la porte.
  flow.step("guard", true);

  const [brain, personalityInstructions] = await Promise.all([
    loadTamilyaBrain(),
    loadPersonalityInstructions(DEFAULT_PERSONALITY),
  ]);
  const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
    personalityInstructions,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, DEFAULT_PERSONALITY),
    grammar: brain.grammar,
    words: wordsFor(brain, question.content),
    knowledge: knowledgeFor(brain, question.content),
    site: { intro: SITES[SITE].intro, instructions: siteInstructions(SITE), data: body.data },
  });
  flow.step("prompt", true);

  let text = "";
  let answeredBy: string | null = null;
  try {
    for await (const chunk of ai.provider.stream({
      system,
      messages,
      persona: true,
      maxOutputTokens: ai.config.maxOutputTokens,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(ANSWER_TIMEOUT_MS)]),
      onAttempt: (slotId, error) => {
        if (!error) answeredBy = slotId;
        flow.step(`model-${slotId}`, !error, error ? (AI_ERROR_LABELS[error] ?? error) : undefined);
      },
    })) {
      if (chunk.type === "text") text += chunk.text;
    }
  } catch (error) {
    const code = error instanceof AIProviderError ? error.code : "unavailable";
    console.error(`[orchestr] Erreur du fournisseur (${code})`, error);
    if (answeredBy) flow.step("output", false, "réponse interrompue");
    // quota : le crédit de l'API d'IA elle-même est épuisé (ce n'est pas une limite de cette route).
    return fail(502, code === "quota" || code === "rate_limited" ? "quota" : "provider_error");
  }

  if (!text.trim()) {
    flow.step("output", false, "réponse vide");
    return fail(502, "provider_error");
  }
  flow.step("output", true);
  return NextResponse.json({ text: text.trim() }, { headers: { "Cache-Control": "no-store" } });
}
