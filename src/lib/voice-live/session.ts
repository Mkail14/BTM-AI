/**
 * Vocal en direct (navigateur) : micro en continu vers Gemini Live par le
 * relais Cloudflare, voix de Tamilya jouée au fil de l'eau, coupure quand la
 * personne reprend la parole. Utilisé par le globe de la conversation, la page
 * /voix et la page d'essai /voix-direct.
 */

export type LiveState = "connexion" | "écoute" | "parle";

export type LiveCallbacks = {
  onState: (state: LiveState) => void;
  /** Morceau de ce que dit la personne (transcription). */
  onUserText: (text: string) => void;
  /** Morceau de ce que dit Tamilya (transcription). */
  onTamilyaText: (text: string) => void;
  /** Tour terminé : Tamilya a fini sa réponse. */
  onTurnComplete: () => void;
  /** Temps entre la fin de la phrase de la personne et la première voix de Tamilya. */
  onLatency?: (ms: number) => void;
  /** Journal (diagnostic). */
  onNote?: (text: string) => void;
  /** Tamilya actionne un bouton (réservation, repas…) : renvoie ce qu'il faut lui dire en retour. */
  onToolCall?: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<string>;
  /** Talkie-walkie dès l'ouverture : Tamilya n'écoute que pendant l'appui sur le bouton. */
  pushToTalk?: boolean;
  /** Conversation fermée (normalement ou sur erreur, avec la raison). */
  onClose: (error: string | null) => void;
};

export type LiveSession = {
  stop: () => void;
  /** Coupe la voix de Tamilya (toucher du globe) : elle s'arrête, l'écoute continue. */
  cut: () => void;
  /**
   * Talkie-walkie : appuyer coupe Tamilya et ouvre le micro ; relâcher dit à
   * Gemini « j'ai fini » (il répond sans attendre le silence). Dès le premier
   * appui, le micro n'envoie plus rien entre deux appuis.
   */
  press: () => void;
  release: () => void;
};

/**
 * Capture du micro, à la fréquence normale de l'appareil (souvent 48 kHz),
 * ramenée ici à 16 kHz en faisant la moyenne des échantillons de chaque
 * tranche (filtre simple : pas de sifflement ni de voix déformée). Paquets de 100 ms.
 */
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = []; this.ratio = sampleRate / 16000; this.pos = 0; this.sum = 0; this.count = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count += 1;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        this.buffer.push(this.sum / this.count);
        this.sum = 0;
        this.count = 0;
      }
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
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] };
  /** La personne a repris la parole : Gemini renonce à ces actions. */
  toolCallCancellation?: { ids?: string[] };
  error?: { message?: string };
};

export const isLiveVoiceSupported = () =>
  typeof window !== "undefined" && typeof AudioWorkletNode !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

