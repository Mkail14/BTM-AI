/** Un bloc affiché plus tard que ça après l'ouverture de la page vient d'être écrit par Tamilya. */
const FRESH_AFTER_MS = 3000;

/**
 * La carte vient d'être écrite par Tamilya (pas relue dans l'historique) : son panneau peut s'ouvrir de lui-même.
 * Dans l'application Android, chaque carte a sa propre petite page (/apercu/carte), toute neuve :
 * l'app dit elle-même que la réponse vient d'arriver (?frais=1).
 */
export function isFreshCard(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("frais") === "1") return true;
  return performance.now() > FRESH_AFTER_MS;
}
