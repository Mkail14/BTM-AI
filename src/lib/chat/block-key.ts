/**
 * Achats faits depuis un bloc de la conversation (billet de barge, commande
 * de repas), gardés sur l'appareil sous une clé « conversation + rang du bloc ».
 *
 * Une nouvelle conversation commence toujours à l'adresse « / » : on n'y
 * relit jamais un achat (il appartiendrait à une autre conversation). Quand
 * l'adresse devient /c/<id>, l'achat fait entre-temps suit (moveBlockValue).
 */

const FRESH = "/";

/** Clé du bloc `el` parmi les blocs du même type (`selector`) de la page. */
export function blockKey(prefix: string, el: HTMLElement | null, selector: string, suffix = "", path = window.location.pathname) {
  const blocks = Array.from(document.querySelectorAll(selector));
  return `${prefix}${path}#${el ? blocks.indexOf(el) : -1}${suffix}`;
}

/**
 * Valeur gardée pour ce bloc, jamais dans une conversation neuve (adresse « / »),
 * sauf `own` : l'achat vient d'être fait depuis ce même bloc.
 */
export function readBlockValue(key: string, own = false): string | null {
  if (window.location.pathname === FRESH && !own) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Garde l'achat sur l'appareil. Ne lève jamais d'erreur : le stockage peut être plein
 * ou bloqué, et l'achat est déjà payé ; une erreur ici s'afficherait comme un paiement
 * raté et pousserait à repayer. Faux si rien n'a pu être gardé.
 */
export function saveBlockValue(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** L'adresse de la conversation a changé (« / » → /c/<id>) : la valeur suit. */
export function moveBlockValue(oldKey: string, newKey: string) {
  if (oldKey === newKey) return;
  try {
    const value = localStorage.getItem(oldKey);
    if (value === null) return;
    localStorage.setItem(newKey, value);
    localStorage.removeItem(oldKey);
  } catch {
    // Stockage indisponible : l'achat reste sous l'ancienne clé.
  }
}
