import "server-only";
import type { ValidatedExample } from "@/lib/language/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectKnowledge, type KnowledgeEntry } from "./knowledge";
import type { PersonalityId } from "./personalities";
import { glossMessage, selectWords, type Gloss, type WordEntry } from "./words";
import { translationTable } from "@/lib/language/unknown-words";

/**
 * « Cerveau » de Tamilya stocké dans Supabase (réglages, connaissances, lexique).
 * Indépendant du modèle d'IA : changer de fournisseur ne change pas Tamilya.
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
  /** Règles de grammaire du shimaoré (awa_grammar, /admin/apprentissage) ; vide sans la migration. */
  grammar: GrammarRule[];
};

export type GrammarRule = { title: string; rule: string; examples: string };

export const EMPTY_BRAIN: AwaBrain = { name: null, identity: null, rules: null, knowledge: [], lexicon: [], words: [], grammar: [] };

/** Lu à part : une table absente ne prive pas Tamilya du reste de son cerveau. */
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

/** Lue à part, comme le dictionnaire : sans la migration, Tamilya garde le reste. */
async function loadGrammar(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>): Promise<GrammarRule[]> {
  const { data, error } = await admin
    .from("awa_grammar")
    .select("title, rule, examples")
    .eq("is_active", true)
    .order("position")
    .order("created_at")
    .limit(100);
  if (error) {
    console.error("[awa] Grammaire illisible (migration 20261125000000_apprentissage_shimaore.sql appliquée ?)", error);
    return [];
  }
  return (data ?? []).map((row) => ({ title: row.title, rule: row.rule, examples: row.examples ?? "" }));
}

/** Colonnes du lexique lues ; variants peut manquer (migration lexicon_variants non appliquée). */
const LEXICON_COLUMNS = "french, shimaore, context, validated_by, validated_at";

/** Expressions actives, les plus récentes d'abord pour la limite ; sans la colonne variants si elle n'existe pas. */
async function loadLexicon(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>) {
  const query = (columns: string) =>
    admin.from("awa_lexicon").select(columns).eq("is_active", true).order("created_at", { ascending: false }).limit(2000);
  const withVariants = await query(`${LEXICON_COLUMNS}, variants`);
  // 42703 : colonne inconnue.
  const error = withVariants.error;
  if (error && (error.code === "42703" || /variants/.test(error.message ?? ""))) return query(LEXICON_COLUMNS);
  return withVariants;
}

type LexiconRow = { french: string; shimaore: string; context: string | null; validated_by: string; validated_at: string; variants?: unknown };

// Court : invalidateAwaBrain() ne vide que le module qui l'appelle (les actions
// de l'admin), pas celui des routes du chat ni les autres instances. Une leçon
// ou une correction doit servir dès le message suivant. Le dictionnaire n'a pas
// de date de modification (awa_words) : impossible de savoir sans tout relire
// s'il a changé, d'où la relecture toutes les 5 s. Quand rien n'a changé, le
// même cerveau est gardé : ses mots déjà préparés (words.ts) resservent.
const CACHE_MS = 5_000;
let cache: { brain: AwaBrain; expiresAt: number; fingerprint: string } | null = null;
/** Lecture en cours : les messages arrivés en même temps l'attendent au lieu de tout relire. */
let loading: Promise<AwaBrain> | null = null;
/** Change à chaque invalidateAwaBrain() : une lecture commencée avant n'est pas gardée. */
let generation = 0;

export function loadAwaBrain(): Promise<AwaBrain> {
  if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.brain);
  if (!loading) {
    const task = readAwaBrain(generation).finally(() => {
      if (loading === task) loading = null;
    });
    loading = task;
  }
  return loading;
}

