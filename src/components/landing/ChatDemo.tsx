"use client";

import { useEffect, useRef, useState } from "react";
import { splitUnknownWords } from "@/lib/language/unknown-words";
import { DEMO_SCRIPT, type DemoLine } from "@/lib/site/landing-demo-script";

/** Temps de lecture avant le message suivant ; Tamilya « écrit » un moment avant de répondre. */
const PAUSE_MS = 1400;
const TYPING_MS = 1200;
/** Pause plus longue quand la conversation repart du début. */
const LOOP_PAUSE_MS = 3200;
/** Messages gardés à l'écran : les plus anciens s'en vont, la boucle peut tourner sans fin. */
const KEPT = 14;
/** Attente maximale de la conversation traduite : au-delà, le texte en français s'affiche. */
const WAIT_MS = 6000;

const FRENCH: DemoLine[] = DEMO_SCRIPT.map((line) => ({ ...line, shimaore: null }));

/** Shimaoré de Tamilya ; un mot qu'elle ne connaît pas encore ([[mot]]) reste en français, en italique. */
function Shimaore({ text }: { text: string }) {
  return splitUnknownWords(text).map((part, i) => (part.french ? <i key={i}>{part.text}</i> : <span key={i}>{part.text}</span>));
}

/**
 * Accueil, section Tamilya : une conversation qui se déroule toute seule quand on
 * arrive dessus. Le shimaoré vient de Tamilya elle-même (/api/accueil/conversation) :
 * quand on la corrige, l'accueil suit. Les messages s'empilent et remontent comme
 * dans une vraie discussion (on peut défiler pour relire), et la conversation
 * repart du début à la fin, sans s'arrêter.
 */
export function ChatDemo() {
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<DemoLine[] | null>(null);
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);

  // Serveur lent ou injoignable : passé WAIT_MS, on abandonne et la conversation part en français.
  useEffect(() => {
    const controller = new AbortController();
    let gaveUp = false;
    const timer = window.setTimeout(() => {
      gaveUp = true;
      controller.abort();
    }, WAIT_MS);
    fetch("/api/accueil/conversation", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { lines?: DemoLine[] } | null) => setLines(data?.lines?.length === DEMO_SCRIPT.length ? data.lines : FRENCH))
      .catch(() => {
        // Abandon dû au départ de la page (démontage) : rien à afficher.
        if (gaveUp || !controller.signal.aborted) setLines(FRENCH);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  // Démarre quand la conversation entre à l'écran ; tout d'un coup si les animations sont réduites.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStill(true);
      return;
    }
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!lines || !visible) return;
    if (lines[count % lines.length].from === "tamilya" && !typing) {
      const id = window.setTimeout(() => setTyping(true), PAUSE_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => {
        setTyping(false);
        setCount((c) => c + 1);
      },
      typing ? TYPING_MS : count === 0 ? 300 : count % lines.length === 0 ? LOOP_PAUSE_MS : PAUSE_MS,
    );
    return () => window.clearTimeout(id);
  }, [lines, visible, count, typing]);

  // Chaque nouveau message fait remonter la conversation.
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [count, typing]);

  // Les derniers messages de la boucle ; n : rang dans toute la boucle (clé stable).
  const end = lines ? (still ? lines.length : count) : 0;
  const shown = lines ? Array.from({ length: Math.min(end, KEPT) }, (_, i) => end - Math.min(end, KEPT) + i).map((n) => ({ n, ...lines[n % lines.length] })) : [];

  return (
    <div className="landing-glass flex h-[24rem] w-full flex-col rounded-3xl md:h-full">
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-5 py-3.5 dark:border-white/[0.08]">
        <span aria-hidden="true" className="chat-demo-avatar size-7 rounded-full" />
        <span className="text-sm font-semibold">Tamilya</span>
        <span className="ml-auto text-xs text-fg-muted">en ligne</span>
      </div>
      <div
        ref={box}
        tabIndex={0}
        role="log"
        aria-label="Exemple de conversation avec Tamilya"
        aria-busy={lines === null}
        // Contour au clavier seulement, tracé à l'intérieur de la boîte (il ne mord pas sur l'en-tête).
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain rounded-b-3xl px-5 py-4 focus-visible:-outline-offset-2"
      >
        <div aria-hidden="true" className="mt-auto" />
        {/* En attendant la conversation : Tamilya « écrit » (au plus WAIT_MS, puis le français). */}
        {lines === null ? (
          <p className="flex gap-1 self-start rounded-2xl rounded-bl-md bg-white/70 px-3.5 py-3 dark:bg-white/[0.1]">
            <span className="sr-only">Chargement de la conversation…</span>
            <span aria-hidden="true" className="chat-demo-dot" />
            <span aria-hidden="true" className="chat-demo-dot [animation-delay:150ms]" />
            <span aria-hidden="true" className="chat-demo-dot [animation-delay:300ms]" />
          </p>
        ) : null}
        {shown.map((m) => (
          <div key={m.n} className={`chat-demo-in max-w-[85%] ${m.from === "user" ? "self-end text-right" : "self-start"}`}>
            <p
              className={
                m.from === "user"
                  ? "inline-block rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-left text-[15px] text-white"
                  : "inline-block rounded-2xl rounded-bl-md bg-white/70 px-3.5 py-2 text-[15px] font-medium dark:bg-white/[0.1]"
              }
            >
              {m.shimaore ? <Shimaore text={m.shimaore} /> : m.fr}
            </p>
            {/* Traduction en français : plus foncée que le gris habituel, pour rester lisible sur le fond rose. */}
            {m.shimaore ? <p className="mt-1 px-1 text-xs font-medium text-fg/80">{m.fr}</p> : null}
          </div>
        ))}
        {typing ? (
          <p aria-label="Tamilya écrit…" className="chat-demo-in flex gap-1 self-start rounded-2xl rounded-bl-md bg-white/70 px-3.5 py-3 dark:bg-white/[0.1]">
            <span className="chat-demo-dot" />
            <span className="chat-demo-dot [animation-delay:150ms]" />
            <span className="chat-demo-dot [animation-delay:300ms]" />
          </p>
        ) : null}
      </div>
    </div>
  );
}
