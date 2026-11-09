"use client";

import { useEffect, useMemo, useRef } from "react";
import { Music } from "lucide-react";
import { parseSongSpec } from "@/lib/music/intent";
import { playSong, playSongOnce } from "@/lib/music/song-stage";

/**
 * Chanson de Tamilya dans la conversation : seulement les paroles et un bouton pour l'écouter.
 * Elle chante dans le grand globe plein écran (SongStage), jamais dans une carte avec une barre
 * de chargement (demande de l'utilisateur, 2026-11-09).
 *
 * Le globe s'ouvre de lui-même seulement quand la chanson vient d'arriver (le bloc s'écrit sous
 * nos yeux). Réécouter rejoue la même chanson, gardée sur l'appareil (song-stage.ts).
 */

/** Délai sans changement avant de considérer le bloc fini d'écrire. */
const SETTLE_MS = 1_500;

export function SongCard({ spec }: { spec: string }) {
  const parsed = useMemo(() => parseSongSpec(spec), [spec]);
  const firstSpec = useRef(spec);
  const live = useRef(false);

  // Le bloc grandit pendant que Tamilya écrit : c'est une chanson toute neuve. Une fois
  // les paroles stables, le globe s'ouvre et elle chante.
  useEffect(() => {
    if (spec !== firstSpec.current) live.current = true;
    if (!live.current || !parsed) return;
    const timer = window.setTimeout(() => playSongOnce(spec), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [spec, parsed]);

  if (!parsed) return null;

  return (
    <figure className="not-prose my-3 flex flex-col gap-3 rounded-2xl border border-border bg-bg-subtle p-4">
      <button type="button" onClick={() => playSong(spec)} className="btn-rose inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-medium">
        <Music size={16} aria-hidden="true" /> Écoute-moi chanter
      </button>
      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted">Les paroles</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{parsed.lyrics}</p>
      </details>
    </figure>
  );
}
