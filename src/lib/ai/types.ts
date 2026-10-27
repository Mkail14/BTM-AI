import type { ChatTurn, FinishReason } from "@/lib/chat/types";

export type AIStreamChunk =
  | { type: "text"; text: string }
  | { type: "finish"; reason: FinishReason };

export type AIStreamInput = {
  system: string;
  messages: ChatTurn[];
  maxOutputTokens: number;
  signal: AbortSignal;
};

/** Contrat commun à tous les fournisseurs de modèle. */
export interface AIProvider {
  readonly id: string;
  stream(input: AIStreamInput): AsyncIterable<AIStreamChunk>;
}

export type AIErrorCode =
  | "auth"
  | "rate_limited"
  /** Crédit ou quota journalier épuisé : inutile de réessayer avant longtemps. */
  | "quota"
  | "overloaded"
  | "timeout"
  | "bad_request"
  | "unavailable"
  | "aborted";

/** Erreur normalisée ; le message n'est destiné qu'aux journaux serveur. */
export class AIProviderError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AIProviderError";
  }
}
