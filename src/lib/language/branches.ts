import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import { completeText } from "@/lib/ai/complete";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeFrench, THEMES, type BranchDef } from "./curriculum";

/**
 * Branches de la carte proposées par Tamilya (bouton « + » de /admin/lexique).
 * Tamilya relit les derniers messages des conversations, ce qu'elle sait déjà
 * dire et les mots shimaoré qu'elle n'a pas compris, et propose le sujet dont
 * on lui parle le plus et qui lui manque.
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

const PROMPT = `Tu es Tamilya, l'assistante de BTM AI à Mayotte. Tu apprends le shimaoré avec l'équipe de GROUPE BTM.
On te montre ce que les gens t'ont vraiment écrit dans leurs conversations, les thèmes et les mots que tu sais déjà dire, et des mots shimaoré qu'on t'a dits sans que tu les comprennes.
Propose UNE nouvelle branche de vocabulaire, absente des thèmes existants, en partant UNIQUEMENT des conversations : le sujet dont les gens te parlent le plus souvent et pour lequel il te manque des mots.
N'invente pas de sujet : il doit revenir dans plusieurs messages. Un mot cité une seule fois en passant ne suffit pas.
Les mots proposés doivent venir de ces conversations ou en être très proches (ce qu'on t'a demandé, ce dont on t'a parlé).

Réponds uniquement par un objet JSON, sans texte autour ni balises :
{"label": "nom court (2 à 25 caractères)", "emoji": "un emoji", "reason": "une ou deux phrases à la première personne, chaleureuses, qui disent ce que les gens t'ont demandé dans les conversations et pourquoi tu aimerais apprendre ces mots (ex. : « On me demande souvent les horaires de la barge et je ne sais pas dire l'heure du départ… »)", "words": ["12 mots ou courtes expressions en français, du plus utile au moins utile, que tu ne connais pas encore"]}`;

/** Derniers messages d'utilisateurs relus pour choisir la branche. */
const MESSAGES_LIMIT = 400;
const EXCERPT_CHARS = 14_000;

/**
 * Messages des conversations, un par ligne, raccourcis et sans doublons
 * (« bonjour » cent fois ne dit rien du sujet), dans la limite de EXCERPT_CHARS.
 */
export function conversationExcerpt(messages: readonly string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  let size = 0;
  for (const raw of messages) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    const key = normalizeFrench(text);
    if (text.length < 3 || seen.has(key)) continue;
    seen.add(key);
    if (size + text.length + 3 > EXCERPT_CHARS) break;
    lines.push(`- ${text}`);
    size += text.length + 3;
  }
  return lines.join("\n");
}

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

/** Demande à Tamilya la branche qui lui manque le plus. `avoid` : idées déjà refusées à l'instant. */
export async function suggestBranch(supabase: SupabaseClient, avoid: readonly string[] = []): Promise<BranchSuggestion | null> {
  // Messages des utilisateurs : clé secrète (tous les comptes), sinon ceux que l'admin peut lire.
  const reader = getSupabaseAdminClient() ?? supabase;
  const [words, requests, branches, messages] = await Promise.all([
    supabase.from("awa_words").select("french").eq("is_active", true).limit(3000),
    supabase.from("awa_word_requests").select("shimaore, example").eq("status", "pending").order("occurrences", { ascending: false }).limit(30),
    listBranches(supabase),
    reader.from("messages").select("content").eq("role", "user").order("created_at", { ascending: false }).limit(MESSAGES_LIMIT),
  ]);
  const said = conversationExcerpt((messages.data ?? []).map((m) => String(m.content ?? "")));
  if (!said) return null;
  const knownFrench = [...(words.data ?? []).map((w) => w.french as string), ...THEMES.flatMap((t) => t.groups.flatMap((g) => g.words.map((w) => w.split("|")[0])))];
  const known = new Set(knownFrench.map(normalizeFrench));
  for (const b of branches ?? []) for (const w of b.words) known.add(normalizeFrench(w));

  const ai = await getAIProvider();
  if (!ai.ok) return null;
  const content = [
    `Ce que les gens t'ont écrit dans leurs conversations (les plus récents d'abord) :\n${said}`,
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
