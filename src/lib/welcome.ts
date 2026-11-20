/**
 * Premiers pas (/bienvenue) : vus une fois par compte et par appareil. Gardé dans l'appareil :
 * l'app réinstallée les repropose, et seules les étapes encore à faire s'affichent.
 */
const key = (userId: string) => `tamilya-bienvenue:${userId}`;

export function welcomeDone(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    // Stockage bloqué : on ne redirige pas en boucle, on considère que c'est vu.
    return true;
  }
}

export function markWelcomeDone(userId: string) {
  try {
    localStorage.setItem(key(userId), "1");
  } catch {
    // Stockage indisponible : rien à faire.
  }
}

export type WelcomeLanguage = "francais" | "shimaore";

export const WELCOME_LANGUAGES: Record<WelcomeLanguage, { label: string; memory: string }> = {
  francais: { label: "Français", memory: "Langue préférée : français" },
  shimaore: { label: "Shimaoré", memory: "Langue préférée : shimaoré" },
};
