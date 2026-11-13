import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { getFeatureSwitches } from "@/lib/site/features";
import { getSiteFlags } from "@/lib/site/settings";

/**
 * Qui voit l'achat de tickets de barge. Comme la commande de repas : les
 * administrateurs seulement, quand le mode démo est allumé (Profil de
 * l'entreprise). Allumée dans /admin/fonctionnalites (ou BARGE_TICKETS=all) : tous les
 * comptes connectés, avec l'accord du gestionnaire des barges.
 */
export async function canBuyBargeTickets(user: SessionUser | null): Promise<boolean> {
  if (!user) return false;
  if (process.env.BARGE_TICKETS?.trim() === "all" || (await getFeatureSwitches())?.barge) return true;
  if (!user.isAdmin) return false;
  return (await getSiteFlags()).demoMode;
}
