"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isVoiceSupported, listen, speak, unlockSpeech, type Dictation } from "@/lib/chat/voice";
import { voiceHeard, voiceListenEnd } from "@/lib/chat/voice-level";
import { stripTranslation } from "@/lib/language/unknown-words";

/** off → listening (on parle) → waiting (Tamilya répond) → speaking (Tamilya lit) → listening… */
export type VoiceState = "off" | "listening" | "waiting" | "speaking";

const noSubscribe = () => () => {};

const VOICE_ERRORS: Record<string, string> = {
  "not-allowed": "Micro refusé : clique sur le cadenas à gauche de l'adresse et autorise le micro, puis réessaie.",
  "service-not-allowed": "Micro refusé : clique sur le cadenas à gauche de l'adresse et autorise le micro, puis réessaie.",
  "audio-capture": "Aucun micro détecté sur cet appareil.",
  // Chrome envoie la voix à Google pour la transcrire ; Brave et certains réseaux le bloquent.
  network: "La dictée a besoin d'internet (et ne marche pas dans Brave). Essaie avec Chrome ou Edge.",
};

/** Écoutes muettes d'affilée (environ 8 s chacune dans Chrome) avant de prévenir que le micro n'envoie rien. */
const SILENCES_BEFORE_HINT = 2;

export const NO_SOUND_HINT =
  "Je ne t'entends pas. Clique sur l'icône du micro dans la barre d'adresse de Chrome et choisis le bon micro. Vérifie aussi Windows : Paramètres → Confidentialité → Microphone, avec l'accès autorisé pour Chrome.";

/**
 * Mode vocal plein écran, mains libres : la personne parle, le message part
 * quand elle se tait, Tamilya lit sa réponse puis réécoute, jusqu'à la fermeture.
 */
export function useVoiceConversation(onSend: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, isVoiceSupported, () => false);
  const [state, setState] = useState<VoiceState>("off");
  const [error, setError] = useState<string | null>(null);
  /** Ce que la personne est en train de dire. */
  const [transcript, setTranscript] = useState("");
  /** Ce que Tamilya lit à voix haute. */
  const [reply, setReply] = useState("");
  /** Incrémenté à chaque mot entendu ou prononcé : fait pulser le globe. */
  const [beat, setBeat] = useState(0);
  /** Rien n'arrive du micro depuis plusieurs écoutes : conseil affiché sous « Je t'écoute… ». */
  const [hint, setHint] = useState<string | null>(null);
  const silences = useRef(0);
  const active = useRef(false);
  const dictation = useRef<Dictation | null>(null);
  const stopSpeaking = useRef<(() => void) | null>(null);
  const sendRef = useRef(onSend);
  useEffect(() => {
    sendRef.current = onSend;
  });

  const stop = useCallback(() => {
    active.current = false;
    dictation.current?.cancel();
    dictation.current = null;
    stopSpeaking.current?.();
    stopSpeaking.current = null;
    voiceListenEnd();
    setTranscript("");
    setState("off");
  }, []);

  const startListening = useCallback(function listenAgain() {
    stopSpeaking.current?.();
    stopSpeaking.current = null;
    dictation.current?.cancel();
    setTranscript("");
    setState("listening");
    let heard = 0;
    dictation.current = listen({
      onText: (text) => {
        silences.current = 0;
        setHint(null);
        setTranscript(text);
        setBeat((n) => n + 1);
        // Le globe frémit quand la personne parle : il écoute.
        voiceHeard(Math.max(1, text.length - heard));
        heard = text.length;
      },
      onEnd: (text) => {
        voiceListenEnd();
        dictation.current = null;
        if (!active.current) return;
        // Silence : on continue d'écouter tant que le mode vocal est ouvert.
        if (!text) {
          silences.current += 1;
          if (silences.current >= SILENCES_BEFORE_HINT) setHint(NO_SOUND_HINT);
          return listenAgain();
        }
        setState("waiting");
        sendRef.current(text);
      },
      onError: (code) => {
        setError(VOICE_ERRORS[code] ?? `Le micro ne répond pas (${code}). Réessaie.`);
        stop();
      },
    });
    if (!dictation.current) {
      setError("Ce navigateur ne gère pas la dictée : ouvre la page dans Chrome ou Edge.");
      stop();
    }
  }, [stop]);

  /** Ouvre le mode vocal (au toucher : débloque aussi la lecture sur iPhone). */
  const start = useCallback(() => {
    setError(null);
    setHint(null);
    silences.current = 0;
    setReply("");
    unlockSpeech();
    active.current = true;
    startListening();
  }, [startListening]);

  /** Coupe la parole de Tamilya (ou relance l'écoute) pour lui parler tout de suite. */
  const interrupt = useCallback(() => {
    if (active.current) startListening();
  }, [startListening]);

  /** Réponse de Tamilya terminée (ou message d'erreur) : elle la lit (sans traduction ajoutée), puis réécoute. */
  const replied = useCallback(
    (answer: string) => {
      if (!active.current) return;
      const text = stripTranslation(answer);
      setReply(text);
      setState("speaking");
      stopSpeaking.current = speak(text, {
        onWord: () => setBeat((n) => n + 1),
        onDone: () => {
          stopSpeaking.current = null;
          if (active.current) startListening();
        },
      });
    },
    [startListening],
  );

  useEffect(() => stop, [stop]);

  return { supported, state, error, hint, transcript, reply, beat, start, stop, interrupt, replied };
}

export type VoiceConversation = ReturnType<typeof useVoiceConversation>;
