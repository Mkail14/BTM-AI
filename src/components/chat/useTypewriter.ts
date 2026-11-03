"use client";

import { useEffect, useRef, useState } from "react";
import { hapticReady, hapticTick, hapticWriting } from "@/lib/chat/haptics";

/** Vitesse de croisière : environ 60 caractères par seconde, comme une écriture fluide. */
const MIN_CHARS_PER_MS = 0.06;
/** Retard maximal visé : au-delà, l'écriture accélère pour rattraper le texte reçu (≈ 0,6 s). */
const CATCH_UP_MS = 600;
/** Petite vibration au plus toutes les 140 ms pendant l'écriture. */
const TICK_MS = 140;

/**
 * Dévoile la réponse de Tamilya caractère par caractère, comme si elle l'écrivait
 * (le modèle envoie le texte par gros morceaux irréguliers). Le rythme est
 * régulier et n'accélère que si le texte reçu prend de l'avance. Téléphone :
 * une impulsion au début, de légères vibrations pendant l'écriture, deux à la fin.
 *
 * `animate` : faux pour les messages déjà écrits (historique), affichés d'un coup.
 */
export function useTypewriter(text: string, { animate, finished }: { animate: boolean; finished: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const shownRef = useRef(shown);
  const started = useRef(false);
  const doneSignaled = useRef(!animate);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!animate || reduceMotion.current) {
      shownRef.current = text.length;
      setShown(text.length);
      return;
    }
    // Texte remplacé (mode maître : version corrigée) : on ne revient jamais en arrière au-delà.
    if (shownRef.current > text.length) {
      shownRef.current = text.length;
      setShown(text.length);
    }

    let frame = 0;
    let last = performance.now();
    let lastTick = 0;
    let carry = 0;

    const step = (now: number) => {
      const elapsed = Math.min(now - last, 100);
      last = now;
      const backlog = text.length - shownRef.current;
      if (backlog <= 0) return;
      if (!started.current) {
        started.current = true;
        hapticWriting();
      }
      // Assez vite pour ne jamais garder plus de ~0,6 s de retard, jamais plus lent que la croisière.
      carry += Math.max(MIN_CHARS_PER_MS, backlog / CATCH_UP_MS) * elapsed;
      const add = Math.floor(carry);
      if (add > 0) {
        carry -= add;
        shownRef.current = Math.min(text.length, shownRef.current + add);
        setShown(shownRef.current);
        if (now - lastTick > TICK_MS) {
          lastTick = now;
          hapticTick();
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, animate]);

  const typing = shown < text.length;

  // Réponse terminée et entièrement écrite : double impulsion.
  useEffect(() => {
    if (finished && !typing && !doneSignaled.current) {
      doneSignaled.current = true;
      if (started.current) hapticReady();
    }
  }, [finished, typing]);

  return { text: typing ? withoutOpenFence(text.slice(0, shown)) : text, typing };
}

/** Bloc ``` à moitié écrit (le tableau du code, par exemple) : caché tant qu'il n'est pas complet. */
function withoutOpenFence(partial: string) {
  const fences = partial.match(/```/g)?.length ?? 0;
  return fences % 2 === 1 ? partial.slice(0, partial.lastIndexOf("```")) : partial;
}
