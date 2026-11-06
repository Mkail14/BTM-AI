import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { DriveFull, ensureDriveFolder, readDriveAccount, readDriveTree, startDriveUpload } from "@/lib/drive/client";
import { driveAccessFor } from "@/lib/drive/connection";
import { DRIVE_FOLDER_IDS, DRIVE_MAX_FILE_BYTES } from "@/lib/drive/folders";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string, reason = "failed") => NextResponse.json({ error, reason }, { status, headers: NO_STORE });

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(255).regex(/^[^\u0000-\u001f]+$/),
  mimeType: z.string().min(1).max(200),
  size: z.number().int().positive().max(DRIVE_MAX_FILE_BYTES),
  folder: z.enum(DRIVE_FOLDER_IDS),
});

/** Les documents du compte, et la place libre sur son Drive. */
export async function GET() {
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return fail(401, "Connexion requise.");
  try {
    const accessToken = await driveAccessFor(admin, user.id);
    if (!accessToken) return fail(409, "Google Drive n'est pas relié.", "not-connected");
    const [tree, account] = await Promise.all([readDriveTree(accessToken), readDriveAccount(accessToken)]);
    return NextResponse.json({ files: tree.files, email: account.email, used: account.used, limit: account.limit }, { headers: NO_STORE });
  } catch (error) {
    console.error("[documents] Lecture impossible", error instanceof Error ? error.message : "inconnue");
    return fail(502, "Google Drive ne répond pas. Réessaie.");
  }
}

/** Ouvre l'envoi d'un fichier : le navigateur l'envoie ensuite directement à Google. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return fail(401, "Connexion requise.");
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Fichier refusé.");

  const limit = await consumeRateLimits([{ key: `drive-upload:${user.id}`, rules: RATE_LIMIT_POLICIES.driveUpload }]).catch(() => null);
  if (!limit) return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  if (!limit.allowed) return fail(429, "Trop d'envois : réessaie dans un moment.");

  try {
    const accessToken = await driveAccessFor(admin, user.id);
    if (!accessToken) return fail(409, "Google Drive n'est pas relié.", "not-connected");
    const { folder, ...file } = parsed.data;
    const parent = await ensureDriveFolder(accessToken, await readDriveTree(accessToken), folder);
    const uploadUrl = await startDriveUpload(accessToken, { ...file, parent }, request.nextUrl.origin);
    return NextResponse.json({ uploadUrl }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof DriveFull) return fail(507, "Ton Google Drive est plein.", "full");
    console.error("[documents] Envoi impossible", error instanceof Error ? error.message : "inconnue");
    return fail(502, "Google Drive ne répond pas. Réessaie.");
  }
}
