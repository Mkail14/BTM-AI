"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lostOk } from "@/lib/safe-action";
import { acceptTermsAction } from "./actions";

/** Engagement à garder l'identité de Tamilya : une case, un bouton, et l'accès est ouvert. */
export function AccessRequest() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await acceptTermsAction(accepted).catch(lostOk);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 size-4 shrink-0" />
        <span>
          Je m&apos;engage à ne jamais changer <strong>le nom</strong>, <strong>le shimaoré</strong> ni{" "}
          <strong>la personnalité</strong> de Tamilya, et j&apos;accepte la{" "}
          <Link href="/developpeurs/charte" target="_blank" className="underline underline-offset-4">
            charte d&apos;utilisation
          </Link>
          . Je sais qu&apos;une tentative bloque la requête et suspend mon accès.
        </span>
      </label>
      <button type="submit" disabled={pending || !accepted} className="btn-rose h-10 self-start rounded-full px-5 text-sm font-medium">
        {pending ? "Un instant…" : "Je m'engage, ouvrir mon accès"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
