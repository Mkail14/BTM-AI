import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { getSiteFlags } from "@/lib/site/settings";

/**
 * Qui voit l'achat de tickets de barge. Comme la commande de repas : les
 * administrateurs seulement, quand le mode démo est allumé (Profil de
 * l'entreprise). BARGE_TICKETS=all l'ouvrira à tous, avec l'accord du gestionnaire des barges.
 */
export async function canBuyBargeTickets(user: SessionUser | null): Promise<boolean> {
  if (process.env.BARGE_TICKETS?.trim() === "all") return Boolean(user);
  if (!user?.isAdmin) return false;
  return (await getSiteFlags()).demoMode;
}
