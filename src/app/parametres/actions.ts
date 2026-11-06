"use server";

import { revalidatePath } from "next/cache";
import { addressSchema, MAX_SAVED_ADDRESSES, savedAddressSchema } from "@/lib/address";
import { getAuthContext } from "@/lib/auth/session";
import { maskPhone, normalizePhone } from "@/lib/code-exam/candidate";
import { disconnectDrive } from "@/lib/drive/connection";
import { notifyAccountChange, notifyAccountDeleted } from "@/lib/email/notify";
import { saveProfileAddress, saveProfilePhone } from "@/lib/profile-contact";
import { deleteSavedAddress, saveSavedAddress } from "@/lib/saved-addresses";
import { profileSchema } from "@/lib/chat/validation";
import { getProfile, updateProfile } from "@/lib/conversations/repository";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { deleteMyReview, saveMyReview } from "@/lib/reviews";
import { publicName, reviewSchema } from "@/lib/reviews/rules";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DELETE_CONFIRMATION } from "./confirmation";

export type ProfileFormState = { status: "idle" | "saved" | "error"; message?: string };

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  // L'action s'autorise elle-même : on relit la session, sans se fier au formulaire.
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };

  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  }

  try {
    const before = await getProfile(supabase, user.id).catch(() => null);
    await updateProfile(supabase, user.id, parsed.data.displayName || null);
    if ((before?.displayName ?? null) !== (parsed.data.displayName || null)) {
      await notifyAccountChange(user.email, { action: "modification", what: "Votre nom", value: parsed.data.displayName || "(retiré)" });
    }
  } catch (error) {
    console.error("[parametres] Mise à jour du profil impossible", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessaie." };
  }

  revalidatePath("/", "layout");
  return { status: "saved", message: "Paramètres enregistrés." };
}

/**
 * Suppression définitive du compte : l'utilisateur d'auth est effacé, et avec
 * lui (on delete cascade) son profil, ses conversations et ses messages.
 * Le compte administrateur protégé est refusé par la base elle-même.
 */
export async function deleteAccountAction(confirmation: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  if (confirmation !== DELETE_CONFIRMATION) {
    return { status: "error", message: `Écris ${DELETE_CONFIRMATION} pour confirmer.` };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { status: "error", message: "La suppression est indisponible pour le moment." };

  // Avant la suppression, qui efface le jeton : l'accès au Drive doit aussi être retiré chez Google.
  if (!user.isAdmin) await disconnectDrive(admin, user.id).catch(() => {});

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    // Le refus du déclencheur arrive en « Database error » générique : un admin refusé est le compte protégé.
    if (user.isAdmin || /protégé|protected/i.test(error.message)) {
      return { status: "error", message: "Ce compte administrateur est protégé : il ne peut pas être supprimé." };
    }
    console.error("[parametres] Suppression du compte impossible", error);
    return { status: "error", message: "La suppression a échoué. Réessaie." };
  }

  await notifyAccountDeleted(user.email);
  // Efface les cookies de session (le jeton ne correspond plus à aucun compte).
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  revalidatePath("/", "layout");
  return { status: "saved", message: "Ton compte a été supprimé." };
}

