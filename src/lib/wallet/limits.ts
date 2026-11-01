/** Règles du portefeuille, partagées entre la page et le serveur. Montants en centimes. */
export const WALLET_MIN_TOPUP = 500;
export const WALLET_MAX_TOPUP = 15_000;
/** Solde maximal : on ne garde jamais plus de 150 € à l'utilisateur (perte limitée en cas de vol du compte). */
export const WALLET_MAX_BALANCE = 15_000;
export const WALLET_PRESETS = [500, 1_000, 2_000, 5_000, 10_000] as const;

export type WalletTransaction = {
  id: string;
  kind: "topup" | "payment" | "refund";
  amountCents: number;
  status: "pending" | "succeeded" | "failed";
  label: string;
  method: string | null;
  createdAt: string;
};

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** 1250 → « 12,50 € » ; 1000 → « 10 € ». */
export function formatEuros(cents: number): string {
  const text = euros.format(cents / 100);
  return cents % 100 === 0 ? text.replace(/[,.]00(?=\s?€)/, "") : text;
}

/** « 12,5 » ou « 12.50 » saisi par l'utilisateur → 1250 ; null si illisible. */
export function parseEuros(value: string): number | null {
  const clean = value.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Message d'erreur si la recharge n'est pas permise, sinon null. */
export function topupError(amountCents: number, balanceCents: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents < WALLET_MIN_TOPUP) {
    return `La recharge minimale est de ${formatEuros(WALLET_MIN_TOPUP)}.`;
  }
  if (amountCents > WALLET_MAX_TOPUP) return `La recharge maximale est de ${formatEuros(WALLET_MAX_TOPUP)}.`;
  const room = WALLET_MAX_BALANCE - balanceCents;
  if (amountCents > room) {
    return room < WALLET_MIN_TOPUP
      ? `Ton solde est déjà au maximum (${formatEuros(WALLET_MAX_BALANCE)}).`
      : `Ton solde ne peut pas dépasser ${formatEuros(WALLET_MAX_BALANCE)} : ${formatEuros(room)} au plus.`;
  }
  return null;
}
