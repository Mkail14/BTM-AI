"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { noteGlobeOrigin } from "@/components/chat/globe-origin";
import { useChatShell } from "@/components/layout/ChatShell";
import { loadAnonymousDraft } from "@/lib/chat/anonymous-draft";
import type { PublicReview } from "@/lib/reviews/rules";
import type { Announcement } from "@/lib/site/announcement-rules";
import { GuestLanding } from "./GuestLanding";

/** Durée du fondu de la page d'accueil vers la conversation (voir .landing[data-leaving]). */
const LEAVE_MS = 560;
/** Temps laissé à la conversation pour afficher le message avant la morphose. */
const MORPH_SETTLE_MS = 90;

type Phase = "landing" | "leaving" | "chat";

type ChatViewComponent = typeof import("@/components/chat/ChatView").ChatView;

/**
 * La conversation (Markdown, commandes, carte…) n'est pas envoyée avec la page
 * d'accueil : elle est chargée à part, dès que le visiteur s'approche du champ
 * (survol, toucher, clavier) ou quand le navigateur n'a plus rien à faire.
 * Import à la main plutôt que next/dynamic : une fois chargée, la conversation
 * s'affiche dans le même rendu (flushSync de la morphose), sans attente de Suspense.
 */
let chatModule: Promise<ChatViewComponent> | null = null;
function loadChatView(): Promise<ChatViewComponent> {
  if (!chatModule) {
    chatModule = import("@/components/chat/ChatView").then((m) => m.ChatView);
    // Échec (réseau) : on pourra réessayer au geste suivant.
    chatModule.catch(() => {
      chatModule = null;
    });
  }
  return chatModule;
}

/**
 * Accueil des visiteurs sans compte : la page de présentation de Tamilya par-dessus
 * la conversation. Quand on lui parle, le message part tout de suite et la
 * page d'accueil s'efface en douceur sur la conversation.
 */
export function GuestHome({
  reviews,
  announcement,
  authPrompt = null,
}: {
  reviews: PublicReview[];
  announcement: Announcement | null;
  /** Page privée demandée sans session (/?auth=required) : la connexion s'ouvre par-dessus l'accueil. */
  authPrompt?: { next: string } | null;
}) {
  const [phase, setPhase] = useState<Phase>("landing");
  const { openAuthDialog } = useAuth();
  const { setChatCovered } = useChatShell();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [Chat, setChat] = useState<ChatViewComponent | null>(null);
  const timer = useRef<number | null>(null);
  const starting = useRef(false);

  // Chargement de la conversation : au premier geste vers le champ, sinon au repos du navigateur.
  useEffect(() => {
    let alive = true;
    const events = ["focusin", "pointerdown", "keydown", "touchstart"] as const;
    const stopListening = () => {
      for (const name of events) document.removeEventListener(name, warm);
      document.removeEventListener("pointerover", near);
    };
    function warm() {
      stopListening();
      void loadChatView().then(
        (component) => {
          if (alive) setChat(() => component);
        },
        () => {},
      );
    }
    // Survol du champ (ou d'un bouton) : le visiteur va sans doute écrire.
    function near(event: Event) {
      if (event.target instanceof Element && event.target.closest(".landing-input, button, a")) warm();
    }
    for (const name of events) document.addEventListener(name, warm, { passive: true });
    document.addEventListener("pointerover", near, { passive: true });
    const idle = window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 3000 });
      else warm();
    }, 2500);
    return () => {
      alive = false;
      stopListening();
      window.clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    // Conversation d'essai déjà commencée sur cet appareil (localStorage) : proposée en reprise.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasDraft((loadAnonymousDraft()?.length ?? 0) > 0);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // Page privée demandée sans session : l'adresse redevient « / » et la connexion s'ouvre sur l'accueil.
  // Fermer la fenêtre (Échap, croix) laisse donc l'accueil, comme une visite directe de « / ».
  const promptNext = authPrompt?.next ?? null;
  useEffect(() => {
    if (promptNext === null) return;
    window.history.replaceState(null, "", "/");
    openAuthDialog({ reason: "Connecte-toi pour accéder à cette page.", next: promptNext });
  }, [promptNext, openAuthDialog]);

  // Tant que l'accueil recouvre la conversation, celle-ci (et la barre latérale) est inerte :
  // ni Tab, ni clic, ni lecteur d'écran n'y vont. Elle redevient utilisable dès qu'elle apparaît.
  const covered = phase === "landing";
  useEffect(() => {
    setChatCovered(covered);
  }, [covered, setChatCovered]);
  useEffect(() => () => setChatCovered(false), [setChatCovered]);

  // Pendant la page d'accueil, la page du dessous ne défile pas.
  useEffect(() => {
    if (phase === "chat") return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [phase]);

  const go = (message: string | null) => {
    if (phase !== "landing" || starting.current) return;
    starting.current = true;
    // Conversation déjà chargée (cas habituel) : on part tout de suite. Sinon on
    // l'attend (le message est gardé) ; en cas d'échec, le visiteur peut renvoyer.
    if (Chat) {
      start(message, Chat);
      return;
    }
    loadChatView().then(
      (component) => start(message, component),
      () => {
        starting.current = false;
      },
    );
  };

  const start = (message: string | null, component: ChatViewComponent) => {
    // Le globe de l'accueil est celui qui glissera jusqu'à la première réponse (MessageItem).
    if (message) noteGlobeOrigin(document.querySelector(".landing .awa-blob")?.getBoundingClientRect() ?? null);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setChat(() => component);
      setPrompt(message);
      setPhase("chat");
      return;
    }
    // Morphose (voir html[data-morph] dans globals.css) : le champ de l'accueil
    // devient la zone de saisie de la conversation pendant que la page se dissout.
    if (typeof document.startViewTransition === "function") {
      const html = document.documentElement;
      html.dataset.morph = "depart";
      const transition = document.startViewTransition(async () => {
        html.dataset.morph = "arrivee";
        flushSync(() => {
          setChat(() => component);
          setPrompt(message);
          setPhase("chat");
        });
        // Le message part tout de suite : on laisse la conversation se placer (saisie en bas).
        await new Promise((resolve) => window.setTimeout(resolve, MORPH_SETTLE_MS));
      });
      void transition.finished.finally(() => delete html.dataset.morph);
      return;
    }
    setChat(() => component);
    setPrompt(message);
    setPhase("leaving");
    timer.current = window.setTimeout(() => setPhase("chat"), LEAVE_MS);
  };

  return (
    <>
      {Chat ? (
        <div className="contents" inert={covered}>
          <Chat key="accueil" conversationId={null} initialMessages={[]} startWith={prompt} />
        </div>
      ) : null}
      {phase !== "chat" ? (
        <GuestLanding
          reviews={reviews}
          announcement={announcement}
          leaving={phase === "leaving"}
          hasDraft={hasDraft}
          onStart={(text) => go(text)}
          onResume={() => go(null)}
        />
      ) : null}
    </>
  );
}
