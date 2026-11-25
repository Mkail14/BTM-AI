import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { normalize } from "@/lib/live/intent";
import { COMMUNES, DIRECTORY_RULES, isComplete, listingForTamilya, type Listing, type ListingAdminEdit, type ListingEdit } from "@/lib/entreprises/listing";
import type { CompanyAsk } from "@/server/services/live/companies";

/**
 * Annuaire Tamilya des entreprises de Mayotte (table business_listings, migration
 * 20261226000000_annuaire_entreprises.sql). Lu et écrit avec la clé secrète, après les
 * vérifications de la page ou de l'action qui appelle.
 */

const COLUMNS =
  "id, name, aliases, siret, category, description, services, commune, village, address, landmark, latitude, longitude, phones, whatsapp, email, website, facebook, instagram, hours, hours_note, opened_on, payments, delivery, parking, wheelchair, languages, status, published, verified_on, owner_id, owner_updated_at, updated_at";

type Row = {
  id: string;
  name: string;
  aliases: string[] | null;
  siret: string | null;
  category: string | null;
  description: string | null;
  services: string[] | null;
  commune: string | null;
  village: string | null;
  address: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  phones: string[] | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  hours: Record<string, string> | null;
  hours_note: string | null;
  opened_on: string | null;
  payments: string[] | null;
  delivery: boolean | null;
  parking: boolean | null;
  wheelchair: boolean | null;
  languages: string[] | null;
  status: Listing["status"];
  published: boolean;
  verified_on: string | null;
  owner_id: string | null;
  owner_updated_at: string | null;
  updated_at: string;
};

const toListing = (r: Row): Listing => ({
  id: r.id,
  name: r.name,
  aliases: r.aliases ?? [],
  siret: r.siret,
  category: r.category,
  description: r.description,
  services: r.services ?? [],
  commune: r.commune,
  village: r.village,
  address: r.address,
  landmark: r.landmark,
  latitude: r.latitude,
  longitude: r.longitude,
  phones: r.phones ?? [],
  whatsapp: r.whatsapp,
  email: r.email,
  website: r.website,
  facebook: r.facebook,
  instagram: r.instagram,
  hours: r.hours ?? {},
  hoursNote: r.hours_note,
  openedOn: r.opened_on,
  payments: r.payments ?? [],
  delivery: r.delivery,
  parking: r.parking,
  wheelchair: r.wheelchair,
  languages: r.languages ?? [],
  status: r.status,
  published: r.published,
  verifiedOn: r.verified_on,
  ownerId: r.owner_id,
  ownerUpdatedAt: r.owner_updated_at,
  updatedAt: r.updated_at,
});

const toRow = (e: ListingEdit) => ({
  name: e.name,
  aliases: e.aliases,
  category: e.category,
  description: e.description,
  services: e.services,
  commune: e.commune,
  village: e.village,
  address: e.address,
  landmark: e.landmark,
  latitude: e.latitude,
  longitude: e.longitude,
  phones: e.phones,
  whatsapp: e.whatsapp,
  email: e.email,
  website: e.website,
  facebook: e.facebook,
  instagram: e.instagram,
  hours: e.hours,
  hours_note: e.hoursNote,
  opened_on: e.openedOn,
  payments: e.payments,
  delivery: e.delivery,
  parking: e.parking,
  wheelchair: e.wheelchair,
  languages: e.languages,
  status: e.status,
});

const MIGRATION = "migration 20261226000000_annuaire_entreprises.sql appliquée ?";

// ---------------------------------------------------------------------------
// Ce que lit Tamilya : les fiches publiées, gardées 60 s en mémoire.

const TTL_MS = 60_000;
let published: { at: number; listings: Listing[] } | null = null;

export async function publishedListings(): Promise<Listing[]> {
  if (published && Date.now() - published.at < TTL_MS) return published.listings;
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("business_listings").select(COLUMNS).eq("published", true).limit(20_000);
  if (error) {
    console.error(`[annuaire] Fiches illisibles (${MIGRATION})`, error.message);
    return published?.listings ?? [];
  }
  published = { at: Date.now(), listings: (data as Row[]).map(toListing) };
  return published.listings;
}

