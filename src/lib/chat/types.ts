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
