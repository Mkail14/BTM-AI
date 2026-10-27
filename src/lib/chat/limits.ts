/**
 * Limites de taille partagées entre le client (affichage) et le serveur
 * (application réelle). Le serveur est la seule source de vérité.
 */
export const CHAT_LIMITS = {
  /** Longueur maximale d'un message saisi par l'utilisateur. */
  maxUserMessageChars: 4_000,
  /** Longueur maximale d'un message stocké ou renvoyé dans l'historique. */
  maxStoredMessageChars: 40_000,
  /** Nombre maximal de messages d'une conversation anonyme (10 échanges). */
  anonymousMaxMessages: 20,
  /** Taille cumulée maximale de l'historique anonyme envoyé par le client. */
  anonymousMaxHistoryChars: 60_000,
  /** Nombre maximal de messages dans une conversation enregistrée. */
  conversationMaxMessages: 200,
  /** Budget de caractères de contexte transmis au modèle (hors message système). */
  modelContextMaxChars: 48_000,
  /** Nombre de messages relus en base pour construire le contexte. */
  historyFetchLimit: 60,
  /** Longueur maximale d'un titre de conversation. */
  maxTitleChars: 80,
} as const;
