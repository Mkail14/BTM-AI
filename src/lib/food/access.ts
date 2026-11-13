import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { getFeatureSwitches } from "@/lib/site/features";
import { getSiteFlags } from "@/lib/site/settings";

/**
 * Qui voit la commande de repas. Par défaut, les administrateurs seulement, et
 * seulement quand le mode démo est allumé (Profil de l'entreprise) : c'est une
 * démonstration à montrer aux partenaires, pas une offre publique.
 * Allumée dans /admin/fonctionnalites (ou FOOD_ORDERING=all) : tous les comptes connectés,
 * le jour où un partenaire a donné son accord.
 */
export async function canOrderFood(user: SessionUser | null): Promise<boolean> {
  if (!user) return false;
  if (process.env.FOOD_ORDERING?.trim() === "all" || (await getFeatureSwitches())?.repas) return true;
  if (!user.isAdmin) return false;
  return (await getSiteFlags()).demoMode;
}
