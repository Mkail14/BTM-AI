/**
 * Lecture de la voix en direct : sans clic et sans saturation.
 *
 * Gemini envoie la voix par petits morceaux, chacun programmé à la suite du
 * précédent, ou 20 ms après l'instant présent s'il arrive en retard (même
 * réglage qu'avant : la première voix ne part pas plus tard).
 *
 * Essayé puis écarté le 2026-11-08 : une marge d'avance qui grandit après
 * chaque trou (40 à 250 ms). Sur un réseau simulé (gigue de 50 à 600 ms,
 * tests/voix-lecture-fluide.test.ts), elle évitait au mieux un trou sur trois
 * mais ajoutait du silence au total et 20 ms avant la première voix.
 *
 * Gardé : un morceau qui repart après un trou (ou qui ouvre une réponse)
 * commence par un fondu de 4 ms, sans clic.
 */

/** Avance minimale d'un morceau sur l'horloge du son, en secondes (réglage d'origine). */
export const LEAD = 0.02;

export type Slot = {
  /** Instant de départ du morceau (horloge du son). */
  startAt: number;
  /** Le morceau arrive après la fin du précédent alors que la réponse continuait : un trou s'est produit. */
  underrun: boolean;
  /** Premier morceau d'une réponse, ou reprise après un trou : fondu d'entrée. */
  fresh: boolean;
};

export function createPlayout(lead = LEAD) {
  let nextTime = 0;
  let speaking = false;
  let underruns = 0;

  return {
    /** Place un morceau de `duration` secondes reçu à l'instant `now`. */
    schedule(now: number, duration: number): Slot {
      const late = speaking && nextTime < now;
      if (late) underruns++;
      const fresh = !speaking || late;
      const startAt = Math.max(nextTime, now + lead);
      nextTime = startAt + duration;
      speaking = true;
      return { startAt, underrun: late, fresh };
    },
    /** Fin de la réponse, ou Tamilya coupée : la prochaine voix repart à neuf (pas comptée comme un trou). */
    reset() {
      speaking = false;
      nextTime = 0;
    },
    get underruns() {
      return underruns;
    },
  };
}

/** Fondu d'entrée de quelques millisecondes (sur place) : pas de clic quand la voix repart. */
export function fadeIn(samples: Float32Array, rate: number, ms = 4): Float32Array {
  const n = Math.min(samples.length, Math.round((rate * ms) / 1000));
  for (let i = 0; i < n; i++) samples[i] *= i / n;
  return samples;
}

/**
 * Chaîne de sortie de la voix : coupe les très graves inutiles (souffle, grondement,
 * que les petits haut-parleurs rendent en bourdonnement) et un limiteur qui empêche
 * toute saturation, sans toucher au volume normal de la voix.
 */
export function createVoiceOutput(context: AudioContext): AudioNode {
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 70;
  highpass.Q.value = 0.7;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  highpass.connect(limiter).connect(context.destination);
  return highpass;
}
