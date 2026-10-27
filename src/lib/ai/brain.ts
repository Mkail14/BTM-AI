import "server-only";
import type { ValidatedExample } from "@/lib/language/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectKnowledge, type KnowledgeEntry } from "./knowledge";

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
};

export const EMPTY_BRAIN: AwaBrain = { name: null, identity: null, rules: null, knowledge: [], lexicon: [] };

const CACHE_MS = 60_000;
let cache: { brain: AwaBrain; expiresAt: number } | null = null;

export async function loadAwaBrain(): Promise<AwaBrain> {
  if (cache && cache.expiresAt > Date.now()) return cache.brain;

  const admin = getSupabaseAdminClient();
  if (!admin) return EMPTY_BRAIN;

  try {
    const [settings, knowledge, lexicon] = await Promise.all([
      admin.from("awa_settings").select("name, identity, rules").eq("id", 1).maybeSingle(),
      admin.from("awa_knowledge").select("title, content, keywords").eq("is_active", true).limit(200),
      admin
        .from("awa_lexicon")
        .select("french, shimaore, context, validated_by, validated_at")
        .eq("is_active", true)
        .limit(300),
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
        validatedBy: row.validated_by,
        validatedAt: row.validated_at,
      })),
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
