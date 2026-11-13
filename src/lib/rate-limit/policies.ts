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
  // Banque de documents : de quoi ranger tous ses papiers d'un coup.
  driveUpload: [{ name: "drive-upload-hour", limit: 120, windowSeconds: 3_600 }],
  // Attestation reçue par mail : de quoi la refaire après une correction.
  attestationEmail: [{ name: "attestation-email-hour", limit: 5, windowSeconds: 3_600 }],
  // Document à remplir : un appel Gemini par document ouvert.
  documentFill: [{ name: "document-fill-hour", limit: 30, windowSeconds: 3_600 }],
  // Formulaires avec téléphone et adresse : assez pour se tromper, pas pour inonder l'équipe.
  foodOrder: [{ name: "food-order-hour", limit: 10, windowSeconds: 3_600 }],
  bargeTicket: [{ name: "barge-ticket-hour", limit: 10, windowSeconds: 3_600 }],
  // Trajets sur la carte : la recherche de lieux (Nominatim, gratuite) ne doit pas être appelée en rafale.
  trip: [
    { name: "trip-minute", limit: 10, windowSeconds: 60 },
    { name: "trip-hour", limit: 60, windowSeconds: 3_600 },
  ],
  // Devis BTM enregistrés sur btm.yt depuis la conversation.
  btmDevis: [{ name: "btm-devis-hour", limit: 15, windowSeconds: 3_600 }],
  // Fournisseurs d'un devis BTM (sans compte) et changement de fournisseur : on compare, sans spammer btm.yt.
  btmFournisseurs: [{ name: "btm-fournisseurs-hour", limit: 60, windowSeconds: 3_600 }],
  // Mot de passe redemandé avant de modifier le Profil de l'entreprise : quelques essais, pas plus.
  profileUnlock: [{ name: "profile-unlock-15min", limit: 5, windowSeconds: 900 }],
  // Code de l'application d'authentification, pour entrer dans l'espace admin : 6 chiffres, pas de quoi deviner.
  adminGate: [{ name: "admin-gate-15min", limit: 5, windowSeconds: 900 }],
  // Code de paiement (paiement à la voix) : de quoi se tromper deux ou trois fois, pas de quoi deviner.
  // Compte aussi les codes justes (chaque paiement au doigt en demande un) : 10 laisse payer
  // plusieurs fois de suite. Les erreurs, elles, bloquent dès 5 (src/lib/wallet/pin.ts, blocage progressif).
  walletPin: [{ name: "wallet-pin-15min", limit: 10, windowSeconds: 900 }],
  codeExamRequest: [{ name: "code-exam-request-hour", limit: 5, windowSeconds: 3_600 }],
  // Avis sur l'application : de quoi corriger une faute, pas de quoi inonder la page d'accueil.
  review: [{ name: "review-hour", limit: 10, windowSeconds: 3_600 }],
  // Rond d'aide : questions à l'IA d'aide, et messages envoyés à l'équipe par e-mail.
  helpChat: [
    { name: "help-chat-min", limit: 6, windowSeconds: 60 },
    { name: "help-chat-day", limit: 60, windowSeconds: 86_400 },
  ],
  helpEmail: [{ name: "help-email-hour", limit: 5, windowSeconds: 3_600 }],
  // Tamilya Connect : messages d'un appareil (comme le chat), relais connectés (beaucoup de messages
  // d'autres téléphones par la même adresse), et enregistrement des appareils.
  meshDevice: [
    { name: "mesh-device-min", limit: 10, windowSeconds: 60 },
    { name: "mesh-device-day", limit: 200, windowSeconds: 86_400 },
  ],
  // SOS de Tamilya Connect : un même SOS revenu par un autre chemin ne compte pas (même réponse rendue).
  sosContacts: [{ name: "sos-contacts-hour", limit: 10, windowSeconds: 3_600 }],
  sosAlert: [{ name: "sos-hour", limit: 3, windowSeconds: 3_600 }],
  meshRelay: [{ name: "mesh-relay-min", limit: 120, windowSeconds: 60 }],
  meshRegister: [{ name: "mesh-register-hour", limit: 10, windowSeconds: 3_600 }],
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
  // Widget à coller sur un site : c'est BTM qui paie, donc limites basses. L'identifiant du widget
  // est public : chaque visiteur (IP), chaque widget, chaque compte et tous les widgets ensemble ont un plafond.
  developerWidget: [
    { name: "dev-widget-min", limit: 10, windowSeconds: 60 },
    { name: "dev-widget-day", limit: 300, windowSeconds: 86_400 },
  ],
  developerWidgetAccount: [{ name: "dev-widget-account-day", limit: 500, windowSeconds: 86_400 }],
  developerWidgetVisitor: [
    { name: "dev-widget-ip-min", limit: 6, windowSeconds: 60 },
    { name: "dev-widget-ip-day", limit: 50, windowSeconds: 86_400 },
  ],
  developerWidgetAll: [{ name: "dev-widget-all-day", limit: 5_000, windowSeconds: 86_400 }],
  // Sites partenaires (route /api/tamilya) : par site, leurs visiteurs sont déjà limités de leur côté.
  partnerSite: [
    { name: "site-min", limit: 60, windowSeconds: 60 },
    { name: "site-day", limit: 5_000, windowSeconds: 86_400 },
  ],
  // Voix Gemini de Tamilya : une lecture par phrase (3 ou 4 par réponse), plus les essais dans l'admin.
  voiceSpeak: [
    { name: "voice-min", limit: 60, windowSeconds: 60 },
    { name: "voice-day", limit: 2_000, windowSeconds: 86_400 },
  ],
  // Vocal en direct (admins) : un enregistrement par échange parlé, quelques boutons, et le bruit
  // ambiant reconnu par Gemini à la demande (le plus coûteux, donc le plus serré).
  voiceLiveTurn: [
    { name: "voice-turn-min", limit: 60, windowSeconds: 60 },
    { name: "voice-turn-day", limit: 5_000, windowSeconds: 86_400 },
  ],
  voiceLiveTool: [
    { name: "voice-tool-min", limit: 30, windowSeconds: 60 },
    { name: "voice-tool-day", limit: 1_000, windowSeconds: 86_400 },
  ],
  voiceLiveAmbiance: [
    { name: "voice-ambiance-min", limit: 10, windowSeconds: 60 },
    { name: "voice-ambiance-day", limit: 200, windowSeconds: 86_400 },
  ],
  // Chansons (Lyria) : chaque appel coûte, on borne les essais.
  // Chaque compte : 3 chansons par jour (décision de l'utilisateur, 2026-11-08). Admins : de quoi essayer.
  music: [{ name: "music-day", limit: 3, windowSeconds: 86_400 }],
  // Lecture en 3D (admins pour l'essai) : une page préparée par Gemini à partir d'une photo.
  reading: [
    { name: "reading-hour", limit: 20, windowSeconds: 3_600 },
    { name: "reading-day", limit: 80, windowSeconds: 86_400 },
  ],
  // Livre lu en entier : un morceau dure ~4 min d'écoute, un seul est préparé d'avance.
  // 30 par heure laisse la place à quelques sauts de chapitre ; 250 par jour, ~16 h d'écoute.
  readingBook: [
    { name: "reading-book-hour", limit: 30, windowSeconds: 3_600 },
    { name: "reading-book-day", limit: 250, windowSeconds: 86_400 },
  ],
  musicAdmin: [
    { name: "music-admin-hour", limit: 20, windowSeconds: 3_600 },
    { name: "music-admin-day", limit: 60, windowSeconds: 86_400 },
  ],
  // E-mails de sécurité : nouvel appareil (un par appareil inconnu) et mot de passe changé.
  authDevice: [{ name: "auth-device-hour", limit: 10, windowSeconds: 3_600 }],
  passwordNotice: [{ name: "password-notice-hour", limit: 3, windowSeconds: 3_600 }],
  // Relais IA (seulement s'il est ouvert) : protège la clé de BTM contre un secret volé.
  aiRelay: [
    { name: "relay-min", limit: 120, windowSeconds: 60 },
    { name: "relay-day", limit: 20_000, windowSeconds: 86_400 },
  ],
} satisfies Record<string, RateLimitRule[]>;
