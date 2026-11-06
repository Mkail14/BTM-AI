/**
 * Paiement à la voix (navigateur). Tamilya ne touche « Payer » qu'après :
 * 1. l'avertissement affiché à l'écran, accepté par la personne (à la voix ou au doigt)
 *    une seule fois : l'autorisation est gardée sur le compte, puis plus jamais redemandée ;
 * 2. son code à 4 chiffres, vérifié par le serveur (/api/wallet/pin).
 * Ensuite, pendant 2 minutes, elle peut toucher les boutons de paiement
 * (plusieurs parties d'un tableau combiné, par exemple).
 *
 * Le code n'est gardé que le temps de la vérification, dans cette page : il
 * n'est ni renvoyé à Gemini, ni enregistré dans la conversation (voir takePinTurn).
 */

export type PayStep = "idle" | "nopin" | "consent" | "pin" | "checking";
export type PayState = { step: PayStep; label: string; typed: number; error: string | null };

/** Durée de l'autorisation après un code juste. */
const AUTHORIZED_MS = 2 * 60_000;

let state: PayState = { step: "idle", label: "", typed: 0, error: null };
let digits = "";
let until = 0;
let pending: (() => Promise<string>) | null = null;
/** Un code a été demandé ou dit pendant cet échange : ce que la personne a dit n'est pas enregistré. */
let pinTurn = false;
const listeners = new Set<() => void>();

function update(next: Partial<PayState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const subscribePay = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPay = () => state;
export const payAuthorized = () => Date.now() < until;

/** À appeler avant d'enregistrer un échange : vrai si un code a pu y être dit. */
export function takePinTurn(): boolean {
  const was = pinTurn || state.step === "pin" || state.step === "checking";
  pinTurn = false;
  return was;
}

/** Tamilya veut payer : ouvre l'avertissement (ou demande de créer un code). */
export async function requestPayment(label: string, run: () => Promise<string>): Promise<string> {
  pending = run;
  digits = "";
  update({ step: "checking", label, typed: 0, error: null });
  const known = (await fetch("/api/wallet/pin", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { hasPin?: boolean; consented?: boolean } | null;
  if (!known) {
    update({ step: "idle" });
    pending = null;
    return "Le paiement à la voix ne répond pas : la personne touche elle-même le bouton.";
  }
  if (!known.hasPin) {
    update({ step: "nopin" });
    return "Pas de code de paiement sur ce compte : sans code, tu ne peux pas payer à sa place. Dis-lui de le créer dans les paramètres (rubrique Tamilya), ou de toucher elle-même le bouton.";
  }
  // L'autorisation se donne une seule fois : déjà donnée, on passe au code.
  if (known.consented) {
    pinTurn = true;
    update({ step: "pin" });
    return "Elle a déjà autorisé une fois pour toutes : ne lui relis pas l'avertissement. Dis le montant, puis demande-lui son code à 4 chiffres : elle peut le dire ou le taper. S'il le dit, appelle saisir_code. Ne répète jamais le code, ne le dis pas, ne l'écris nulle part.";
  }
  update({ step: "consent" });
  return "L'avertissement est affiché. Lis-le-lui en une phrase : si elle t'autorise à payer à sa place, c'est sous sa responsabilité, et elle doit vérifier le montant. Si elle dit oui, appelle autoriser_paiement. Sinon, appelle annuler_paiement.";
}

export function acceptPayment(): string {
  if (state.step !== "consent") return state.step === "pin" ? "Déjà autorisé : demande-lui son code." : "Aucun paiement en attente.";
  pinTurn = true;
  update({ step: "pin", error: null });
  // Gardée sur le compte : l'avertissement ne sera plus jamais réaffiché.
  void fetch("/api/wallet/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent" }) }).catch(() => null);
  return "Demande-lui son code à 4 chiffres : elle peut le dire ou le taper. S'il le dit, appelle saisir_code. Ne répète jamais le code, ne le dis pas, ne l'écris nulle part.";
}

export function cancelPayment(): string {
  pending = null;
  digits = "";
  update({ step: "idle", typed: 0, error: null });
  return "Paiement annulé : rien n'a été payé.";
}

/** Un chiffre tapé au doigt (le clavier de l'écran). */
export function typeDigit(digit: string) {
  if (state.step !== "pin" || !/^\d$/.test(digit) || digits.length >= 4) return;
  digits += digit;
  update({ typed: digits.length, error: null });
  if (digits.length === 4) void submit();
}

export function eraseDigit() {
  if (state.step !== "pin") return;
  digits = digits.slice(0, -1);
  update({ typed: digits.length });
}

/** Le code dit à la voix : Tamilya le saisit d'un coup. */
export async function enterPin(spoken: string): Promise<string> {
  pinTurn = true;
  if (state.step !== "pin") return state.step === "consent" ? "Elle n'a pas encore autorisé : demande-lui d'abord." : "Aucun paiement en attente.";
  const typed = spoken.replace(/\D/g, "");
  if (typed.length !== 4) return "Il faut exactement 4 chiffres : redemande-lui son code.";
  digits = typed;
  update({ typed: 4 });
  return submit();
}

async function submit(): Promise<string> {
  const pin = digits;
  digits = "";
  update({ step: "checking", typed: 4 });
  const response = await fetch("/api/wallet/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", pin }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; reason?: string } | null;
  if (!body?.ok) {
    const locked = body?.reason === "locked" || body?.reason === "none";
    update({ step: locked ? "idle" : "pin", typed: 0, error: body?.error ?? "Le code n'a pas pu être vérifié." });
    if (locked) pending = null;
    return `${body?.error ?? "Le code n'a pas pu être vérifié."} Ne répète pas le code.`;
  }
  until = Date.now() + AUTHORIZED_MS;
  update({ step: "idle", typed: 0, error: null });
  const run = pending;
  pending = null;
  return run ? `Code juste, paiement lancé.\n${await run()}` : "Code juste.";
}