/** Après un changement : la prochaine question relit la base. */
const forgetPublished = () => {
  published = null;
};

const clean = (text: string) => ` ${normalize(text).replace(/[’'`]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** Noms à chercher dans un message : le nom et les autres noms, d'au moins 3 lettres. */
const namesOf = (l: Listing) => [l.name, ...l.aliases].map(clean).filter((n) => n.trim().length >= 3);

/** Nombre de fiches données au plus : demandées par leur nom, ou montrées dans une liste. */
const MAX_ASKED = 3;
const MAX_LISTED = 6;

export type DirectoryMatch = { asked: Listing[]; listed: Listing[] };

/**
 * Les fiches dont parle le message : celles dont le nom y figure en entier (« le numéro
 * de Somaco »), puis, sans nom reconnu, celles du métier et de la commune demandés.
 */
export function matchDirectory(listings: readonly Listing[], message: string, ask: CompanyAsk | null): DirectoryMatch {
  const text = clean(message);
  const wanted = ask?.name ? clean(ask.name).trim().split(" ").filter(Boolean) : [];
  const asked = listings.filter((l) => {
    const names = namesOf(l);
    if (names.some((n) => text.includes(n))) return true;
    // Nom donné par Tamilya au vocal (« somaco kaweni ») : chaque mot est dans un de ses noms.
    return wanted.length > 0 && !/^\d+$/.test(ask!.name) && names.some((n) => wanted.every((w) => n.includes(` ${w} `)));
  });
  // Numéro SIRET ou SIREN cité.
  const number = ask?.name && /^\d{9}(\d{5})?$/.test(ask.name) ? ask.name : null;
  if (number) asked.push(...listings.filter((l) => l.siret?.startsWith(number) && !asked.includes(l)));
  if (asked.length) return { asked: asked.slice(0, MAX_ASKED), listed: [] };

  const trade = ask?.trade ? normalize(ask.trade.label) : null;
  if (!trade && !ask?.communes.length) return { asked: [], listed: [] };
  const listed = listings.filter(
    (l) =>
      l.status !== "ferme_definitif" &&
      (!trade || (l.category !== null && normalize(l.category) === trade)) &&
      (!ask?.communes.length || (l.commune !== null && ask.communes.includes(l.commune))),
  );
  // Une commune sans métier : trop large pour une liste utile.
  if (!trade) return { asked: [], listed: [] };
  return { asked: [], listed: listed.slice(0, MAX_LISTED) };
}

export type Channel = "ecrit" | "vocal" | "widget";

/** Ajoute les demandes au compteur du jour (sans attendre la réponse). */
export async function countDirectory(match: DirectoryMatch, channel: Channel): Promise<void> {
  if (!match.asked.length && !match.listed.length) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("count_business_listings", {
    asked_ids: match.asked.map((l) => l.id),
    listed_ids: match.listed.map((l) => l.id),
    on_channel: channel,
  });
  if (error) console.error("[annuaire] Compteur non mis à jour", error.message);
}

