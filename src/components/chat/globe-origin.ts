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

/**
 * Vol du grand globe jusqu'au petit rond de la première réponse (demande de l'utilisateur,
 * 2026-11-09 : l'ancien vol rétrécissait sur place puis sautait, avec un rebond qui l'écrasait).
 * Un seul geste continu : il part tout de suite, suit une courbe douce (comme un objet lancé),
 * rétrécit au fil du trajet et se pose en douceur. Images clés calculées : `el` est déjà à sa
 * place d'arrivée, on le fait partir de `from`.
 */
export function globeFlightFrames(from: DOMRect, to: DOMRect, steps = 24): Keyframe[] {
  const start = { x: from.left + from.width / 2 - (to.left + to.width / 2), y: from.top + from.height / 2 - (to.top + to.height / 2) };
  // Point de contrôle : d'abord vers le côté, puis il plonge vers sa place (arc naturel).
  const bend = { x: start.x * 0.15, y: start.y * 0.85 };
  const big = Math.max(from.width / to.width, 1);
  // Lent au départ, rapide au milieu, il ralentit en arrivant.
  const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = ease(i / steps);
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * bend.x;
    const y = u * u * start.y + 2 * u * t * bend.y;
    // Taille réduite en proportion (échelle logarithmique) : le rétrécissement paraît régulier.
    const scale = big ** (1 - t);
    frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`, offset: (i / steps) * 0.86 });
  }
  // Il se pose : un léger gonflement, puis sa taille.
  frames.push({ transform: "translate(0, 0) scale(1.08)", offset: 0.93 }, { transform: "translate(0, 0) scale(1)", offset: 1 });
  return frames;
}

/**
 * Le texte de l'accueil (bonjour, idées) s'efface en douceur au lieu de disparaître d'un coup :
 * une copie figée reste un instant à sa place, se fond et monte un peu, puis s'en va.
 * Le globe n'y est pas : c'est lui qui vole jusqu'à la réponse.
 */
export function fadeOutHome(home: Element | null | undefined) {
  if (!home || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = home.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ghost = home.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll(".awa-blob-home").forEach((el) => ((el as HTMLElement).style.visibility = "hidden"));
  ghost.querySelectorAll<HTMLElement>("*").forEach((el) => (el.style.animation = "none"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "5",
  });
  document.body.appendChild(ghost);
  ghost
    .animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-12px)", filter: "blur(2px)" }], { duration: 380, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" })
    .finished.catch(() => {})
    .finally(() => ghost.remove());
}
