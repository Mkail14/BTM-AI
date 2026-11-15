/**
 * Mesures de l'iPhone 17 dessiné sur l'accueil (ChatDemo), en points d'écran.
 * La page d'aperçu (/apercu/conversation) laisse ces marges libres en haut et
 * en bas : l'accueil y dessine la barre d'iOS et le trait du bas.
 */
export const PHONE = {
  /** Écran. */
  width: 402,
  height: 874,
  /** Bord noir autour de l'écran. */
  bezel: 10,
  /** Hauteur de la barre d'iOS (heure, îlot, réseau, batterie). */
  statusBar: 54,
  /** Place du trait du bas. */
  homeBar: 21,
} as const;

/** Adresse de la page affichée dans le téléphone. */
export const PREVIEW_PATH = "/apercu/conversation";
