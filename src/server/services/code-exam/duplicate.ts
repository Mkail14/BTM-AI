import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Le même créneau déjà demandé par ce compte (double clic, deux onglets) ?
 * Une demande annulée ne compte pas : on peut reprendre le créneau.
 *
 * Course restante : deux demandes arrivées exactement en même temps passent
 * toutes les deux cette lecture avant que l'une soit écrite. Seul un index
 * unique (user_id, center_id, starts_at) where status <> 'cancelled' la
 * fermerait ; pas de migration pour l'instant (la base de production ne change
 * pas). Le bouton de la fenêtre se bloque pendant l'envoi, ce qui couvre le
 * double clic ordinaire.
 */
export async function hasActiveBooking(
  admin: SupabaseClient,
  booking: { userId: string; centerId: string; startsAt: string },
): Promise<boolean> {
  const { data, error } = await admin
    .from("code_exam_requests")
    .select("id")
    .eq("user_id", booking.userId)
    .eq("center_id", booking.centerId)
    .eq("starts_at", booking.startsAt)
    .neq("status", "cancelled")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
