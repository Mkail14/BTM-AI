import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";

/**
 * Qui a le portefeuille (solde, recharge, code de paiement). Pour l'instant, les
 * administrateurs seulement : on construit d'abord, les clients l'auront quand un
 * partenariat sera signé. Allumé dans /admin/fonctionnalites (ou WALLET=all) : tous les comptes connectés.
 */
export async function canUseWallet(user: SessionUser | null): Promise<boolean> {
  if (!user) return false;
  if (process.env.WALLET?.trim() === "all") return true;
  return canUse(user, "portefeuille");
}
