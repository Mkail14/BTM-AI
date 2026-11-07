import "server-only";
import { DRIVE_FOLDER_MIME, DRIVE_FOLDERS, DRIVE_MARK, DRIVE_ROOT_MARK, organizeDrive, type DriveFolderId, type DriveItem, type DriveTree } from "./folders";

/** Appels à l'API Google Drive, avec l'accès du compte (src/lib/drive/connection.ts). */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const FIELDS = "id,name,mimeType,parents,size,modifiedTime,webViewLink,appProperties";
const MAX_PAGES = 10;

/** Drive plein : à distinguer pour le dire à la personne. */
export class DriveFull extends Error {}

async function call(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path.startsWith("https:") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.ok) return response;
  const detail = await response.text().catch(() => "");
  if (detail.includes("storageQuotaExceeded")) throw new DriveFull();
  // Jamais le corps : il peut citer le nom d'un document. Seulement le code de la raison
  // (« accessNotConfigured » = API Drive pas activée dans Google Cloud, « insufficientPermissions »…).
  throw new Error(`Google Drive a répondu ${response.status}${driveReason(detail)}`);
}

/** « (raison) » lue dans la réponse d'erreur de Google : un mot-code, jamais de texte libre. */
function driveReason(detail: string): string {
  try {
    const body = JSON.parse(detail) as { error?: { status?: unknown; errors?: { reason?: unknown }[] } };
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.status;
    return typeof reason === "string" && /^[A-Za-z_]{1,60}$/.test(reason) ? ` (${reason})` : "";
  } catch {
    return "";
  }
}

export async function readDriveAccount(accessToken: string): Promise<{ email: string | null; used: number | null; limit: number | null }> {
  const response = await call(accessToken, `/about?fields=${encodeURIComponent("user(emailAddress),storageQuota(limit,usage)")}`);
  const data = (await response.json()) as { user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } };
  const number = (value?: string) => (value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
  return { email: data.user?.emailAddress ?? null, used: number(data.storageQuota?.usage), limit: number(data.storageQuota?.limit) };
}

export async function readDriveTree(accessToken: string): Promise<DriveTree> {
  const items: DriveItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ q: "trashed = false", pageSize: "1000", fields: `nextPageToken,files(${FIELDS})`, spaces: "drive" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await call(accessToken, `/files?${params}`);
    const data = (await response.json()) as { files?: DriveItem[]; nextPageToken?: string };
    items.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return organizeDrive(items);
}

async function createFolder(accessToken: string, name: string, mark: string, parent?: string): Promise<string> {
  const response = await call(accessToken, "/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME, appProperties: { [DRIVE_MARK]: mark }, ...(parent ? { parents: [parent] } : {}) }),
  });
  return ((await response.json()) as { id: string }).id;
}

/** Dossier Drive d'une rubrique, créé au premier document (ou s'il a été supprimé depuis le Drive). */
export async function ensureDriveFolder(accessToken: string, tree: DriveTree, folder: DriveFolderId): Promise<string> {
  const existing = tree.folderIds[folder];
  if (existing) return existing;
  const rootId = tree.rootId ?? (await createFolder(accessToken, "Tamilya", DRIVE_ROOT_MARK));
  const label = DRIVE_FOLDERS.find((item) => item.id === folder)!.label;
  return createFolder(accessToken, label, folder, rootId);
}

/**
 * Prépare l'envoi : le fichier part ensuite du navigateur directement chez Google,
 * sans passer par nos serveurs (qui refusent au-delà de 4,5 Mo). L'origine du site
 * doit être annoncée ici pour que Google accepte l'envoi depuis le navigateur.
 */
export async function startDriveUpload(
  accessToken: string,
  file: { name: string; mimeType: string; size: number; parent: string },
  origin: string,
): Promise<string> {
  const response = await call(accessToken, `${UPLOAD_API}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.mimeType,
      "X-Upload-Content-Length": String(file.size),
      Origin: origin,
    },
    body: JSON.stringify({ name: file.name, parents: [file.parent] }),
  });
  const url = response.headers.get("location");
  if (!url) throw new Error("Google Drive n'a pas donné d'adresse d'envoi");
  return url;
}

export async function moveDriveFile(accessToken: string, fileId: string, target: string): Promise<void> {
  const current = await call(accessToken, `/files/${encodeURIComponent(fileId)}?fields=parents`);
  const { parents = [] } = (await current.json()) as { parents?: string[] };
  const params = new URLSearchParams({ addParents: target, removeParents: parents.join(","), fields: "id" });
  await call(accessToken, `/files/${encodeURIComponent(fileId)}?${params}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
}

/** Corbeille du Drive : récupérable pendant 30 jours. */
export async function trashDriveFile(accessToken: string, fileId: string): Promise<void> {
  await call(accessToken, `/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}
