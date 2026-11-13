import { z } from "zod";
import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_TYPES } from "./attachment";
import { CHAT_LIMITS } from "./limits";

const turnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(CHAT_LIMITS.maxStoredMessageChars),
});

const userMessageSchema = z
  .string()
  .trim()
  .min(1, "Le message est vide.")
  .max(
    CHAT_LIMITS.maxUserMessageChars,
    `Le message dépasse ${CHAT_LIMITS.maxUserMessageChars} caractères.`,
  );

/**
 * Corps de POST /api/chat.
 * - Visiteur : `history` contient l'échange précédent (conservé par le navigateur).
 * - Utilisateur connecté : `history` est ignoré, l'historique est relu en base.
 */
export const chatRequestSchema = z.strictObject({
  message: userMessageSchema,
  conversationId: z.uuid().optional(),
  /** Message dicté (mode vocal) : Tamilya en tient compte et répond pour être écoutée. */
  voice: z.boolean().optional(),
  /** Administrateur : leçon de shimaoré allumée (mode maître, Tamilya ne parle que shimaoré). */
  shimaoreLesson: z.boolean().optional(),
  /** Photo ou PDF envoyé par le « + » : Tamilya le lit pour répondre à la question. */
  attachment: z
    .strictObject({
      name: z.string().trim().min(1).max(200),
      mimeType: z.enum(CHAT_ATTACHMENT_TYPES),
      data: z
        .string()
        .max(Math.ceil(CHAT_ATTACHMENT_MAX_BYTES / 3) * 4, "Fichier trop lourd pour que Tamilya le lise.")
        .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Fichier illisible."),
    })
    .optional(),
  history: z
    .array(turnSchema)
    .max(CHAT_LIMITS.anonymousMaxMessages)
    .refine(
      (turns) =>
        turns.reduce((sum, t) => sum + t.content.length, 0) <=
        CHAT_LIMITS.anonymousMaxHistoryChars,
      "L'historique est trop long.",
    )
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Corps de POST /api/conversations : import d'une conversation anonyme. */
export const importConversationSchema = z.strictObject({
  messages: z
    .array(turnSchema.extend({ content: turnSchema.shape.content.min(1) }))
    .min(1)
    .max(CHAT_LIMITS.anonymousMaxMessages),
});

export const conversationIdSchema = z.uuid();

export const profileSchema = z.strictObject({
  displayName: z.string().trim().max(60, "60 caractères maximum."),
});
