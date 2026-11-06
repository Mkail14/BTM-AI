"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { IconLogout } from "@/components/ui/icons";
import { SECONDARY } from "./ui";

/** `row` : ligne de liste, en bas des rubriques sur téléphone. */
export function SignOutButton({ row = false }: { row?: boolean }) {
  const { signOut } = useAuth();
  if (row) {
    return (
      <button type="button" onClick={signOut} className="flex min-h-13 w-full items-center gap-3 px-4 text-left text-sm">
        <IconLogout width={18} height={18} className="shrink-0 text-fg-muted" />
        Se déconnecter
      </button>
    );
  }
  return (
    <button type="button" onClick={signOut} className={SECONDARY}>
      Se déconnecter
    </button>
  );
}
