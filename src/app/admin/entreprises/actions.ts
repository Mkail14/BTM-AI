"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { deleteListing, detachOwner, saveListingAsTeam } from "@/server/services/entreprises/listings";
import { markClaimCodeSent, refuseClaim } from "@/server/services/entreprises/claims";
import { listingAdminSchema } from "@/lib/entreprises/listing";

const id = z.uuid();
const firstError = (error: z.ZodError) => error.issues[0]?.message ?? "Fiche incomplète.";

/** Nouvelle fiche (id null) ou fiche existante. Une nouvelle fiche ouvre sa page. */
export async function saveListingAction(listingId: string | null, input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  if (listingId !== null && !id.safeParse(listingId).success) return { ok: false, message: "Fiche inconnue." };
  const parsed = listingAdminSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const saved = await saveListingAsTeam(listingId, parsed.data, auth.user.id);
  if (!saved.ok) {
    return {
      ok: false,
      message: saved.reason === "siret_taken" ? "Une autre fiche a déjà ce SIRET." : "L'enregistrement a échoué (migration 20261226000000_annuaire_entreprises.sql appliquée ?).",
    };
  }
  revalidatePath("/admin/entreprises");
  if (!listingId) redirect(`/admin/entreprises/${saved.id}`);
  return {
    ok: true,
    message: parsed.data.published ? "Enregistré. Tamilya le dit dans moins d'une minute." : "Enregistré en brouillon : Tamilya ne la lit pas encore.",
  };
}

export async function deleteListingAction(listingId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  if (!id.safeParse(listingId).success || !(await deleteListing(listingId))) return { ok: false, message: "Suppression impossible." };
  revalidatePath("/admin/entreprises");
  redirect("/admin/entreprises");
}

export async function detachOwnerAction(listingId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  if (!id.safeParse(listingId).success || !(await detachOwner(listingId))) return { ok: false, message: "Impossible pour le moment." };
  revalidatePath(`/admin/entreprises/${listingId}`);
  return { ok: true, message: "L'entreprise n'a plus la main sur cette fiche." };
}

export async function claimCodeSentAction(claimId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  if (!id.safeParse(claimId).success || !(await markClaimCodeSent(claimId))) return { ok: false, message: "Impossible pour le moment." };
  revalidatePath("/admin/entreprises");
  return { ok: true, message: "Noté : l'entreprise peut taper son code." };
}

export async function refuseClaimAction(claimId: string): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  if (!id.safeParse(claimId).success || !(await refuseClaim(claimId))) return { ok: false, message: "Impossible pour le moment." };
  revalidatePath("/admin/entreprises");
  return { ok: true, message: "Demande refusée." };
}
