/** Durée pendant laquelle la place notée reste valable (le message part tout de suite). */
const VALID_MS = 3000;

let noted: { rect: DOMRect; at: number } | null = null;

/** Page d'accueil des visiteurs : place de son globe, juste avant de lancer la conversation. */
export function noteGlobeOrigin(rect: DOMRect | null) {
  noted = rect ? { rect, at: performance.now() } : null;
}

/** Place notée par l'accueil (une seule fois), sinon null : un globe caché ou hors de l'écran ne compte pas. */
export function takeGlobeOrigin(): DOMRect | null {
  const rect = noted && performance.now() - noted.at < VALID_MS ? noted.rect : null;
  noted = null;
  return rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null;
}
