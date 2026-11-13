export type ChatRole = "user" | "assistant";

/** Photo ou document envoyé avec la question (« + » de la barre) : lu par Tamilya pour ce message seulement. */
export type ChatAttachment = {
  name: string;
  mimeType: string;
  /** Contenu en base64. */
  data: string;
};

export type ChatTurn = {
  role: ChatRole;
  content: string;
  attachment?: ChatAttachment;
};

/** Statut d'un message tel qu'il est stocké. */
export type MessageStatus = "complete" | "interrupted" | "error";

export type FinishReason = "stop" | "length" | "refusal" | "other";

export type ChatErrorCode =
  | "ai_not_configured"
  | "rate_limited"
  | "signup_required"
  | "invalid_request"
  | "conversation_too_long"
  | "unauthorized"
  | "not_found"
  | "provider_error"
  | "provider_overloaded"
  | "timeout"
  | "refusal"
  | "service_unavailable"
  | "flow_cut"
  | "internal";

/** Événements du flux NDJSON renvoyé par /api/chat. */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "delta"; text: string }
  /** Texte final qui remplace tout ce qui a été affiché (mode maître : réponse corrigée). */
  | { type: "replace"; text: string }
  /** Mode vocal : phrase terminée (déjà corrigée en mode maître), à lire tout de suite. */
  | { type: "speech"; text: string }
  /** Mode vocal : temps du serveur jusqu'au premier mot du modèle (chronométrage, /admin/voix). */
  | { type: "timing"; firstTokenMs: number }
  /** Question difficile : l'équipe d'agents consultée avant la réponse (affiché pendant l'attente). */
  | { type: "team"; agents: string[] }
  /** Mode maître : shimaoré retenu de ce message (affiché « ✓ Retenu » sous la réponse). */
  | { type: "learned"; words: { french: string; shimaore: string }[] }
  /** Ce que Tamilya vient de retenir sur la personne (« Mémoire mise à jour » sous la réponse). */
  | { type: "remembered"; items: string[] }
  | { type: "done"; finishReason: FinishReason }
  | { type: "error"; code: ChatErrorCode; message: string };

/** Où la conversation a commencé : Tamilya normale ou Tamilya Connect (sans internet). */
export type ConversationSource = "tamilya" | "connect";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  source: ConversationSource;
};

export type StoredMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
};
