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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("Relais vocal de Tamilya", { status: 200 });
    if (url.pathname !== "/live") return new Response("Introuvable", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket attendu", { status: 426 });

    const ticket = url.searchParams.get("ticket") ?? "";
    if (!(await readTicket(ticket, env.LIVE_TICKET_SECRET))) return new Response("Ticket refusé", { status: 401 });

    // Consignes de Tamilya pour cette conversation, préparées par le site (personnalité, shimaoré…).
    const setupResponse = await fetch(`${env.SITE_URL}/api/voice/live/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    if (!setupResponse.ok) return new Response("Consignes indisponibles", { status: 502 });
    const setup = (await setupResponse.json()) as { setup: unknown };

    // Connexion à Gemini (Live API) depuis Cloudflare.
    const upstreamResponse = await fetch(`${GEMINI_LIVE_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      headers: { Upgrade: "websocket" },
    });
    const gemini = upstreamResponse.webSocket;
    if (!gemini) return new Response(`Gemini injoignable (${upstreamResponse.status})`, { status: 502 });
    gemini.accept();
    gemini.send(JSON.stringify({ setup: setup.setup }));

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
        if (Object.keys(message).every((key) => ALLOWED_FROM_PHONE.has(key))) gemini.send(event.data);
      } catch {}
    });
    // Gemini → téléphone : tout (voix, transcriptions, coupures), tel quel.
    gemini.addEventListener("message", (event) => {
      try {
        phone.send(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer));
      } catch {}
    });
    phone.addEventListener("close", () => {
      clearTimeout(timer);
      closeBoth();
    });
    gemini.addEventListener("close", (event) => {
      clearTimeout(timer);
      closeBoth(event.code === 1000 ? 1000 : 1011, event.reason || "Gemini a fermé");
    });
    phone.addEventListener("error", () => closeBoth(1011, "erreur téléphone"));
    gemini.addEventListener("error", () => closeBoth(1011, "erreur Gemini"));

    return new Response(null, { status: 101, webSocket: client });
  },
};
