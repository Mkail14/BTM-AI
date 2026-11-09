import "server-only";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Qui a le portefeuille (solde, recharge, code de paiement). Pour l'instant, les
 * administrateurs seulement : on construit d'abord, les clients l'auront quand un
 * partenariat sera signé. WALLET=all l'ouvrira à tous les comptes connectés.
 */
export function canUseWallet(user: SessionUser | null): boolean {
  if (!user) return false;
  if (process.env.WALLET?.trim() === "all") return true;
  return user.isAdmin;
}
