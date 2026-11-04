import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Ticket d'entrée du vocal en direct : le site le signe pour un compte
 * connecté, le relais Cloudflare le vérifie (même secret LIVE_TICKET_SECRET)
 * avant d'ouvrir Gemini, puis le site le relit pour préparer les consignes.
 * Format « charge.signature » en base64url, valable 60 secondes.
 */

export type LiveTicket = { sid: string; uid: string; admin: boolean; exp: number };

const TICKET_MS = 60_000;

export const liveTicketSecret = () => process.env.LIVE_TICKET_SECRET?.trim() || null;
export const liveRelayUrl = () => process.env.LIVE_RELAY_URL?.trim().replace(/\/+$/, "") || null;

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signLiveTicket(user: { id: string; isAdmin: boolean }, secret: string, now = Date.now()): string {
  const ticket: LiveTicket = { sid: randomUUID(), uid: user.id, admin: user.isAdmin, exp: now + TICKET_MS };
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readLiveTicket(ticket: string, secret: string, now = Date.now()): LiveTicket | null {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as LiveTicket;
    if (typeof data.uid !== "string" || typeof data.exp !== "number" || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}
