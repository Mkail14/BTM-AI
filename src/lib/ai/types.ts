import type { ChatTurn, FinishReason } from "@/lib/chat/types";

export type AIStreamChunk =
  | { type: "text"; text: string }
  | { type: "finish"; reason: FinishReason }
  /** Jetons consommés (si l'API les donne) ; relevé par la chaîne de secours, jamais transmis plus loin. */
  | { type: "usage"; model: string; inputTokens: number; outputTokens: number };

export type AIStreamInput = {
  system: string;
  messages: ChatTurn[];
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Chaîne de secours : chaque API essayée, avec le code d'erreur si elle a échoué. */
  onAttempt?: (slotId: string, error?: AIErrorCode) => void;
  /** Réponse de Tamilya à une personne (pas une tâche de fond) : rappel d'harmonisation pour les modèles hors référence. */
  persona?: boolean;
  /** Réponse à l'oral (mode vocal) : réflexion minimale, et modèle AI_VOICE_MODEL s'il est défini. */
  fast?: boolean;
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
