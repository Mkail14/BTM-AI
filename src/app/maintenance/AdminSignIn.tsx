"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/** Site fermé au public : seuls les administrateurs peuvent se connecter et entrer. */
export function AdminSignIn() {
  const { openAuthDialog } = useAuth();
  return (
    <button
      type="button"
      onClick={() => openAuthDialog({ reason: "Accès réservé aux administrateurs pour le moment.", next: "/admin", mode: "signin" })}
      className="-my-2 inline-block py-2 text-fg-muted underline-offset-2 hover:text-fg hover:underline"
    >
      Accès administrateur
    </button>
  );
}
