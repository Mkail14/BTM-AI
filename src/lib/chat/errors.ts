import { CHAT_LIMITS } from "./limits";
import type { ChatErrorCode } from "./types";

/** Messages destinés à l'utilisateur : jamais de détails internes. */
export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  ai_not_configured: "Tamilya n'est pas encore prête sur ce site. Réessaie plus tard.",
  rate_limited:
    "Tu as atteint la limite d'utilisation pour le moment. Réessaie un peu plus tard.",
  signup_required: `Tes ${CHAT_LIMITS.guestTrialMessages} messages d'essai sont utilisés. Crée ton compte gratuit pour continuer à parler avec Tamilya.`,
  invalid_request: "La demande est invalide.",
  conversation_too_long:
    "Cette conversation a atteint sa longueur maximale. Démarre une nouvelle conversation.",
  unauthorized: "Tu dois être connecté pour faire cette action.",
  not_found: "Conversation introuvable.",
  provider_error: "Le service d'IA a renvoyé une erreur. Réessaie dans un instant.",
  provider_overloaded:
    "Le service d'IA est momentanément surchargé. Réessaie dans quelques instants.",
  timeout: "La réponse a pris trop de temps. Réessaie.",
  refusal: "Tamilya ne peut pas répondre à cette demande.",
  service_unavailable: "Le service est momentanément indisponible. Réessaie plus tard.",
  flow_cut: "Tamilya est en pause pour le moment. Réessaie un peu plus tard.",
  reauth_required: "Pour ta sécurité, reconnecte-toi avant de faire cette action.",
  wallet_not_empty: "Ton portefeuille n'est pas vide : utilise ou fais rembourser ton solde d'abord.",
  internal: "Une erreur inattendue s'est produite. Réessaie.",
};

export function chatErrorBody(code: ChatErrorCode, message?: string) {
  return { error: { code, message: message ?? CHAT_ERROR_MESSAGES[code] } };
}
