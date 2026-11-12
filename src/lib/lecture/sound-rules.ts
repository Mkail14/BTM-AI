import type { SceneAmbience, SoundCue } from "./script";

/**
 * Garde-fous du son, appliqués par le code quoi que Gemini ait choisi (plainte du 2026-11-12 :
 * des bruits de fond mal choisis, pas adaptés). Gemini choisit ; ici on écarte seulement ce qui
 * sonne faux à coup sûr.
 */

/** Deux décors au plus : au-delà, on n'entend plus qu'un brouhaha sous la voix. */
export const MAX_AMBIENCES = 2;
/** Deux bruits courts au plus par réplique. */
export const MAX_CUES = 2;

/** Décors qui disent « il fait nuit ». */
const NIGHT = new Set(["nuit", "grenouilles", "roussettes"]);
/** Décors de pleine journée, faux la nuit. */
const DAY = new Set(["marche", "enfants", "classe", "stade", "cigales", "chantier", "menuisier"]);

/**
 * Décor de la page : sans doublon, sans mélange jour/nuit (le premier choisi par Gemini décide),
 * sans son qui fait peur sous une musique légère, deux au plus.
 */
export function tidyAmbiences(ambiences: SceneAmbience[], light: boolean, isScary: (sound: string) => boolean): SceneAmbience[] {
  const kept: SceneAmbience[] = [];
  let time: "jour" | "nuit" | null = null;
  for (const a of ambiences) {
    if (kept.length >= MAX_AMBIENCES) break;
    if (kept.some((k) => k.sound === a.sound)) continue;
    if (light && isScary(a.sound)) continue;
    const t = NIGHT.has(a.sound) ? "nuit" : DAY.has(a.sound) ? "jour" : null;
    if (t && time && t !== time) continue;
    time ??= t;
    kept.push(a);
  }
  return kept;
}

/**
 * Bruits d'une réplique : pas de son qui fait peur sous une musique légère, deux au plus, et pas
 * le même bruit que la réplique d'avant (sinon il revient en boucle et fatigue). Quand la
 * narratrice imite un bruit (placed), le vrai bruit peut l'accompagner à chaque fois.
 */
export function tidyCues(cues: SoundCue[], light: boolean, isScary: (sound: string) => boolean, previous: ReadonlySet<string>, placed: boolean): SoundCue[] {
  return cues
    .filter((c) => !(light && isScary(c.sound)))
    .filter((c) => placed || !previous.has(c.sound))
    .slice(0, MAX_CUES);
}
