"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_DISCLAIMER, CHAT_PLACEHOLDER, ChatFootnote, ChatHeader, ChatSurface, ComposerDock, ComposerRow, MessageThread, MicButton } from "@/components/chat/ChatChrome";
import { Composer } from "@/components/chat/Composer";
import { MessageItem, type UiMessage } from "@/components/chat/MessageItem";
import { BellButton } from "@/components/chat/NotificationBell";
import { PlusMenu } from "@/components/chat/PlusMenu";
import { personaStyle } from "@/components/personality/PersonalityContext";
import { THEME_STORAGE_KEY } from "@/components/ui/ThemeScript";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { DEMO_SCRIPT, type DemoLine } from "@/lib/site/landing-demo-script";
import { PHONE } from "./phone";

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
const noop = () => {};

/** Un message de l'exemple, au format de la vraie conversation. */
function toMessage(line: DemoLine, n: number): UiMessage {
  if (line.from === "user") {
    // Le visiteur écrit du texte simple : un mot encore inconnu ([[mot]]) s'affiche sans ses crochets.
    return { id: `m${n}`, role: "user", status: "complete", content: (line.shimaore ?? line.fr).replace(/\[\[([^\]]+)\]\]/g, "$1") };
  }
  // Tamilya répond en shimaoré et donne le français à la suite, en italique.
  return { id: `m${n}`, role: "assistant", status: "complete", content: line.shimaore ? `${line.shimaore}\n\n*${line.fr}*` : line.fr };
}

/**
 * La page de conversation, avec ses vraies pièces (fond, barre du haut, messages,
 * barre pour écrire : ChatChrome, MessageItem, Composer, PlusMenu), telle que la
 * voit une personne connectée sur son téléphone. Une conversation d'exemple s'y
 * déroule toute seule, en boucle ; son shimaoré vient de Tamilya elle-même
 * (/api/accueil/conversation). Rien n'est cliquable (inert).
 *
 * Montrée dans le téléphone de l'accueil (ChatDemo) : comme c'est une vraie page,
 * à la largeur d'un téléphone, tout changement de la conversation s'y voit aussitôt.
 */
export function ConversationPreview() {
  const box = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<DemoLine[] | null>(null);
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
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

  // Animations réduites : toute la conversation d'un coup, sans boucle.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStill(true);
  }, []);

  // Le thème choisi sur l'accueil (ThemeToggle) est suivi ici aussi, sans recharger.
  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const theme = event.newValue === "light" || event.newValue === "dark" ? event.newValue : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, []);

  useEffect(() => {
    if (!lines || still) return;
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
  }, [lines, still, count, typing]);

  // Chaque nouveau message fait remonter la conversation.
  useEffect(() => {
    const el = box.current;
    const content = thread.current;
    if (!el || !content) return;
    const follow = () => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Les derniers messages de la boucle ; n : rang dans toute la boucle (clé stable).
  const end = lines ? (still ? lines.length : count) : 0;
  const shown = lines ? Array.from({ length: Math.min(end, KEPT) }, (_, i) => end - Math.min(end, KEPT) + i).map((n) => ({ n, line: lines[n % lines.length] })) : [];
  // Tamilya « écrit » : pendant le chargement (au plus WAIT_MS, puis le français) et avant chacune de ses réponses.
  const writing = lines === null || typing;

  return (
    <div data-apercu="" data-chat-view="" inert className="fixed inset-0 flex overflow-hidden">
      <ChatSurface persona={DEFAULT_PERSONALITY} style={personaStyle(DEFAULT_PERSONALITY)}>
        <div ref={box} className="relative flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {/* Place de la barre d'iOS, dessinée par l'accueil : même fond que la barre du haut, collées ensemble. */}
          <div className="persona-backdrop sticky top-0 z-20 shrink-0" style={{ paddingTop: PHONE.statusBar }}>
            <ChatHeader onMenu={noop}>
              <BellButton />
            </ChatHeader>
          </div>

          <div ref={thread} className="flex shrink-0 flex-1 flex-col">
            <MessageThread>
              {shown.map(({ n, line }) => (
                <div key={n} className="chat-demo-in">
                  <MessageItem message={toMessage(line, n)} />
                  {/* Seul ajout à la vraie page : le français, en petit, sous ce qu'écrit le visiteur. */}
                  {line.from === "user" && line.shimaore ? <p className="mt-1.5 px-1 text-right text-[13px] text-fg-muted">{line.fr}</p> : null}
                </div>
              ))}
              {writing ? (
                <div key={`w${end}`} className="chat-demo-in">
                  <MessageItem message={{ id: `w${end}`, role: "assistant", status: "streaming", content: "" }} />
                </div>
              ) : null}
            </MessageThread>
          </div>

          <ComposerDock empty={false}>
            <ComposerRow>
              <PlusMenu />
              <div className="min-w-0 flex-1">
                <Composer isStreaming={typing} disabled={false} onSend={noop} onStop={noop} placeholder={CHAT_PLACEHOLDER} trailing={<MicButton />} />
              </div>
            </ComposerRow>
            <ChatFootnote>{CHAT_DISCLAIMER}</ChatFootnote>
            {/* Place du trait du bas de l'iPhone. */}
            <div style={{ height: PHONE.homeBar }} />
          </ComposerDock>
        </div>
      </ChatSurface>
    </div>
  );
}
