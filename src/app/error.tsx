"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SimplePage } from "@/components/layout/SimplePage";

/** Erreur inattendue dans une page : message simple, on peut réessayer ou revenir à l'accueil. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page] Erreur affichée", error);
  }, [error]);

  return (
    <SimplePage title="Quelque chose n'a pas marché">
      <p role="alert" className="text-sm text-fg-muted">
        La page n&apos;a pas pu s&apos;afficher. Vérifie ta connexion, puis réessaie.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={reset} className="btn-rose h-11 rounded-full px-5 text-sm font-medium">
          Réessayer
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-lg px-2 font-medium text-accent hover:underline">
          Revenir à BTM AI
        </Link>
      </div>
    </SimplePage>
  );
}