/** Bloc pour Tamilya (null : aucune fiche ne correspond). */
export function directoryBlock(match: DirectoryMatch): string | null {
  const shown = [...match.asked, ...match.listed];
  if (!shown.length) return null;
  return [
    DIRECTORY_RULES,
    match.listed.length ? "Entreprises de l'annuaire Tamilya pour ce métier (propose-les, la personne choisira) :" : null,
    ...shown.map(listingForTamilya),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Recherche, bloc et compteur en une fois. count=false : le maître teste, on ne compte pas. */
export async function directoryFor(message: string, ask: CompanyAsk | null, { channel, count }: { channel: Channel; count: boolean }) {
  const match = matchDirectory(await publishedListings(), message, ask);
  return { block: directoryBlock(match), counted: count ? countDirectory(match, channel) : Promise.resolve() };
}

// ---------------------------------------------------------------------------
// Équipe GROUPE BTM (/admin/entreprises).

export type ListingSummary = Pick<Listing, "id" | "name" | "category" | "commune" | "status" | "published" | "verifiedOn" | "ownerId" | "updatedAt"> & {
  phones: number;
  complete: boolean;
};

export const LISTING_FILTERS = ["toutes", "completes", "a_completer", "brouillons", "a_revoir", "tenues"] as const;
export type ListingFilter = (typeof LISTING_FILTERS)[number];
export const LISTINGS_PER_PAGE = 50;

/** Condition PostgREST de chaque filtre (même règle « complète » que isComplete). */
function filterCondition(filter: ListingFilter): string | null {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  switch (filter) {
    case "completes":
      return "and(category.not.is.null,commune.not.is.null,address.not.is.null,phones.neq.{},hours.neq.{})";
    case "a_completer":
      return "or(category.is.null,commune.is.null,address.is.null,phones.eq.{},hours.eq.{})";
    case "brouillons":
      return "published.is.false";
    case "a_revoir":
      return `or(verified_on.is.null,verified_on.lt.${yearAgo})`;
    case "tenues":
      return "owner_id.not.is.null";
    default:
      return null;
  }
}

/** Recherche sur le nom, l'activité, le SIRET ou la commune. */
function searchCondition(query: string): string | null {
  const q = query.replace(/[,()*%"\\:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q) return null;
  const parts = [`name.ilike.*${q}*`, `category.ilike.*${q}*`];
  if (/^\d{9,14}$/.test(q.replace(/\s/g, ""))) parts.push(`siret.like.${q.replace(/\s/g, "")}*`);
  const communes = Object.keys(COMMUNES).filter((c) => normalize(COMMUNES[c]).includes(normalize(q)));
  if (communes.length) parts.push(`commune.in.(${communes.join(",")})`);
  return `or(${parts.join(",")})`;
}

/**
 * Une page de fiches (les plus récemment changées d'abord), le nombre de fiches trouvées et
 * le nombre de fiches de chaque filtre ; null si la table est illisible.
 */
export async function searchListings(query: string, filter: ListingFilter, page: number) {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const search = searchCondition(query);
  const conditions = [search, filterCondition(filter)].filter(Boolean);
  const from = (page - 1) * LISTINGS_PER_PAGE;

  let rows = admin
    .from("business_listings")
    .select("id, name, category, commune, address, hours, status, published, verified_on, owner_id, updated_at, phones", { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id")
    .range(from, from + LISTINGS_PER_PAGE - 1);
  if (conditions.length) rows = rows.or(`and(${conditions.join(",")})`);

  const counted = LISTING_FILTERS.map((f) => {
    let q = admin.from("business_listings").select("id", { count: "exact", head: true });
    const c = [search, filterCondition(f)].filter(Boolean);
    if (c.length) q = q.or(`and(${c.join(",")})`);
    return q;
  });

  const [list, ...counts] = await Promise.all([rows, ...counted]);
  const failed = [list, ...counts].find((r) => r.error);
  if (failed?.error) {
    console.error(`[annuaire] Liste illisible (${MIGRATION})`, failed.error.message);
    return null;
  }
  const listings: ListingSummary[] = (list.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    commune: r.commune,
    status: r.status,
    published: r.published,
    verifiedOn: r.verified_on,
    ownerId: r.owner_id,
    updatedAt: r.updated_at,
    phones: (r.phones ?? []).length,
    complete: isComplete({ category: r.category, commune: r.commune, address: r.address, phones: r.phones ?? [], hours: r.hours ?? {} }),
  }));
  return {
    listings,
    found: list.count ?? 0,
    counts: Object.fromEntries(LISTING_FILTERS.map((f, i) => [f, counts[i].count ?? 0])) as Record<ListingFilter, number>,
  };
}

export async function getListing(id: string): Promise<Listing | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("business_listings").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toListing(data as Row);
}

export type SaveResult = { ok: true; id: string } | { ok: false; reason: "siret_taken" | "error" };

/** Enregistre une fiche de l'équipe (nouvelle si id est null). */
export async function saveListingAsTeam(id: string | null, edit: ListingAdminEdit, userId: string): Promise<SaveResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "error" };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Indian/Mayotte" });
  const row = {
    ...toRow(edit),
    siret: edit.siret,
    published: edit.published,
    ...(edit.verifiedToday && { verified_on: today, verified_by: userId }),
  };
  const query = id
    ? admin.from("business_listings").update(row).eq("id", id).select("id").single()
    : admin.from("business_listings").insert({ ...row, created_by: userId }).select("id").single();
  const { data, error } = await query;
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, reason: "siret_taken" };
    console.error("[annuaire] Fiche non enregistrée", error?.message);
    return { ok: false, reason: "error" };
  }
  forgetPublished();
  return { ok: true, id: data.id };
}

