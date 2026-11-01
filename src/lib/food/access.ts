import "server-only";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Qui voit la commande de repas. Par défaut, les administrateurs seulement :
 * c'est un prototype à montrer aux partenaires, pas une offre publique.
 * FOOD_ORDERING=all l'ouvrira à tous, le jour où un partenaire a donné son accord.
 */
export function canOrderFood(user: SessionUser | null): boolean {
  if (process.env.FOOD_ORDERING?.trim() === "all") return Boolean(user);
  return Boolean(user?.isAdmin);
}
