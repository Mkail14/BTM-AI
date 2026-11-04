import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPersonalityId } from "@/lib/ai/personalities";
import type { SessionUser } from "@/lib/auth/identity";
import { profileSchema } from "@/lib/chat/validation";
import { getProfile, updatePersonality, updateProfile } from "@/lib/conversations/repository";
import { notifyAccountChange, notifyAccountDeleted } from "@/lib/email/notify";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatEuros } from "@/lib/wallet/limits";
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
      kind: "invalid_request" | "forbidden" | "unavailable" | "internal" | "reauth_required" | "wallet_not_empty";
    };

export type AccountDeps = {
  notifyChange: typeof notifyAccountChange;
  notifyDeleted: typeof notifyAccountDeleted;
  getAdminClient: typeof getSupabaseAdminClient;
  /** Heure courante en ms (remplaçable dans les tests). */
  now: () => number;
  /** Solde et recharge en cours du compte (lecture RLS). */
  readWallet: (supabase: SupabaseClient, userId: string) => Promise<{ balanceCents: number; pendingTopup: boolean }>;
};

/** Une suppression de compte exige une authentification de moins de 10 minutes. */
export const RECENT_AUTH_SECONDS = 600;

async function readWalletState(supabase: SupabaseClient, userId: string) {
  const [wallet, pending] = await Promise.all([
    supabase.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle(),
    supabase
      .from("wallet_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "topup")
      .eq("status", "pending")
      .limit(1),
  ]);
  if (wallet.error) throw wallet.error;
  if (pending.error) throw pending.error;
  return {
    balanceCents: Number((wallet.data as { balance_cents?: number } | null)?.balance_cents ?? 0),
    pendingTopup: (pending.data?.length ?? 0) > 0,
  };
}

const defaultDeps: AccountDeps = {
  notifyChange: notifyAccountChange,
  notifyDeleted: notifyAccountDeleted,
  getAdminClient: getSupabaseAdminClient,
  now: () => Date.now(),
  readWallet: readWalletState,
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
  supabase: SupabaseClient,
  user: SessionUser,
  confirmation: unknown,
  deps: AccountDeps = defaultDeps,
): Promise<AccountResult> {
  if (confirmation !== DELETE_CONFIRMATION) {
    return { ok: false, kind: "invalid_request", message: `Écris ${DELETE_CONFIRMATION} pour confirmer.` };
  }

  // Authentification récente : un jeton ou une session volés ne suffisent pas à détruire le compte.
  const ageSeconds = user.authenticatedAt === null ? Infinity : deps.now() / 1000 - user.authenticatedAt;
  if (ageSeconds > RECENT_AUTH_SECONDS) {
    return {
      ok: false,
      kind: "reauth_required",
      message: "Pour ta sécurité, reconnecte-toi avant de supprimer ton compte (ta connexion date de plus de 10 minutes).",
    };
  }

  // Le portefeuille disparaît avec le compte : solde et recharge en cours doivent être réglés avant.
  try {
    const wallet = await deps.readWallet(supabase, user.id);
    if (wallet.balanceCents > 0) {
      return {
        ok: false,
        kind: "wallet_not_empty",
        message: `Ton portefeuille contient encore ${formatEuros(wallet.balanceCents)}. Utilise ou fais rembourser ton solde avant de supprimer ton compte.`,
      };
    }
    if (wallet.pendingTopup) {
      return {
        ok: false,
        kind: "wallet_not_empty",
        message: "Une recharge de ton portefeuille est en cours. Attends qu'elle soit terminée avant de supprimer ton compte.",
      };
    }
  } catch (error) {
    console.error("[parametres] Portefeuille illisible avant la suppression", error);
    return { ok: false, kind: "internal", message: "La suppression a échoué. Réessaie." };
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
