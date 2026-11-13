/**
 * Photo ou document joint à une question (« + » de la barre de conversation).
 * Le fichier est rangé dans le Drive ; une copie part avec la question suivante
 * pour que Tamilya la lise. Seulement les formats que les modèles savent lire.
 */

export const CHAT_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ChatAttachmentType = (typeof CHAT_ATTACHMENT_TYPES)[number];

/** 4 Mo : la requête reste sous la limite du proxy (10 Mo) une fois en base64. */
export const CHAT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const isChatAttachmentType = (type: string): type is ChatAttachmentType =>
  (CHAT_ATTACHMENT_TYPES as readonly string[]).includes(type);

/** Ce qui reste du fichier dans la conversation enregistrée (le contenu, lui, n'est pas gardé). */
export const attachmentLabel = (name: string) => `📎 ${name}`;

export function withAttachmentLabel(message: string, name: string | undefined): string {
  return name ? `${attachmentLabel(name)}\n${message}` : message;
}
