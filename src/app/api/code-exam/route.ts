import { NextResponse } from "next/server";
import { LAPOSTE_SEARCH_URL, loadCodeExam, type CodeExamData } from "@/lib/code-exam/laposte";

/** Ce que renvoie GET : lu par le tableau des créneaux dans la conversation. */
export type CodeExamResponse =
  | ({ ok: true; bookingUrl: string } & CodeExamData)
  | { ok: false; bookingUrl: string; message: string };

/** Horaires de l'examen du code dans les bureaux La Poste de Mayotte (lecture publique, sans compte). */
export async function GET() {
  const data = await loadCodeExam();
  const body: CodeExamResponse = data
    ? { ok: true, bookingUrl: LAPOSTE_SEARCH_URL, ...data }
    : {
        ok: false,
        bookingUrl: LAPOSTE_SEARCH_URL,
        message: "Les horaires de La Poste ne sont pas lisibles pour le moment.",
      };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
