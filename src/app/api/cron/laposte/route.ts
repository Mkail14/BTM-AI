import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { checkLaPosteNow } from "@/lib/code-exam/laposte";

/** Toujours exécutée : jamais de réponse mise en cache. */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Surveillance du site de La Poste, appelée toutes les heures par GitHub
 * (.github/workflows/surveillance-laposte.yml). Relit les horaires maintenant,
 * étape par étape (checkLaPosteNow, src/lib/code-exam/laposte.ts) : 200 si tout va bien, 503 sinon — GitHub envoie alors un
 * e-mail, avec l'étape qui casse dans le journal. Protégée par CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  const check = await checkLaPosteNow();
  return NextResponse.json(check, { status: check.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
