"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/** Ouvre la fenêtre de connexion et revient sur /developpeurs ensuite. */
export function SignInButton({ className }: { className: string }) {
  const { openAuthDialog } = useAuth();
  return (
    <button
      type="button"
      onClick={() => openAuthDialog({ mode: "signup", next: "/developpeurs", reason: "Un compte gratuit suffit pour créer votre widget ou votre code d'accès." })}
      className={className}
    >
      Créer mon compte gratuit
    </button>
  );
}
