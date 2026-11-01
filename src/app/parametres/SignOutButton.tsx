"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { IconLogout } from "@/components/ui/icons";

/** `compact` : icône seule, pour les barres d'en-tête. */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { signOut } = useAuth();
  if (compact) {
    return (
      <button
        type="button"
        onClick={signOut}
        aria-label="Se déconnecter"
        title="Se déconnecter"
        className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        <IconLogout width={18} height={18} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-lg border border-border px-3 py-2 font-medium whitespace-nowrap hover:bg-bg-muted"
    >
      Se déconnecter
    </button>
  );
}
