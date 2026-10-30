import "server-only";
import type { ValidatedExample } from "@/lib/language/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectKnowledge, type KnowledgeEntry } from "./knowledge";
import type { PersonalityId } from "./personalities";
import { selectWords, type WordEntry } from "./words";
import { translationTable } from "@/lib/language/unknown-words";

/**
 * « Cerveau » d'Awa stocké dans Supabase (réglages, connaissances, lexique).
 * Indépendant du modèle d'IA : changer de fournisseur ne change pas Awa.
 * Sans clé secrète ou en cas d'erreur, les textes par défaut du code s'appliquent.
 */
export type AwaBrain = {
  name: string | null;
  identity: string | null;
  rules: string | null;
  knowledge: KnowledgeEntry[];
  lexicon: ValidatedExample[];
  /** Dictionnaire de mots (awa_words) ; vide si la migration n'est pas appliquée. */
  words: WordEntry[];
};

export const EMPTY_BRAIN: AwaBrain = { name: null, identity: null, rules: null, knowledge: [], lexicon: [], words: [] };

/** Lu à part : une table absente ne prive pas Awa du reste de son cerveau. */
async function loadWords(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>): Promise<WordEntry[]> {
  const { data, error } = await admin
    .from("awa_words")
    .select("french, shimaore, category")
    .eq("is_active", true)
    .order("created_at")
    .limit(5000);
  if (error) {
    console.error("[awa] Dictionnaire illisible (migration awa_words appliquée ?)", error);
    return [];
  }
  return (data ?? []).map((row) => ({ french: row.french, shimaore: row.shimaore, category: row.category ?? undefined }));
}

const CACHE_MS = 60_000;
let cache: { brain: AwaBrain; expiresAt: number } | null = null;

export async function loadAwaBrain(): Promise<AwaBrain> {
  if (cache && cache.expiresAt > Date.now()) return cache.brain;

  const admin = getSupabaseAdminClient();
  if (!admin) return EMPTY_BRAIN;

  try {
    const [settings, knowledge, lexicon, words] = await Promise.all([
      admin.from("awa_settings").select("name, identity, rules").eq("id", 1).maybeSingle(),
      admin.from("awa_knowledge").select("title, content, keywords").eq("is_active", true).limit(200),
      admin
        .from("awa_lexicon")
        // « * » : la colonne variants peut ne pas exister encore (migration lexicon_variants).
        .select("*")
        .eq("is_active", true)
        .limit(300),
      loadWords(admin),
    ]);
    if (settings.error) throw settings.error;
    if (knowledge.error) throw knowledge.error;
    if (lexicon.error) throw lexicon.error;

    const brain: AwaBrain = {
      name: settings.data?.name?.trim() || null,
      identity: settings.data?.identity?.trim() || null,
      rules: settings.data?.rules?.trim() || null,
      knowledge: knowledge.data ?? [],
      lexicon: (lexicon.data ?? []).map((row) => ({
        french: row.french,
        shimaore: row.shimaore,
        context: row.context ?? undefined,
        variants: readVariants(row.variants),
        validatedBy: row.validated_by,
        validatedAt: row.validated_at,
      })),
      words,
    };
    cache = { brain, expiresAt: Date.now() + CACHE_MS };
    return brain;
  } catch (error) {
    console.error("[awa] Cerveau indisponible (migration appliquée ?), textes par défaut utilisés", error);
    // Évite de réessayer à chaque message quand les tables n'existent pas encore.
    cache = { brain: EMPTY_BRAIN, expiresAt: Date.now() + CACHE_MS };
    return EMPTY_BRAIN;
  }
}

/** Après une modification depuis /admin : relecture immédiate sur cette instance (les autres suivent sous 60 s). */
export function invalidateAwaBrain() {
  cache = null;
}

/** Fiches utiles pour ce message, dans la limite du budget de caractères. */
export function knowledgeFor(brain: AwaBrain, message: string, maxChars = 6000): KnowledgeEntry[] {
  return selectKnowledge(brain.knowledge, message, maxChars);
}

/** Versions par personnalité enregistrées en base (texte non vide uniquement). */
export function readVariants(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""),
  );
}

/**
 * Expressions telles que la personnalité les dit : sa version si elle existe,
 * sinon la version générale. undefined sans expression (exemples du code).
 */
export function lexiconFor(brain: AwaBrain, personality: PersonalityId): ValidatedExample[] | undefined {
  if (brain.lexicon.length === 0) return undefined;
  return brain.lexicon.map(({ variants, ...example }) => ({ ...example, shimaore: variants?.[personality] || example.shimaore }));
}

/** Mots du dictionnaire utiles pour ce message ; avec son maître, Awa parle shimaoré et reçoit tout son vocabulaire. */
export function wordsFor(brain: AwaBrain, message: string, speaksShimaore = false): WordEntry[] {
  return selectWords(brain.words, message, { topic: speaksShimaore });
}

/** Tout ce que le maître a appris à Awa (mots et expressions), pour remplacer les [[mots]] déjà traduits. */
export function knownTranslations(brain: AwaBrain): Map<string, string> {
  return translationTable([...brain.lexicon, ...brain.words]);
}
