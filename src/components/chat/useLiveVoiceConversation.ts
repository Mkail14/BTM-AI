"use client";

import { markReadingAutoStart, READING_DONE_EVENT, type ReadingDone } from "@/lib/lecture/auto";
import { getStories, subscribeStories } from "@/lib/lecture/stage";
import { SONG_BLOCK, voiceSongSpec } from "@/lib/music/intent";
import { getSong, playSongOnce, subscribeSong } from "@/lib/music/song-stage";
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
/** Silence accepté après la question de fin d'une histoire, avant de revenir à l'écrit. */
const BRIEF_SILENCE_MS = 4_000;
/** Au plus, le temps laissé à Tamilya pour sa phrase d'attente avant une histoire. */
const READING_TALK_MAX_MS = 8_000;
type ReadingPause = { timer: number; spoke: boolean; turnDone: boolean };
const NO_READING_PAUSE: ReadingPause = { timer: 0, spoke: false, turnDone: false };

/** Fin de la phrase d'attente : l'appel se met en pause pour l'histoire (rien si déjà fait). */
function pauseForReading(pending: { current: ReadingPause }, stop: { current: () => void }) {
  if (!pending.current.timer) return;
  window.clearTimeout(pending.current.timer);
  pending.current = { ...NO_READING_PAUSE };
  stop.current();
}

