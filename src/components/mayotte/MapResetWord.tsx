"use client";

import { MAP_RESET_EVENT } from "./MayotteMap";

/**
 * Le mot « Mayotte » du titre de la page : même aspect qu'avant, mais on peut le
 * toucher pour remettre la carte à sa vue de départ (l'île entière, vue du
 * dessus, sans repère), après un zoom ou une ville montrée par Tamilya.
 */
export function MapResetWord() {
  return (
    <button
      type="button"
      title="Revoir toute l'île"
      aria-label="Mayotte : revoir toute l'île sur la carte"
      onClick={() => window.dispatchEvent(new Event(MAP_RESET_EVENT))}
      className="landing-accent cursor-pointer [font:inherit] [letter-spacing:inherit]"
    >
      Mayotte
    </button>
  );
}
