"use client";

import { useEffect, useState } from "react";
import { Music } from "lucide-react";

/** Style tiré de la vidéo de référence (chorale de rue à Paris) : rythme mesuré à environ 130 BPM. */
const EXAMPLES = {
  fr: `Chanson française de rue, joyeuse et entraînante, environ 130 BPM, chantée en chœur par une grande chorale de jeunes, avec violons et altos, comme un chant qu'une foule reprend ensemble ; l'élan monte jusqu'au dernier refrain.

[Couplet]
Sur la barge au petit matin
Le soleil se lève sur Mamoudzou
On se salue, on se tend la main
Mayotte se réveille avec nous

[Refrain]
Tamilya chante, Tamilya danse
Du lagon jusqu'au mont Choungui
Tout le monde reprend en cadence
Mayotte chante aujourd'hui`,
  shimaore: `Chanson joyeuse et entraînante, environ 130 BPM, chantée en chœur par une grande chorale, avec violons, en shimaoré (langue de Mayotte).

[Refrain]
Marahaba, marahaba
Mayotte na lagon`,
} as const;

type Result = { url: string; text: string; ms: number; model: string };

export function SongTester() {
  const [prompt, setPrompt] = useState<string>(EXAMPLES.fr);
  const [model, setModel] = useState<"clip" | "song">("clip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => () => (result ? URL.revokeObjectURL(result.url) : undefined), [result]);

  async function generate() {
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      const response = await fetch("/api/admin/musique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Erreur ${response.status}`);
        return;
      }
      const blob = await response.blob();
      setResult({
        url: URL.createObjectURL(blob),
        text: decodeURIComponent(response.headers.get("X-Lyria-Text") ?? ""),
        ms: Number(response.headers.get("X-Lyria-Ms") ?? 0),
        model: response.headers.get("X-Lyria-Model") ?? "",
      });
    } catch {
      setError("Connexion perdue, réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-bg p-4 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Music size={18} aria-hidden="true" /> Essai des chansons de Tamilya
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Lyria (Google) fabrique la chanson : voix chantée et instruments. Décris le style, puis écris les paroles avec [Couplet] et [Refrain]. Pas de
          chanson existante ni de voix d&apos;artiste : Google refuse.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={() => setPrompt(EXAMPLES.fr)} className="rounded-full border border-border px-3 py-1.5 hover:bg-bg-subtle">
          Exemple en français
        </button>
        <button type="button" onClick={() => setPrompt(EXAMPLES.shimaore)} className="rounded-full border border-border px-3 py-1.5 hover:bg-bg-subtle">
          Exemple en shimaoré
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Demande à Lyria
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={12}
          maxLength={4000}
          className="rounded-xl border border-border bg-bg px-3 py-2.5 font-normal outline-none focus:border-accent"
        />
      </label>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Longueur</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={model === "clip"} onChange={() => setModel("clip")} /> Extrait de 30 s (rapide)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={model === "song"} onChange={() => setModel("song")} /> Chanson entière (plus long)
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="button" onClick={generate} disabled={busy || prompt.trim().length < 10} className="btn-rose h-11 rounded-full px-5 text-sm font-medium disabled:opacity-60">
          {busy ? `Lyria compose… ${elapsed} s` : "Créer la chanson"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col gap-2">
          <audio controls autoPlay src={result.url} className="w-full" />
          <p className="text-xs text-fg-muted">
            {result.model} · composée en {Math.round(result.ms / 1000)} s
          </p>
          {result.text ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-bg-subtle p-3 text-xs">{result.text}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}
