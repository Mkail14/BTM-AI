import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import { completeText } from "@/lib/ai/complete";
import { normalizeFrench, THEMES, type BranchDef } from "./curriculum";

/**
 * Branches de la carte proposées par Awa (bouton « + » de /admin/lexique).
 * Awa regarde ce qu'elle sait déjà dire, les mots shimaoré qu'on lui a dits
 * sans qu'elle les comprenne, et propose le thème qui lui manque le plus.
 */

export type BranchSuggestion = { label: string; emoji: string; reason: string; words: string[] };

/** Branches enregistrées (null : migration 20261116000000_awa_branches.sql pas encore appliquée). */
export async function listBranches(supabase: SupabaseClient): Promise<BranchDef[] | null> {
  const { data, error } = await supabase.from("awa_branches").select("id, label, emoji, hue, reason, words").order("created_at");
  if (error) return null;
  return (data ?? []).map((b) => ({ id: b.id, label: b.label, emoji: b.emoji ?? "🌱", hue: b.hue, reason: b.reason ?? "", words: b.words ?? [] }));
}

/** Teinte d'une nouvelle branche : la plus éloignée de celles déjà prises sur la carte. */
export function freeHue(branches: readonly BranchDef[]): number {
  const taken = [...THEMES.map((t) => t.hue), ...branches.map((b) => b.hue)];
  let best = 0;
  let bestGap = -1;
  for (let hue = 0; hue < 360; hue += 5) {
    const gap = Math.min(...taken.map((t) => Math.min(Math.abs(t - hue), 360 - Math.abs(t - hue))));
    if (gap > bestGap) [best, bestGap] = [hue, gap];
  }
  return best;
}

const PROMPT = `Tu es Awa, l'assistante de BTM AI à Mayotte. Tu apprends le shimaoré avec l'équipe de GROUPE BTM.
On te montre les thèmes et les mots que tu sais déjà dire, et des mots shimaoré qu'on t'a dits sans que tu les comprennes.
Propose UNE nouvelle branche de vocabulaire : le sujet de la vie quotidienne à Mayotte qui te manque le plus pour aider les gens (marché, santé, démarches, pêche, école, transport…), absent des thèmes existants.

Réponds uniquement par un objet JSON, sans texte autour ni balises :
{"label": "nom court (2 à 25 caractères)", "emoji": "un emoji", "reason": "une ou deux phrases à la première personne, chaleureuses, qui disent pourquoi tu aimerais apprendre ces mots (ex. : « On me parle souvent du marché de Mamoudzou et je ne sais pas dire les prix… »)", "words": ["12 mots ou courtes expressions en français, du plus utile au moins utile, que tu ne connais pas encore"]}`;

/** Lit la réponse de l'IA : un objet JSON, éventuellement entouré de texte ou de balises. */
export function parseSuggestion(output: string, known: ReadonlySet<string>): BranchSuggestion | null {
  const json = output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  try {
    const raw = JSON.parse(json) as Partial<Record<keyof BranchSuggestion, unknown>>;
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 30) : "";
    const words = Array.isArray(raw.words)
      ? [...new Set(raw.words.filter((w): w is string => typeof w === "string").map((w) => w.trim().toLowerCase()).filter((w) => w && w.length <= 60))]
          .filter((w) => !known.has(normalizeFrench(w)))
          .slice(0, 16)
      : [];
    if (label.length < 2 || words.length < 3) return null;
    return {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji.trim().slice(0, 8) : "🌱",
      reason: typeof raw.reason === "string" ? raw.reason.trim().slice(0, 300) : "",
      words,
    };
  } catch {
    return null;
  }
}

/** Demande à Awa la branche qui lui manque le plus. `avoid` : idées déjà refusées à l'instant. */
export async function suggestBranch(supabase: SupabaseClient, avoid: readonly string[] = []): Promise<BranchSuggestion | null> {
  const [words, requests, branches] = await Promise.all([
    supabase.from("awa_words").select("french").eq("is_active", true).limit(3000),
    supabase.from("awa_word_requests").select("shimaore, example").eq("status", "pending").order("occurrences", { ascending: false }).limit(30),
    listBranches(supabase),
  ]);
  const knownFrench = [...(words.data ?? []).map((w) => w.french as string), ...THEMES.flatMap((t) => t.groups.flatMap((g) => g.words.map((w) => w.split("|")[0])))];
  const known = new Set(knownFrench.map(normalizeFrench));
  for (const b of branches ?? []) for (const w of b.words) known.add(normalizeFrench(w));

  const ai = await getAIProvider();
  if (!ai.ok) return null;
  const content = [
    `Thèmes déjà sur la carte : ${[...THEMES.map((t) => t.label), ...(branches ?? []).map((b) => b.label)].join(", ")}.`,
    avoid.length ? `Ne propose pas : ${avoid.join(", ")}.` : "",
    `Mots que tu sais déjà dire (extrait) : ${[...known].slice(0, 400).join(", ")}.`,
    requests.data?.length
      ? `Mots shimaoré qu'on t'a dits sans que tu les comprennes :\n${requests.data.map((r) => `- ${r.shimaore}${r.example ? ` (« ${String(r.example).slice(0, 120)} »)` : ""}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const output = await completeText(ai.provider, { system: PROMPT, content, maxOutputTokens: 900, timeoutMs: 20_000 }).catch((error: unknown) => {
    console.error("[lexique] Proposition de branche impossible", error);
    return "";
  });
  return parseSuggestion(output, known);
}
