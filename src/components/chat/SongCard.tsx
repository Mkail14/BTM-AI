"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Music, RotateCcw } from "lucide-react";
import { parseSongSpec, SONG_BLOCK } from "@/lib/music/intent";
import { getServerSong, getSong, playSong, playSongOnce, songKey, subscribeSong } from "@/lib/music/song-stage";
import { useMessageInfo } from "./message-context";

/**
 * Chanson de Tamilya dans la conversation : une simple ligne. Elle chante dans le grand globe
 * plein écran (SongStage), jamais dans une carte (demande de l'utilisateur, 2026-11-09 : pas de
 * carte, pas de bouton à toucher, pas de paroles avant qu'elle chante).
 *
 * Une réponse reçue à l'instant ouvre le globe toute seule dès que le serveur a fini d'envoyer
 * (comme les histoires) ; une ancienne conversation montre « Réécouter ».
 */

const FENCE = "```";

/** Le bloc complet dans la réponse entière (le texte affiché s'écrit encore lettre à lettre). */
function fullSpec(content: string | undefined, typed: string) {
  if (!content) return typed;
  const start = content.indexOf(FENCE + SONG_BLOCK);
  if (start < 0) return typed;
  const from = start + FENCE.length + SONG_BLOCK.length;
  const end = content.indexOf(FENCE, from);
  return end < 0 ? typed : content.slice(from, end);
}

export function SongCard({ spec }: { spec: string }) {
  const message = useMessageInfo();
  const block = fullSpec(message?.content, spec).replace(/\r/g, "").trim();
  const parsed = parseSongSpec(block);
  const { active } = useSyncExternalStore(subscribeSong, getSong, getServerSong);
  const mine = active?.key === songKey(block);

  const fresh = Boolean(message?.fresh && message.done);
  useEffect(() => {
    if (fresh && parsed) playSongOnce(block);
    // parsed dépend de block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, block]);

  if (!parsed) return null;

  return (
    <div className="not-prose my-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
        <Music size={16} aria-hidden="true" className="shrink-0 text-accent" />
        <span className="truncate">Chanson</span>
      </span>
      {!mine ? (
        <button type="button" onClick={() => playSong(block)} className="zone-appui inline-flex items-center gap-1 font-medium text-accent">
          <RotateCcw size={14} aria-hidden="true" /> Réécouter
        </button>
      ) : null}
    </div>
  );
}
