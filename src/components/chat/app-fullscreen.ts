/** Pont posé par l'application Android (CardFrame.java) sur la page /apercu/carte. */
type Bridge = { hauteur?: (px: number) => void; pleinEcran?: (on: boolean) => void };

/** Marque posée sur <html> pendant que la carte occupe tout l'écran de l'app. */
export const FULL_ATTR = "data-plein-ecran";

export function cardBridge(): Bridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { TamilyaCarte?: Bridge }).TamilyaCarte;
}

/** Attend que la page change de taille (l'app l'agrandit ou la rétrécit), au plus `max` ms. */
export function waitResize(max = 700): Promise<void> {
  return new Promise((resolve) => {
    const start = { w: window.innerWidth, h: window.innerHeight };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("resize", check);
      clearTimeout(timer);
      // Deux images : la page est dessinée à sa nouvelle taille avant la suite.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const check = () => (window.innerWidth !== start.w || window.innerHeight !== start.h) && finish();
    const timer = setTimeout(finish, max);
    window.addEventListener("resize", check);
  });
}

/**
 * Avant d'ouvrir un panneau plein écran dans la petite carte de l'app : l'app donne d'abord
 * tout l'écran à la page (cachée, une photo de la carte reste dans la conversation), et le
 * panneau s'ouvre seulement à la bonne taille ; l'app montre la page à ce moment-là
 * (CardEmbed redit « plein écran » quand le panneau apparaît). Sans ça, le panneau s'ouvrait
 * écrasé dans le petit cadre puis se recalait (carte avec des rectangles noirs).
 * Sur le site (pas de pont), rien à attendre.
 */
export async function enterAppFullscreen(): Promise<void> {
  const bridge = cardBridge();
  if (!bridge?.pleinEcran) return;
  const resized = waitResize();
  bridge.pleinEcran(true);
  await resized;
  // La petite carte, maintenant en haut de la page agrandie, ne reste pas visible sous le panneau.
  document.documentElement.setAttribute(FULL_ATTR, "");
}
