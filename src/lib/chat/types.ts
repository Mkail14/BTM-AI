export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
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
  /** Mode maître : shimaoré retenu de ce message (affiché « ✓ Retenu » sous la réponse). */
  | { type: "learned"; words: { french: string; shimaore: string }[] }
  | { type: "done"; finishReason: FinishReason }
  | { type: "error"; code: ChatErrorCode; message: string };

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
};
