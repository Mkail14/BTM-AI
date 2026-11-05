import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReplyEnvelope } from "./envelope";

/** Tamilya Connect en base (tables mesh_*, serveur seulement). */

export const MAX_DEVICES_PER_USER = 5;
export const ACTION_TTL_MS = 30 * 60_000;

export type MeshDevice = { id: string; userId: string; publicKey: string };

/** Enregistre la clé d'un appareil (ou la retrouve). null : trop d'appareils pour ce compte. */
export async function registerDevice(admin: SupabaseClient, userId: string, publicKey: string): Promise<{ id: string } | null> {
  const { data: existing, error: readError } = await admin
    .from("mesh_devices")
    .select("id, user_id, revoked_at")
    .eq("public_key", publicKey)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    // La même clé déjà prise par un autre compte : refusée (une clé = un appareil = un compte).
    if (existing.user_id !== userId || existing.revoked_at) return null;
    return { id: existing.id as string };
  }
  const { count, error: countError } = await admin
    .from("mesh_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_DEVICES_PER_USER) return null;
  const { data, error } = await admin.from("mesh_devices").insert({ user_id: userId, public_key: publicKey }).select("id").single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function findDevice(admin: SupabaseClient, deviceId: string): Promise<MeshDevice | null> {
  const { data, error } = await admin.from("mesh_devices").select("id, user_id, public_key, revoked_at").eq("id", deviceId).maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return null;
  return { id: data.id as string, userId: data.user_id as string, publicKey: data.public_key as string };
}

export async function touchDevice(admin: SupabaseClient, deviceId: string) {
  await admin.from("mesh_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", deviceId);
}

export type Claim = { state: "new" } | { state: "done"; reply: ReplyEnvelope } | { state: "pending" } | { state: "foreign" };

/**
 * Réserve un message avant de le traiter. Un doublon (le même message arrivé par
 * deux chemins) reçoit la réponse déjà faite, ou « en cours » s'il est encore traité.
 */
export async function claimMessage(admin: SupabaseClient, id: string, device: MeshDevice): Promise<Claim> {
  const { error } = await admin.from("mesh_messages").insert({ id, device_id: device.id, user_id: device.userId });
  if (!error) return { state: "new" };
  if (error.code !== "23505") throw error;
  const { data, error: readError } = await admin.from("mesh_messages").select("device_id, reply").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!data || data.device_id !== device.id) return { state: "foreign" };
  return data.reply ? { state: "done", reply: data.reply as ReplyEnvelope } : { state: "pending" };
}

export async function saveReply(admin: SupabaseClient, id: string, reply: ReplyEnvelope) {
  const { error } = await admin.from("mesh_messages").update({ reply }).eq("id", id);
  if (error) throw error;
}

/** Traitement raté avant toute action : le message pourra être renvoyé. */
export async function releaseMessage(admin: SupabaseClient, id: string) {
  await admin.from("mesh_messages").delete().eq("id", id).is("reply", null);
}

export type StoredAction = { id: string; userId: string; kind: "barge" | "food"; data: Record<string, unknown>; label: string };

export async function createAction(admin: SupabaseClient, action: Omit<StoredAction, "id">, now = Date.now()): Promise<string> {
  const id = randomBytes(18).toString("base64url");
  const { error } = await admin.from("mesh_actions").insert({
    id,
    user_id: action.userId,
    kind: action.kind,
    data: action.data,
    label: action.label,
    expires_at: new Date(now + ACTION_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return id;
}

export async function readAction(admin: SupabaseClient, id: string, userId: string, now = Date.now()): Promise<StoredAction | "used" | "expired" | null> {
  const { data, error } = await admin.from("mesh_actions").select("id, user_id, kind, data, label, expires_at, used_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) return null;
  if (data.used_at) return "used";
  if (Date.parse(data.expires_at as string) < now) return "expired";
  return { id: data.id as string, userId, kind: data.kind as StoredAction["kind"], data: data.data as Record<string, unknown>, label: data.label as string };
}

/** Marque le choix comme utilisé ; faux si un autre message l'a déjà pris (une seule fois, même en parallèle). */
export async function spendAction(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await admin.from("mesh_actions").update({ used_at: new Date().toISOString() }).eq("id", id).is("used_at", null).select("id");
  if (error) throw error;
  return (data ?? []).length === 1;
}
