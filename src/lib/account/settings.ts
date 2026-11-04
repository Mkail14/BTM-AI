import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPersonalityId } from "@/lib/ai/personalities";
import type { SessionUser } from "@/lib/auth/identity";
import { profileSchema } from "@/lib/chat/validation";
import { getProfile, updatePersonality, updateProfile } from "@/lib/conversations/repository";
import { notifyAccountChange, notifyAccountDeleted } from "@/lib/email/notify";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DELETE_CONFIRMATION } from "./confirmation";

/**
 * Cœur des réglages du compte, partagé par les Server Actions du site
 * (src/app/parametres/actions.ts) et par la route /api/me (application mobile).
 * Les messages sont ceux du site : ne pas les modifier sans toucher aux deux.
 */


export type AccountResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      /** invalid_request : saisie refusée ; forbidden : compte protégé ; unavailable : service absent ; internal : échec. */
      kind: "invalid_request" | "forbidden" | "unavailable" | "internal";
    };

export type AccountDeps = {
  notifyChange: typeof notifyAccountChange;
  notifyDeleted: typeof notifyAccountDeleted;
  getAdminClient: typeof getSupabaseAdminClient;
};

const defaultDeps: AccountDeps = {
  notifyChange: notifyAccountChange,
  notifyDeleted: notifyAccountDeleted,
  getAdminClient: getSupabaseAdminClient,
};

const SAVE_FAILED = "L'enregistrement a échoué. Réessaie.";

/** Nom affiché. `input` : { displayName } (même schéma que le formulaire du site). */
export async function saveDisplayName(
  supabase: SupabaseClient,
  user: SessionUser,
  input: unknown,
  deps: AccountDeps = defaultDeps,
): Promise<AccountResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, kind: "invalid_request", message: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  }

  try {
    const before = await getProfile(supabase, user.id).catch(() => null);
    await updateProfile(supabase, user.id, parsed.data.displayName || null);
    if ((before?.displayName ?? null) !== (parsed.data.displayName || null)) {
      await deps.notifyChange(user.email, { action: "modification", what: "Votre nom", value: parsed.data.displayName || "(retiré)" });
    }
  } catch (error) {
    console.error("[parametres] Mise à jour du profil impossible", error);
    return { ok: false, kind: "internal", message: SAVE_FAILED };
  }
  return { ok: true, message: "Paramètres enregistrés." };
}

/** Personnalité de Tamilya (après l'inscription ou depuis les Paramètres). */
export async function savePersonality(
  supabase: SupabaseClient,
  user: SessionUser,
  personality: unknown,
): Promise<AccountResult> {
  if (!isPersonalityId(personality)) return { ok: false, kind: "invalid_request", message: "Personnalité inconnue." };

  try {
    await updatePersonality(supabase, user.id, personality);
  } catch (error) {
    console.error("[parametres] Choix de personnalité impossible", error);
    return { ok: false, kind: "internal", message: SAVE_FAILED };
  }
  return { ok: true, message: "C'est noté, Tamilya change de personnalité !" };
}

/**
 * Suppression définitive du compte : l'utilisateur d'auth est effacé, et avec
 * lui (on delete cascade) son profil, ses conversations et ses messages.
 * Le compte administrateur protégé est refusé par la base elle-même.
 * La fermeture de la session (cookies) reste à la charge de l'appelant.
 */
export async function removeAccount(
  user: SessionUser,
  confirmation: unknown,
  deps: AccountDeps = defaultDeps,
): Promise<AccountResult> {
  if (confirmation !== DELETE_CONFIRMATION) {
    return { ok: false, kind: "invalid_request", message: `Écris ${DELETE_CONFIRMATION} pour confirmer.` };
  }

  const admin = deps.getAdminClient();
  if (!admin) return { ok: false, kind: "unavailable", message: "La suppression est indisponible pour le moment." };

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    // Le refus du déclencheur arrive en « Database error » générique : un admin refusé est le compte protégé.
    if (user.isAdmin || /protégé|protected/i.test(error.message)) {
      return { ok: false, kind: "forbidden", message: "Ce compte administrateur est protégé : il ne peut pas être supprimé." };
    }
    console.error("[parametres] Suppression du compte impossible", error);
    return { ok: false, kind: "internal", message: "La suppression a échoué. Réessaie." };
  }

  await deps.notifyDeleted(user.email);
  return { ok: true, message: "Ton compte a été supprimé." };
}
