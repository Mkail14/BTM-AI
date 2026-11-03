import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXAM_TYPES, type ExamType } from "@/lib/code-exam/candidate";

/**
 * Dossier de la personne pour Tamilya : ce qu'elle a fait sur le site, en dehors
 * de la conversation (réservations du code…). Des faits seulement, jamais de
 * conclusion : c'est Tamilya qui remarque un schéma (« plusieurs passages du code
 * en peu de temps ») et décide d'en parler, avec tact (voir DOSSIER dans
 * system-prompt.ts). Aucune donnée personnelle sensible (NEPH, date de
 * naissance, téléphone) n'y figure.
 */

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Mayotte" });

type CodeRow = { starts_at: string; created_at: string; exam_type: ExamType; status: "pending" | "booked" | "cancelled"; center_name: string };

const STATUS = { pending: "demande en attente", booked: "place confirmée", cancelled: "annulée" } as const;

/** Réservations du code, en quelques lignes (null : aucune, ou table indisponible). */
async function codeExamLines(supabase: SupabaseClient, now: number): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("code_exam_requests")
    .select("starts_at, created_at, exam_type, status, center_name")
    .order("starts_at", { ascending: false })
    .limit(20);
  if (error || !data?.length) return null;
  const rows = data as CodeRow[];
  const kept = rows.filter((r) => r.status !== "cancelled");
  const past = kept.filter((r) => Date.parse(r.starts_at) < now);
  const coming = kept.filter((r) => Date.parse(r.starts_at) >= now);
  const first = rows.reduce((min, r) => (r.created_at < min ? r.created_at : min), rows[0].created_at);

  const lines = [
    `Réservations de l'examen du code sur BTM AI : ${rows.length} demande${rows.length > 1 ? "s" : ""} depuis le ${day.format(new Date(first))}` +
      `, dont ${past.length} créneau${past.length > 1 ? "x" : ""} déjà passé${past.length > 1 ? "s" : ""}` +
      `${coming.length ? ` et ${coming.length} à venir` : ""}` +
      `${rows.length - kept.length ? `, ${rows.length - kept.length} annulée${rows.length - kept.length > 1 ? "s" : ""}` : ""}.`,
    ...rows
      .slice(0, 8)
      .map(
        (r) =>
          `  - ${day.format(new Date(r.starts_at))} : ${EXAM_TYPES[r.exam_type] ?? r.exam_type}, La Poste de ${r.center_name} (${
            Date.parse(r.starts_at) < now && r.status !== "cancelled" ? "date passée" : STATUS[r.status]
          })`,
      ),
    "  Le site ne connaît pas les résultats : il ne sait pas si elle a réussi ou échoué, ni si elle s'est présentée.",
  ];
  return lines;
}

/** Dossier complet, ou null s'il n'y a rien à dire. */
export async function buildDossier(supabase: SupabaseClient, now = Date.now()): Promise<string | null> {
  const parts = await Promise.all([codeExamLines(supabase, now).catch(() => null)]);
  const lines = parts.flatMap((p) => p ?? []);
  return lines.length ? lines.join("\n") : null;
}
