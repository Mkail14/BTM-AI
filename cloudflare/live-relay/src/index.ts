/**
 * Relais du vocal en direct de Tamilya (Cloudflare Worker).
 *
 * Le téléphone ouvre une connexion WebSocket ici avec un ticket signé par le
 * site (valable 60 s). Le relais vérifie le ticket, demande au site les
 * consignes de Tamilya pour cette conversation, puis ouvre la Live API de
 * Gemini avec la clé gardée en secret ici (le téléphone ne la voit jamais).
 * Ensuite il passe les messages dans les deux sens : la voix de la personne
 * vers Gemini, la voix de Tamilya vers le téléphone, au fil de l'eau.
 *
 * Pourquoi un relais : Vercel ne garde pas de connexion ouverte, et Google
 * refuse les connexions qui viennent de Mayotte.
 *
 * Secrets (wrangler secret put) : GEMINI_API_KEY, LIVE_TICKET_SECRET.
 * Variable (wrangler.toml) : SITE_URL.
 */

export interface Env {
  GEMINI_API_KEY: string;
  LIVE_TICKET_SECRET: string;
  /** Essais de l'équipe sans passer par le site (ticket signé avec ce secret, consignes courtes). */
  LIVE_TEST_SECRET?: string;
  SITE_URL: string;
}

const GEMINI_LIVE_URL =
  "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** Une conversation vocale dure au plus ce temps (garde-fou de consommation). */
const MAX_SESSION_MS = 15 * 60_000;

/** Messages du téléphone autorisés vers Gemini : la voix, et rien d'autre (pas de nouvelles consignes). */
const ALLOWED_FROM_PHONE = new Set(["realtimeInput"]);

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

/** Ticket « charge.signature » (HMAC-SHA256) : renvoie la charge si la signature est bonne et le ticket encore valable. */
async function readTicket(ticket: string, secret: string): Promise<{ sid: string; exp: number } | null> {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(payload));
  if (!valid) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { sid?: unknown; exp?: unknown };
    if (typeof data.sid !== "string" || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { sid: data.sid, exp: data.exp };
  } catch {
    return null;
  }
}

const bytesToBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Même format que le site (src/lib/voice-live/ticket.ts). */
async function signTicket(data: object, secret: string): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(data)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("Relais vocal de Tamilya", { status: 200 });
    if (url.pathname !== "/live") return new Response("Introuvable", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket attendu", { status: 426 });

    const ticket = url.searchParams.get("ticket") ?? "";
    const testTicket = url.searchParams.get("test") ?? "";
    let setup: { setup: { model?: string } };
    const isTest = Boolean(testTicket && env.LIVE_TEST_SECRET && (await readTicket(testTicket, env.LIVE_TEST_SECRET)));
    if (isTest && url.searchParams.get("real")) {
      // Essai avec les vraies consignes du site (compte fictif « essai », mode maître).
      const siteTicket = await signTicket({ sid: crypto.randomUUID(), uid: "essai", admin: true, exp: Date.now() + 60_000 }, env.LIVE_TICKET_SECRET);
      const response = await fetch(`${env.SITE_URL}/api/voice/live/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: siteTicket }) });
      if (!response.ok) return new Response(`Consignes indisponibles (${response.status})`, { status: 502 });
      setup = (await response.json()) as { setup: { model?: string } };
    } else if (isTest) {
      // Essai de l'équipe : consignes courtes, modèle au choix.
      setup = {
        setup: {
          model: url.searchParams.get("model") ?? "models/gemini-2.5-flash-native-audio-latest",
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Leda" } } } },
          systemInstruction: { parts: [{ text: "Tu es Tamilya, une jeune femme de Mayotte. Réponds en français, en une ou deux phrases courtes." }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          ...(url.searchParams.get("silence")
            ? { realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: Number(url.searchParams.get("silence")) } } }
            : {}),
        } as { model?: string },
      };
    } else {
      if (!(await readTicket(ticket, env.LIVE_TICKET_SECRET))) return new Response("Ticket refusé", { status: 401 });
      // Consignes de Tamilya pour cette conversation, préparées par le site (personnalité, shimaoré…).
      const setupResponse = await fetch(`${env.SITE_URL}/api/voice/live/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      if (!setupResponse.ok) return new Response("Consignes indisponibles", { status: 502 });
      setup = (await setupResponse.json()) as { setup: { model?: string } };
    }
    console.log(`session : modèle ${setup.setup?.model}`);

    // Connexion à Gemini (Live API) depuis Cloudflare.
    const upstreamResponse = await fetch(`${GEMINI_LIVE_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      headers: { Upgrade: "websocket" },
    });
    const gemini = upstreamResponse.webSocket;
    if (!gemini) return new Response(`Gemini injoignable (${upstreamResponse.status})`, { status: 502 });
    gemini.accept();
    // Réflexion du modèle coupée : avec les longues consignes de Tamilya, il « pensait » 5 s ou
    // plus avant de parler (parfois jamais) ; coupée, il répond en 2 à 2,5 s (mesuré). Essai : think=N.
    const think = (isTest ? url.searchParams.get("think") : null) ?? "0";
    {
      const config = ((setup.setup as Record<string, unknown>).generationConfig ??= {}) as Record<string, unknown>;
      config.thinkingConfig = { thinkingBudget: Number(think) };
    }
    // Essai : détection de fin de parole réglée (silence=ms, sens=high|low).
    // 0,4 s de silence suffit (mesuré : ~0,3 s de gagné sur 0,6 s, sans couper les petites pauses).
    const silence = (isTest ? url.searchParams.get("silence") : null) ?? "400";
    const sensitivity = isTest ? url.searchParams.get("sens") : null;
    if (silence || sensitivity) {
      (setup.setup as Record<string, unknown>).realtimeInputConfig = {
        automaticActivityDetection: {
          ...(silence ? { silenceDurationMs: Number(silence) } : {}),
          ...(sensitivity ? { endOfSpeechSensitivity: sensitivity === "high" ? "END_SENSITIVITY_HIGH" : "END_SENSITIVITY_LOW" } : {}),
        },
      };
    }
    const setupText = JSON.stringify({ setup: setup.setup });
    console.log(`consignes : ${setupText.length} caractères`);
    gemini.send(setupText);

    const pair = new WebSocketPair();
    const [client, phone] = [pair[0], pair[1]];
    phone.accept();

    let closed = false;
    const closeBoth = (code = 1000, reason = "fin") => {
      if (closed) return;
      closed = true;
      try {
        phone.close(code, reason.slice(0, 120));
      } catch {}
      try {
        gemini.close(1000, "fin");
      } catch {}
    };
    const timer = setTimeout(() => closeBoth(1000, "durée maximale atteinte"), MAX_SESSION_MS);

    // Téléphone → Gemini : seulement la voix (realtimeInput).
    phone.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as Record<string, unknown>;
        if (Object.keys(message).every((key) => ALLOWED_FROM_PHONE.has(key))) {
          // Niveau du son reçu (paquets 1, 10, 30, 60) : un son vide (silence) se voit ici.
          if ([0, 9, 29, 59].includes(fromPhone)) {
            const data = (message.realtimeInput as { audio?: { data?: string } })?.audio?.data ?? "";
            const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
            const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
            let sum = 0;
            for (const v of pcm) sum += v * v;
            console.log(`téléphone → paquet ${fromPhone + 1} : ${pcm.length} échantillons, niveau ${Math.round(Math.sqrt(sum / (pcm.length || 1)))}`);
          }
          fromPhone++;
          gemini.send(event.data);
        }
      } catch {}
    });
    // Gemini → téléphone : tout (voix, transcriptions, coupures), tel quel.
    let fromGemini = 0;
    let fromPhone = 0;
    // Gemini envoie ses messages en binaire (Blob ou ArrayBuffer) : convertis en texte, dans l'ordre
    // d'arrivée (une file de promesses), pour que les morceaux de voix ne se mélangent pas.
    const toText = async (data: unknown): Promise<string> => {
      if (typeof data === "string") return data;
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new TextDecoder().decode(data as ArrayBuffer);
      if (data && typeof (data as Blob).text === "function") return (data as Blob).text();
      return String(data);
    };
    let queue: Promise<void> = Promise.resolve();
    gemini.addEventListener("message", (event) => {
      queue = queue.then(async () => {
      const text = await toText(event.data);
      // Journal : les premiers messages de Gemini (sans le son), pour comprendre un blocage.
      if (fromGemini++ < 5) console.log(`gemini → ${text.replace(/"data":"[^"]{40,}"/g, "\"data\":\"…\"").slice(0, 300)}`);
      try {
        phone.send(text);
      } catch {}
      }).catch((error) => console.log(`relais : message illisible (${error})`));
    });
    phone.addEventListener("close", () => {
      clearTimeout(timer);
      closeBoth();
    });
    gemini.addEventListener("close", (event) => {
      console.log(`gemini fermé : ${event.code} ${event.reason} (reçus ${fromGemini}, envoyés ${fromPhone})`);
      clearTimeout(timer);
      closeBoth(event.code === 1000 ? 1000 : 1011, event.reason || "Gemini a fermé");
    });
    phone.addEventListener("error", () => closeBoth(1011, "erreur téléphone"));
    // Erreur : on attend la fermeture, qui donne la raison de Google (transmise au téléphone).
    gemini.addEventListener("error", (event) => {
      console.log(`gemini erreur : ${(event as ErrorEvent).message ?? "?"}`);
      setTimeout(() => closeBoth(1011, "erreur Gemini"), 2_000);
    });

    return new Response(null, { status: 101, webSocket: client });
  },
};
