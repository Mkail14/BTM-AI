import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/auth/session";
import { canOrderFood } from "@/lib/food/access";
import { FOOD_DEMO, FOOD_DEMO_BALANCE_CENTS } from "@/lib/food/catalog";
import { formatEuros, type WalletTransaction } from "./limits";

/**
 * Portefeuille fictif du mode démo : départ à 150 €, recharges sans carte,
 * commandes de repas débitées. Gardé dans un cookie du navigateur de
 * l'administrateur : le vrai portefeuille (table wallets) n'est jamais touché.
 */

const COOKIE = "btm_demo_wallet";
/** Opérations gardées dans le cookie (le solde, lui, est toujours exact). */
const MAX_TRANSACTIONS = 25;

type DemoState = { userId: string; balanceCents: number; transactions: WalletTransaction[] };

/** Portefeuille fictif pour ce compte ? (mode démo allumé et commande de repas ouverte). */
export async function usesDemoWallet(user: SessionUser | null): Promise<boolean> {
  return FOOD_DEMO && (await canOrderFood(user));
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

/** Solde et opérations fictives de ce compte (un autre compte sur le même navigateur repart de 150 €). */
export async function readDemoWallet(userId: string): Promise<DemoState> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (raw) {
    try {
      const state = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as DemoState;
      if (state.userId === userId && Number.isInteger(state.balanceCents) && Array.isArray(state.transactions)) return state;
    } catch {
      // Cookie illisible : on repart de zéro.
    }
  }
  return freshState(userId);
}

async function writeDemoWallet(state: DemoState) {
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(state)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Ajoute (recharge) ou retire (paiement) une somme fictive. null si le solde ne suffit pas. */
export async function recordDemoOperation(
  userId: string,
  kind: "topup" | "payment",
  amountCents: number,
  label: string,
): Promise<DemoState | null> {
  const state = await readDemoWallet(userId);
  const balanceCents = state.balanceCents + (kind === "topup" ? amountCents : -amountCents);
  if (balanceCents < 0) return null;
  const operation: WalletTransaction = {
    id: randomUUID(),
    kind,
    amountCents,
    status: "succeeded",
    label: label || (kind === "topup" ? `Recharge de ${formatEuros(amountCents)}` : "Paiement"),
    method: "Démo",
    createdAt: new Date().toISOString(),
  };
  const next: DemoState = { userId, balanceCents, transactions: [operation, ...state.transactions].slice(0, MAX_TRANSACTIONS) };
  await writeDemoWallet(next);
  return next;
}
