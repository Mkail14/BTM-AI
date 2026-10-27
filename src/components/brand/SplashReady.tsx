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
    window.__btmAiPret?.();
  }, []);
  return null;
}
