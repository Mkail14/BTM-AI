"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { voiceHeard, voiceListenEnd, voiceSpeakEnd, voiceSpeakStart, voiceWord } from "@/lib/chat/voice-level";
import { isLiveVoiceSupported, openLiveSession, type LiveSession } from "@/lib/voice-live/session";
import type { VoiceConversation, VoiceState } from "./useVoiceConversation";

const noSubscribe = () => () => {};

/**
 * Mode vocal en direct (Gemini Live), avec la même interface que l'ancien mode
 * (useVoiceConversation) : l'écran vocal et le globe ne changent pas. À la fin
 * de chaque réponse, `onTurn` reçoit ce que la personne a dit et ce que
 * Tamilya a répondu, pour l'afficher et l'enregistrer dans la conversation.
 */
export function useLiveVoiceConversation(onTurn: (user: string, tamilya: string) => void): VoiceConversation {
  const supported = useSyncExternalStore(noSubscribe, isLiveVoiceSupported, () => false);
  const [state, setState] = useState<VoiceState>("off");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [beat, setBeat] = useState(0);
  const [debug, setDebug] = useState("");
  const session = useRef<LiveSession | null>(null);
  /** Numéro de la conversation en cours d'ouverture : fermée avant d'être prête, elle est refermée dès qu'elle l'est. */
  const generation = useRef(0);
  const opening = useRef(false);
  const userText = useRef("");
  const tamilyaText = useRef("");
  const turnRef = useRef(onTurn);
  useEffect(() => {
    turnRef.current = onTurn;
  });

  const note = useCallback((event: string) => {
    const at = new Date().toLocaleTimeString("fr-FR", { minute: "2-digit", second: "2-digit" });
    setDebug((previous) => [...previous.split(" · ").filter(Boolean).slice(-2), `${at} ${event}`].join(" · "));
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    opening.current = false;
    session.current?.stop();
    session.current = null;
    voiceSpeakEnd();
    voiceListenEnd();
    setState("off");
  }, []);

  const start = useCallback(() => {
    if (session.current || opening.current) return;
    opening.current = true;
    const mine = ++generation.current;
    setError(null);
    setTranscript("");
    setReply("");
    userText.current = "";
    tamilyaText.current = "";
    void openLiveSession({
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
        if (!tamilyaText.current) voiceSpeakStart(text);
        tamilyaText.current += text;
        voiceWord(tamilyaText.current, Math.max(0, tamilyaText.current.length - text.length));
        setReply(tamilyaText.current.trim());
        setBeat((n) => n + 1);
      },
      onTurnComplete: () => {
        const [user, tamilya] = [userText.current.trim(), tamilyaText.current.trim()];
        if (user || tamilya) turnRef.current(user, tamilya);
        userText.current = "";
        tamilyaText.current = "";
      },
      onToolCall: async (name, args) => {
        const response = await fetch("/api/voice/live/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, args }),
        });
        const data = (await response.json().catch(() => null)) as { block?: string; error?: string } | null;
        if (!data?.block) return data?.error ?? "Ce bouton n'est pas disponible : dis-le à la personne.";
        // Le tableau s'affiche dans la conversation, juste après ce que la personne vient de dire.
        turnRef.current(userText.current.trim(), data.block);
        userText.current = "";
        return "C'est affiché sur l'écran de la personne : dis-lui en une phrase de choisir et valider au doigt. N'invente aucun horaire ni prix.";
      },
      onLatency: (ms) => note(`réponse en ${(ms / 1000).toFixed(1)} s`),
      onNote: note,
      onClose: (problem) => {
        session.current = null;
        voiceSpeakEnd();
        voiceListenEnd();
        if (problem) setError(problem);
        setState("off");
      },
    }).then((opened) => {
      opening.current = false;
      if (mine !== generation.current) return opened?.stop();
      session.current = opened;
    });
  }, [note]);

  /** Toucher du globe pendant qu'elle parle : elle se tait et écoute. */
  const interrupt = useCallback(() => {
    session.current?.cut();
    voiceSpeakEnd();
    setState("listening");
  }, []);

  useEffect(() => () => session.current?.stop(), []);

  // say / replied : l'ancien mode lisait les réponses écrites ; en direct, Gemini parle lui-même.
  const nothing = useCallback(() => {}, []);
  return { supported, state, error, hint: null, debug, transcript, reply, beat, start, stop, interrupt, say: nothing, replied: nothing };
}
