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
 * simulation (réservation d'essai), la demande passe « réservée » tout de suite
 * sans qu'aucune vraie place soit prise.
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
      // Toujours la demande de CE compte (un administrateur lit toutes les demandes avec la RLS).
      .eq("user_id", user.id)
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
  // Les demandes ne s'écrivent qu'avec la clé secrète du serveur (jamais avec les droits du compte).
  const admin = getSupabaseAdminClient();
  if (!admin) return fail(503, "La réservation du code n'est pas disponible pour le moment.");

  // Informations vérifiées avant de compter un essai : une faute de saisie ne consomme pas le quota.
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Informations invalides.");
  const body = parsed.data;

  try {
    const limit = await consumeRateLimits([{ key: `code-exam:${user.id}`, rules: RATE_LIMIT_POLICIES.codeExamRequest }]);
    if (!limit.allowed) return fail(429, "Trop de demandes d'un coup : réessaie dans une heure.");
  } catch (error) {
    console.error("[code-exam] Limite de débit indisponible", error);
    return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  }

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

  // Écrite par le serveur seul (clé secrète), après les vérifications ci-dessus : un compte
  // ne peut pas créer de demande « payée » ni pour un faux créneau en appelant la base.
  // Démonstration et simulation : la demande est enregistrée directement « réservée ».
  const { data: saved, error } = await admin.from("code_exam_requests").insert({
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
    status: payment.mode === "partner" ? "pending" : "booked",
  }).select("id").single();
  if (error || !saved) {
    console.error("[code-exam] Demande non enregistrée", error);
    return fail(500, "La demande n'a pas pu être enregistrée. Réessaie dans un instant.");
  }

  if (payment.mode === "demo") {
    // Démonstration : aucune convocation n'est envoyée. Débit impossible : la demande est retirée,
    // pour ne jamais laisser une réservation « confirmée » sans paiement.
    const paid = await recordDemoOperation(user.id, "payment", payment.feeCents, `Examen du code · ${center.name}`);
    if (!paid) {
      await admin.from("code_exam_requests").delete().eq("id", saved.id);
      return fail(402, "Solde insuffisant.");
    }
    return NextResponse.json({ ok: true, mode: payment.mode, paidCents: payment.feeCents, balanceCents: paid.balanceCents });
  }
  if (payment.mode === "manual") {
    // Simulation (pas encore de partenariat La Poste) : rien n'est débité, aucune vraie place
    // n'est prise. La cloche et le dossier l'appellent « réservation d'essai (simulation) ».
    return NextResponse.json({ ok: true, mode: payment.mode, paidCents: 0 });
  }
  // payment.mode === "partner" : processBooking() (src/lib/code-exam/partner.ts) réservera, débitera
  // et enverra la convocation ; tant qu'il n'est pas écrit, la demande reste « en attente » dans la
  // table code_exam_requests (la page d'administration du code a été retirée).
  return NextResponse.json({ ok: true, mode: payment.mode, paidCents: 0 });
}
