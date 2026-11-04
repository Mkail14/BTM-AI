"use client";

import { useEffect, useState } from "react";
import { secondaryButton } from "@/components/admin/form";
import { clearVoiceTurns, percentile, readVoiceTurns, VOICE_STEPS, type VoiceTurn } from "@/lib/chat/voice-metrics";

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);

/** Temps du mode vocal mesurés sur cet appareil : médiane, P90, P95 par étape. */
export function VoiceMetrics() {
  const [turns, setTurns] = useState<VoiceTurn[] | null>(null);
  useEffect(() => {
    // localStorage n'existe que dans le navigateur : lecture après l'affichage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns(readVoiceTurns());
  }, []);

  if (!turns) return null;
  const rows = [
    ...VOICE_STEPS.map((step) => ({ label: step.label, values: turns.flatMap((t) => (t.steps[step.id] === undefined ? [] : [t.steps[step.id]!])) })),
    { label: "Serveur : premier mot du modèle", values: turns.flatMap((t) => (t.server.firstTokenMs === undefined ? [] : [t.server.firstTokenMs])) },
    { label: "Serveur : fabrication de la 1re voix", values: turns.flatMap((t) => (t.server.ttsMs === undefined ? [] : [t.server.ttsMs])) },
  ];
  const fallbacks = turns.filter((t) => t.fallback).length;

  return (
    <section className="rounded-xl border border-border bg-bg p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">Temps de réponse en vocal</h2>
        <button
          type="button"
          className={`${secondaryButton} min-h-11`}
          onClick={() => {
            clearVoiceTurns();
            setTurns([]);
          }}
        >
          Effacer
        </button>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Mesuré sur cet appareil, depuis la fin de ta phrase. {turns.length} échange{turns.length > 1 ? "s" : ""} enregistré
        {turns.length > 1 ? "s" : ""}
        {fallbacks ? `, dont ${fallbacks} avec la voix du navigateur (Gemini indisponible)` : ""}.
      </p>
      {turns.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="py-2 pr-3 font-medium">Étape</th>
                <th className="py-2 pr-3 font-medium">Médiane</th>
                <th className="py-2 pr-3 font-medium">P90</th>
                <th className="py-2 font-medium">P95</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3 font-medium">{seconds(percentile(row.values, 50))}</td>
                  <td className="py-2 pr-3">{seconds(percentile(row.values, 90))}</td>
                  <td className="py-2">{seconds(percentile(row.values, 95))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">Parle à Tamilya en vocal sur cet appareil, puis reviens ici.</p>
      )}
    </section>
  );
}
