import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_GATE_COOKIE,
  adminGateCookieOptions,
  adminGateValue,
  adminLockPath,
  isAdminGatedPath,
  isAdminGateOpen,
} from "@/lib/admin/gate";
import { authRequiredPath, isProtectedPath } from "@/lib/auth/redirect";
import { getSiteFlags } from "@/lib/site/flags";
import { siteClosure } from "@/lib/site/status";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Rafraîchit la session et effectue une vérification « optimiste » sur les
 * pages privées. Ce n'est pas la seule barrière : chaque page, route d'API et
 * politique RLS vérifie à nouveau les droits.
 *
 * Site en maintenance ou en attente d'un partenaire : page d'attente pour tous
 * sauf les administrateurs.
 */
export async function proxy(request: NextRequest) {
  const { response, userId, isAdmin } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const closure = isAdmin || OPEN_WHEN_CLOSED.some((p) => pathname.startsWith(p)) ? null : siteClosure((await getSiteFlags()).status);
  if (closure) {
    // Jamais mise en cache : la réouverture doit se voir tout de suite.
    const headers = { "Retry-After": closure.retryAfter, "Cache-Control": "no-store" };
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: closure.apiError }, { status: 503, headers });
    }
    // Même adresse (réécriture, pas redirection) : recharger la page suffit quand le site rouvre.
    const page = NextResponse.rewrite(new URL("/maintenance", request.url), {
      status: closure.pageStatus,
      headers: closure.pageStatus === 503 ? headers : { "Cache-Control": "no-store" },
    });
    for (const cookie of response.cookies.getAll()) page.cookies.set(cookie);
    return page;
  }

  if (!userId && isProtectedPath(pathname)) {
    const url = new URL(authRequiredPath(`${pathname}${search}`), request.url);
    return redirectWithCookies(url, response);
  }

  if (userId && isAdmin && isAdminGatedPath(pathname)) return adminGate(request, response, userId);

  return response;
}

/**
 * Espace d'administration : sans code d'authentification tapé depuis moins de
 * 15 minutes d'inactivité, une page renvoie vers le verrou. Les actions
 * (POST) passent et se refusent elles-mêmes (requireAdminAction). Chaque
 * visite prolonge le verrou, sauf le préchargement des liens, qui n'est pas
 * une utilisation.
 */
function adminGate(request: NextRequest, response: NextResponse, userId: string) {
  const { pathname, search } = request.nextUrl;
  if (!isAdminGateOpen(request.cookies.get(ADMIN_GATE_COOKIE)?.value, userId)) {
    if (request.method !== "GET" && request.method !== "HEAD") return response;
    return redirectWithCookies(new URL(adminLockPath(`${pathname}${search}`), request.url), response);
  }
  const value = request.headers.has("next-router-prefetch") ? null : adminGateValue(userId);
  if (value) response.cookies.set(ADMIN_GATE_COOKIE, value, adminGateCookieOptions);
  return response;
}

/**
 * Toujours ouverts : la page d'attente, la connexion (un administrateur doit
 * pouvoir se connecter), les tâches planifiées, le retour des paiements Stripe et
 * le relais vocal, qui prépare la voix des administrateurs (route protégée par ticket signé),
 * et Tamilya Connect : le message arrive par le téléphone d'un autre, sans session ; c'est le
 * compte signataire qui décide ensuite (src/lib/mesh/closure.ts). La clé publique du serveur
 * (/api/mesh/key) aussi : sans elle, un téléphone neuf ne pouvait pas activer Connect.
 * Les règles de confidentialité restent toujours lisibles (exigé par Google pour la connexion avec Google).
 */
const OPEN_WHEN_CLOSED = ["/maintenance", "/confidentialite", "/conditions", "/auth/", "/api/auth/", "/api/cron/", "/api/ai/relay", "/api/voice/live/setup", "/api/wallet/webhook", "/api/mesh/relay", "/api/mesh/key", "/manifest.webmanifest", "/brand/"];

export const config = {
  matcher: [
    // Fichiers fixes (images, sons, polices, manifeste, détecteur de voix Silero, empreinte de voix, moteur des cartes, lecteur de PDF,
    // bruitages et musiques de la lecture) : servis tout de suite, sans passer par le proxy.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|brand/|vad/|voiceprint/|maplibre/|pdfjs/|sons/|musique/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp3|wav|ogg|webm|woff2?|txt|xml)$).*)",
  ],
};