async function readAwaBrain(started: number): Promise<AwaBrain> {
  const admin = getSupabaseAdminClient();
  if (!admin) return EMPTY_BRAIN;

  try {
    const [settings, knowledge, lexicon, words, grammar] = await Promise.all([
      admin.from("awa_settings").select("name, identity, rules").eq("id", 1).maybeSingle(),
      admin.from("awa_knowledge").select("title, content, keywords").eq("is_active", true).limit(200),
      // Les plus récentes d'abord pour la limite, remises ensuite du plus ancien au plus récent.
      loadLexicon(admin),
      loadWords(admin),
      loadGrammar(admin),
    ]);
    if (settings.error) throw settings.error;
    if (knowledge.error) throw knowledge.error;
    if (lexicon.error) throw lexicon.error;

    const brain: AwaBrain = {
      name: settings.data?.name?.trim() || null,
      identity: settings.data?.identity?.trim() || null,
      rules: settings.data?.rules?.trim() || null,
      knowledge: knowledge.data ?? [],
      lexicon: ((lexicon.data ?? []) as unknown as LexiconRow[]).reverse().map((row) => ({
        french: row.french,
        shimaore: row.shimaore,
        context: row.context ?? undefined,
        variants: readVariants(row.variants),
        validatedBy: row.validated_by,
        validatedAt: row.validated_at,
      })),
      words,
      grammar,
    };
    // Rien n'a changé depuis la dernière lecture : on garde le même objet (et ce qui en est déjà calculé).
    const fingerprint = JSON.stringify(brain);
    const kept = cache?.fingerprint === fingerprint ? cache.brain : brain;
    if (started === generation) cache = { brain: kept, expiresAt: Date.now() + CACHE_MS, fingerprint };
    return kept;
  } catch (error) {
    console.error("[awa] Cerveau indisponible (migration appliquée ?), textes par défaut utilisés", error);
    // Évite de réessayer à chaque message quand les tables n'existent pas encore.
    if (started === generation) cache = { brain: EMPTY_BRAIN, expiresAt: Date.now() + CACHE_MS, fingerprint: "" };
    return EMPTY_BRAIN;
  }
}

/** Après une modification depuis /admin : relecture immédiate sur cette instance (les autres suivent sous 5 s). */
export function invalidateAwaBrain() {
  cache = null;
  loading = null;
  generation++;
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

/** Phrases modèles données au modèle à chaque message, au plus. */
const LEXICON_IN_PROMPT = 80;

/**
 * Expressions telles que la personnalité les dit : sa version si elle existe,
 * sinon la version générale. undefined sans expression (exemples du code).
 * Avec le message, et beaucoup d'expressions : celles qui y apparaissent
 * d'abord, puis les plus récemment validées (« C'est juste », corrections).
 */
export function lexiconFor(brain: AwaBrain, personality: PersonalityId, message?: string): ValidatedExample[] | undefined {
  if (brain.lexicon.length === 0) return undefined;
  let chosen = brain.lexicon;
  if (message !== undefined && chosen.length > LEXICON_IN_PROMPT) {
    const picked = new Set(selectWords(chosen, message, { maxMatched: 40, maxTopic: LEXICON_IN_PROMPT, topic: true }));
    chosen = chosen.filter((example) => picked.has(example));
  }
  return chosen.map(({ variants, ...example }) => ({ ...example, shimaore: variants?.[personality] || example.shimaore }));
}

/** Mots du dictionnaire utiles pour ce message ; avec son maître, Tamilya parle shimaoré et reçoit tout son vocabulaire. */
export function wordsFor(brain: AwaBrain, message: string, speaksShimaore = false): WordEntry[] {
  return selectWords(brain.words, message, { topic: speaksShimaore });
}

/** Lecture du message mot à mot avec tout le vocabulaire (mots et expressions validés). */
export function glossFor(brain: AwaBrain, message: string): Gloss {
  return glossMessage(vocabularyOf(brain), message);
}

/**
 * Calculés une fois par cerveau (le cerveau en cache est le même objet d'un
 * message à l'autre) : le vocabulaire complet et la table des traductions.
 */
const vocabularies = new WeakMap<AwaBrain, WordEntry[]>();
const translations = new WeakMap<AwaBrain, Map<string, string>>();

function vocabularyOf(brain: AwaBrain): WordEntry[] {
  let all = vocabularies.get(brain);
  if (!all) vocabularies.set(brain, (all = [...brain.lexicon, ...brain.words]));
  return all;
}

/** Tout ce que le maître a appris à Tamilya (mots et expressions), pour remplacer les [[mots]] déjà traduits. */
export function knownTranslations(brain: AwaBrain): ReadonlyMap<string, string> {
  let table = translations.get(brain);
  if (!table) translations.set(brain, (table = translationTable(vocabularyOf(brain))));
  return table;
}
