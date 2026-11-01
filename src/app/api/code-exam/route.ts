import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { CODE_EXAM_CENTERS, CODE_EXAM_DEMO, centerName, findSlot, listSlots, sameInstant } from "@/lib/code-exam/slots";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/** Ce que renvoie GET : lu par le tableau des créneaux dans la conversation. */
export type CodeExamResponse = {
  demo: boolean;
  signedIn: boolean;
  centers: { id: string; name: string }[];
  slots: { centerId: string; startsAt: string; status: "free" | "full" | "mine" }[];
  booking: { centerId: string; startsAt: string } | null;
};

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

const BOOKINGS_MISSING = "Réservations indisponibles (migration 20261109000000_code_exam_bookings.sql appliquée ?).";

/** Créneaux déjà pris, tous comptes confondus (seulement centre et heure, aucune identité). */
async function takenSlots(): Promise<{ center_id: string; starts_at: string }[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("code_exam_bookings")
    .select("center_id, starts_at")
    .gte("starts_at", new Date().toISOString());
  if (error) {
    console.error("[code-exam] Réservations illisibles", error);
    return [];
  }
  return data ?? [];
}

export async function GET() {
  const { supabase, user } = await getAuthContext();
  const [taken, own] = await Promise.all([
    takenSlots(),
    supabase && user
      ? supabase.from("code_exam_bookings").select("center_id, starts_at").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const booking = own.data ? { centerId: own.data.center_id as string, startsAt: own.data.starts_at as string } : null;

  const body: CodeExamResponse = {
    demo: CODE_EXAM_DEMO,
    signedIn: Boolean(user),
    centers: [...CODE_EXAM_CENTERS],
    slots: listSlots().map((slot) => ({
      centerId: slot.centerId,
      startsAt: slot.startsAt,
      status:
        booking && booking.centerId === slot.centerId && sameInstant(booking.startsAt, slot.startsAt)
          ? "mine"
          : slot.full || taken.some((t) => t.center_id === slot.centerId && sameInstant(t.starts_at, slot.startsAt))
            ? "full"
            : "free",
    })),
    booking,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

const bookingSchema = z.object({ centerId: z.string().max(40), startsAt: z.string().max(40) });

/** Réserve un créneau (un seul par compte, sans paiement pour l'instant). */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour réserver.");

  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Créneau invalide.");
  const slot = findSlot(parsed.data.centerId, parsed.data.startsAt);
  if (!slot || slot.full) return fail(409, "Ce créneau n'est plus disponible.");

  const { error } = await supabase
    .from("code_exam_bookings")
    .insert({ user_id: user.id, center_id: slot.centerId, starts_at: slot.startsAt });
  if (error) {
    // 23505 : créneau déjà pris, ou réservation déjà faite par ce compte.
    if (error.code === "23505") {
      const { data } = await supabase.from("code_exam_bookings").select("id").maybeSingle();
      return fail(409, data ? "Tu as déjà une réservation : annule-la d'abord." : "Ce créneau vient d'être pris.");
    }
    console.error("[code-exam] Réservation impossible", error);
    return fail(500, BOOKINGS_MISSING);
  }
  return NextResponse.json({ ok: true, message: `Réservé à La Poste de ${centerName(slot.centerId)}.` });
}

/** Annule la réservation du compte connecté. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi d'abord.");
  const { error } = await supabase.from("code_exam_bookings").delete().eq("user_id", user.id);
  if (error) {
    console.error("[code-exam] Annulation impossible", error);
    return fail(500, BOOKINGS_MISSING);
  }
  return NextResponse.json({ ok: true, message: "Réservation annulée." });
}
