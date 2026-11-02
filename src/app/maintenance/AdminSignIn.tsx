"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/** Pendant la maintenance, seuls les administrateurs peuvent se connecter et entrer. */
export function AdminSignIn() {
  const { openAuthDialog } = useAuth();
  return (
    <button
      type="button"
      onClick={() => openAuthDialog({ reason: "Accès administrateur pendant la maintenance.", next: "/admin", mode: "signin" })}
      className="mt-6 text-xs text-fg-muted hover:text-fg hover:underline"
    >
      Connexion administrateur
    </button>
  );
}
