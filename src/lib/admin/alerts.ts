import type { AdminOverview } from "./stats";

export type AdminAlert = {
  level: "critical" | "warning" | "info";
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

type AlertInput = {
  /** Raison renvoyée par readAIConfig, ou null si le fournisseur est configuré. */
  aiProblem: string | null;
  hasSecretKey: boolean;
  hasRateLimitSalt: boolean;
  overview: AdminOverview | null;
  /** Construit un lien vers le tableau de bord Supabase (null si inconnu). */
  supabaseLink: (path: string) => string | null;
};

const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * Points d'attention du tableau de bord, du plus grave au moins grave.
 * Chaque alerte dit quoi faire, pas seulement ce qui ne va pas.
 */
export function buildAdminAlerts({
  aiProblem,
  hasSecretKey,
  hasRateLimitSalt,
  overview,
  supabaseLink,
}: AlertInput): AdminAlert[] {
  const alerts: AdminAlert[] = [];
  const withAction = (label: string, path: string) => {
    const href = supabaseLink(path);
    return href ? { label, href } : undefined;
  };

  if (aiProblem) {
    alerts.push({
      level: "critical",
      title: "BTM AI ne peut pas répondre",
      detail: `Le fournisseur d'IA n'est pas configuré : ${aiProblem} Renseignez les variables AI_* sur le serveur.`,
    });
  }
  if (!hasSecretKey) {
    alerts.push({
      level: "critical",
      title: "Clé secrète Supabase absente",
      detail:
        "Les statistiques sont indisponibles et les quotas sont comptés en mémoire, sans protection réelle en production. Renseignez SUPABASE_SECRET_KEY.",
    });
  }
  if (!hasRateLimitSalt) {
    alerts.push({
      level: "warning",
      title: "RATE_LIMIT_SALT non défini",
      detail: "Les quotas par adresse IP sont remis à zéro à chaque redémarrage du serveur.",
    });
  }

  if (overview) {
    if (overview.answers7d >= 10) {
      const errorRate = overview.errors7d / overview.answers7d;
      if (errorRate >= 0.05) {
        alerts.push({
          level: "warning",
          title: `${percent(errorRate)} des réponses en erreur sur 7 jours`,
          detail: "Vérifiez la clé et le crédit du fournisseur d'IA, puis les journaux du serveur.",
        });
      }
    }

    if (overview.usersTotal >= 3 && overview.usersUnconfirmed / overview.usersTotal >= 0.3) {
      alerts.push({
        level: "warning",
        title: `${overview.usersUnconfirmed} comptes n'ont pas confirmé leur adresse`,
        detail: "Les e-mails de confirmation n'arrivent peut-être pas. Vérifiez l'envoi depuis contact@btm.yt (SMTP).",
        action: withAction("Voir les journaux d'authentification", "logs/auth-logs"),
      });
    }

    if (overview.anonDevicesBlockedToday > 0) {
      alerts.push({
        level: "info",
        title: `${overview.anonDevicesBlockedToday} visiteur(s) sans compte ont atteint leur limite aujourd'hui`,
        detail: `Limite : ${overview.anonDailyLimit} messages par jour et par appareil. Si cela se répète, relevez le quota ou mettez davantage en avant la création de compte.`,
      });
    }
    if (overview.usersBlockedToday > 0) {
      alerts.push({
        level: "info",
        title: `${overview.usersBlockedToday} compte(s) ont atteint leur limite aujourd'hui`,
        detail: `Limite : ${overview.userDailyLimit} messages par jour et par compte.`,
      });
    }
  }

  return alerts;
}
