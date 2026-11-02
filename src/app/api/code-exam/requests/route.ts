import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { requestSchema } from "@/lib/code-exam/candidate";
import { loadCodeExam } from "@/lib/code-exam/laposte";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

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

/** Pré-remplissage : la dernière demande du compte, sinon son e-mail. 401 sans compte. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour réserver.");
  const { data } = await supabase
    .from("code_exam_requests")
    .select("civility, last_name, first_name, birth_date, city, phone, email, neph")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prefill: CandidatePrefill = data
    ? {
        civility: data.civility,
        lastName: data.last_name,
        firstName: data.first_name,
        birthDate: data.birth_date,
        city: data.city,
        phone: data.phone,
        email: data.email,
        neph: data.neph,
      }
    : { email: user.email ?? undefined };
  return NextResponse.json({ prefill }, { headers: { "Cache-Control": "no-store" } });
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

  const { error } = await supabase.from("code_exam_requests").insert({
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
  });
  if (error) {
    console.error("[code-exam] Demande non enregistrée", error);
    return fail(500, "La demande n'a pas pu être enregistrée. Réessaie dans un instant.");
  }
  return NextResponse.json({ ok: true });
}
