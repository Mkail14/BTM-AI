import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";

/**
 * Rattachement d'une fiche à un compte (table business_claims). L'entreprise donne son
 * SIRET, qui doit être celui de la fiche ; l'équipe GROUPE BTM lui transmet alors un code
 * au numéro vérifié de la fiche (appel ou SMS), et elle le tape dans son espace.
 * Le code ne passe jamais par l'écran de celui qui le demande : il prouve qu'il répond
 * bien au numéro de l'entreprise.
 */

const MAX_PENDING_PER_ACCOUNT = 3;
const MAX_ATTEMPTS = 5;

export type ClaimableListing = { id: string; name: string; commune: string | null; category: string | null; ready: boolean };

/** Fiches publiées sans propriétaire, par nom ou SIRET (8 au plus). */
export async function searchClaimable(query: string): Promise<ClaimableListing[]> {
  const admin = getSupabaseAdminClient();
  const q = query.trim().slice(0, 80);
  if (!admin || q.length < 2) return [];
  const digits = q.replace(/\s/g, "");
  const filter = /^\d{9,14}$/.test(digits) ? admin.from("business_listings").select("id, name, commune, category, siret, phones").like("siret", `${digits}%`) : admin.from("business_listings").select("id, name, commune, category, siret, phones").ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data, error } = await filter.eq("published", true).is("owner_id", null).order("name").limit(8);
  if (error) return [];
  return data.map((r) => ({ id: r.id, name: r.name, commune: r.commune, category: r.category, ready: Boolean(r.siret) && (r.phones ?? []).length > 0 }));
}

export type ClaimRequestResult = { ok: true } | { ok: false; reason: "not_found" | "taken" | "not_ready" | "siret_mismatch" | "too_many" | "error" };

export async function requestClaim(userId: string, listingId: string, siret: string, contactName: string): Promise<ClaimRequestResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "error" };
  const { data: listing } = await admin.from("business_listings").select("id, siret, phones, owner_id, published").eq("id", listingId).maybeSingle();
  if (!listing || !listing.published) return { ok: false, reason: "not_found" };
  if (listing.owner_id) return { ok: false, reason: listing.owner_id === userId ? "error" : "taken" };
  if (!listing.siret || !(listing.phones ?? []).length) return { ok: false, reason: "not_ready" };
  if (listing.siret !== siret) return { ok: false, reason: "siret_mismatch" };

  const { data: pending } = await admin.from("business_claims").select("id, listing_id").eq("user_id", userId).eq("status", "en_attente");
  if (pending?.some((c) => c.listing_id === listingId)) return { ok: true };
  if ((pending?.length ?? 0) >= MAX_PENDING_PER_ACCOUNT) return { ok: false, reason: "too_many" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await admin.from("business_claims").insert({ listing_id: listingId, user_id: userId, siret, contact_name: contactName, code });
  if (error) {
    console.error("[annuaire] Demande de rattachement non enregistrée", error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

export type MyClaim = { id: string; listingName: string; codeSent: boolean; expiresAt: string };

/** Demandes en attente de ce compte (sans le code). */
export async function listMyClaims(userId: string): Promise<MyClaim[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("business_claims")
    .select("id, code_sent_at, expires_at, business_listings(name)")
    .eq("user_id", userId)
    .eq("status", "en_attente")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [];
  return data.map((c) => ({
    id: c.id,
    listingName: (c.business_listings as unknown as { name: string } | null)?.name ?? "Entreprise",
    codeSent: Boolean(c.code_sent_at),
    expiresAt: c.expires_at,
  }));
}

export type ConfirmResult = { ok: true } | { ok: false; reason: "wrong_code" | "locked" | "expired" | "taken" | "error" };

/** Le code tapé par l'entreprise : la fiche passe à son compte. */
export async function confirmClaim(userId: string, claimId: string, code: string): Promise<ConfirmResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "error" };
  const { data: claim } = await admin
    .from("business_claims")
    .select("id, listing_id, code, attempts, status, expires_at")
    .eq("id", claimId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!claim || claim.status !== "en_attente") return { ok: false, reason: "expired" };
  if (Date.parse(claim.expires_at) < Date.now()) {
    await admin.from("business_claims").update({ status: "expiree" }).eq("id", claim.id);
    return { ok: false, reason: "expired" };
  }
  if (claim.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  await admin.from("business_claims").update({ attempts: claim.attempts + 1 }).eq("id", claim.id);
  const typed = Buffer.from(code.padEnd(6, " ").slice(0, 6));
  if (!timingSafeEqual(typed, Buffer.from(claim.code))) {
    return { ok: false, reason: claim.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong_code" };
  }
  // Seulement si personne n'a pris la fiche entre-temps.
  const { data: taken, error } = await admin
    .from("business_listings")
    .update({ owner_id: userId })
    .eq("id", claim.listing_id)
    .is("owner_id", null)
    .select("id");
  if (error) return { ok: false, reason: "error" };
  if (!taken?.length) return { ok: false, reason: "taken" };
  await admin.from("business_claims").update({ status: "validee" }).eq("id", claim.id);
  await admin.from("business_claims").update({ status: "refusee" }).eq("listing_id", claim.listing_id).eq("status", "en_attente");
  return { ok: true };
}

export type PendingClaim = {
  id: string;
  listingId: string;
  listingName: string;
  phones: string[];
  contactName: string;
  code: string;
  codeSentAt: string | null;
  createdAt: string;
};

/** Pour l'équipe : les demandes à traiter, avec le code à transmettre au numéro de la fiche. */
export async function listPendingClaims(): Promise<PendingClaim[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("business_claims")
    .select("id, listing_id, contact_name, code, code_sent_at, created_at, business_listings(name, phones)")
    .eq("status", "en_attente")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return null;
  return data.map((c) => {
    const listing = c.business_listings as unknown as { name: string; phones: string[] | null } | null;
    return {
      id: c.id,
      listingId: c.listing_id,
      listingName: listing?.name ?? "Fiche supprimée",
      phones: listing?.phones ?? [],
      contactName: c.contact_name,
      code: c.code,
      codeSentAt: c.code_sent_at,
      createdAt: c.created_at,
    };
  });
}

export async function markClaimCodeSent(claimId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("business_claims").update({ code_sent_at: new Date().toISOString() }).eq("id", claimId).eq("status", "en_attente");
  return !error;
}

export async function refuseClaim(claimId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("business_claims").update({ status: "refusee" }).eq("id", claimId).eq("status", "en_attente");
  return !error;
}
