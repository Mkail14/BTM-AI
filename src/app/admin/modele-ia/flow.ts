import type { NodeStatus } from "@/lib/ai/health";
import type { RateLimitSettings } from "@/lib/rate-limit/settings";
import type { CharacterDraft } from "../caractere/limits";

/** Données du schéma, construites côté serveur et transmises telles quelles au canevas. */
export type FlowIcon = "message" | "shield" | "sparkle" | "settings" | "book" | "language" | "memory" | "prompt" | "chip" | "reply";

export type FlowNode = {
  id: string;
  /** Colonne du schéma, de gauche (message reçu) à droite (réponse). */
  column: number;
  icon: FlowIcon;
  title: string;
  /** Nœuds d'API : nom du modèle. */
  subtitle?: string;
  status: NodeStatus;
  statusLabel: string;
  /** Page d'administration ouverte par un clic sur le bloc. */
  href?: string;
  /** Explication de l'état, affichée au survol. */
  reason?: string;
  /** Nœuds d'API : emplacement (1 = principale) et rôle actuel. */
  slot?: number;
  /** Identifiant de l'API dans la chaîne (« env-1 », « db-<uuid> »). */
  apiId?: string;
  /** Vrai pour une API ajoutée depuis cette page (les autres sont dans les variables du serveur). */
  deletable?: boolean;
  inService?: boolean;
  /** Nœuds d'API : fiche affichée au clic (valeurs déjà formatées, clé masquée). */
  api?: ApiDetails;
  /** Bloc « Quotas et sécurité » : quotas en vigueur, modifiables au clic. */
  limits?: RateLimitSettings;
  /** Bloc « Caractère et règles » : textes enregistrés et textes du code. */
  character?: { saved: CharacterDraft; defaults: CharacterDraft };
};

export type ApiDetails = {
  connection: { label: string; value: string; masked?: boolean }[];
  /** Crédit de la clé (OpenRouter). */
  credit: {
    limit: string | null;
    remaining: string | null;
    /** Part consommée du plafond, de 0 à 1 (null sans plafond). */
    ratio: number | null;
  } | null;
  /** Quota journalier des modèles gratuits (OpenRouter). */
  freeQuota: { limit: number; used: number; remaining: number; resetIn: string } | null;
  activity: { label: string; value: string }[];
};

export type FlowEdge = {
  from: string;
  to: string;
  /** Chemin réellement emprunté par les messages en ce moment. */
  live?: boolean;
  /** Chemin coupé (API épuisée, en erreur ou non configurée). */
  muted?: boolean;
};

export const STATUS_STYLES: Record<NodeStatus, { dot: string; pill: string; border: string }> = {
  ok: { dot: "bg-success", pill: "bg-success-soft text-success", border: "border-success/50" },
  warning: { dot: "bg-warning", pill: "bg-warning-soft text-warning", border: "border-warning/50" },
  exhausted: { dot: "bg-warning", pill: "bg-warning-soft text-warning", border: "border-warning/60" },
  error: { dot: "bg-danger", pill: "bg-danger-soft text-danger", border: "border-danger/60" },
  unknown: { dot: "bg-fg-muted", pill: "bg-bg-muted text-fg-muted", border: "border-border" },
  off: { dot: "bg-fg-muted/50", pill: "bg-bg-muted text-fg-muted", border: "border-dashed border-border" },
};