export async function deleteListing(id: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("business_listings").delete().eq("id", id);
  if (error) return false;
  forgetPublished();
  return true;
}

/** L'équipe retire la main à l'entreprise (compte perdu, mauvaise personne). */
export async function detachOwner(id: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("business_listings").update({ owner_id: null }).eq("id", id);
  return !error;
}

// ---------------------------------------------------------------------------
// L'entreprise elle-même (/entreprise).

/** Fiches tenues par ce compte ; null si la table est illisible. */
export async function listOwnedListings(userId: string): Promise<Listing[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("business_listings").select(COLUMNS).eq("owner_id", userId).order("name");
  if (error) {
    console.error(`[annuaire] Fiches du compte illisibles (${MIGRATION})`, error.message);
    return null;
  }
  return (data as Row[]).map(toListing);
}

/** Changement de l'entreprise : visible tout de suite, sans validation (elle en est responsable). */
export async function saveListingAsOwner(userId: string, id: string, edit: ListingEdit): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("business_listings")
    .update({ ...toRow(edit), owner_updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id");
  if (error || !data?.length) {
    console.error("[annuaire] Fiche de l'entreprise non enregistrée", error?.message);
    return false;
  }
  forgetPublished();
  return true;
}

export type ListingStats = {
  days: { day: string; asked: number; listed: number }[];
  week: { asked: number; listed: number };
  month: { asked: number; listed: number };
  total: { asked: number; listed: number };
  byChannel: Record<Channel, number>;
};

/** Combien de fois Tamilya a donné la fiche : les 30 derniers jours, jour par jour, et depuis le début. */
export async function listingStats(listingId: string): Promise<ListingStats | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("business_listing_stats").select("day, channel, asked, listed").eq("listing_id", listingId).limit(20_000);
  if (error) return null;
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Indian/Mayotte" }));
  const daysAgo = (day: string) => Math.round((today.getTime() - new Date(day).getTime()) / 86_400_000);
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today.getTime() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day: d, asked: 0, listed: 0 };
  });
  const stats: ListingStats = { days, week: { asked: 0, listed: 0 }, month: { asked: 0, listed: 0 }, total: { asked: 0, listed: 0 }, byChannel: { ecrit: 0, vocal: 0, widget: 0 } };
  for (const r of data) {
    const ago = daysAgo(r.day);
    stats.total.asked += r.asked;
    stats.total.listed += r.listed;
    stats.byChannel[r.channel as Channel] += r.asked + r.listed;
    if (ago < 7) {
      stats.week.asked += r.asked;
      stats.week.listed += r.listed;
    }
    if (ago < 30) {
      stats.month.asked += r.asked;
      stats.month.listed += r.listed;
      const slot = days[29 - ago];
      if (slot) {
        slot.asked += r.asked;
        slot.listed += r.listed;
      }
    }
  }
  return stats;
}
