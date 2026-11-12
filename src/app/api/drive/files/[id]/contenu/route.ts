import { type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { readDriveContent } from "@/lib/drive/client";
import { driveAccessFor } from "@/lib/drive/connection";
import { canUse } from "@/lib/site/features";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const fileId = z.string().regex(/^[\w-]{10,200}$/);
const fail = (status: number, text: string) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Le document lui-même, pour le voir dans la page (photo, PDF) ou le télécharger
 * (?telecharger=1). Il passe en flux depuis le Drive de la personne, sans être gardé.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Seulement depuis nos propres pages (ou une ouverture directe), jamais intégré par un autre site.
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "Requête refusée.");
  const id = fileId.safeParse((await ctx.params).id);
  if (!id.success) return fail(400, "Document introuvable.");
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return fail(401, "Connexion requise.");
  if (!(await canUse(user, "documents"))) return fail(403, "Mes documents n'est pas ouvert pour l'instant.");
  try {
    const accessToken = await driveAccessFor(admin, user.id);
    if (!accessToken) return fail(409, "Google Drive n'est pas relié.");
    const file = await readDriveContent(accessToken, id.data);
    const inline = file.showable && !request.nextUrl.searchParams.has("telecharger");
    const headers = new Headers({
      // Un fichier inconnu ne s'exécute jamais sur notre site : téléchargé, ou affiché en bac à sable.
      "Content-Type": inline ? file.type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    if (file.size) headers.set("Content-Length", file.size);
    return new Response(file.body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "inconnue";
    console.error("[documents] Lecture du fichier impossible", message);
    return fail(message.includes(" 404") ? 404 : 502, message.includes(" 404") ? "Document introuvable." : "Google Drive ne répond pas. Réessaie.");
  }
}
