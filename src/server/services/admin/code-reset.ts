import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { CODE_RESET_KEY, closeSessions, listAdmins, type AdminAccount } from "./delegation";

/**
 * « Code oublié » d'un administrateur délégué qui n'a plus son application
 * d'authentification. La demande est gardée dans son app_metadata (aucune
 * table à créer) ; l'administrateur principal la voit en pastille, puis
 * supprime le compte en entier. La personne recrée son compte avec la même
 * adresse et le principal lui redonne l'accès.
 */

export type ResetResult = { ok: true; message: string } | { ok: false; message: string };

/** Demandes en attente, de la plus ancienne à la plus récente. Gardées 30 s : la pastille est lue sur chaque page. */
let cache: { at: number; list: AdminAccount[] } | null = null;
const CACHE_MS = 30_000;

export async function listCodeResets({ fresh = false } = {}): Promise<AdminAccount[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  const admins = await listAdmins();
  const list = (admins ?? []).filter((a) => a.secondary && a.codeResetAt).sort((a, b) => a.codeResetAt!.localeCompare(b.codeResetAt!));
  cache = { at: Date.now(), list };
  return list;
}

const forget = () => {
  cache = null;
};

/** Le délégué demande la réinitialisation. Le principal, lui, n'a personne au-dessus : refusé. */
export async function requestCodeReset(userId: string): Promise<ResetResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Demande impossible pour le moment." };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false, message: "Compte introuvable." };
  const meta = data.user.app_metadata ?? {};
  if (meta.role !== "admin") return { ok: false, message: "Accès réservé aux administrateurs." };
  if (meta.admin_level !== "secondary") {
    return {
      ok: false,
      message: "Tu es l'administrateur principal : retire l'application depuis Supabase (Authentication, ton compte, MFA), puis recharge cette page.",
    };
  }
  if (typeof meta[CODE_RESET_KEY] === "string") return { ok: true, message: "Demande déjà envoyée : l'administrateur principal va réinitialiser ton compte." };
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...meta, [CODE_RESET_KEY]: new Date().toISOString() },
  });
  if (updateError) {
    console.error("[admin] Demande « code oublié » non enregistrée", updateError.message);
    return { ok: false, message: "Demande non envoyée : réessaie." };
  }
  forget();
  return { ok: true, message: "Demande envoyée : l'administrateur principal va réinitialiser ton compte." };
}

/** Le principal refuse la demande : rien n'est supprimé. */
export async function dismissCodeReset(userId: string): Promise<ResetResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Comptes illisibles : réessaie." };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false, message: "Compte introuvable." };
  const meta = { ...(data.user.app_metadata ?? {}) };
  delete meta[CODE_RESET_KEY];
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (updateError) return { ok: false, message: "Refus non enregistré : réessaie." };
  forget();
  return { ok: true, message: `Demande de ${data.user.email ?? "ce compte"} refusée.` };
}

/**
 * Réinitialisation : le compte du délégué est supprimé en entier (profil,
 * conversations, messages partent avec lui). Seulement un délégué qui l'a
 * demandé, et sans argent réel dans son portefeuille.
 */
export async function resetAdminAccount(userId: string): Promise<ResetResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "Comptes illisibles : réessaie." };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false, message: "Compte introuvable : déjà supprimé ?" };
  const meta = data.user.app_metadata ?? {};
  if (meta.admin_level !== "secondary" || typeof meta[CODE_RESET_KEY] !== "string") {
    return { ok: false, message: "Ce compte n'a pas demandé de réinitialisation." };
  }
  const wallet = await admin.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle();
  if (wallet.error) return { ok: false, message: "Solde illisible : réessaie." };
  if (Number(wallet.data?.balance_cents ?? 0) > 0) {
    return { ok: false, message: "Il reste de l'argent sur son portefeuille : rembourse-le avant de supprimer le compte." };
  }
  await closeSessions(userId);
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[admin] Réinitialisation impossible", deleteError.message);
    return { ok: false, message: "La suppression a échoué : réessaie." };
  }
  forget();
  return {
    ok: true,
    message: `Compte de ${data.user.email ?? "ce délégué"} supprimé. Quand la personne l'aura recréé, redonne-lui l'accès dans Mon compte, Administration.`,
  };
}