export function useLiveVoiceConversation(
  onTurn: (user: string, tamilya: string, board?: boolean) => void,
  conversationId?: string | null,
): VoiceConversation {
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
  /** Lu à chaque connexion : la conversation a pu être créée entre-temps. */
  const currentConversation = useRef(conversationId);
  useEffect(() => {
    currentConversation.current = conversationId;
  });
  const lexicon = useRef<SnapLexicon>(buildSnapLexicon([]));
  const tamilyaText = useRef("");
  /** Message écrit qui attend le choix du mode, puis ce qu'il faut faire s'il reste sans réponse vocale. */
  const typed = useRef<string | null>(null);
  const unanswered = useRef<(() => void) | null>(null);
  /** L'appel a été mis en pause pour une lecture en 3D : il reprend quand elle est finie. */
  const pausedForReading = useRef(false);
  /** Tamilya chante (Lyria, bouton « chanter ») : l'appel se met en pause et reprend à la fin de la chanson. */
  const pausedForSong = useRef(false);
  /**
   * Pendant que l'histoire se prépare, Tamilya dit une petite phrase d'attente ; l'appel se met
   * en pause quand elle a fini (ou quand l'histoire se fait entendre, ou au bout de 8 s).
   */
  const readingPause = useRef<ReadingPause>({ ...NO_READING_PAUSE });
  const liveState = useRef<string>("");
  /**
   * Après une histoire, Tamilya a pris des nouvelles : le vocal s'ouvre pour écouter la réponse.
   * Sans un mot pendant 4 s, il se referme et on revient à l'écrit (demande de l'utilisateur).
   */
  const brief = useRef(false);
  const briefTimer = useRef(0);
  const endBrief = () => {
    brief.current = false;
    window.clearTimeout(briefTimer.current);
    briefTimer.current = 0;
  };
  const stopRef = useRef<() => void>(() => {});
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
    window.clearTimeout(readingPause.current.timer);
    readingPause.current = { ...NO_READING_PAUSE };
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
      conversationId: () => currentConversation.current,
      onState: (live) => {
        liveState.current = live;
        // Sa phrase d'attente est finie (réponse complète et plus aucun son) : pause pour l'histoire.
        if (live === "parle" && readingPause.current.timer) readingPause.current.spoke = true;
        if (live === "écoute" && readingPause.current.turnDone) {
          pauseForReading(readingPause, stopRef);
          return;
        }
        if (live === "connexion") setState("waiting");
        else if (live === "écoute") {
          voiceSpeakEnd();
          setState("listening");
          if (brief.current && !briefTimer.current) {
            briefTimer.current = window.setTimeout(() => {
              const silent = brief.current;
              endBrief();
              if (silent) stopRef.current();
            }, BRIEF_SILENCE_MS);
          }
        } else {
          // Elle parle : la conversation a repris, plus de fermeture au bout de 4 s.
          endBrief();
          setState("speaking");
        }
      },
      onUserText: (text) => {
        endBrief();
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
        // Réponse après le lancement d'une histoire : on attend la fin du son, sauf si elle s'est tue.
        const pending = readingPause.current;
        if (pending.timer && pending.spoke) {
          pending.turnDone = true;
          if (liveState.current === "écoute") pauseForReading(readingPause, stopRef);
        }
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
          return "Les vidéos sont affichées, les plus vues d'abord : elle touche celle qu'elle veut. Dis-le en une petite phrase à toi, courte et différente des fois précédentes : ne les décris pas, ne les lis pas, ne pose aucune question.";
        }
        // Chanson : comme une histoire, l'appel se met en pause après sa petite phrase (sa voix et la
        // chanson jamais en même temps, et le micro n'entend pas la musique) et reprend à la fin.
        if (name === "chanter") {
          const spec = voiceSongSpec(args.style, args.paroles);
          if (!spec) return "Paroles vides ou trop longues : réécris-les plus court (12 lignes au plus) et rappelle chanter, sans rien dire.";
          setStage(false);
          turnRef.current(hidePin(userText.current.trim(), "")[0], `\`\`\`${SONG_BLOCK}\n${spec}\n\`\`\``, true);
          userText.current = "";
          setBoard(true);
          pausedForSong.current = true;
          playSongOnce(spec);
          window.clearTimeout(readingPause.current.timer);
          readingPause.current = { timer: window.setTimeout(() => pauseForReading(readingPause, stopRef), READING_TALK_MAX_MS), spoke: false, turnDone: false };
          return "Ta chanson se compose et va être chantée avec ta voix chantée et des instruments. Dis-lui juste une petite phrase à toi, courte, que tu la prépares : ne dis pas les paroles, ne chante pas, pas de question.";
        }
        if (name === "defiler_conversation") return scrollConversation(String(args.vers ?? ""));
        if (name === "autoriser_paiement") return acceptPayment();
        if (name === "saisir_code") return enterPin(String(args.chiffres ?? ""));
        if (name === "annuler_paiement") return cancelPayment();
        const response = await fetch("/api/voice/live/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, args, conversationId: currentConversation.current ?? null }),
          signal,
        });
        const data = (await response.json().catch(() => null)) as {
          block?: string;
          time?: string;
          info?: string;
          trip?: string | null;
          reading?: string;
          error?: string;
        } | null;
        // Annulée pendant le chargement : pas de nouveau tableau, la personne a changé d'avis.
        if (signal.aborted) return CANCELLED;
        if (data?.time) return data.time;
        // Lecture en 3D : la carte s'ajoute à la conversation et démarre seule. Tamilya dit une
        // petite phrase pendant qu'elle se prépare, puis l'appel se met en pause pendant la lecture
        // (deux voix en même temps dans les écouteurs) et reprend à la fin.
        if (data?.reading) {
          const spec = data.reading.replace(/^```[^\n]*\n/, "").replace(/\n?```$/, "");
          markReadingAutoStart(spec);
          setStage(false);
          turnRef.current(hidePin(userText.current.trim(), "")[0], data.reading, true);
          userText.current = "";
          setBoard(true);
          requestAnimationFrame(() => scrollConversation("bas"));
          if (spec.startsWith("texte") || spec.startsWith("histoire")) {
            pausedForReading.current = true;
            window.clearTimeout(readingPause.current.timer);
            readingPause.current = { timer: window.setTimeout(() => pauseForReading(readingPause, stopRef), READING_TALK_MAX_MS), spoke: false, turnDone: false };
          }
          return data.info ?? "La lecture se prépare : dis-lui en une phrase courte, à ta façon, de se préparer à écouter.";
        }
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

  useEffect(() => {
    stopRef.current = stop;
  });

  const start = useCallback(() => {
    const mode = readTalkMode();
    if (mode) open(mode);
    else setChoosing(true);
  }, [open]);

  // L'histoire se fait entendre alors que Tamilya parle encore : l'appel se met en pause tout de
  // suite (jamais deux voix en même temps dans les écouteurs).
  useEffect(() => {
    const unsubscribe = subscribeStories(() => {
      const pending = readingPause.current;
      if (!pending.timer || !getStories().active?.started) return;
      window.clearTimeout(pending.timer);
      readingPause.current = { ...NO_READING_PAUSE };
      stopRef.current();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Lecture en 3D finie (ou arrêtée) : l'appel mis en pause reprend tout seul.
  useEffect(() => {
    const resume = (event: Event) => {
      // Histoire arrêtée (ou en échec) pendant sa phrase d'attente : l'appel n'a pas été coupé, il continue.
      if (readingPause.current.timer) {
        window.clearTimeout(readingPause.current.timer);
        readingPause.current = { ...NO_READING_PAUSE };
        pausedForReading.current = false;
        return;
      }
      if (pausedForReading.current) {
        pausedForReading.current = false;
        start();
        return;
      }
      // Histoire lancée à l'écrit et allée au bout : le vocal écoute la réponse 4 s.
      const converse = (event as CustomEvent<ReadingDone>).detail?.converse;
      if (converse && !session.current && !opening.current && isLiveVoiceSupported()) {
        brief.current = true;
        start();
      }
    };
    window.addEventListener(READING_DONE_EVENT, resume);
    return () => window.removeEventListener(READING_DONE_EVENT, resume);
  }, [start]);

  // Chanson lancée en vocal : dès qu'elle se fait entendre, l'appel se met en pause (si Tamilya
  // parle encore) ; une fois finie ou arrêtée, l'appel reprend tout seul.
  useEffect(() => {
    const unsubscribe = subscribeSong(() => {
      if (!pausedForSong.current) return;
      const song = getSong().active;
      if (song?.status === "playing" && readingPause.current.timer) {
        window.clearTimeout(readingPause.current.timer);
        readingPause.current = { ...NO_READING_PAUSE };
        stopRef.current();
        return;
      }
      if (song) return;
      pausedForSong.current = false;
      // Arrêtée pendant sa petite phrase : l'appel n'a pas été coupé, il continue.
      if (readingPause.current.timer) {
        window.clearTimeout(readingPause.current.timer);
        readingPause.current = { ...NO_READING_PAUSE };
        return;
      }
      if (!session.current && !opening.current) start();
    });
    return () => {
      unsubscribe();
    };
  }, [start]);

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
