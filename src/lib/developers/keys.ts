import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Codes d'accès de l'API de Tamilya (table developer_keys). Le code complet
 * n'est montré qu'une fois, à sa création ; seule son empreinte est gardée.
 */

export const MAX_ACTIVE_KEYS = 5;
const KEY_PATTERN = /^tml_[A-Za-z0-9_-]{32}$/;

export type DeveloperKey = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Codes actifs de l'utilisateur ; null si la table est illisible (migration absente). */
export async function listDeveloperKeys(userId: string): Promise<DeveloperKey[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("developer_keys")
    .select("id, label, prefix, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[developpeurs] Codes illisibles (migration 20261124000000_codes_developpeurs.sql appliquée ?)", error);
    return null;
  }
  return data.map((row) => ({
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export type CreateKeyResult = { ok: true; key: string } | { ok: false; reason: "limit" | "error" };

export async function createDeveloperKey(userId: string, label: string): Promise<CreateKeyResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "error" };
  const { count, error: countError } = await admin
    .from("developer_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (countError) return { ok: false, reason: "error" };
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) return { ok: false, reason: "limit" };

  const key = `tml_${randomBytes(24).toString("base64url")}`;
  const { error } = await admin.from("developer_keys").insert({
    user_id: userId,
    label,
    prefix: key.slice(0, 10),
    key_hash: hashKey(key),
  });
  if (error) {
    console.error("[developpeurs] Création du code impossible", error);
    return { ok: false, reason: "error" };
  }
  return { ok: true, key };
}

export async function revokeDeveloperKey(userId: string, id: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin
    .from("developer_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) console.error("[developpeurs] Suppression du code impossible", error);
  return !error;
}

/** Code reçu par l'API : identifiant du code et compte qui l'a créé s'il est valide et actif, sinon null. */
export async function findDeveloperKey(token: string): Promise<{ id: string; userId: string } | null> {
  if (!KEY_PATTERN.test(token)) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("developer_keys")
    .select("id, user_id")
    .eq("key_hash", hashKey(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) console.error("[developpeurs] Vérification du code impossible", error);
  if (!data) return null;
  return { id: data.id, userId: data.user_id };
}

/** Date de dernière utilisation, affichée sur /developpeurs (appelée après la réponse, avec after()). */
export async function touchDeveloperKey(id: string): Promise<void> {
  const { error } = (await getSupabaseAdminClient()?.from("developer_keys").update({ last_used_at: new Date().toISOString() }).eq("id", id)) ?? {};
  if (error) console.error("[developpeurs] Date d'utilisation non enregistrée", error);
}
