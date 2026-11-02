import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, type SessionUser } from "@/lib/auth/session";
import { requestSchema } from "@/lib/code-exam/candidate";
import { loadCodeExam } from "@/lib/code-exam/laposte";
import { CODE_EXAM_FEE_CENTS, codeExamPartnerReady } from "@/lib/code-exam/partner";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWallet } from "@/lib/wallet";
import { readDemoWallet, recordDemoOperation, usesDemoWallet } from "@/lib/wallet/demo";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/**
 * Paiement de la place : « demo » débite le portefeuille fictif, « partner »
 * le vrai (réservation automatique La Poste), « manual » ne débite rien :
 * GROUPE BTM réserve à la main puis recontacte le candidat.
 */
export type BookingPayment = { mode: "demo" | "partner" | "manual"; feeCents: number; balanceCents: number };

async function bookingPayment(user: SessionUser, supabase: SupabaseClient): Promise<BookingPayment> {
  if (await usesDemoWallet(user)) {
    return { mode: "demo", feeCents: CODE_EXAM_FEE_CENTS, balanceCents: (await readDemoWallet(user.id)).balanceCents };
  }
  if (codeExamPartnerReady()) {
    return { mode: "partner", feeCents: CODE_EXAM_FEE_CENTS, balanceCents: (await loadWallet(supabase, user.id, 1)).balanceCents };
  }
  return { mode: "manual", feeCents: CODE_EXAM_FEE_CENTS, balanceCents: 0 };
}

/** Informations déjà connues, pour pré-remplir la fenêtre de réservation. */
export type CandidatePrefill = {
  civility?: string;
  lastName?: string;
  firstName?: string;
  birthDate?: string;
  city?: string;
  phone?: string;
  email?: string;
  neph?: string;
};

/**
 * Pré-remplissage : la dernière demande du compte, complétée par ce que le
 * profil connaît déjà (prénom, téléphone, commune, e-mail). 401 sans compte.
 */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour réserver.");
  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("code_exam_requests")
      .select("civility, last_name, first_name, birth_date, city, phone, email, neph")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // « * » : la page reste utilisable avant la migration de l'adresse et du téléphone.
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);
  const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const prefill: CandidatePrefill = {
    civility: text(data?.civility),
    lastName: text(data?.last_name),
    firstName: text(data?.first_name) ?? text(profile?.display_name)?.split(" ")[0],
    birthDate: text(data?.birth_date),
    city: text(data?.city) ?? text(profile?.address_commune),
    phone: text(data?.phone) ?? text(profile?.phone),
    email: text(data?.email) ?? user.email ?? undefined,
    neph: text(data?.neph),
  };
  return NextResponse.json({ prefill, payment: await bookingPayment(user, supabase) }, { headers: { "Cache-Control": "no-store" } });
}

/** Enregistre une demande de réservation, après avoir revérifié les informations et le créneau. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour réserver.");

  const limit = await consumeRateLimits([{ key: `code-exam:${user.id}`, rules: RATE_LIMIT_POLICIES.codeExamRequest }]);
  if (!limit.allowed) return fail(429, "Trop de demandes d'un coup : réessaie dans une heure.");

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Informations invalides.");
  const body = parsed.data;

  // Le créneau existe-t-il encore, avec des places, et pour cette épreuve ?
  // Relu sur La Poste à l'instant : une place affichée il y a 5 minutes a pu partir.
  const exam = await loadCodeExam({ fresh: true });
  const center = exam?.centers.find((c) => c.id === body.centerId);
  const slot = exam?.slots.find(
    (s) => s.centerId === body.centerId && new Date(s.startsAt).getTime() === new Date(body.startsAt).getTime(),
  );
  if (!exam || !center) return fail(503, "Les horaires de La Poste ne sont pas lisibles pour le moment : réessaie plus tard.");
  if (!slot || slot.places <= 0) return fail(409, "Ce créneau n'a plus de place : choisis-en un autre.");
  if (center.types.length > 0 && !center.types.includes(body.examType)) {
    return fail(400, "Ce bureau ne propose pas cette épreuve.");
  }

  // Paiement avec le portefeuille : fictif en démonstration (aucune place n'est prise chez La Poste).
  const payment = await bookingPayment(user, supabase);
  if (payment.mode !== "manual" && payment.balanceCents < payment.feeCents) {
    return fail(402, `Solde insuffisant : il manque ${((payment.feeCents - payment.balanceCents) / 100).toFixed(2).replace(".", ",")} € dans ton portefeuille.`);
  }

  const { data: saved, error } = await supabase.from("code_exam_requests").insert({
    user_id: user.id,
    center_id: center.id,
    center_name: center.name,
    starts_at: slot.startsAt,
    exam_type: body.examType,
    civility: body.civility,
    last_name: body.lastName,
    first_name: body.firstName,
    birth_date: body.birthDate,
    city: body.city,
    phone: body.phone,
    email: body.email,
    neph: body.neph,
    snu: body.snu,
  }).select("id").single();
  if (error || !saved) {
    console.error("[code-exam] Demande non enregistrée", error);
    return fail(500, "La demande n'a pas pu être enregistrée. Réessaie dans un instant.");
  }

  if (payment.mode === "demo") {
    const paid = await recordDemoOperation(user.id, "payment", payment.feeCents, `Examen du code · ${center.name}`);
    if (!paid) return fail(402, "Solde insuffisant.");
    // Démonstration : la demande passe directement « réservée » (aucune convocation n'est envoyée).
    await getSupabaseAdminClient()?.from("code_exam_requests").update({ status: "booked" }).eq("id", saved.id);
    return NextResponse.json({ ok: true, mode: payment.mode, paidCents: payment.feeCents, balanceCents: paid.balanceCents });
  }
  // payment.mode === "partner" : processBooking() (src/lib/code-exam/partner.ts) réservera, débitera
  // et enverra la convocation ; tant qu'il n'est pas écrit, la demande reste à traiter dans /admin/code.
  return NextResponse.json({ ok: true, mode: payment.mode, paidCents: 0 });
}
