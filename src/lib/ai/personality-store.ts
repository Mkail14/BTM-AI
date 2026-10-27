import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  composePersonalityInstructions,
  isPersonalityId,
  parseBehavior,
  PERSONALITIES,
  PERSONALITY_IDS,
  personalityCard,
  type PersonalityBehavior,
  type PersonalityCard,
  type PersonalityId,
} from "./personalities";

/**
 * Comportement des personnalités modifié depuis /admin (awa_personalities.behavior).
 * null : valeurs par défaut du code. Sans clé secrète, sans migration ou en cas
 * d'erreur, tout reste aux valeurs par défaut.
 */
export type PersonalityRecord = {
  behavior: PersonalityBehavior | null;
  updatedAt: string | null;
};
export type PersonalityRecords = Record<PersonalityId, PersonalityRecord>;

const EMPTY: PersonalityRecords = {
  mechante: { behavior: null, updatedAt: null },
  professionnelle: { behavior: null, updatedAt: null },
  cool: { behavior: null, updatedAt: null },
};

const CACHE_MS = 60_000;
let cache: { records: PersonalityRecords; expiresAt: number } | null = null;

async function readRecords(client: SupabaseClient): Promise<PersonalityRecords> {
  const { data, error } = await client.from("awa_personalities").select("id, behavior, updated_at");
  if (error) throw error;
  const records = structuredClone(EMPTY);
  for (const row of data ?? []) {
    if (!isPersonalityId(row.id)) continue;
    records[row.id] = { behavior: parseBehavior(row.behavior), updatedAt: row.updated_at ?? null };
  }
  return records;
}

async function loadRecords(): Promise<PersonalityRecords> {
  if (cache && cache.expiresAt > Date.now()) return cache.records;
  const admin = getSupabaseAdminClient();
  if (!admin) return EMPTY;

  let records = EMPTY;
  try {
    records = await readRecords(admin);
  } catch (error) {
    console.error("[awa] Personnalités indisponibles (migration appliquée ?), valeurs par défaut utilisées", error);
  }
  cache = { records, expiresAt: Date.now() + CACHE_MS };
  return records;
}

/** Pour le chat : consignes réécrites par l'admin, ou null (texte du code). */
export async function loadPersonalityInstructions(id: PersonalityId): Promise<string | null> {
  const behavior = (await loadRecords())[id].behavior;
  return behavior ? composePersonalityInstructions(id, behavior) : null;
}

/** Cartes montrées aux utilisateurs au moment du choix. */
export async function loadPersonalityCards(): Promise<PersonalityCard[]> {
  const records = await loadRecords();
  return PERSONALITY_IDS.map((id) => personalityCard(id, records[id].behavior ?? PERSONALITIES[id].defaults));
}

/** Pour la page d'administration : lecture fraîche, avec le client RLS de l'admin. */
export function getPersonalityRecordsForAdmin(client: SupabaseClient) {
  return readRecords(client);
}

export async function savePersonalityBehavior(
  client: SupabaseClient,
  id: PersonalityId,
  behavior: PersonalityBehavior | null,
  adminId: string,
) {
  const { data, error } = await client
    .from("awa_personalities")
    .update({ behavior, updated_by: adminId })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Ligne awa_personalities introuvable (migration appliquée ?)");
  // Prise en compte immédiate sur cette instance ; les autres suivent sous 60 s.
  cache = null;
}
