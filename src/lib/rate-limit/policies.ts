import type { RateLimitRule } from "./types";

/**
 * Quotas de messages envoyés à l'IA. À Mayotte, beaucoup d'abonnés mobiles
 * partagent la même adresse IP (CGNAT) : la limite par IP est donc large et
 * la limite principale des visiteurs porte sur l'appareil (cookie).
 */
export const RATE_LIMIT_POLICIES = {
  anonymousDevice: [
    { name: "anon-dev-min", limit: 6, windowSeconds: 60 },
    { name: "anon-dev-day", limit: 30, windowSeconds: 86_400 },
  ],
  anonymousIp: [
    { name: "anon-ip-min", limit: 30, windowSeconds: 60 },
    { name: "anon-ip-day", limit: 300, windowSeconds: 86_400 },
  ],
  user: [
    { name: "user-min", limit: 15, windowSeconds: 60 },
    { name: "user-day", limit: 300, windowSeconds: 86_400 },
  ],
  conversationImport: [{ name: "import-hour", limit: 10, windowSeconds: 3_600 }],
  walletTopup: [{ name: "wallet-topup-hour", limit: 10, windowSeconds: 3_600 }],
  // Formulaires avec téléphone et adresse : assez pour se tromper, pas pour inonder l'équipe.
  foodOrder: [{ name: "food-order-hour", limit: 10, windowSeconds: 3_600 }],
  bargeTicket: [{ name: "barge-ticket-hour", limit: 10, windowSeconds: 3_600 }],
  // Mot de passe redemandé avant de modifier le Profil de l'entreprise : quelques essais, pas plus.
  profileUnlock: [{ name: "profile-unlock-15min", limit: 5, windowSeconds: 900 }],
  codeExamRequest: [{ name: "code-exam-request-hour", limit: 5, windowSeconds: 3_600 }],
  // Avis sur l'application : de quoi corriger une faute, pas de quoi inonder la page d'accueil.
  review: [{ name: "review-hour", limit: 10, windowSeconds: 3_600 }],
  // Rond d'aide : questions à l'IA d'aide, et messages envoyés à l'équipe par e-mail.
  helpChat: [
    { name: "help-chat-min", limit: 6, windowSeconds: 60 },
    { name: "help-chat-day", limit: 60, windowSeconds: 86_400 },
  ],
  helpEmail: [{ name: "help-email-hour", limit: 5, windowSeconds: 3_600 }],
  // API des développeurs : leur clé Gemini paie, mais le serveur de BTM travaille quand même.
  developerKey: [
    { name: "dev-key-min", limit: 20, windowSeconds: 60 },
    { name: "dev-key-day", limit: 2_000, windowSeconds: 86_400 },
  ],
  developerIp: [{ name: "dev-ip-min", limit: 60, windowSeconds: 60 }],
  // Tous les codes d'un même compte additionnés : créer 5 codes ne donne pas 5 fois plus de messages.
  developerAccount: [{ name: "dev-account-day", limit: 2_000, windowSeconds: 86_400 }],
  // Création de codes d'accès : assez pour se tromper, pas pour en fabriquer à la chaîne.
  developerKeyCreate: [{ name: "dev-key-create-day", limit: 10, windowSeconds: 86_400 }],
  // Sites partenaires (route /api/awa) : par site, leurs visiteurs sont déjà limités de leur côté.
  partnerSite: [
    { name: "site-min", limit: 60, windowSeconds: 60 },
    { name: "site-day", limit: 5_000, windowSeconds: 86_400 },
  ],
  // Relais IA (seulement s'il est ouvert) : protège la clé de BTM contre un secret volé.
  aiRelay: [
    { name: "relay-min", limit: 120, windowSeconds: 60 },
    { name: "relay-day", limit: 20_000, windowSeconds: 86_400 },
  ],
} satisfies Record<string, RateLimitRule[]>;
