/**
 * Mode vocal : découpe la réponse qui arrive du modèle en phrases terminées,
 * envoyées une à une à la voix pendant que la suite s'écrit encore.
 */

/** Une phrase plus courte (« Oui ! ») attend la suivante : la voix sonne mieux sur une vraie phrase. */
const MIN_SENTENCE_CHARS = 12;

// Fin de phrase : ponctuation suivie d'un espace (« 3.5 » n'en est pas une), ou saut de ligne.
const BOUNDARY = /[.!?…]+["»”')\]]*(?=\s)|\n+/g;

export function createSentenceSplitter() {
  let buffer = "";
  return {
    /** Ajoute le texte reçu ; renvoie les phrases désormais terminées. */
    push(text: string): string[] {
      buffer += text;
      const sentences: string[] = [];
      let start = 0;
      for (const match of buffer.matchAll(BOUNDARY)) {
        const end = match.index + match[0].length;
        const sentence = buffer.slice(start, end).trim();
        if (sentence.length < MIN_SENTENCE_CHARS) continue;
        sentences.push(sentence);
        start = end;
      }
      buffer = buffer.slice(start);
      return sentences;
    },
    /** Fin de la réponse : ce qui reste, même sans point final. */
    end(): string[] {
      const rest = buffer.trim();
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}
