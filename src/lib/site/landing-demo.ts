import "server-only";
import { createHash } from "node:crypto";
import { buildSystemPrompt, getAIProvider } from "@/lib/ai";
import { glossFor, knownTranslations, lexiconFor, loadAwaBrain, wordsFor, type AwaBrain } from "@/lib/ai/brain";
import { completeText } from "@/lib/ai/complete";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { enforceShimaore, fillKnownWords } from "@/lib/language/unknown-words";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEMO_SCRIPT, type DemoLine } from "./landing-demo-script";

/*
 * Conversation d'exemple de l'accueil, traduite par Tamilya avec son vocabulaire
 * et gardée dans site_settings (migration 20261122000000). La clé résume son
 * vocabulaire : une leçon ou une correction la change, et la conversation est
 * retraduite à la visite suivante. Un mot qu'elle ne connaît pas reste en
 * français entre [[ ]], comme dans ses conversations avec son maître.
 */

const TTL_MS = 60_000;
/** Après un échec de l'IA (quota, panne), on attend avant de redemander. */
const RETRY_MS = 10 * 60_000;

let cached: { lines: DemoLine[]; at: number } | null = null;
let running: Promise<DemoLine[]> | null = null;
let failedAt = 0;

const french = (): DemoLine[] => DEMO_SCRIPT.map((line) => ({ ...line, shimaore: null }));

function vocabularyKey(brain: AwaBrain): string {
  const lexicon = lexiconFor(brain, DEFAULT_PERSONALITY) ?? [];
  const vocabulary = [...lexicon.map((e) => [e.french, e.shimaore]), ...brain.words.map((w) => [w.french, w.shimaore])];
  return createHash("sha256").update(JSON.stringify([DEMO_SCRIPT, vocabulary])).digest("hex");
}

const TASK = `TÂCHE POUR LA PAGE D'ACCUEIL : traduis en shimaoré chaque ligne de la conversation d'exemple ci-dessous, dans l'ordre, avec ton vocabulaire.
- Garde tels quels les noms de lieux et de marques (Mamoudzou, Mayotte, Trévani, Petite-Terre, BFC, Comité) et les chiffres.
- Un mot que tu ne connais pas : écris-le en français entre doubles crochets, comme d'habitude.
- Réponds UNIQUEMENT par un tableau JSON de ${DEMO_SCRIPT.length} chaînes, sans texte autour.`;

function parseLines(raw: string): string[] | null {
  const json = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
  try {
    const list: unknown = JSON.parse(json);
    if (!Array.isArray(list) || list.length !== DEMO_SCRIPT.length) return null;
    if (!list.every((line) => typeof line === "string" && line.trim() && line.length <= 300)) return null;
    return list.map((line: string) => line.trim());
  } catch {
    return null;
  }
}

async function translate(brain: AwaBrain): Promise<string[] | null> {
  const ai = await getAIProvider();
  if (!ai.ok) return null;
  const text = DEMO_SCRIPT.map((line) => line.fr).join("\n");
  const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, DEFAULT_PERSONALITY, text),
    grammar: brain.grammar,
    words: wordsFor(brain, text, true),
    gloss: glossFor(brain, text),
    teacher: true,
  });
  const raw = await completeText(ai.provider, {
    system: `${system}\n\n${TASK}`,
    content: DEMO_SCRIPT.map((line, i) => `${i + 1}. ${line.from === "user" ? "Visiteur" : "Tamilya"} : ${line.fr}`).join("\n"),
    maxOutputTokens: 800,
    timeoutMs: 30_000,
  });
  const lines = parseLines(raw);
  if (!lines) return null;
  // Comme dans le chat du maître : le français restant devient [[à apprendre]], puis les mots appris le remplacent.
  const known = knownTranslations(brain);
  return lines.map((line) => fillKnownWords(enforceShimaore(line), known));
}

async function load(): Promise<DemoLine[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return french();
  const [brain, stored] = await Promise.all([
    loadAwaBrain(),
    admin.from("site_settings").select("landing_demo, landing_demo_key").eq("id", 1).maybeSingle(),
  ]);
  if (stored.error) {
    console.error("[accueil] Conversation d'exemple illisible (migration 20261122000000 appliquée ?)", stored.error.message);
    return french();
  }
  const previous = Array.isArray(stored.data?.landing_demo) && stored.data.landing_demo.length === DEMO_SCRIPT.length ? (stored.data.landing_demo as string[]) : null;
  const withShimaore = (lines: readonly string[] | null) => DEMO_SCRIPT.map((line, i) => ({ ...line, shimaore: lines?.[i] ?? null }));

  const key = vocabularyKey(brain);
  if (previous && stored.data?.landing_demo_key === key) return withShimaore(previous);
  if (Date.now() - failedAt < RETRY_MS) return withShimaore(previous);

  const lines = await translate(brain).catch((error: unknown) => {
    console.error("[accueil] Traduction de la conversation d'exemple impossible", error);
    return null;
  });
  if (!lines) {
    failedAt = Date.now();
    return withShimaore(previous);
  }
  const { error } = await admin.from("site_settings").update({ landing_demo: lines, landing_demo_key: key }).eq("id", 1);
  if (error) console.error("[accueil] Conversation d'exemple non enregistrée", error.message);
  return withShimaore(lines);
}

/** Conversation de l'accueil ; shimaore vaut null pour une ligne pas encore traduite (le français s'affiche). */
export async function getLandingDemo(): Promise<DemoLine[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.lines;
  // Une seule traduction à la fois, même si plusieurs visiteurs arrivent ensemble.
  running ??= load().finally(() => (running = null));
  const lines = await running;
  cached = { lines, at: Date.now() };
  return lines;
}
