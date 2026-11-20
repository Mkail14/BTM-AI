import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { refreshWaterPlanning } from "@/server/services/water/smae";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Tours d'eau : appelée toutes les heures par GitHub (.github/workflows/tours-d-eau.yml) et chaque
 * jour vers 5 h à Mayotte par Vercel (vercel.json), au cas où GitHub ne passe pas. Regarde
 * l'accueil de la SMAE et, si un nouveau planning y est annoncé, le fait lire par Gemini et le met
 * en service sur la carte de l'eau. Protégée par CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  try {
    const { changed, planning, title } = await refreshWaterPlanning();
    return NextResponse.json(
      { ok: true, nouveau: changed, titre: title, du: planning?.from ?? null, au: planning?.to ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[eau] Lecture automatique de la SMAE", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erreur." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
