/**
 * Chansons au casque (demande de l'utilisateur, 2026-11-09) :
 * - de temps en temps, la musique fait un tour autour de la tête (devant, à droite, derrière, à
 *   gauche, puis revient devant), comme les sons des histoires ;
 * - la fin baisse doucement au lieu de s'arrêter net.
 * Calculs purs, suivis sur le temps de la chanson : la pause fige tout.
 */

/** Durée de la baisse finale (secondes). */
export const SONG_FADE = 3;
/** Premier tour, écart entre deux tours, durée d'un tour (secondes). */
export const ORBIT = { first: 7, every: 20, length: 9 } as const;

/** Volume (0 à 1) à ce moment de la chanson : plein, puis baisse sur les dernières secondes. */
export function fadeAt(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(0, Math.min(1, (duration - time) / SONG_FADE));
}

export type Orbit = { angle: number; lift: number };

/**
 * Place de la musique pendant un tour, ou null en dehors (musique normale, au milieu).
 * Un tour ne commence que s'il finit avant la baisse finale. Un tour sur deux part dans l'autre sens.
 */
export function orbitAt(time: number, duration: number): Orbit | null {
  if (!Number.isFinite(duration) || time < ORBIT.first) return null;
  const index = Math.floor((time - ORBIT.first) / ORBIT.every);
  const start = ORBIT.first + index * ORBIT.every;
  if (time >= start + ORBIT.length || start + ORBIT.length > duration - SONG_FADE - 1) return null;
  const x = (time - start) / ORBIT.length;
  // Démarre et s'arrête en douceur.
  const ease = x * x * (3 - 2 * x);
  const turn = index % 2 === 0 ? 360 : -360;
  let angle = ease * turn;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  // Monte un peu au-dessus de la tête au milieu du tour.
  return { angle, lift: 0.3 * Math.sin(Math.PI * x) };
}
