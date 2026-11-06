/**
 * Comment Gemini sait quand la personne parle.
 * - Maintenir pour parler : c'est l'appui sur le bouton qui décide (activityStart et
 *   activityEnd), Gemini n'écoute pas lui-même : le bruit ne peut ni le lancer ni le bloquer.
 * - Sans bouton : Gemini décide, après PAUSE_MS de silence, et la porte
 *   à bruit (noise-gate.ts) lui donne le vrai silence qui marque la fin de la phrase.
 */
/**
 * Silence qui marque la fin de la phrase. À 300 ms, une petite pause pour chercher ses mots
 * coupait la demande en deux : Tamilya répondait au début, puis recommençait à chaque morceau.
 * Plus long = mieux compris, mais la réponse démarre d'autant plus tard.
 */
const PAUSE_MS = 700;

export function speechDetection(manual: boolean) {
  return {
    automaticActivityDetection: manual
      ? { disabled: true }
      : // Démarrage normal : « LOW » rendait Tamilya sourde dans le bruit fort (mesuré, 0 réponse sur 2).
        { endOfSpeechSensitivity: "END_SENSITIVITY_HIGH", prefixPaddingMs: 200, silenceDurationMs: PAUSE_MS },
  };
}
