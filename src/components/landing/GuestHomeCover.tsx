"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { LandingNav } from "./LandingNav";

/**
 * Pendant le chargement de l'accueil, un visiteur sans compte voit déjà le fond
 * et la barre de l'accueil, au lieu de la conversation qui s'affichait 1 à 2 s
 * avant la page de présentation. Rien pour les comptes connectés ni ailleurs.
 */
export function GuestHomeCover() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (user || pathname !== "/") return null;
  return (
    <div aria-hidden="true" className="landing landing-home fixed inset-0 z-[55] overflow-hidden bg-bg text-fg">
      <div className="fond-lagon fond-lagon--page" />
      <LandingNav />
    </div>
  );
}