/** À appeler au toucher (obligatoire sur iPhone pour le micro et le son). */
export async function openLiveSession(callbacks: LiveCallbacks): Promise<LiveSession | null> {
  const note = (text: string) => callbacks.onNote?.(text);
  callbacks.onState("connexion");
  const playback = new AudioContext();
  // Fréquence normale de l'appareil : sur iPhone, un micro forcé à 16 kHz arrivait
  // déformé (Gemini entendait « toutes les langues sauf le français »).
  const capture = new AudioContext();
  void playback.resume();
  void capture.resume();
  const closeAudio = () => {
    void capture.close().catch(() => {});
    void playback.close().catch(() => {});
  };

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    closeAudio();
    callbacks.onClose("Micro refusé : autorise le micro pour ce site, puis réessaie.");
    return null;
  }

  const sources = new Set<AudioBufferSourceNode>();
  let nextTime = 0;
  let speechEndedAt: number | null = null;
  let speaking = false;
  let quietSince = 0;
  let ready = false;
  let closed = false;
  /** Talkie-walkie : le micro n'envoie que pendant l'appui sur le bouton (choix de l'écran vocal). */
  let pushToTalk = callbacks.pushToTalk ?? false;
  let holding = false;
  let socket: WebSocket | null = null;
  /** Reprise de la conversation chez Google après une coupure réseau (même contexte). */
  let resumeHandle: string | null = null;
  let reconnects = 0;
  /** Actions en cours, par identifiant Gemini : annulables. */
  const running = new Map<string, AbortController>();

  const cut = () => {
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    sources.clear();
    nextTime = 0;
  };

  const finish = (error: string | null) => {
    if (closed) return;
    closed = true;
    try {
      socket?.close();
    } catch {}
    cut();
    mic.getTracks().forEach((t) => t.stop());
    closeAudio();
    callbacks.onClose(error);
  };

  const send = (message: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  // Micro → Gemini. Filtre « passe-haut » : coupe les bruits graves (travaux, moteurs, vent)
  // avant l'envoi, en plus de la réduction de bruit du téléphone.
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await capture.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(capture, "capture");
  const lowCut = capture.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = 120;
  capture.createMediaStreamSource(mic).connect(lowCut).connect(node);
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
    if (ready && (!pushToTalk || holding)) send({ realtimeInput: { audio: { data: toBase64Pcm(samples), mimeType: "audio/pcm;rate=16000" } } });
  };

  const onMessage = async (event: MessageEvent) => {
    const raw = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
    let message: GeminiMessage;
    try {
      message = JSON.parse(raw) as GeminiMessage;
    } catch {
      return;
    }
    if (message.setupComplete) {
      ready = true;
      reconnects = 0;
      note("Gemini prêt");
      callbacks.onState("écoute");
    }
    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      resumeHandle = message.sessionResumptionUpdate.newHandle;
    }
    if (message.error) note(`Gemini : ${message.error.message ?? "erreur"}`);
    // Annulation : elle arrive pendant que l'action attend (flash, chargement), qui s'arrête avant de cliquer.
    for (const id of message.toolCallCancellation?.ids ?? []) {
      running.get(id)?.abort();
      note("action annulée");
    }
    // Boutons actionnés par Tamilya : la page agit, puis répond à Gemini pour qu'il continue.
    for (const call of message.toolCall?.functionCalls ?? []) {
      if (!call.name) continue;
      note(`bouton ${call.name}`);
      const control = new AbortController();
      if (call.id) running.set(call.id, control);
      const result = await (
        callbacks.onToolCall?.(call.name, call.args ?? {}, control.signal) ?? Promise.resolve("Bouton indisponible.")
      )
        .catch(() => "Le bouton n'a pas marché : dis-le à la personne.")
        .finally(() => {
          if (call.id) running.delete(call.id);
        });
      // Gemini n'attend plus de réponse pour une action annulée.
      if (!control.signal.aborted) {
        send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } });
      }
    }
    const content = message.serverContent;
    if (!content) return;
    if (content.interrupted) {
      cut();
      note("coupée par toi");
      callbacks.onState("écoute");
    }
    if (content.inputTranscription?.text) callbacks.onUserText(content.inputTranscription.text);
    if (content.outputTranscription?.text) callbacks.onTamilyaText(content.outputTranscription.text);
    for (const part of content.modelTurn?.parts ?? []) {
      const audio = part.inlineData;
      if (!audio?.data || !audio.mimeType?.startsWith("audio/pcm")) continue;
      if (speechEndedAt !== null) {
        callbacks.onLatency?.(Math.round(performance.now() - speechEndedAt));
        speechEndedAt = null;
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
        if (!sources.size && !closed) callbacks.onState("écoute");
      };
      callbacks.onState("parle");
    }
    if (content.turnComplete) callbacks.onTurnComplete();
  };

  /**
   * Connexion (et reconnexion) au relais. Connexion faible à Mayotte : si elle
   * saute, on se reconnecte tout seul jusqu'à 3 fois, et Google reprend la même
   * conversation (poignée de reprise), sans rien perdre.
   */
  const connect = async (): Promise<boolean> => {
    const session = (await fetch("/api/voice/live/session", { method: "POST" })
      .then((r) => r.json())
      .catch(() => null)) as { url?: string; error?: string } | null;
    if (!session?.url) {
      if (!reconnects) finish(session?.error ?? "Le vocal en direct ne répond pas. Réessaie dans un instant.");
      else finish("La connexion est trop faible en ce moment. Touche le globe pour réessayer.");
      return false;
    }
    if (closed) return false;
    ready = false;
    const opened = new WebSocket(resumeHandle ? `${session.url}&resume=${encodeURIComponent(resumeHandle)}` : session.url);
    socket = opened;
    opened.onopen = () => note(reconnects ? "reconnectée" : "relais connecté");
    opened.onerror = () => note("erreur de connexion");
    opened.onmessage = (event) => void onMessage(event);
    opened.onclose = (event) => {
      if (closed || socket !== opened) return;
      note(`fermé (${event.code}${event.reason ? ` : ${event.reason}` : ""})`);
      if (event.code === 1000) return finish(null);
      // Coupure : nouvel essai, de plus en plus espacé.
      if (reconnects < 3) {
        reconnects += 1;
        ready = false;
        cut();
        callbacks.onState("connexion");
        note(`reconnexion ${reconnects}/3`);
        setTimeout(() => void connect(), 600 * reconnects);
        return;
      }
      finish(`La connexion est trop faible en ce moment (${event.reason || event.code}). Touche le globe pour réessayer.`);
    };
    return true;
  };
  if (!(await connect())) return null;

  const press = () => {
    pushToTalk = true;
    holding = true;
    cut();
    callbacks.onState("écoute");
  };
  const release = () => {
    if (!holding) return;
    holding = false;
    // Fin de parole tout de suite : speechEndedAt sert au chronométrage.
    speechEndedAt = performance.now();
    send({ realtimeInput: { audioStreamEnd: true } });
  };

  return { stop: () => finish(null), cut, press, release };
}
