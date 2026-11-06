"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AwaBlob } from "./AwaBlob";

/** Durée de la descente du globe, de l'accueil jusqu'au-dessus de la zone de saisie. */
const FLIGHT_MS = 950;

/**
 * Petit globe posé au-dessus de la zone de saisie pendant que Tamilya écrit.
 * Au début d'une conversation, `originRef` donne la place du grand globe de
 * l'accueil : il rétrécit sur place, descend et rebondit en se posant.
 * Quand elle a fini, il s'efface.
 */
export function WritingGlobe({ active, originRef, onActivate }: { active: boolean; originRef: RefObject<DOMRect | null>; onActivate: () => void }) {
  const [shown, setShown] = useState(active);
  if (active && !shown) setShown(true);
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!shown) return;
    const from = originRef.current;
    originRef.current = null;
    const el = box.current;
    if (!el || !from?.width || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Avant de mesurer : l'animation d'entrée fausserait la taille.
    el.setAttribute("data-flying", "");
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = from.width / to.width;
    const flight = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, easing: "cubic-bezier(0.5, 0, 0.2, 1)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale * 0.42})`, offset: 0.34, easing: "cubic-bezier(0.55, 0, 0.7, 0.6)" },
        { transform: "translate(0, 0) scale(1.22, 0.8)", offset: 0.8, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
        { transform: "translate(0, -10px) scale(0.92, 1.1)", offset: 0.9, easing: "ease-in" },
        { transform: "translate(0, 0) scale(1)" },
      ],
      { duration: FLIGHT_MS },
    );
    return () => flight.cancel();
  }, [shown, originRef]);

  if (!shown) return null;
  return (
    // inert : le globe se regarde, il ne prend ni le doigt ni le clavier.
    <div className="pointer-events-none absolute inset-x-2.5 bottom-full z-10 translate-y-3 sm:inset-x-6" inert>
      <div className="mx-auto w-full max-w-3xl">
        <div
          ref={box}
          className="writing-globe size-10"
          data-leaving={active ? undefined : ""}
          onAnimationEnd={() => {
            if (!active) setShown(false);
          }}
        >
          <AwaBlob label="Tamilya écrit" onActivate={onActivate} size="2.5rem" goo={2} busy />
        </div>
      </div>
    </div>
  );
}
