import type { ChatErrorCode } from "./types";

/** Messages destinés à l'utilisateur : jamais de détails internes. */
export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  ai_not_configured:
    "Le service d'IA n'est pas encore configuré sur ce serveur. L'administrateur doit renseigner AI_PROVIDER, AI_API_KEY et AI_MODEL (voir README).",
  rate_limited:
    "Vous avez atteint la limite d'utilisation pour le moment. Réessayez un peu plus tard.",
  invalid_request: "La requête est invalide.",
  conversation_too_long:
    "Cette conversation a atteint sa longueur maximale. Démarrez une nouvelle conversation.",
  unauthorized: "Vous devez être connecté pour effectuer cette action.",
  not_found: "Conversation introuvable.",
  provider_error: "Le service d'IA a renvoyé une erreur. Réessayez dans un instant.",
  provider_overloaded:
    "Le service d'IA est momentanément surchargé. Réessayez dans quelques instants.",
  timeout: "La réponse a pris trop de temps. Réessayez.",
  refusal: "BTM AI ne peut pas répondre à cette demande.",
  service_unavailable: "Le service est momentanément indisponible. Réessayez plus tard.",
  flow_cut: "Awa est en pause pour le moment. Réessayez un peu plus tard.",
  internal: "Une erreur inattendue s'est produite. Réessayez.",
};

export function chatErrorBody(code: ChatErrorCode, message?: string) {
  return { error: { code, message: message ?? CHAT_ERROR_MESSAGES[code] } };
}
