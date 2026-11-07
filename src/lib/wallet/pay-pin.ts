/**
 * Code de paiement demandé avant chaque paiement fait au doigt (repas, barge,
 * examen du code). Affiché par <PayPinHost /> (layout racine).
 *
 * Le serveur vérifie le code (/api/wallet/pin, « tap ») et donne l'accord pour
 * UN paiement : les routes de paiement refusent sans lui (src/lib/wallet/pay-auth.ts).
 * Quand Tamilya paie à la voix, le code a déjà été donné (voice-pay.ts) : rien
 * n'est redemandé.
 */

import { payAuthorized } from "@/lib/voice-live/voice-pay";

export type PayPinStep = "idle" | "loading" | "nopin" | "pin" | "checking";
export type PayPinState = { step: PayPinStep; label: string; typed: number; error: string | null };

export const PAY_PIN_IDLE: PayPinState = { step: "idle", label: "", typed: 0, error: null };

let state: PayPinState = PAY_PIN_IDLE;
let digits = "";
let resolve: ((ok: boolean) => void) | null = null;
const listeners = new Set<() => void>();

function update(next: Partial<PayPinState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const subscribePayPin = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPayPin = () => state;

function finish(ok: boolean) {
  const done = resolve;
  resolve = null;
  digits = "";
  update(PAY_PIN_IDLE);
  done?.(ok);
}

/** Demande le code ; vrai quand il est juste (le paiement peut partir), faux si annulé. */
export async function askPayPin(label: string): Promise<boolean> {
  if (payAuthorized()) return true;
  // Une demande déjà ouverte est annulée : une seule fenêtre à la fois.
  if (resolve) finish(false);
  const answer = new Promise<boolean>((r) => (resolve = r));
  digits = "";
  update({ step: "loading", label, typed: 0, error: null });
  const known = (await fetch("/api/wallet/pin", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { hasPin?: boolean } | null;
  if (state.step !== "loading") return answer;
  if (!known) update({ step: "pin", error: "Connexion impossible : vérifie ton réseau." });
  else update({ step: known.hasPin ? "pin" : "nopin" });
  return answer;
}

export const cancelPayPin = () => finish(false);

export function typePayDigit(digit: string) {
  if (state.step !== "pin" || !/^\d$/.test(digit) || digits.length >= 4) return;
  digits += digit;
  update({ typed: digits.length, error: null });
  if (digits.length === 4) void submit();
}

export function erasePayDigit() {
  if (state.step !== "pin") return;
  digits = digits.slice(0, -1);
  update({ typed: digits.length });
}

async function submit() {
  const pin = digits;
  digits = "";
  update({ step: "checking" });
  const response = await fetch("/api/wallet/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", pin, tap: true }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; reason?: string } | null;
  if (state.step !== "checking") return;
  if (body?.ok) return finish(true);
  if (body?.reason === "none") return update({ step: "nopin", typed: 0, error: null });
  update({ step: "pin", typed: 0, error: body?.error ?? "Le code n'a pas pu être vérifié." });
}
