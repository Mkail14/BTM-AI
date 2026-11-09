"use client";

import { useEffect, useState } from "react";

/** Durée du fondu de sortie (globals.css, .stage-swap[data-leaving]). */
export const STAGE_LEAVE_MS = 450;

/**
 * Grand écran d'histoire ou de chanson : quand il se ferme, on garde la dernière image le temps
 * d'un fondu, au lieu de disparaître d'un coup (on revient au vocal ou au chat en douceur).
 */
export function useLeavingStage<T>(active: T | null): { shown: T | null; leaving: boolean } {
  const [last, setLast] = useState<T | null>(active);
  if (active && active !== last) setLast(active);
  useEffect(() => {
    if (active || !last) return;
    const timer = setTimeout(() => setLast(null), STAGE_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [active, last]);
  return { shown: active ?? last, leaving: !active && last !== null };
}
