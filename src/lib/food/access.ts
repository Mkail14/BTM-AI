import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { getSiteFlags } from "@/lib/site/settings";

/**
 * Qui voit la commande de repas. Par défaut, les administrateurs seulement, et
 * seulement quand le mode démo est allumé (Profil de l'entreprise) : c'est une
 * démonstration à montrer aux partenaires, pas une offre publique.
 * FOOD_ORDERING=all l'ouvrira à tous, le jour où un partenaire a donné son accord.
 */
export async function canOrderFood(user: SessionUser | null): Promise<boolean> {
  if (process.env.FOOD_ORDERING?.trim() === "all") return Boolean(user);
  if (!user?.isAdmin) return false;
  return (await getSiteFlags()).demoMode;
}