/** Adresse du compte : livraisons et « près de chez moi » (bureau du code le plus proche…). */
export async function saveAddressAction(input: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  try {
    await saveProfileAddress(supabase, user.id, parsed.data);
    await notifyAccountChange(user.email, { action: "modification", what: "Votre adresse", feminine: true, value: parsed.data.commune });
  } catch (error) {
    console.error("[parametres] Adresse non enregistrée", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessaie." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Adresse enregistrée." };
}

/** Téléphone du compte (livreur, rappel pour le code) : jamais renvoyé en entier au navigateur. */
export async function savePhoneAction(input: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  const phone = typeof input === "string" ? normalizePhone(input) : null;
  if (!phone) return { status: "error", message: "Numéro invalide : 10 chiffres, par exemple 0639 12 34 56." };
  try {
    await saveProfilePhone(supabase, user.id, phone);
    await notifyAccountChange(user.email, { action: "modification", what: "Votre numéro de téléphone", value: maskPhone(phone) });
  } catch (error) {
    console.error("[parametres] Téléphone non enregistré", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessaie." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Numéro enregistré." };
}

/** Fait oublier à Tamilya un souvenir (kind), ou tous si kind est absent. */
export async function forgetMemoryAction(kind?: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  let query = supabase.from("awa_memories").delete().eq("user_id", user.id);
  if (kind !== undefined) {
    if (typeof kind !== "string" || kind.length > 60) return { status: "error", message: "Souvenir inconnu." };
    query = query.eq("kind", kind);
  }
  const { error } = await query;
  if (error) {
    console.error("[parametres] Souvenir non effacé", error);
    return { status: "error", message: "L'effacement a échoué. Réessaie." };
  }
  await notifyAccountChange(user.email, {
    action: "suppression",
    what: kind === undefined ? "Tout ce dont Tamilya se souvenait" : "Un souvenir de Tamilya",
  });
  revalidatePath("/parametres");
  return { status: "saved", message: kind === undefined ? "Tamilya a tout oublié." : "Souvenir effacé." };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ajoute (id absent) ou modifie une adresse du carnet : travail, ami, famille… */
export async function saveSavedAddressAction(input: unknown, id?: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  if (id !== undefined && (typeof id !== "string" || !UUID.test(id))) return { status: "error", message: "Adresse inconnue." };
  const parsed = savedAddressSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  try {
    await saveSavedAddress(supabase, parsed.data, id);
    await notifyAccountChange(user.email, {
      action: id ? "modification" : "ajout",
      what: "Une adresse de votre carnet",
      feminine: true,
      value: `${parsed.data.label} · ${parsed.data.commune}`,
    });
  } catch (error) {
    const full = error instanceof Error && /Carnet plein/.test(error.message);
    if (!full) console.error("[parametres] Adresse du carnet non enregistrée", error);
    return { status: "error", message: full ? `Carnet plein : ${MAX_SAVED_ADDRESSES} adresses au maximum.` : "L'enregistrement a échoué. Réessaie." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: id ? "Adresse modifiée." : "Adresse ajoutée." };
}

export async function deleteSavedAddressAction(id: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  if (typeof id !== "string" || !UUID.test(id)) return { status: "error", message: "Adresse inconnue." };
  try {
    await deleteSavedAddress(supabase, id);
    await notifyAccountChange(user.email, { action: "suppression", what: "Une adresse de votre carnet", feminine: true });
  } catch (error) {
    console.error("[parametres] Adresse du carnet non supprimée", error);
    return { status: "error", message: "La suppression a échoué. Réessaie." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Adresse supprimée." };
}

/** Publie ou modifie l'avis du compte sur BTM AI (affiché sur la page d'accueil). */
export async function saveReviewAction(input: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Avis invalide." };
  const limit = await consumeRateLimits([{ key: `review:${user.id}`, rules: RATE_LIMIT_POLICIES.review }]).catch(() => null);
  if (!limit?.allowed) return { status: "error", message: "Trop de modifications d'un coup : réessaie dans une heure." };
  try {
    // Nom public tiré du profil par le serveur (« Fatima M. »), jamais envoyé par le navigateur.
    const profile = await getProfile(supabase, user.id);
    await saveMyReview(user.id, publicName(profile.displayName), parsed.data);
    await notifyAccountChange(user.email, { action: "modification", what: "Votre avis sur BTM AI" });
  } catch (error) {
    console.error("[parametres] Avis non enregistré", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessaie." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Merci ! Ton avis est publié." };
}

export async function deleteReviewAction(): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Ta session a expiré. Reconnecte-toi." };
  try {
    await deleteMyReview(user.id);
    await notifyAccountChange(user.email, { action: "suppression", what: "Votre avis sur BTM AI" });
  } catch (error) {
    console.error("[parametres] Avis non supprimé", error);
    return { status: "error", message: "La suppression a échoué. Réessaie." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Ton avis est supprimé." };
}
