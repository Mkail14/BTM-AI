"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createSpeaker, holdMicrophone, isVoiceSupported, listen, speak, unlockSpeech, type Dictation, type Speaker } from "@/lib/chat/voice";
import { voiceHeard, voiceListenEnd } from "@/lib/chat/voice-level";
import { beginVoiceTurn } from "@/lib/chat/voice-metrics";
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
  busy: "Le micro est encore occupé. Touche le globe pour réessayer.",
};

/** Erreurs passagères de Chrome : on relance l'écoute au lieu de tout fermer (jusqu'à 3 fois d'affilée). */
const TRANSIENT = new Set(["network", "busy"]);
const MAX_RETRIES = 3;
/**
 * Pause avant de rouvrir le micro : Chrome refuse souvent une écoute lancée
 * juste après la précédente (ou juste après la voix de Tamilya).
 */
const RESTART_DELAY_MS = 300;
/** Écoute sans aucune nouvelle de Chrome au-delà de ce temps : micro rouvert. */
const LISTEN_GUARD_MS = 15_000;

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
  /** iPhone : micro tenu ouvert pendant tout le mode vocal (voir holdMicrophone). */
  const releaseMic = useRef<(() => void) | null>(null);
  /** Diagnostic de l'écoute (affiché sous le globe, mode admin) : les 3 derniers évènements. */
  const [debug, setDebug] = useState("");
  const note = useCallback((event: string) => {
    const at = new Date().toLocaleTimeString("fr-FR", { minute: "2-digit", second: "2-digit" });
    setDebug((previous) => [...previous.split(" · ").filter(Boolean).slice(-2), `${at} ${event}`].join(" · "));
  }, []);
  const retries = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Relance de l'écoute depuis la fin d'une écoute (begin est défini avant startListening). */
  const startListeningRef = useRef<() => void>(() => {});
  const active = useRef(false);
  const dictation = useRef<Dictation | null>(null);
  const stopSpeaking = useRef<(() => void) | null>(null);
  /** Voix en cours, qui reçoit les phrases au fil de la réponse. */
  const speaker = useRef<Speaker | null>(null);
  const sendRef = useRef(onSend);
  useEffect(() => {
    sendRef.current = onSend;
  });

  const stop = useCallback(() => {
    active.current = false;
    releaseMic.current?.();
    releaseMic.current = null;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    dictation.current?.cancel();
    dictation.current = null;
    stopSpeaking.current?.();
    stopSpeaking.current = null;
    voiceListenEnd();
    setTranscript("");
    setState("off");
  }, []);

  /** Ouvre le micro pour une phrase. */
  const begin = useCallback(() => {
    let heard = 0;
    const openedAt = performance.now();
    // Chrome reste parfois en écoute sans jamais rien renvoyer : sans nouvelle au bout de
    // 15 s (il conclut normalement après ~8 s de silence), on rouvre le micro.
    let guard: ReturnType<typeof setTimeout> | null = null;
    const armGuard = () => {
      if (guard) clearTimeout(guard);
      guard = setTimeout(() => {
        if (!active.current || dictation.current !== current) return;
        note("micro muet 15 s, réouverture");
        current?.cancel();
        dictation.current = null;
        startListeningRef.current();
      }, LISTEN_GUARD_MS);
    };
    const current: Dictation | null = listen({
      onEvent: (event) => note(event === "audiostart" ? "micro capte" : "son reçu"),
      onText: (text) => {
        armGuard();
        silences.current = 0;
        retries.current = 0;
        setHint(null);
        setTranscript(text);
        setBeat((n) => n + 1);
        // Le globe frémit quand la personne parle : il écoute.
        voiceHeard(Math.max(1, text.length - heard));
        heard = text.length;
      },
      onEnd: (text) => {
        if (guard) clearTimeout(guard);
        note(text ? `entendu ${text.length} car.` : `fin d'écoute sans rien (${Math.round((performance.now() - openedAt) / 100) / 10} s)`);
        voiceListenEnd();
        dictation.current = null;
        if (!active.current) return;
        // Silence : on continue d'écouter tant que le mode vocal est ouvert.
        if (!text) {
          silences.current += 1;
          if (silences.current >= SILENCES_BEFORE_HINT) setHint(NO_SOUND_HINT);
          return startListeningRef.current();
        }
        beginVoiceTurn();
        setState("waiting");
        sendRef.current(text);
      },
      onError: (code) => {
        note(`erreur ${code}`);
        // Passagère : la fin d'écoute qui suit relance le micro.
        if (TRANSIENT.has(code) && retries.current < MAX_RETRIES) {
          retries.current += 1;
          return;
        }
        retries.current = 0;
        setError(VOICE_ERRORS[code] ?? `Le micro ne répond pas (${code}). Réessaie.`);
        stop();
      },
    });
    dictation.current = current;
    if (current) {
      armGuard();
      note("micro ouvert");
    }
    if (!dictation.current) {
      setError("Ce navigateur ne gère pas la dictée : ouvre la page dans Chrome ou Edge.");
      stop();
    }
  }, [note, stop]);

  const startListening = useCallback(() => {
    stopSpeaking.current?.();
    stopSpeaking.current = null;
    const hadDictation = dictation.current !== null;
    dictation.current?.cancel();
    dictation.current = null;
    setTranscript("");
    setState("listening");
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      if (active.current) begin();
    }, hadDictation ? RESTART_DELAY_MS * 2 : RESTART_DELAY_MS);
  }, [begin]);

  useEffect(() => {
    startListeningRef.current = startListening;
  });

  /** Ouvre le mode vocal (au toucher : débloque aussi la lecture sur iPhone). */
  const start = useCallback(() => {
    setError(null);
    setHint(null);
    silences.current = 0;
    retries.current = 0;
    setReply("");
    unlockSpeech();
    // iPhone : sans micro tenu ouvert, la dictée n'entend plus rien après la 1re réponse lue.
    void holdMicrophone().then((release) => {
      if (active.current) {
        releaseMic.current?.();
        releaseMic.current = release;
      } else release();
    });
    // Réveille le serveur pendant que la personne parle : la première réponse part plus vite.
    void fetch("/api/voice/warm", { method: "POST" }).catch(() => {});
    active.current = true;
    startListening();
  }, [startListening]);

  /** Coupe la parole de Tamilya (ou relance l'écoute) pour lui parler tout de suite. */
  const interrupt = useCallback(() => {
    if (active.current) startListening();
  }, [startListening]);

  const speakerOptions = useCallback(
    () => ({
      onWord: () => setBeat((n) => n + 1),
      onDone: () => {
        stopSpeaking.current = null;
        speaker.current = null;
        if (active.current) startListening();
      },
    }),
    [startListening],
  );

  /**
   * Phrase de la réponse, envoyée par le serveur dès qu'elle est terminée :
   * Tamilya commence à parler pendant que la suite s'écrit encore.
   */
  const say = useCallback(
    (sentence: string) => {
      if (!active.current) return;
      const text = stripTranslation(sentence);
      if (!speaker.current) {
        const created = createSpeaker(speakerOptions());
        speaker.current = created;
        stopSpeaking.current = () => {
          created.stop();
          speaker.current = null;
        };
        setReply("");
        setState("speaking");
      }
      speaker.current.add(text);
      setReply((previous) => (previous ? `${previous} ${text}` : text));
    },
    [speakerOptions],
  );

  /** Réponse de Tamilya terminée (ou message d'erreur) : elle la lit (sans traduction ajoutée), puis réécoute. */
  const replied = useCallback(
    (answer: string) => {
      if (!active.current) return;
      // Déjà lue phrase par phrase : il n'y a plus qu'à finir.
      if (speaker.current) {
        speaker.current.end();
        return;
      }
      const text = stripTranslation(answer);
      setReply(text);
      setState("speaking");
      stopSpeaking.current = speak(text, speakerOptions());
    },
    [speakerOptions],
  );

  useEffect(() => stop, [stop]);

  return { supported, state, error, hint, debug, transcript, reply, beat, start, stop, interrupt, say, replied };
}

export type VoiceConversation = ReturnType<typeof useVoiceConversation>;
