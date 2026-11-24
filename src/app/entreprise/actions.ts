"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/server/middlewares/session";
import { canUse } from "@/server/services/site/features";
import { saveListingAsOwner } from "@/server/services/entreprises/listings";
import { confirmClaim, requestClaim, searchClaimable, type ClaimableListing } from "@/server/services/entreprises/claims";
import { linkWidget } from "@/server/services/entreprises/widgets";
import { listingEditSchema } from "@/lib/entreprises/listing";

type Result = { ok: boolean; message: string };

const SIGN_IN: Result = { ok: false, message: "Connectez-vous d'abord." };

/** Compte connecté, et l'espace entreprise ouvert pour lui. */
async function account() {
  const { user } = await getAuthContext();
  if (!user || !(await canUse(user, "entreprises"))) return null;
  return user;
}

export async function searchListingsAction(query: unknown): Promise<ClaimableListing[]> {
  if (!(await account()) || typeof query !== "string") return [];
  return searchClaimable(query);
}

const claimSchema = z.object({
  listingId: z.uuid(),
  siret: z.string().transform((v) => v.replace(/\s/g, "")).pipe(z.string().regex(/^\d{14}$/, "Le SIRET a 14 chiffres.")),
  contactName: z.string().trim().min(2, "Donnez votre nom.").max(80),
});

const CLAIM_ERRORS = {
  not_found: "Cette fiche n'existe plus.",
  taken: "Cette fiche est déjà tenue par un autre compte. Si c'est une erreur, écrivez à contact@btm.yt.",
  not_ready: "Notre équipe n'a pas encore vérifié le SIRET et le numéro de cette fiche. Écrivez à contact@btm.yt, nous la complétons.",
  siret_mismatch: "Ce SIRET n'est pas celui de la fiche.",
  too_many: "Vous avez déjà trois demandes en cours. Attendez nos appels.",
  error: "La demande n'est pas passée. Réessayez.",
} as const;

export async function requestClaimAction(input: unknown): Promise<Result> {
  const user = await account();
  if (!user) return SIGN_IN;
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Demande incomplète." };
  const done = await requestClaim(user.id, parsed.data.listingId, parsed.data.siret, parsed.data.contactName);
  if (!done.ok) return { ok: false, message: CLAIM_ERRORS[done.reason] };
  revalidatePath("/entreprise");
  return { ok: true, message: "Demande envoyée. Notre équipe vous appelle au numéro de la fiche pour vous donner un code." };
}

const codeSchema = z.object({ claimId: z.uuid(), code: z.string().regex(/^\d{6}$/, "Le code a 6 chiffres.") });

const CODE_ERRORS = {
  wrong_code: "Ce n'est pas le bon code.",
  locked: "Trop d'essais. Écrivez à contact@btm.yt pour recevoir un nouveau code.",
  expired: "Cette demande a expiré. Refaites-la.",
  taken: "Cette fiche vient d'être prise par un autre compte. Écrivez à contact@btm.yt.",
  error: "La vérification n'a pas marché. Réessayez.",
} as const;

export async function confirmClaimAction(input: unknown): Promise<Result> {
  const user = await account();
  if (!user) return SIGN_IN;
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Code invalide." };
  const done = await confirmClaim(user.id, parsed.data.claimId, parsed.data.code);
  if (!done.ok) return { ok: false, message: CODE_ERRORS[done.reason] };
  revalidatePath("/entreprise");
  return { ok: true, message: "C'est fait : la fiche est à vous." };
}

export async function saveOwnListingAction(listingId: string, input: unknown): Promise<Result> {
  const user = await account();
  if (!user) return SIGN_IN;
  if (!z.uuid().safeParse(listingId).success) return { ok: false, message: "Fiche inconnue." };
  const parsed = listingEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Fiche incomplète." };
  if (!(await saveListingAsOwner(user.id, listingId, parsed.data))) return { ok: false, message: "L'enregistrement n'est pas passé. Réessayez." };
  revalidatePath("/entreprise");
  return { ok: true, message: "Enregistré. Tamilya donne vos nouvelles informations dans moins d'une minute." };
}

const linkSchema = z.object({ widgetId: z.uuid(), listingId: z.uuid().nullable() });

export async function linkWidgetAction(input: unknown): Promise<Result> {
  const user = await account();
  if (!user) return SIGN_IN;
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success || !(await linkWidget(user.id, parsed.data.widgetId, parsed.data.listingId))) return { ok: false, message: "Le changement n'est pas passé." };
  revalidatePath("/entreprise");
  return { ok: true, message: parsed.data.listingId ? "Votre chatbot répond maintenant avec votre fiche." : "Votre chatbot ne lit plus votre fiche." };
}
