"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { boardCount, describeBoard, scrollConversation, touchBoard, waitForBoard, writeBoard } from "@/lib/voice-live/board";
import { acceptPayment, cancelPayment, enterPin, takePinTurn } from "@/lib/voice-live/voice-pay";
import { voiceHeard, voiceListenEnd, voiceSpeakEnd, voiceSpeakStart, voiceWord } from "@/lib/chat/voice-level";
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
  /** Première utilisation : l'écran vocal demande comment parler avant d'ouvrir le micro. */
  const [choosing, setChoosing] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const session = useRef<LiveSession | null>(null);
  /** Numéro de la conversation en cours d'ouverture : fermée avant d'être prête, elle est refermée dès qu'elle l'est. */
  const generation = useRef(0);
  const opening = useRef(false);
  /** Bouton déjà appuyé pendant que le micro s'ouvre : l'appui compte dès qu'il est prêt. */
  const held = useRef(false);
  const userText = useRef("");
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
    cancelPayment();
    session.current?.stop();
    session.current = null;
    voiceSpeakEnd();
    voiceListenEnd();
    setChoosing(false);
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
        // Nouvelle phrase de la personne après une réponse : on repart de zéro.
        if (tamilyaText.current) {
          userText.current = "";
          tamilyaText.current = "";
          setReply("");
        }
        userText.current += text;
        setTranscript(userText.current.trim());
        voiceHeard(text.length);
        setBeat((n) => n + 1);
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
      onToolCall: async (name, args) => {
        // Tableau déjà à l'écran : Tamilya agit directement dessus, sans passer par le serveur.
        if (name === "lire_tableau") return describeBoard();
        if (name === "toucher_tableau") return touchBoard(String(args.bouton ?? ""));
        if (name === "remplir_tableau") return writeBoard(String(args.champ ?? ""), String(args.valeur ?? ""));
        if (name === "defiler_conversation") return scrollConversation(String(args.vers ?? ""));
        if (name === "autoriser_paiement") return acceptPayment();
        if (name === "saisir_code") return enterPin(String(args.chiffres ?? ""));
        if (name === "annuler_paiement") return cancelPayment();
        const response = await fetch("/api/voice/live/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, args }),
        });
        const data = (await response.json().catch(() => null)) as { block?: string; error?: string } | null;
        if (!data?.block) return data?.error ?? "Ce bouton n'est pas disponible : dis-le à la personne.";
        // Le tableau s'affiche dans la conversation, juste après ce que la personne vient de dire.
        const before = boardCount();
        turnRef.current(hidePin(userText.current.trim(), "")[0], data.block, true);
        userText.current = "";
        setBoard(true);
        await waitForBoard(before);
        return `C'est affiché sur l'écran de la personne. Continue toi-même avec ce qu'elle t'a déjà dit.\n${describeBoard()}`;
      },
      onLatency: (ms) => note(`réponse en ${(ms / 1000).toFixed(1)} s`),
      onNote: note,
      onClose: (problem) => {
        session.current = null;
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
  return { live: true, board, handsFree, choosing, choose, startWith, press, release, supported, state, error, hint: null, debug, transcript, reply, beat, start, stop, interrupt, say: nothing, replied: nothing };
}
