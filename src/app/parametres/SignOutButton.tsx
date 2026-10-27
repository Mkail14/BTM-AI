"use client";

import { useAuth } from "@/components/auth/AuthProvider";

export function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-lg border border-border px-3 py-2 font-medium hover:bg-bg-muted"
    >
      Se déconnecter
    </button>
  );
}
