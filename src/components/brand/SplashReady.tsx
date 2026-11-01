"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __btmAiPret?: () => void;
  }
}

/** Signale à l'écran de lancement que l'application est affichée et utilisable (après hydratation). */
export function SplashReady() {
  useEffect(() => {
    if (window.__btmAiPret) {
      window.__btmAiPret();
      return;
    }
    // Page rendue par le navigateur (ex. « Page introuvable ») : le script de l'écran
    // de lancement n'a pas tourné, on le masque nous-mêmes au lieu d'attendre 9 s.
    document.getElementById("ecran-chargement")?.classList.add("fini");
    document.documentElement.classList.remove("chargement");
  }, []);
  return null;
}
