import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getMayotteNews, NEWS_CACHE_TAG } from "@/lib/live/news";

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
 * Relit les journaux de Mayotte en arrière-plan, appelée toutes les 10 minutes par GitHub
 * (.github/workflows/actu-mayotte.yml). Les journaux sont lents (2 à 5 s) : grâce à ça,
 * Tamilya trouve toujours les articles déjà prêts. Protégée par CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  // Marque les flux comme périmés : ils sont relus en arrière-plan, les anciens restent servis d'ici là.
  revalidateTag(NEWS_CACHE_TAG, "max");
  const items = await getMayotteNews({ fresh: true });
  return NextResponse.json(
    { ok: items.length > 0, articles: items.length, dernier: items[0]?.date ?? null },
    { status: items.length ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
