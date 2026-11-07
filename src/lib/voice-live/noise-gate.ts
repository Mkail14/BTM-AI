/**
 * Porte à bruit du mode « parler sans bouton » : Gemini décide seul quand la
 * personne a fini de parler, et il prend le bruit de fond (route, travaux) pour
 * de la parole, donc il attend sans fin. La porte laisse passer ce qui dépasse
 * nettement le bruit ambiant et remplace le reste par du vrai silence.
 *
 * Elle apprend le niveau du bruit en continu, donc elle marche dans une pièce
 * calme comme au bord de la route. Elle ne sépare pas deux voix : quelqu'un qui
 * parle fort à côté passe aussi (dans ce cas, le mode « maintenir » est le bon).
 */

/*
 * Réglages comparés sur une vraie voix mélangée à du bruit (de 10 à 3 dB) : 89 à 100 %
 * de la voix passe, moins d'une seconde de bruit, fermeture 0,5 s après la phrase.
 * Plus strict (2,5 fois le bruit), la voix était coupée à 90 %.
 */
/** Dépasser le bruit ambiant de ce facteur compte comme de la parole. */
const OVER_NOISE = 1.8;
/** En dessous, c'est le silence, même dans une pièce très calme. */
const MIN_LEVEL = 0.012;
/** Deux paquets (0,2 s) : un coup de marteau isolé n'ouvre pas la porte. */
const PACKETS_TO_OPEN = 2;
/*
 * Pendant que Tamilya parle, sa voix revient dans le micro (surtout quand elle chante) :
 * Gemini la prenait pour la personne et se coupait. Pour l'interrompre, il faut alors
 * parler nettement plus fort que cet écho, pendant 0,4 s.
 */
const OVER_ECHO = 3.5;
const ECHO_LEVEL = 0.06;
const ECHO_PACKETS_TO_OPEN = 4;
/** La porte reste ouverte 0,6 s après le dernier mot : les petites pauses ne coupent pas la phrase. */
const PACKETS_TO_CLOSE = 6;
/**
 * Bruit ambiant = le niveau le plus bas des 3 dernières secondes : même en parlant,
 * il y a des creux entre les mots, donc la voix n'est pas prise pour du bruit.
 */
const NOISE_WINDOW = 30;
/** Silero : au-dessus, c'est une voix ; une fois la porte ouverte, un peu moins suffit pour la garder (réglages conseillés par Silero). */
const VOICE_OPEN = 0.5;
const VOICE_KEEP = 0.35;

const level = (samples: Float32Array) => {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / (samples.length || 1));
};

/** Renvoie la fonction à appeler sur chaque paquet : elle dit quoi envoyer à Gemini à la place. */
export function createNoiseGate() {
  const recent: number[] = [];
  let open = false;
  let loud = 0;
  let quiet = 0;
  /** Début de phrase : gardé le temps de savoir si c'est de la parole, pour ne pas couper le premier mot. */
  let pending: Float32Array[] = [];

  /**
   * `voice` : probabilité de voix donnée par Silero (0 à 1), absente tant qu'il n'est pas chargé
   * (la porte décide alors au volume seul, comme avant).
   */
  return (samples: Float32Array, tamilyaTalking = false, voice?: number): Float32Array[] => {
    const rms = level(samples);
    recent.push(rms);
    if (recent.length > NOISE_WINDOW) recent.shift();
    const floor = Math.min(...recent);
    const loudEnough = rms > (tamilyaTalking ? Math.max(ECHO_LEVEL, floor * OVER_ECHO) : Math.max(MIN_LEVEL, floor * OVER_NOISE));
    const over =
      voice === undefined
        ? loudEnough
        : tamilyaTalking
          ? // L'écho de Tamilya est aussi une voix : il faut toujours parler plus fort qu'elle.
            loudEnough && voice > VOICE_OPEN
          : // Silero reconnaît la voix, même près du bruit : le volume ne sert plus qu'à écarter un murmure lointain.
            rms > MIN_LEVEL / 2 && voice > (open ? VOICE_KEEP : VOICE_OPEN);

    if (open) {
      quiet = over ? 0 : quiet + 1;
      if (quiet < PACKETS_TO_CLOSE) return [samples];
      open = false;
      loud = 0;
      return [new Float32Array(samples.length)];
    }
    loud = over ? loud + 1 : 0;
    if (!over) {
      pending = [samples];
      return [new Float32Array(samples.length)];
    }
    pending.push(samples);
    if (loud < (tamilyaTalking ? ECHO_PACKETS_TO_OPEN : PACKETS_TO_OPEN)) return [new Float32Array(samples.length)];
    open = true;
    quiet = 0;
    const flush = pending;
    pending = [];
    return flush;
  };
}
