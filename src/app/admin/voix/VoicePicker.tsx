"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import { GEMINI_VOICES, type GeminiVoiceId } from "@/lib/ai/voice/voices";
import { saveVoiceAction } from "./actions";

const SAMPLE = "Bonjour, je suis Tamilya ! Karibu, marahaba d'être là. Qu'est-ce que je peux faire pour toi aujourd'hui ?";

/** Liste des voix : « Écouter » lit la phrase d'essai, « Choisir » l'enregistre pour Tamilya. */
export function VoicePicker({ saved }: { saved: GeminiVoiceId }) {
  const [current, setCurrent] = useState(saved);
  const [sample, setSample] = useState(SAMPLE);
  const [playing, setPlaying] = useState<GeminiVoiceId | null>(null);
  const [loading, setLoading] = useState<GeminiVoiceId | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const audio = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      audio.current?.pause();
    },
    [],
  );

  function stop() {
    request.current?.abort();
    audio.current?.pause();
    setPlaying(null);
    setLoading(null);
  }

  async function listen(voice: GeminiVoiceId) {
    stop();
    setStatus(null);
    const controller = new AbortController();
    request.current = controller;
    setLoading(voice);
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample.trim() || SAMPLE, voice }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? `Erreur ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const player = (audio.current ??= new Audio());
      player.src = url;
      player.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(null);
      };
      setLoading(null);
      setPlaying(voice);
      await player.play();
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoading(null);
      setPlaying(null);
      setStatus({ ok: false, message: `La voix n'a pas pu être lue : ${error instanceof Error ? error.message : "erreur inconnue"}` });
    }
  }

  function choose(voice: GeminiVoiceId) {
    startSaving(async () => {
      const result = await saveVoiceAction(voice);
      setStatus(result);
      if (result.ok) setCurrent(voice);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-border bg-bg p-5">
        <label htmlFor="voice-sample" className="block text-sm font-medium">
          Phrase d&apos;essai
        </label>
        <p className="mt-0.5 text-xs text-fg-muted">Mets du français et du shimaoré pour entendre comment chaque voix s&apos;en sort.</p>
        <textarea
          id="voice-sample"
          rows={2}
          maxLength={400}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className={`${inputClass} mt-2`}
        />
        <div className="mt-3 min-h-5" aria-live="polite">
          <ActionStatus result={status} />
        </div>
      </section>

      {(["femme", "homme"] as const).map((gender) => (
        <section key={gender} className="rounded-xl border border-border bg-bg p-2 sm:p-3">
          <h2 className="px-3 pt-2 pb-1 text-sm font-semibold">{gender === "femme" ? "Voix de femme" : "Voix d'homme"}</h2>
          <ul className="divide-y divide-border">
            {GEMINI_VOICES.filter((v) => v.gender === gender).map((v) => {
              const chosen = v.id === current;
              const busy = loading === v.id;
              const isPlaying = playing === v.id;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {v.label}
                      {chosen ? <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Voix actuelle</span> : null}
                    </p>
                    <p className="text-sm text-fg-muted">{v.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => (busy || isPlaying ? stop() : void listen(v.id))}
                    className={`${secondaryButton} min-h-11 min-w-28`}
                  >
                    {busy ? "Chargement…" : isPlaying ? "Arrêter" : "Écouter"}
                  </button>
                  <button
                    type="button"
                    disabled={chosen || saving}
                    onClick={() => choose(v.id)}
                    className={`${primaryButton} min-h-11 min-w-24`}
                  >
                    {chosen ? "Choisie" : "Choisir"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
