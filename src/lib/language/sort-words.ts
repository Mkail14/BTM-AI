import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import { completeText } from "@/lib/ai/complete";
import { ALL_GROUP_CATEGORIES, buildLexiconTree, type BranchDef, type KnownEntry } from "./curriculum";

/** Mot que Gemini n'a pas su ranger : il reste « À ranger » sans être renvoyé à chaque visite. */
export const UNSORTED = "À ranger";

const MAX_WORDS = 80;
const TIMEOUT_MS = 8_000;

const PROMPT = `Tu ranges des mots dans les thèmes d'un dictionnaire français–shimaoré.
Pour chaque mot numéroté, choisis la catégorie la plus juste dans la liste, recopiée à l'identique.
Réponds uniquement par une ligne par mot, de la forme « numéro|catégorie », sans rien d'autre.
Si aucune ne convient vraiment, écris « numéro|Phrases utiles › Au quotidien » pour une phrase, sinon « numéro|? ».

Catégories :
${ALL_GROUP_CATEGORIES.join("\n")}`;

/** Lit la réponse « 3|Nourriture › Plats » : seules les catégories de la liste (ou « ? ») sont gardées. */
export function parseSorting(output: string, count: number): Map<number, string> {
  const valid = new Set(ALL_GROUP_CATEGORIES);
  const result = new Map<number, string>();
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+)\s*\|\s*(.+?)\s*$/);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    const category = match[2].replace(/\s*>\s*/, " › ");
    if (index < 0 || index >= count) continue;
    if (valid.has(category)) result.set(index, category);
    else if (category === "?") result.set(index, UNSORTED);
  }
  return result;
}

/**
 * Range dans la carte les mots appris sans catégorie connue, quelle que soit
 * la façon dont Tamilya les a appris (conversation, traduction, liste collée…).
 * Gemini choisit « Thème › Groupe », enregistré dans awa_words.category.
 * Ne bloque jamais plus de quelques secondes ; ce qui reste sera rangé
 * au prochain passage. Renvoie la nouvelle catégorie de chaque mot rangé (par id).
 */
export async function sortNewWords(
  supabase: SupabaseClient,
  entries: readonly KnownEntry[],
  branches: readonly BranchDef[] = [],
): Promise<Map<string, string>> {
  // Les mots du programme (et des branches de Tamilya) ont déjà leur place : seuls ceux « À ranger » sont envoyés.
  const tree = buildLexiconTree(entries, branches);
  const words = entries.filter((e) => e.category !== UNSORTED && isWaiting(tree, e)).slice(0, MAX_WORDS);
  const done = new Map<string, string>();
  if (!words.length) return done;

  const ai = await getAIProvider();
  if (!ai.ok) return done;
  const output = await completeText(ai.provider, {
    system: PROMPT,
    content: words.map((w, i) => `${i + 1}. ${w.french} (shimaoré : ${w.shimaore})`).join("\n"),
    maxOutputTokens: 40 * words.length,
    timeoutMs: TIMEOUT_MS,
  }).catch((error: unknown) => {
    console.error("[lexique] Rangement des mots impossible", error);
    return "";
  });

  const sorted = parseSorting(output, words.length);
  const byCategory = new Map<string, string[]>();
  for (const [index, category] of sorted) byCategory.set(category, [...(byCategory.get(category) ?? []), words[index].id!]);
  for (const [category, ids] of byCategory) {
    const { error } = await supabase.from("awa_words").update({ category }).in("id", ids);
    if (error) console.error("[lexique] Catégorie non enregistrée", error);
    else for (const id of ids) done.set(id, category);
  }
  return done;
}

/** Vrai si le mot est dans la bulle « À ranger » (et pas déjà un mot du programme). */
function isWaiting(tree: ReturnType<typeof buildLexiconTree>, entry: KnownEntry): boolean {
  const ranger = tree.children?.find((t) => t.id === "ranger");
  const stack = [...(ranger?.children ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.word?.source === entry) return true;
    stack.push(...(node.children ?? []));
  }
  return false;
}
