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
 */
export function siteClosure(status: SiteStatus, env: Record<string, string | undefined> = process.env): { apiError: string; retryAfter: string } | null {
  if (env.VERCEL_GIT_COMMIT_REF === "develop") return null;
  if (status === "maintenance") return { apiError: "Site en maintenance : réessaie un peu plus tard.", retryAfter: "600" };
  if (status === "waiting_partner") return { apiError: "Tamilya ouvre bientôt : réessaie un peu plus tard.", retryAfter: "3600" };
  return null;
}
