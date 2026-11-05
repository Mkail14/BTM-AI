/**
 * Le micro ne doit jamais rester ouvert sans que la personne le voie : un écran
 * qui recouvre le vocal le coupe, et un appel sans aucun échange se termine seul.
 */
export const VOICE_HANG_UP_EVENT = "tamilya:voice-hang-up";

/** Deux minutes sans parole ni toucher : laisse le temps de lire ou de choisir sur un tableau. */
export const VOICE_IDLE_LIMIT_MS = 120_000;
export const VOICE_IDLE_CHECK_MS = 5_000;

export const isVoiceIdle = (lastActivity: number, now: number) => now - lastActivity >= VOICE_IDLE_LIMIT_MS;

/** À appeler quand un écran passe par-dessus les boutons du vocal. */
export function hangUpVoice() {
  window.dispatchEvent(new Event(VOICE_HANG_UP_EVENT));
}
