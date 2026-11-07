"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { boardCount, CANCELLED, describeBoard, scrollConversation, touchBoard, waitForBoard, writeBoard } from "@/lib/voice-live/board";
import { buildSnapLexicon, snapToLexicon, type SnapLexicon } from "@/lib/language/snap-lexicon";
import { INITIATIVE_NOTE, initiativeDelayMs } from "@/lib/voice-live/initiative";
import { onBoardDone } from "@/lib/voice-live/stage";
import { voiceVideosBlock } from "@/lib/youtube/voice-videos";
import { acceptPayment, cancelPayment, enterPin, takePinTurn } from "@/lib/voice-live/voice-pay";
import { voiceHeard, voiceListenEnd, voiceSpeakEnd, voiceSpeakStart, voiceWord } from "@/lib/chat/voice-level";
import { isVoiceIdle, VOICE_HANG_UP_EVENT, VOICE_IDLE_CHECK_MS } from "@/lib/voice-live/hang-up";
import { isLiveVoiceSupported, openLiveSession, type LiveSession } from "@/lib/voice-live/session";
import { readTalkMode, saveTalkMode, type TalkMode } from "@/lib/voice-live/talk-mode";
import type { VoiceConversation, VoiceState } from "./useVoiceConversation";

const noSubscribe = () => () => {};

/** Échange où un code de paiement a pu être dit : rien de ce qui a été dit n'est enregistré. */
const PIN_HIDDEN = "(code de paiement : non enregistré)";
const hidePin = (user: string, tamilya: string): [string, string] => (takePinTurn() ? [user && PIN_HIDDEN, tamilya.replace(/d/g, "•")] : [user, tamilya]);

/**
 * Mode vocal en direct (Gemini Live), avec la même interface que l'ancien mode
 * (useVoiceConversation) : l'écran vocal et le globe ne changent pas. À la fin
 * de chaque réponse, `onTurn` reçoit ce que la personne a dit et ce que
 * Tamilya a répondu, pour l'afficher et l'enregistrer dans la conversation
 * (`board` : ce qu'elle « répond » est un tableau à afficher).
 */
