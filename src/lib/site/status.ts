/** Les trois états du site. Sans dépendance : lu par le proxy, le serveur et les écrans d'administration. */

export const SITE_STATUSES = ["online", "maintenance", "waiting_partner"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  online: "En ligne",
  maintenance: "Maintenance",
  waiting_partner: "En attente d'un partenaire",
};

/**
 * Ce que le proxy répond aux visiteurs quand le site est fermé ; null : site ouvert.
 * Le site de la branche develop (dev.tamilya.yt) n'est jamais fermé : c'est là
 * qu'on teste pendant une maintenance. Vercel donne la branche à chaque déploiement.
 *
 * `pageStatus` : code de la page d'attente. Maintenance : 503 (panne courte, les robots
 * repassent plus tard). En attente d'un partenaire : 200, c'est la vraie page d'accueil
 * du moment, qui doit pouvoir être lue (Google la vérifie avant d'ouvrir la connexion
 * avec Google à tous, le 2026-11-13).
 */
export function siteClosure(
  status: SiteStatus,
  env: Record<string, string | undefined> = process.env,
): { apiError: string; retryAfter: string; pageStatus: 200 | 503 } | null {
  if (env.VERCEL_GIT_COMMIT_REF === "develop") return null;
  if (status === "maintenance") return { apiError: "Site en maintenance : réessaie un peu plus tard.", retryAfter: "600", pageStatus: 503 };
  if (status === "waiting_partner") return { apiError: "Tamilya ouvre bientôt : réessaie un peu plus tard.", retryAfter: "3600", pageStatus: 200 };
  return null;
}
