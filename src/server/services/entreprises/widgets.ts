import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { getListing } from "@/server/services/entreprises/listings";
import type { Listing } from "@/lib/entreprises/listing";

/**
 * Widget Tamilya relié à une fiche (colonne developer_widgets.listing_id) : sur le site de
 * l'entreprise, Tamilya répond avec ses horaires, ses services, son numéro…
 * Lu à part du widget lui-même : sans la migration, les widgets marchent comme avant.
 */

export type AccountWidget = { id: string; label: string; origins: string[]; mission: string | null; listingId: string | null };

/** Widgets actifs du compte ; null si la colonne n'existe pas encore. */
export async function listAccountWidgets(userId: string): Promise<AccountWidget[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("developer_widgets")
    .select("id, label, origins, mission, listing_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) return null;
  return data.map((w) => ({ id: w.id, label: w.label, origins: w.origins, mission: w.mission, listingId: w.listing_id }));
}

/** Relie (ou détache, listingId null) un widget du compte à une fiche que le compte tient. */
export async function linkWidget(userId: string, widgetId: string, listingId: string | null): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  if (listingId) {
    const { data } = await admin.from("business_listings").select("id").eq("id", listingId).eq("owner_id", userId).maybeSingle();
    if (!data) return false;
  }
  const { data, error } = await admin
    .from("developer_widgets")
    .update({ listing_id: listingId })
    .eq("id", widgetId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  return !error && Boolean(data?.length);
}

/** La fiche du widget, si elle appartient toujours au propriétaire du widget. */
export async function widgetListing(widgetId: string, userId: string): Promise<Listing | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("developer_widgets").select("listing_id").eq("id", widgetId).maybeSingle();
  if (error || !data?.listing_id) return null;
  const listing = await getListing(data.listing_id);
  return listing && listing.ownerId === userId ? listing : null;
}