export function useLiveVoiceConversation(onTurn: (user: string, tamilya: string, board?: boolean) => void): VoiceConversation {
  const supported = useSyncExternalStore(noSubscribe, isLiveVoiceSupported, () => false);
  const [state, setState] = useState<VoiceState>("off");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [beat, setBeat] = useState(0);
  const [debug, setDebug] = useState("");
  /** Un tableau est ouvert : le globe se fait petit et laisse voir l'écran jusqu'à la fin de l'appel. */
  const [board, setBoard] = useState(false);
  /** Le tableau est seul au centre de l'écran (stage.ts) ; une fois fini, il rejoint la conversation. */
  const [stage, setStage] = useState(false);
  /** Première utilisation : l'écran vocal demande comment parler avant d'ouvrir le micro. */
  const [choosing, setChoosing] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const session = useRef<LiveSession | null>(null);
  /** Numéro de la conversation en cours d'ouverture : fermée avant d'être prête, elle est refermée dès qu'elle l'est. */
  const generation = useRef(0);
  const opening = useRef(false);
  /** Bouton déjà appuyé pendant que le micro s'ouvre : l'appui compte dès qu'il est prêt. */
  const held = useRef(false);
  /** Prises de parole de Tamilya restées sans réponse. */
  const initiatives = useRef(0);
  const userText = useRef("");
  const lexicon = useRef<SnapLexicon>(buildSnapLexicon([]));
  const tamilyaText = useRef("");
  /** Message écrit qui attend le choix du mode, puis ce qu'il faut faire s'il reste sans réponse vocale. */
  const typed = useRef<string | null>(null);
  const unanswered = useRef<(() => void) | null>(null);
  const turnRef = useRef(onTurn);
  useEffect(() => {
    turnRef.current = onTurn;
  });

  const note = useCallback((event: string) => {
    const at = new Date().toLocaleTimeString("fr-FR", { minute: "2-digit", second: "2-digit" });
    setDebug((previous) => [...previous.split(" · ").filter(Boolean).slice(-2), `${at} ${event}`].join(" · "));
  }, []);

  /** Fermé ou en échec avant sa première parole : le message écrit n'est pas perdu. */
  const giveBackTyped = useCallback(() => {
    const fallback = unanswered.current;
    typed.current = null;
    unanswered.current = null;
    fallback?.();
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    opening.current = false;
    // Appel fermé pendant qu'elle répond : ce qui vient d'être dit (un mot appris…) n'est pas perdu.
    const [user, tamilya] = hidePin(userText.current.trim(), tamilyaText.current.trim());
    if (user || tamilya) turnRef.current(user, tamilya);
    userText.current = "";
    tamilyaText.current = "";
    cancelPayment();
    session.current?.stop();
    session.current = null;
    voiceSpeakEnd();
    voiceListenEnd();
    setChoosing(false);
    setStage(false);
    setState("off");
    giveBackTyped();
  }, [giveBackTyped]);

  const open = useCallback((mode: TalkMode, firstMessage?: string) => {
    if (session.current || opening.current) return;
    opening.current = true;
    const mine = ++generation.current;
    setHandsFree(mode === "free");
    setError(null);
    setBoard(false);
    setStage(false);
    setTranscript("");
    setReply("");
    userText.current = firstMessage ?? "";
    tamilyaText.current = "";
    void openLiveSession({
      // « Maintenir » : Tamilya n'écoute que pendant l'appui. « Sans bouton » : Gemini repère seul la fin de parole.
      pushToTalk: mode === "hold",
      firstMessage,
      onState: (live) => {
        if (live === "connexion") setState("waiting");
        else if (live === "écoute") {
          voiceSpeakEnd();
          setState("listening");
        } else setState("speaking");
      },
      onUserText: (text) => {
        initiatives.current = 0;
        // Nouvelle phrase de la personne après une réponse : on repart de zéro.
        if (tamilyaText.current) {
          userText.current = "";
          tamilyaText.current = "";
          setReply("");
        }
        userText.current += text;
        setTranscript(snapToLexicon(userText.current.trim(), lexicon.current));
        voiceHeard(text.length);
        setBeat((n) => n + 1);
      },
      onLexicon: (words) => {
        lexicon.current = buildSnapLexicon(words);
      },
      onTamilyaText: (text) => {
        unanswered.current = null;
        if (!tamilyaText.current) voiceSpeakStart(text);
        tamilyaText.current += text;
        voiceWord(tamilyaText.current, Math.max(0, tamilyaText.current.length - text.length));
        setReply(tamilyaText.current.trim());
        setBeat((n) => n + 1);
      },
      onTurnComplete: () => {
        const [user, tamilya] = hidePin(userText.current.trim(), tamilyaText.current.trim());
        if (user || tamilya) turnRef.current(user, tamilya);
        userText.current = "";
        tamilyaText.current = "";
      },
      onToolCall: async (name, args, signal) => {
        // Tableau déjà à l'écran : Tamilya agit directement dessus, sans passer par le serveur.
        if (name === "lire_tableau") return describeBoard();
        if (name === "toucher_tableau") return touchBoard(String(args.bouton ?? ""), signal);
        if (name === "remplir_tableau") return writeBoard(String(args.champ ?? ""), String(args.valeur ?? ""), signal, userText.current);
        if (name === "videos_youtube") {
          const block = voiceVideosBlock(args.recherches);
          if (!block) return "Aucune recherche : redemande en un mot ce qu'elle veut voir.";
          // Pas un tableau : Tamilya revient dans la conversation (globe en petit en haut)
          // et les cartes s'y ajoutent, sous les yeux de la personne.
          setStage(false);
          turnRef.current(hidePin(userText.current.trim(), "")[0], block, true);
          userText.current = "";
          setBoard(true);
          requestAnimationFrame(() => scrollConversation("bas"));
          return "Les vidéos sont affichées, les plus vues d'abord : elle touche celle qu'elle veut. Dis seulement « Voilà ! », rien d'autre : ne les décris pas, ne les lis pas, ne pose aucune question.";
        }
        if (name === "defiler_conversation") return scrollConversation(String(args.vers ?? ""));
        if (name === "autoriser_paiement") return acceptPayment();
        if (name === "saisir_code") return enterPin(String(args.chiffres ?? ""));
        if (name === "annuler_paiement") return cancelPayment();
        const response = await fetch("/api/voice/live/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, args }),
          signal,
        });
        const data = (await response.json().catch(() => null)) as { block?: string; time?: string; info?: string; trip?: string | null; error?: string } | null;
        // Annulée pendant le chargement : pas de nouveau tableau, la personne a changé d'avis.
        if (signal.aborted) return CANCELLED;
        if (data?.time) return data.time;
        // Carte du trajet : comme les vidéos, elle s'ajoute à la conversation (et s'ouvre en grand d'elle-même).
        if (data?.trip) {
          setStage(false);
          turnRef.current(hidePin(userText.current.trim(), "")[0], data.trip, true);
          userText.current = "";
          setBoard(true);
          requestAnimationFrame(() => scrollConversation("bas"));
        }
        if (data?.info) return data.info;
        if (!data?.block) return data?.error ?? "Ce bouton n'est pas disponible : dis-le à la personne.";
        // Le tableau s'affiche dans la conversation, juste après ce que la personne vient de dire.
        // L'ancien tableau rejoint d'abord la conversation : le nouveau prend sa place au centre.
        setStage(false);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const before = boardCount();
        turnRef.current(hidePin(userText.current.trim(), "")[0], data.block, true);
        userText.current = "";
        setBoard(true);
        await waitForBoard(before, () => setStage(true));
        return `C'est affiché sur l'écran de la personne. Continue toi-même avec ce qu'elle t'a déjà dit.\n${describeBoard()}`;
      },
      onLatency: (ms) => note(`réponse en ${(ms / 1000).toFixed(1)} s`),
      onNote: note,
      onClose: (problem) => {
        session.current = null;
        setStage(false);
        voiceSpeakEnd();
        voiceListenEnd();
        if (problem) setError(problem);
        setState("off");
        giveBackTyped();
      },
    }).then((opened) => {
      opening.current = false;
      if (mine !== generation.current) return opened?.stop();
      session.current = opened;
      if (held.current) opened?.press();
    }).catch((problem: unknown) => {
      // Sans ça, une ouverture ratée laisserait le vocal bloqué, sans rien dire.
      console.error("[voix] Ouverture du direct impossible", problem);
      opening.current = false;
      if (mine !== generation.current) return;
      setError("Le vocal n'a pas pu démarrer sur cet appareil. Réessaie.");
      setState("off");
      giveBackTyped();
    });
  }, [giveBackTyped, note]);

  /** Le micro ne reste jamais ouvert à l'insu de la personne (hang-up.ts). */
  const lastActivity = useRef(0);
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [state, transcript, reply]);
  useEffect(() => {
    if (state === "off") return;
    const seen = () => {
      lastActivity.current = Date.now();
    };
    const timer = setInterval(() => {
      if (state === "speaking") seen();
      else if (isVoiceIdle(lastActivity.current, Date.now())) stop();
    }, VOICE_IDLE_CHECK_MS);
    window.addEventListener("pointerdown", seen, { passive: true });
    window.addEventListener("keydown", seen);
    window.addEventListener(VOICE_HANG_UP_EVENT, stop);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", seen);
      window.removeEventListener("keydown", seen);
      window.removeEventListener(VOICE_HANG_UP_EVENT, stop);
    };
  }, [state, stop]);

  // Commande payée, ticket acheté… : le tableau repart tout seul dans la conversation.
  useEffect(() => {
    if (!stage) return;
    return onBoardDone(() => setStage(false));
  }, [stage]);

  /** Mode admin : plus aucune interaction pendant l'appel, Tamilya prend la parole d'elle-même (initiative.ts). */
  useEffect(() => {
    if (state !== "listening" || board) return;
    const wait = initiativeDelayMs(initiatives.current);
    if (wait === null) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (held.current || !session.current?.canInitiate()) return;
        initiatives.current += 1;
        session.current.nudge(INITIATIVE_NOTE);
      }, wait);
    };
    arm();
    window.addEventListener("pointerdown", arm, { passive: true });
    window.addEventListener("keydown", arm);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [state, board, beat]);

  const leaveStage = useCallback(() => setStage(false), []);

  const start = useCallback(() => {
    const mode = readTalkMode();
    if (mode) open(mode);
    else setChoosing(true);
  }, [open]);

  /** Message écrit qui demande sa voix (« chante ») : à appeler à l'envoi, le toucher ouvre le micro sur iPhone. */
  const startWith = useCallback(
    (text: string, fallback: () => void) => {
      unanswered.current = fallback;
      const mode = readTalkMode();
      if (mode) return open(mode, text);
      typed.current = text;
      setChoosing(true);
    },
    [open],
  );

  /** Le toucher sur le choix ouvre le micro (obligatoire sur iPhone). */
  const choose = useCallback(
    (mode: TalkMode) => {
      saveTalkMode(mode);
      setChoosing(false);
      open(mode, typed.current ?? undefined);
      typed.current = null;
    },
    [open],
  );

  /** Talkie-walkie : appui = Tamilya se tait et t'écoute ; relâcher = elle répond tout de suite. */
  const press = useCallback(() => {
    voiceSpeakEnd();
    held.current = true;
    session.current?.press();
  }, []);
  const release = useCallback(() => {
    held.current = false;
    session.current?.release();
  }, []);

  /** Toucher du globe pendant qu'elle parle : elle se tait et écoute. */
  const interrupt = useCallback(() => {
    session.current?.cut();
    voiceSpeakEnd();
    setState("listening");
  }, []);

  useEffect(() => () => session.current?.stop(), []);

  // say / replied : l'ancien mode lisait les réponses écrites ; en direct, Gemini parle lui-même.
  const nothing = useCallback(() => {}, []);
  return { live: true, board, stage, leaveStage, handsFree, choosing, choose, startWith, press, release, supported, state, error, hint: null, debug, transcript, reply, beat, start, stop, interrupt, say: nothing, replied: nothing };
}
