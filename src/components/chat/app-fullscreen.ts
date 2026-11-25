/**
 * Pont posé par l'application Android (CardFrame.java) sur la page /apercu/carte.
 * Petite carte : hauteur, pleinEcran (anciennes versions), grand (ouvre la page en grand à part).
 * Page en grand : fermer (le panneau est fermé, l'app retire la page).
 */
type Bridge = {
  hauteur?: (px: number) => void;
  pleinEcran?: (on: boolean) => void;
  grand?: (index: number) => void;
  fermer?: () => void;
};

/** Marque posée sur <html> pendant que la carte occupe tout l'écran de l'app. */
export const FULL_ATTR = "data-plein-ecran";

/**
 * Page en grand de l'app (?grand=N) : le panneau du N-ième bouton « Voir … » de la carte,
 * ouvert tout de suite dans une page à part en plein écran. La petite carte ne bouge jamais.
 */
export function bigIndex(): number | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("grand");
  return value && /^\d{1,2}$/.test(value) ? Number(value) : null;
}

/** Panneau de la page en grand fermé : l'app retire la page. */
export function closeBigPage() {
  cardBridge()?.fermer?.();
}

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
 * Anciennes versions de l'app (sans page en grand) : avant d'ouvrir un panneau plein écran
 * dans la petite carte, l'app donne d'abord tout l'écran à la page, et le panneau s'ouvre
 * seulement à la bonne taille. Sans ça, il s'ouvrait écrasé dans le petit cadre puis se
 * recalait (carte avec des rectangles noirs).
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
