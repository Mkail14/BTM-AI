"use client";

import { useEffect, useRef, useState } from "react";
import { IconMic } from "@/components/ui/icons";
import { average, loadPrinter, similarity } from "@/lib/voice-live/speaker";
import { speechSeconds, startRecording, type Recording } from "@/lib/voice-live/record";
import { PinField } from "../parametres/PaymentPin";

/** Mêmes phrases et mêmes règles que dans les Paramètres (VoicePrint). */
const PHRASES = [
  "Tamilya, c'est moi. Je confirme que c'est bien ma voix.",
  "Aujourd'hui à Mayotte, je prépare ma journée tranquillement.",
  "Mon code reste secret, je ne le donne à personne.",
];
const MIN_SPEECH_S = 1.5;
const SAME_VOICE = 0.4;

/**
 * Étape « Ta voix » des premiers pas : trois phrases lues, seule l'empreinte (des nombres) part.
 * `knownPin` : le code créé juste avant ; sinon, le serveur le demande et on l'affiche.
 */
export function WelcomeVoice({ knownPin, mainClass, onDone }: { knownPin: string | null; mainClass: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [prints, setPrints] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<number[] | null>(null);
  const [code, setCode] = useState("");
  const current = useRef<Recording | null>(null);

  useEffect(() => {
    // Le modèle (≈ 7 Mo) se charge pendant la lecture de l'étape.
    void loadPrinter();
    return () => void current.current?.stop();
  }, []);

  async function save(print: number[], pin: string | null) {
    setBusy("Enregistrement…");
    setError(null);
    const response = await fetch("/api/voice/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ print, consent: true, ...(pin ? { current: pin } : {}) }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; reason?: string } | null;
    setBusy(null);
    if (result?.ok) return onDone();
    setCode("");
    if (result?.reason === "pin-required") {
      setPending(print);
      return setError(pin ? (result.error ?? "Code faux.") : null);
    }
    setError(result?.error ?? "Connexion impossible : réessaie.");
  }

  async function finishPhrase() {
    const rec = current.current;
    current.current = null;
    setRecording(false);
    setLevel(0);
    if (!rec) return;
    const samples = await rec.stop();
    if (speechSeconds(samples) < MIN_SPEECH_S) return setError("Trop court : lis toute la phrase, à voix normale.");
    setBusy("Calcul de ton empreinte…");
    const printer = await loadPrinter();
    const print = printer ? await printer(samples).catch(() => null) : null;
    setBusy(null);
    if (!print) return setError(printer ? "Phrase illisible : recommence au calme." : "Ce téléphone ne peut pas calculer l'empreinte de voix.");
    const next = [...prints, print];
    setPrints(next);
    if (next.length < PHRASES.length) return setStep(next.length);
    const close = next.every((a, i) => next.every((b, j) => i >= j || similarity(a, b) >= SAME_VOICE));
    if (!close) {
      setPrints([]);
      setStep(0);
      return setError("Les trois phrases ne se ressemblent pas assez : recommence seul, au calme.");
    }
    await save(average(next), knownPin);
  }

  async function toggle() {
    if (recording) return finishPhrase();
    setError(null);
    try {
      current.current = await startRecording(setLevel);
      setRecording(true);
    } catch {
      setError("Micro refusé : autorise le micro, puis réessaie.");
    }
  }

  if (pending) {
    return (
      <div className="flex flex-col items-center gap-5">
        <PinField label="Ton code de paiement" value={code} onChange={setCode} autoFocus />
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <button type="button" disabled={code.length !== 4 || Boolean(busy)} onClick={() => void save(pending, code)} className={mainClass}>
          {busy ?? "Enregistrer ma voix"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">
        Phrase {Math.min(step + 1, PHRASES.length)} sur {PHRASES.length}
      </p>
      <p className="text-lg leading-snug font-medium">« {PHRASES[step]} »</p>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-fg/10" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {busy ? <p className="text-sm text-fg-muted">{busy}</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <button type="button" disabled={Boolean(busy)} onClick={() => void toggle()} className={`${mainClass} inline-flex items-center justify-center gap-2`}>
        <IconMic width={18} height={18} />
        {recording ? "J'ai fini" : "Appuie, puis lis la phrase"}
      </button>
    </div>
  );
}
