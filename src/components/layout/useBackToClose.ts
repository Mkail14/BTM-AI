"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tiroir ouvert sur téléphone : le bouton « retour » le ferme au lieu de quitter
 * la page. Une entrée d'historique (copie de celle de Next.js, pour qu'il la
 * reconnaisse) est ajoutée à l'ouverture.
 *
 * Renvoie `dismiss` : fermeture voulue (croix, fond, Échap, glissement), qui
 * retire aussi cette entrée. Un lien suivi ferme avec `close` et la laisse : la
 * retirer pendant que Next.js change de page couperait la navigation.
 * `close` doit être stable (useCallback ou fonction de useState).
 */
export function useBackToClose(open: boolean, close: () => void, query = "(max-width: 1023px)") {
  const dismissed = useRef(false);

  useEffect(() => {
    if (!open || !window.matchMedia(query).matches) return;
    dismissed.current = false;
    window.history.pushState({ ...window.history.state, tiroir: true }, "");
    let closedByBack = false;
    const onPopState = () => {
      closedByBack = true;
      close();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (!closedByBack && dismissed.current && window.history.state?.tiroir) window.history.back();
    };
  }, [open, close, query]);

  return useCallback(() => {
    dismissed.current = true;
    close();
  }, [close]);
}
