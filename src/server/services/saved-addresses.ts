import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Address, SavedAddress, SavedAddressKind } from "@/lib/address";

type Row = {
  id: string;
  kind: SavedAddressKind;
  label: string;
  commune: string;
  line: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

/**
 * Carnet d'adresses du compte (RLS : seulement les siennes). null : la
 * migration 20261115000000_saved_addresses.sql n'est pas encore appliquée.
 */
export async function listSavedAddresses(supabase: SupabaseClient): Promise<SavedAddress[] | null> {
  const { data, error } = await supabase
    .from("saved_addresses")
    .select("id, kind, label, commune, line, lat, lng, accuracy")
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    commune: r.commune,
    line: r.line,
    geo: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng, accuracy: r.accuracy ?? 0 } : null,
  }));
}

type Input = Address & { kind: SavedAddressKind; label: string };

const columns = (a: Input) => ({
  kind: a.kind,
  label: a.label,
  commune: a.commune,
  line: a.line,
  lat: a.geo?.lat ?? null,
  lng: a.geo?.lng ?? null,
  accuracy: a.geo?.accuracy ?? null,
});

/** Ajoute une adresse (id absent) ou modifie la sienne. */
export async function saveSavedAddress(supabase: SupabaseClient, input: Input, id?: string) {
  const { error } = id
    ? await supabase.from("saved_addresses").update({ ...columns(input), updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("saved_addresses").insert(columns(input));
  if (error) throw error;
}

export async function deleteSavedAddress(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("saved_addresses").delete().eq("id", id);
  if (error) throw error;
}
