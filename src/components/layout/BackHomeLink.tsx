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
      <Link href="/" aria-label={`BTM AI — retour à ${target}`} className="rounded">
        <BrandLogo size="md" />
      </Link>
      <Link href="/" className="-mr-2 rounded-lg px-2 py-2.5 text-sm text-fg-muted hover:text-fg">
        ← Retour à {target}
      </Link>
    </>
  );
}
