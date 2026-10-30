import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTeachingRequest,
  mayBeTeaching,
  parseTaughtWords,
  TEACHING_SYSTEM_PROMPT,
  type TaughtWord,
} from "@/lib/language/teaching";
import { invalidateAwaBrain } from "./brain";
import { completeText } from "./complete";
import type { AIProvider } from "./types";

const key = (french: string) => french.trim().toLowerCase();

/**
 * Enregistre des mots appris (chat ou liste collée dans /admin/lexique).
 * La dernière leçon fait foi : les traductions déjà connues d'un même mot
 * français sont remplacées. Client RLS d'un administrateur requis.
 */
export async function teachWords(
  supabase: SupabaseClient,
  userId: string,
  words: readonly TaughtWord[],
  category: string | null = null,
): Promise<number> {
  if (words.length === 0) return 0;

  const taught = new Set(words.map((w) => key(w.french)));
  const { data: existing, error: readError } = await supabase.from("awa_words").select("id, french").limit(10000);
  if (readError) throw readError;
  const replaced = (existing ?? []).filter((row) => taught.has(key(row.french))).map((row) => row.id as string);

  for (let i = 0; i < replaced.length; i += 200) {
    const { error } = await supabase.from("awa_words").delete().in("id", replaced.slice(i, i + 200));
    if (error) throw error;
  }
  for (let i = 0; i < words.length; i += 500) {
    const { error } = await supabase
      .from("awa_words")
      .insert(words.slice(i, i + 500).map((w) => ({ french: w.french, shimaore: w.shimaore, category, created_by: userId })));
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
  input: { message: string; previousReply: string | null },
): Promise<TaughtWord[]> {
  if (!mayBeTeaching(input.message, input.previousReply)) return [];
  const output = await completeText(provider, {
    system: TEACHING_SYSTEM_PROMPT,
    content: buildTeachingRequest(input.previousReply, input.message),
  });
  const words = parseTaughtWords(output);
  if (words.length > 0) {
    await teachWords(supabase, userId, words);
    invalidateAwaBrain();
  }
  return words;
}
