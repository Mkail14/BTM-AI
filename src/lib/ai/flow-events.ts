/**
 * Trajet d'un message dans le schéma de /admin/circuit, diffusé en direct
 * aux administrateurs (Supabase Realtime, canal privé). Aucun contenu de
 * message ne circule : seulement les blocs franchis et la raison d'un blocage.
 */
export const FLOW_TOPIC = "admin-flow";
export const FLOW_EVENT = "step";
/** Bloc du vocal en direct (Gemini Live, par le relais) dans le schéma. */
export const VOICE_NODE = "voice-live";

export type FlowStep = {
  /** Identifiant du message suivi. */
  trace: string;
  /** Ordre d'émission, pour rejouer les étapes dans l'ordre. */
  seq: number;
  /** Identifiant du bloc atteint (« guard », « prompt », « model-env-1 »…). */
  node: string;
  /** Faux : le message s'arrête à ce bloc. */
  ok: boolean;
  reason?: string;
  /** D'où vient le message quand ce n'est pas le chat de BTM AI (site BTM, widget ou API d'un développeur). */
  source?: string;
  /** Bloc de départ : la plateforme de Tamilya (BTM AI) ou l'API des entreprises. */
  origin?: FlowOrigin;
};

/**
 * Origine d'un message, premier bloc du schéma : la plateforme de Tamilya
 * (chat et voix de BTM AI) ou l'API des entreprises (sites de GROUPE BTM,
 * Orchestr AI, widgets, API publique des développeurs).
 */
export type FlowOrigin = "platform" | "api";
export const ORIGIN_NODES: Record<FlowOrigin, string> = { platform: "origin-platform", api: "origin-api" };

export const AI_ERROR_LABELS: Record<string, string> = {
  quota: "crédit ou quota épuisé",
  rate_limited: "trop de requêtes",
  auth: "clé refusée",
  timeout: "trop lent",
  overloaded: "serveur surchargé",
  bad_request: "requête refusée",
  unavailable: "injoignable",
};
