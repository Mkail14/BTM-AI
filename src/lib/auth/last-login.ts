/**
 * « Dernière connexion » : l'adresse du dernier compte connecté sur cet appareil, rappelée
 * (à moitié cachée) sur l'écran de connexion pour qui ne se souvient plus de son mail.
 * Gardée dans l'appareil seulement, jamais envoyée.
 */
const KEY = "tamilya-derniere-connexion";

export type LastLogin = { email: string; google: boolean };

export function readLastLogin(): LastLogin | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<LastLogin> | null;
    if (!value || typeof value.email !== "string" || !value.email.includes("@")) return null;
    return { email: value.email, google: value.google === true };
  } catch {
    return null;
  }
}

export function rememberLastLogin(login: LastLogin) {
  try {
    localStorage.setItem(KEY, JSON.stringify(login));
  } catch {
    // Stockage indisponible : pas de rappel, rien de grave.
  }
}
