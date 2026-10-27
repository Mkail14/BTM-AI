import type { NextRequest } from "next/server";
import { authRequiredPath, isProtectedPath } from "@/lib/auth/redirect";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Rafraîchit la session et effectue une vérification « optimiste » sur les
 * pages privées. Ce n'est pas la seule barrière : chaque page, route d'API et
 * politique RLS vérifie à nouveau les droits.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!userId && isProtectedPath(pathname)) {
    const url = new URL(authRequiredPath(`${pathname}${search}`), request.url);
    return redirectWithCookies(url, response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
