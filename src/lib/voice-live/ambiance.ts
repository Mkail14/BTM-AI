/**
 * Bruit autour de la personne, gardé à part de sa voix : Tamilya écoute la
 * personne sans le bruit (porte + Silero), mais peut dire s'il y en a, s'il
 * est fort et ce que c'est (ventilateur, route, travaux, cris…).
 *
 * Le navigateur garde les 5 dernières secondes où personne ne parlait (ni la
 * personne ni Tamilya) ; à la demande, ce son part à Gemini qui le reconnaît.
 */

/** 5 s de bruit au plus (paquets de 100 ms) pour mesurer le niveau. */
const KEEP_PACKETS = 50;
/** Moins d'1 s de bruit : trop court pour reconnaître quoi que ce soit. */
const MIN_PACKETS = 10;
/**
 * Envoyé à Gemini : les 2,5 dernières secondes à 8 kHz (≈ 40 Ko au lieu de
 * 160). Le 2026-11-07, 5 s à 16 kHz ne remontaient pas en 40 s depuis Mayotte
 * pendant l'appel (le micro occupe déjà l'envoi) : Tamilya restait muette.
 */
const SEND_PACKETS = 25;
const SEND_RATE = 8000;
/** Au-delà, Tamilya répond avec le seul niveau mesuré : elle ne reste jamais muette à attendre. */
const ANSWER_MS = 3000;

const rms = (samples: Float32Array) => {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / (samples.length || 1));
};

/** Niveau du bruit en mots (après la réduction de bruit du téléphone, donc plus bas que dans la pièce). */
export function noiseWords(level: number): string {
  if (level < 0.004) return "calme, presque aucun bruit";
  if (level < 0.015) return "un léger bruit de fond";
  if (level < 0.05) return "un bruit de fond net";
  return "beaucoup de bruit";
}

export function createAmbiance() {
  let packets: Float32Array[] = [];
  return {
    /** À appeler sur chaque paquet où personne ne parle. */
    keep(samples: Float32Array) {
      packets.push(samples);
      if (packets.length > KEEP_PACKETS) packets = packets.slice(-KEEP_PACKETS);
    },
    /** Niveau moyen du bruit gardé, ou null s'il n'y en a pas assez. */
    level(): number | null {
      if (packets.length < MIN_PACKETS) return null;
      return packets.reduce((sum, packet) => sum + rms(packet), 0) / packets.length;
    },
    /** Les dernières secondes de bruit, en WAV 8 kHz mono (pour Gemini), ou null s'il n'y en a pas assez. */
    wav(): Uint8Array | null {
      if (packets.length < MIN_PACKETS) return null;
      // 16 kHz → 8 kHz : moyenne de deux échantillons (assez pour reconnaître un bruit).
      const recent = packets.slice(-SEND_PACKETS).map((packet) => Float32Array.from({ length: packet.length >> 1 }, (_, i) => (packet[2 * i] + packet[2 * i + 1]) / 2));
      const length = recent.reduce((sum, packet) => sum + packet.length, 0);
      const out = new Uint8Array(44 + length * 2);
      const view = new DataView(out.buffer);
      const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      ascii(0, "RIFF");
      view.setUint32(4, 36 + length * 2, true);
      ascii(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, SEND_RATE, true);
      view.setUint32(28, SEND_RATE * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      ascii(36, "data");
      view.setUint32(40, length * 2, true);
      let at = 44;
      for (const packet of recent)
        for (const value of packet) {
          view.setInt16(at, Math.max(-32768, Math.min(32767, Math.round(value * 32767))), true);
          at += 2;
        }
      return out;
    },
  };
}

export type Ambiance = ReturnType<typeof createAmbiance>;

/** Réponse du bouton « bruit_ambiant » pour Tamilya. */
export async function describeAmbiance(ambiance: Ambiance, signal: AbortSignal): Promise<string> {
  const level = ambiance.level();
  const wav = ambiance.wav();
  if (level === null || !wav) return "Tu n'as pas encore assez entendu le fond sonore (il faut au moins une seconde sans que personne parle) : dis-le simplement.";
  const amount = noiseWords(level);
  let heard = "";
  // Annulé par Gemini, ou trop long : on arrête d'attendre (le niveau suffit pour répondre).
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ANSWER_MS);
  const cancel = () => stop.abort();
  signal.addEventListener("abort", cancel);
  try {
    let binary = "";
    for (let i = 0; i < wav.length; i += 0x8000) binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
    const response = await fetch("/api/voice/live/ambiance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: btoa(binary) }),
      signal: stop.signal,
    });
    const data = (await response.json().catch(() => null)) as { heard?: string } | null;
    heard = data?.heard ?? "";
  } catch {
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
  return [
    `Niveau du bruit autour de la personne : ${amount}.`,
    heard ? `Ce qu'on y reconnaît : ${heard}` : "Impossible de reconnaître la nature du bruit pour l'instant.",
    "Ce bruit est filtré : tu entends bien la personne malgré lui. Réponds en une ou deux phrases naturelles ; si tu n'es pas sûre de ce que c'est, dis-le.",
  ].join("\n");
}
