"use client";

import { useEffect, type RefObject } from "react";

/**
 * Cale l'élément (position fixe, en haut de l'écran) sur la partie visible de
 * l'écran au-dessus du clavier, comme une application native.
 *
 * Sur iPhone, Safari ne réduit pas la page quand le clavier s'ouvre : il la fait
 * glisser vers le haut, ce qui sort l'en-tête de l'écran et décale les messages.
 * La hauteur suit donc visualViewport, et le décalage imposé par Safari est
 * compensé. Pendant un zoom à deux doigts, rien n'est touché.
 */
export function useKeyboardViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = ref.current;
    if (!viewport || !el) return;
    const target = el;
    const visual = viewport;

    let frame = 0;
    function apply() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (visual.scale > 1.01) return;
        target.style.height = `${visual.height}px`;
        target.style.transform = visual.offsetTop > 0 ? `translateY(${visual.offsetTop}px)` : "";
        // Clavier ouvert : la marge de la barre d'accueil de l'iPhone n'a plus lieu d'être.
        target.toggleAttribute("data-keyboard", window.innerHeight - visual.height > 120);
      });
    }

    apply();
    visual.addEventListener("resize", apply);
    visual.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(frame);
      visual.removeEventListener("resize", apply);
      visual.removeEventListener("scroll", apply);
      target.style.height = "";
      target.style.transform = "";
      target.removeAttribute("data-keyboard");
    };
  }, [ref]);
}
