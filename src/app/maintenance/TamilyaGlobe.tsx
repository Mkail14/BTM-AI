"use client";

import { TamilyaBlob } from "@/components/chat/TamilyaBlob";

/** Le globe de Tamilya au travail, entouré d'un halo qui tourne en boucle. Le toucher le fait rebondir, sans rien ouvrir. */
export function TamilyaGlobe() {
  return (
    <div className="atelier-globe">
      <span aria-hidden="true" className="atelier-scan" />
      <TamilyaBlob label="Tamilya" onActivate={() => {}} size="var(--globe)" goo={7} busy />
    </div>
  );
}
