import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/auth/session";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { canOrderFood } from "@/lib/food/access";
import { FOOD_DEMO_BALANCE_CENTS } from "@/lib/food/catalog";
import { signJson, verifyJson } from "@/lib/security/signed-cookie";
import { DEMO_PAYMENTS } from "./demo-mode";
import { formatEuros, type WalletTransaction } from "./limits";

/**
 * Portefeuille fictif du mode démo : départ à 150 €, recharges sans carte,
 * commandes de repas débitées. Gardé dans un cookie signé du navigateur de
 * l'administrateur : le vrai portefeuille (table wallets) n'est jamais touché.
 */

const COOKIE = "btm_demo_wallet";
const PURPOSE = "demo-wallet";
/** Opérations gardées dans le cookie (le solde, lui, est toujours exact). */
const MAX_TRANSACTIONS = 25;

type DemoState = { userId: string; balanceCents: number; transactions: WalletTransaction[] };

/**
 * Portefeuille fictif pour ce compte ? Seule décision du mode démo, utilisée par
 * le portefeuille, les repas, les tickets de barge et l'examen du code : le
 * solde fictif est le même partout (mode démo allumé et repas ou barge ouverts).
 */
export async function usesDemoWallet(user: SessionUser | null): Promise<boolean> {
  if (!DEMO_PAYMENTS || !user) return false;
  const [food, barge] = await Promise.all([canOrderFood(user), canBuyBargeTickets(user)]);
  return food || barge;
}

function freshState(userId: string): DemoState {
  return {
    userId,
    balanceCents: FOOD_DEMO_BALANCE_CENTS,
    transactions: [
      {
        id: randomUUID(),
        kind: "topup",
        amountCents: FOOD_DEMO_BALANCE_CENTS,
        status: "succeeded",
        label: "Crédit de démonstration",
        method: "Démo",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

/** Solde et opérations fictives de ce compte (un autre compte, ou un cookie modifié, repart de 150 €). */
export async function readDemoWallet(userId: string): Promise<DemoState> {
  const state = verifyJson<DemoState>(PURPOSE, (await cookies()).get(COOKIE)?.value);
  if (state && state.userId === userId && Number.isInteger(state.balanceCents) && Array.isArray(state.transactions)) return state;
  return freshState(userId);
}

async function writeDemoWallet(state: DemoState): Promise<boolean> {
  const value = signJson(PURPOSE, state);
  if (!value) return false;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

/**
 * Efface le portefeuille fictif de ce navigateur : la prochaine démonstration
 * repart de 150 €. Seulement dans une action serveur ou une route (cookies modifiables).
 */
export async function forgetDemoWallet() {
  const jar = await cookies();
  if (jar.has(COOKIE)) jar.delete(COOKIE);
}

/** Ajoute (recharge) ou retire (paiement) une somme fictive. null si le solde ne suffit pas (ou rien n'a pu être gardé). */
export async function recordDemoOperation(
  userId: string,
  kind: "topup" | "payment" | "refund",
  amountCents: number,
  label: string,
): Promise<DemoState | null> {
  const state = await readDemoWallet(userId);
  const balanceCents = state.balanceCents + (kind === "payment" ? -amountCents : amountCents);
  if (balanceCents < 0) return null;
  const operation: WalletTransaction = {
    id: randomUUID(),
    kind,
    amountCents,
    status: "succeeded",
    label: label || (kind === "topup" ? `Recharge de ${formatEuros(amountCents)}` : kind === "refund" ? "Remboursement" : "Paiement"),
    method: "Démo",
    createdAt: new Date().toISOString(),
  };
  const next: DemoState = { userId, balanceCents, transactions: [operation, ...state.transactions].slice(0, MAX_TRANSACTIONS) };
  return (await writeDemoWallet(next)) ? next : null;
}
