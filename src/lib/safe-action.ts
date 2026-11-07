import { unstable_rethrow } from "next/navigation";

/** Message montré quand une action serveur n'a pas pu joindre le serveur (réseau coupé, serveur tombé). */
export const CONNECTION_LOST = "Connexion perdue, réessaie.";

/**
 * À passer à `.catch()` d'un appel d'action serveur : rend `fallback` au lieu de laisser
 * l'erreur casser la page. Les redirections et « page introuvable » de Next passent quand même.
 */
export function orFallback<F>(fallback: F) {
  return (error: unknown): F => {
    unstable_rethrow(error);
    return fallback;
  };
}

/** Résultat d'échec au format `{ ok: false, message }`, le plus courant dans les actions. */
export const lostOk = orFallback({ ok: false as const, message: CONNECTION_LOST });

/** Résultat d'échec au format `{ status: "error", message }` (Paramètres, profil). */
export const lostStatus = orFallback({ status: "error" as const, message: CONNECTION_LOST });
