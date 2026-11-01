"use client";

import { useState } from "react";
import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { maskEmail } from "./mask-email";

export function MaskedEmail({ email }: { email: string | null }) {
  const [shown, setShown] = useState(false);
  if (!email) return <span>—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <span className="truncate">{shown ? email : maskEmail(email)}</span>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Masquer l'adresse" : "Afficher l'adresse"}
        className="shrink-0 rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        {shown ? <IconEyeOff width={15} height={15} /> : <IconEye width={15} height={15} />}
      </button>
    </span>
  );
}
