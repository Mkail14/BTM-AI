import { DRIVE_MAX_FILE_BYTES, type DriveFolderId } from "./folders";

export type DriveUploadProblem = "not-connected" | "full" | "too-big" | "failed";

/** Envoi depuis le navigateur : le serveur ouvre l'envoi, le fichier part directement chez Google. */
export async function uploadToDrive(file: File, folder: DriveFolderId): Promise<DriveUploadProblem | null> {
  if (file.size > DRIVE_MAX_FILE_BYTES) return "too-big";
  try {
    const start = await fetch("/api/drive/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, folder }),
    });
    const data = (await start.json().catch(() => null)) as { uploadUrl?: string; reason?: DriveUploadProblem } | null;
    if (!start.ok || !data?.uploadUrl) return data?.reason ?? "failed";
    const sent = await fetch(data.uploadUrl, { method: "PUT", body: file });
    return sent.ok ? null : "failed";
  } catch {
    return "failed";
  }
}

export const DRIVE_UPLOAD_MESSAGES: Record<DriveUploadProblem, string> = {
  "not-connected": "Ton Google Drive n'est plus relié.",
  full: "Ton Google Drive est plein.",
  "too-big": "Ce fichier dépasse 100 Mo.",
  failed: "L'envoi n'a pas abouti. Réessaie.",
};
