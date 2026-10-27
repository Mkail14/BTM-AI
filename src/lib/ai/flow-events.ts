/**
 * Trajet d'un message dans le schéma de /admin/modele-ia, diffusé en direct
 * aux administrateurs (Supabase Realtime, canal privé). Aucun contenu de
 * message ne circule : seulement les blocs franchis et la raison d'un blocage.
 */
export const FLOW_TOPIC = "admin-flow";
export const FLOW_EVENT = "step";

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
};

export const AI_ERROR_LABELS: Record<string, string> = {
  quota: "crédit ou quota épuisé",
  rate_limited: "trop de requêtes",
  auth: "clé refusée",
  timeout: "trop lent",
  overloaded: "serveur surchargé",
  bad_request: "requête refusée",
  unavailable: "injoignable",
};
