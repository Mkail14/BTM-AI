import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MyReview, PublicReview, ReviewInput } from "./rules";

/**
 * Avis sur BTM IA (table app_reviews). Lus et écrits uniquement ici, avec la
 * clé secrète : l'API Supabase n'y donne aucun accès direct. Les actions qui
 * appellent ces fonctions vérifient d'abord la session.
 */

const LIST_LIMIT = 60;
const CACHE_MS = 60_000;
/** Une modification moins d'une minute après la publication n'est pas signalée. */
const EDITED_AFTER_MS = 60_000;

let cache: { reviews: PublicReview[]; expiresAt: number } | null = null;

type Row = { id: string; display_name: string; commune: string | null; rating: number; comment: string | null; created_at: string; updated_at: string };

/** Avis publiés, les plus récents d'abord. Liste vide si la table n'existe pas encore. */
export async function listPublishedReviews(): Promise<PublicReview[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.reviews;
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("app_reviews")
    .select("id, display_name, commune, rating, comment, created_at, updated_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.error("[avis] Lecture impossible (migration app_reviews appliquée ?)", error.message);
    // Pas de nouvel essai avant une minute : la page d'accueil ne relance pas la base à chaque visite.
    cache = { reviews: cache?.reviews ?? [], expiresAt: Date.now() + CACHE_MS };
    return cache.reviews;
  }
  const reviews = (data as Row[]).map((row) => ({
    id: row.id,
    name: row.display_name,
    commune: row.commune,
    rating: row.rating,
    comment: row.comment,
    date: row.created_at,
    edited: Date.parse(row.updated_at) - Date.parse(row.created_at) > EDITED_AFTER_MS,
  }));
  cache = { reviews, expiresAt: Date.now() + CACHE_MS };
  return reviews;
}

/** L'avis du compte, ou null (jamais donné, ou table absente). */
export async function getMyReview(userId: string): Promise<MyReview | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("app_reviews").select("rating, comment, commune").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("[avis] Lecture de l'avis du compte impossible", error.message);
    return null;
  }
  return data ? { rating: data.rating, comment: data.comment ?? "", commune: data.commune } : null;
}

/** Publie ou met à jour l'avis du compte (un seul par compte). Le nom public est calculé par l'appelant. */
export async function saveMyReview(userId: string, displayName: string, input: ReviewInput): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY manquante");
  const { error } = await admin.from("app_reviews").upsert(
    { user_id: userId, display_name: displayName, rating: input.rating, comment: input.comment || null, commune: input.commune },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  cache = null;
}

export async function deleteMyReview(userId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY manquante");
  const { error } = await admin.from("app_reviews").delete().eq("user_id", userId);
  if (error) throw error;
  cache = null;
}
