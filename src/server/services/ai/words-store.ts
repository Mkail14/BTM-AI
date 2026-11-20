import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTeachingRequest,
  isExplanation,
  isGivenBySpeaker,
  isNotAMeaning,
  mayBeTeaching,
  parseTaughtWords,
  shimaoreEntryKey,
  TAUGHT_WORD_MAX,
  TEACHING_SYSTEM_PROMPT,
  type TaughtWord,
} from "@/lib/language/teaching";
import { invalidateTamilyaBrain } from "@/server/services/ai/brain";
import { completeText } from "@/server/services/ai/complete";
import type { AIProvider } from "@/lib/ai/types";

const key = (french: string) => french.trim().toLowerCase();

/**
 * Enregistre des mots appris (chat ou liste collée dans /admin/lexique).
 * La dernière leçon fait foi : les traductions déjà connues d'un même mot
 * français sont remplacées ; avec `sameShimaore`, aussi celles du même
 * shimaoré dont le français ne diffère que par l'écriture (correction du
 * français en conversation). Client RLS d'un
 * administrateur requis.
 */
export async function teachWords(
  supabase: SupabaseClient,
  userId: string,
  words: readonly TaughtWord[],
  category: string | null = null,
  options: { sameShimaore?: boolean; /** Leçon de conversation : l'ancienne ligne est mise en pause au lieu d'être effacée (voir plus bas). */ protectExisting?: boolean } = {},
): Promise<number> {
  if (words.length === 0) return 0;

  const { data: existing, error: readError } = await supabase.from("awa_words").select("id, french, shimaore, is_active").limit(10000);
  if (readError) throw readError;

  // Leçon relevée par le modèle dans une conversation : il peut se tromper (« je t'aime » est devenu
  // « sain du » le 2026-11-15). La correction du maître compte tout de suite, mais l'ancienne ligne n'est
  // jamais effacée : elle est seulement mise en pause (is_active = false) et se réactive dans /admin/lexique.
  const soft = Boolean(options.protectExisting);
  const pairKey = (french: string, shimaore: string) => `${key(french)}\u0000${shimaoreEntryKey(shimaore)}`;
  const rowsExisting = existing ?? [];

  const taught = new Set(words.map((w) => key(w.french)));
  // Même shimaoré : seulement le même français écrit autrement (« il est ou » → « il est où ? »). Un mot a souvent
  // plusieurs sens (mutsanga = plage, sable) : « je te déteste → mutsanga », relevé de travers le 2026-11-16, les avait mis en pause.
  const respelled = new Set(options.sameShimaore ? words.map((w) => pairKey(shimaoreEntryKey(w.french), w.shimaore)) : []);
  const wanted = new Set(words.map((w) => pairKey(w.french, w.shimaore)));
  const replaced = rowsExisting
    .filter((row) => taught.has(key(row.french)) || respelled.has(pairKey(shimaoreEntryKey(row.french), String(row.shimaore ?? ""))))
    // La ligne qui dit déjà la même chose reste telle quelle (réactivée plus bas si elle était en pause).
    .filter((row) => !wanted.has(pairKey(row.french, String(row.shimaore ?? ""))))
    .map((row) => row.id as string);

  for (let i = 0; i < replaced.length; i += 200) {
    const ids = replaced.slice(i, i + 200);
    const { error } = soft
      ? await supabase.from("awa_words").update({ is_active: false }).in("id", ids)
      : await supabase.from("awa_words").delete().in("id", ids);
    if (error) throw error;
  }

  // Même paire déjà au dictionnaire mais en pause : on la réactive au lieu d'en créer une deuxième.
  const sleeping = rowsExisting.filter((row) => row.is_active === false && wanted.has(pairKey(row.french, String(row.shimaore ?? ""))));
  const sleepingKeys = new Set(sleeping.map((row) => pairKey(row.french, String(row.shimaore ?? ""))));
  if (sleeping.length > 0) {
    const { error } = await supabase.from("awa_words").update({ is_active: true }).in("id", sleeping.map((row) => row.id as string));
    if (error) throw error;
  }
  const activeKeys = new Set(rowsExisting.filter((row) => row.is_active !== false).map((row) => pairKey(row.french, String(row.shimaore ?? ""))));
  const rows = words
    .filter((w) => !sleepingKeys.has(pairKey(w.french, w.shimaore)) && !activeKeys.has(pairKey(w.french, w.shimaore)))
    .map((w) => ({ french: w.french, shimaore: w.shimaore, category, created_by: userId, is_active: true }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("awa_words").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return words.length;
}

/**
 * Leçon en conversation : le modèle relève le shimaoré qu'un administrateur
 * vient d'enseigner (ou de corriger), et le dictionnaire le garde.
 * À lancer après la réponse (after). Renvoie les mots appris.
 */
export async function learnWordsFromMessage(
  supabase: SupabaseClient,
  userId: string,
  provider: AIProvider,
  /** previousAsk : message précédent du locuteur, souvent la phrase dont il corrige la traduction. */
  input: { message: string; previousReply: string | null; previousAsk?: string | null },
): Promise<TaughtWord[]> {
  if (!mayBeTeaching(input.message, input.previousReply, input.previousAsk ?? null)) return [];
  const output = await completeText(provider, {
    system: TEACHING_SYSTEM_PROMPT,
    content: buildTeachingRequest(input.previousReply, input.message, input.previousAsk ?? null),
  });
  // Rien que le locuteur n'a pas dit lui-même, pas d'explication en français prise pour une traduction,
  // et pas de réaction (« Non, c'est ça ») prise pour un sens.
  const taught = parseTaughtWords(output).filter(
    (w) => isGivenBySpeaker(w.shimaore, input.message, input.previousReply) && !isExplanation(w.shimaore) && !isNotAMeaning(w.french),
  );
  const short = (w: TaughtWord) => w.french.length <= TAUGHT_WORD_MAX && w.shimaore.length <= TAUGHT_WORD_MAX;
  const words = taught.filter(short);
  const phrases = taught.filter((w) => !short(w));
  if (words.length > 0) await teachWords(supabase, userId, words, null, { sameShimaore: true, protectExisting: true });
  if (phrases.length > 0) await teachPhrases(supabase, phrases);
  if (taught.length > 0) invalidateTamilyaBrain();
  return taught;
}

/**
 * Phrase trop longue pour le dictionnaire (correction d'une phrase traduite) :
 * gardée dans les expressions, à la place de l'ancienne version de la même phrase.
 */
async function teachPhrases(supabase: SupabaseClient, phrases: readonly TaughtWord[]): Promise<void> {
  const taught = new Set(phrases.map((p) => key(p.french)));
  const { data: existing, error: readError } = await supabase.from("awa_lexicon").select("id, french").limit(5000);
  if (readError) throw readError;
  const replaced = (existing ?? []).filter((row) => taught.has(key(String(row.french ?? "")))).map((row) => row.id as string);
  if (replaced.length > 0) {
    const { error } = await supabase.from("awa_lexicon").delete().in("id", replaced);
    if (error) throw error;
  }
  const { error } = await supabase
    .from("awa_lexicon")
    .insert(phrases.map((p) => ({ french: p.french, shimaore: p.shimaore, validated_by: "Maître de Tamilya (conversation)" })));
  if (error) throw error;
}
