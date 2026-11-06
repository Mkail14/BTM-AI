import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { ensureDriveFolder, moveDriveFile, readDriveTree, trashDriveFile } from "@/lib/drive/client";
import { driveAccessFor } from "@/lib/drive/connection";
import { DRIVE_FOLDER_IDS } from "@/lib/drive/folders";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string, reason = "failed") => NextResponse.json({ error, reason }, { status, headers: NO_STORE });

const fileId = z.string().regex(/^[\w-]{10,200}$/);
const moveSchema = z.object({ folder: z.enum(DRIVE_FOLDER_IDS) });

type Context = RouteContext<"/api/drive/files/[id]">;

async function prepare(request: NextRequest, ctx: Context) {
  if (!isSameOrigin(request)) return { response: fail(403, "Requête refusée.") };
  const id = fileId.safeParse((await ctx.params).id);
  if (!id.success) return { response: fail(400, "Document introuvable.") };
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return { response: fail(401, "Connexion requise.") };
  const accessToken = await driveAccessFor(admin, user.id);
  if (!accessToken) return { response: fail(409, "Google Drive n'est pas relié.", "not-connected") };
  return { id: id.data, accessToken };
}

/** Change un document de dossier. */
export async function PATCH(request: NextRequest, ctx: Context) {
  const body = moveSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Dossier inconnu.");
  try {
    const ready = await prepare(request, ctx);
    if (ready.response) return ready.response;
    const target = await ensureDriveFolder(ready.accessToken, await readDriveTree(ready.accessToken), body.data.folder);
    await moveDriveFile(ready.accessToken, ready.id, target);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[documents] Déplacement impossible", error instanceof Error ? error.message : "inconnue");
    return fail(502, "Le document n'a pas pu être déplacé. Réessaie.");
  }
}

/** Met un document à la corbeille du Drive. */
export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    const ready = await prepare(request, ctx);
    if (ready.response) return ready.response;
    await trashDriveFile(ready.accessToken, ready.id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[documents] Suppression impossible", error instanceof Error ? error.message : "inconnue");
    return fail(502, "Le document n'a pas pu être supprimé. Réessaie.");
  }
}
