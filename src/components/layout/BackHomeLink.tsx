"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Logo et lien de retour des pages secondaires : un compte retrouve sa
 * conversation, un visiteur (qui n'en a pas) revient à l'accueil.
 */
export function BackHomeLinks() {
  const { user } = useAuth();
  const target = user ? "la conversation" : "l'accueil";
  return (
    <>
      <Link href="/" aria-label={`BTM AI — retour à ${target}`} className="zone-appui relative -mx-1 rounded px-1 opacity-90 transition hover:opacity-100">
        <BrandLogo size="sm" className="text-[#1d1d1f]! dark:text-[#f5f5f7]!" />
      </Link>
      {/* Pastille comme « Essayer Tamilya » de la barre d'accueil, en version discrète. */}
      <Link
        href="/"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border-y-4 border-transparent bg-black/[0.05] bg-clip-padding px-3.5 text-[13px] font-medium whitespace-nowrap opacity-90 transition hover:bg-black/[0.08] hover:opacity-100 md:h-7 md:border-y-0 md:text-xs dark:bg-white/[0.1] dark:hover:bg-white/[0.15]"
      >
        <span aria-hidden="true">←</span> Retour à {target}
      </Link>
    </>
  );
}
