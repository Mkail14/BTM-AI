import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { buildDriveAuthUrl, driveConfigured } from "@/lib/drive/oauth";

/** Part chez Google pour relier le Drive. Dans l'application Android, Google s'ouvre dans le navigateur. */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const { user } = await getAuthContext();
  const url = user && driveConfigured() ? buildDriveAuthUrl(user.id, origin, Date.now(), undefined, user.email) : null;
  return NextResponse.redirect(url ?? new URL("/documents?drive=echec", origin));
}
