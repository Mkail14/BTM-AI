"use client";

import { useEffect, useRef, useState } from "react";
import { percentile } from "@/lib/chat/voice-metrics";

/**
 * Vocal en direct, comme ChatGPT Voice : le micro part en continu vers Gemini
 * (Live API, par le relais Cloudflare), la voix de Tamilya revient en continu
 * et s'arrête si on lui coupe la parole. Aucune dictée du navigateur : marche
 * aussi sur iPhone après plusieurs échanges.
 */

type Line = { who: "toi" | "Tamilya"; text: string };
type State = "off" | "connexion" | "écoute" | "parle" | "erreur";

/** Capture du micro : échantillons ramenés à 16 kHz, envoyés par paquets de 100 ms. */
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = []; this.ratio = sampleRate / 16000; this.pos = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.pos += 1;
      if (this.pos >= this.ratio) { this.pos -= this.ratio; this.buffer.push(input[i]); }
    }
    if (this.buffer.length >= 1600) {
      this.port.postMessage(Float32Array.from(this.buffer));
      this.buffer = [];
    }
    return true;
  }
}
registerProcessor("capture", Capture);
`;

function toBase64Pcm(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64Pcm(data: string): Float32Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

type GeminiMessage = {
  setupComplete?: object;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
  goAway?: object;
  error?: { message?: string };
};

export function LiveVoice() {
  const [state, setState] = useState<State>("off");
  const [lines, setLines] = useState<Line[]>([]);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const note = (text: string) =>
    setLog((previous) => [...previous.slice(-5), `${new Date().toLocaleTimeString("fr-FR", { minute: "2-digit", second: "2-digit" })} ${text}`]);

  /** Ajoute du texte à la dernière ligne de la même personne (les transcriptions arrivent par morceaux). */
  const say = (who: Line["who"], text: string) =>
    setLines((previous) => {
      const last = previous.at(-1);
      if (last?.who === who) return [...previous.slice(0, -1), { who, text: last.text + text }];
      return [...previous, { who, text }].slice(-12);
    });

  async function start() {
    setState("connexion");
    setLog([]);
    // Tout est créé au toucher du bouton : obligatoire sur iPhone pour le son et le micro.
    const playback = new AudioContext();
    let capture: AudioContext;
    try {
      capture = new AudioContext({ sampleRate: 16000 });
    } catch {
      capture = new AudioContext();
    }
    void playback.resume();
    void capture.resume();

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      note("micro refusé");
      setState("erreur");
      return;
    }

    const session = await fetch("/api/voice/live/session", { method: "POST" }).then((r) => r.json()).catch(() => null) as { url?: string; error?: string } | null;
    if (!session?.url) {
      note(session?.error ?? "session impossible");
      mic.getTracks().forEach((t) => t.stop());
      setState("erreur");
      return;
    }

    const socket = new WebSocket(session.url);
    const sources = new Set<AudioBufferSourceNode>();
    let nextTime = 0;
    let speechEndedAt: number | null = null;
    let speaking = false;
    let quietSince = 0;
    let ready = false;

    const stopPlayback = () => {
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      sources.clear();
      nextTime = 0;
    };

    const stop = () => {
      stopRef.current = null;
      try {
        socket.close();
      } catch {}
      stopPlayback();
      mic.getTracks().forEach((t) => t.stop());
      void capture.close().catch(() => {});
      void playback.close().catch(() => {});
      setState("off");
    };
    stopRef.current = stop;

    // Micro → Gemini, et repérage local de la fin de ta phrase (pour chronométrer).
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await capture.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(capture, "capture");
    capture.createMediaStreamSource(mic).connect(node);
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const samples = event.data;
      let sum = 0;
      for (const v of samples) sum += v * v;
      const loud = Math.sqrt(sum / samples.length) > 0.02;
      const now = performance.now();
      if (loud) {
        speaking = true;
        quietSince = 0;
      } else if (speaking) {
        quietSince ||= now;
        if (now - quietSince > 300) {
          speaking = false;
          speechEndedAt = quietSince;
        }
      }
      if (ready && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ realtimeInput: { audio: { data: toBase64Pcm(samples), mimeType: "audio/pcm;rate=16000" } } }));
      }
    };

    socket.onopen = () => note("relais connecté");
    socket.onclose = (event) => {
      note(`fermé (${event.code}${event.reason ? ` : ${event.reason}` : ""})`);
      if (stopRef.current) {
        stop();
        if (event.code !== 1000) setState("erreur");
      }
    };
    socket.onerror = () => note("erreur de connexion");
    socket.onmessage = async (event) => {
      const raw = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      let message: GeminiMessage;
      try {
        message = JSON.parse(raw) as GeminiMessage;
      } catch {
        return;
      }
      if (message.setupComplete) {
        ready = true;
        note("Gemini prêt");
        setState("écoute");
      }
      if (message.error) note(`Gemini : ${message.error.message ?? "erreur"}`);
      const content = message.serverContent;
      if (!content) return;
      if (content.interrupted) {
        stopPlayback();
        note("coupée par toi");
        setState("écoute");
      }
      if (content.inputTranscription?.text) say("toi", content.inputTranscription.text);
      if (content.outputTranscription?.text) say("Tamilya", content.outputTranscription.text);
      for (const part of content.modelTurn?.parts ?? []) {
        const audio = part.inlineData;
        if (!audio?.data || !audio.mimeType?.startsWith("audio/pcm")) continue;
        if (speechEndedAt !== null) {
          const latency = Math.round(performance.now() - speechEndedAt);
          speechEndedAt = null;
          setLatencies((previous) => [...previous, latency].slice(-30));
        }
        const rate = Number(audio.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
        const samples = fromBase64Pcm(audio.data);
        const buffer = playback.createBuffer(1, samples.length, rate);
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
        const source = playback.createBufferSource();
        source.buffer = buffer;
        source.connect(playback.destination);
        nextTime = Math.max(nextTime, playback.currentTime + 0.02);
        source.start(nextTime);
        nextTime += buffer.duration;
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          if (!sources.size) setState((s) => (s === "parle" ? "écoute" : s));
        };
        setState("parle");
      }
      if (content.turnComplete) say("Tamilya", "\n");
    };
  }

  const median = percentile(latencies, 50);
  const running = state === "connexion" || state === "écoute" || state === "parle";
  const label: Record<State, string> = {
    off: "Touche le bouton pour parler à Tamilya",
    connexion: "Connexion…",
    écoute: "Je t'écoute…",
    parle: "Je parle (coupe-moi quand tu veux)",
    erreur: "Ça n'a pas marché, regarde le journal en bas",
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-center text-lg font-medium">{label[state]}</p>
      <button
        type="button"
        onClick={() => (running ? stopRef.current?.() : void start())}
        className={`h-32 w-32 rounded-full text-base font-semibold shadow-lg transition active:scale-95 ${
          running ? "bg-danger text-danger-fg" : "bg-accent text-white"
        } ${state === "parle" ? "animate-pulse" : ""}`}
      >
        {running ? "Arrêter" : "Parler"}
      </button>

      <div className="w-full max-w-xl space-y-2">
        {lines.map((line, i) => (
          <p key={i} className={line.who === "toi" ? "text-right text-fg-muted" : "text-left"}>
            <span className="text-xs font-semibold uppercase">{line.who}</span>
            <br />
            {line.text.trim()}
          </p>
        ))}
      </div>

      <section className="w-full max-w-xl rounded-xl border border-border bg-bg p-4 text-sm">
        <p className="font-semibold">Temps entre la fin de ta phrase et la voix de Tamilya</p>
        <p className="mt-1 text-fg-muted tabular-nums">
          {latencies.length
            ? `Médiane ${(median! / 1000).toFixed(1)} s · P90 ${(percentile(latencies, 90)! / 1000).toFixed(1)} s · ${latencies.length} échange(s) · dernier ${(latencies.at(-1)! / 1000).toFixed(1)} s`
            : "Pas encore mesuré."}
        </p>
        <p className="mt-3 font-semibold">Journal</p>
        <p className="mt-1 text-xs text-fg-muted tabular-nums">{log.join(" · ") || "—"}</p>
      </section>
    </div>
  );
}
