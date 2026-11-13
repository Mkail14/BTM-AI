"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconLock } from "@/components/ui/icons";
import { lostOk } from "@/lib/safe-action";
import { startEnrollAction, verifyCodeAction } from "./actions";

type Setup = { factorId: string; qr: string; secret: string };

/**
 * Code à 6 chiffres de l'application d'authentification. Sans application
 * liée : QR code à scanner, puis le premier code confirme l'ajout.
 */
export function CodeForm({ enrolled, next, email, minutes }: { enrolled: boolean; next: string; email: string | null; minutes: number }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const asking = enrolled || setup !== null;

  const beginSetup = () =>
    start(async () => {
      setError(null);
      const res = await startEnrollAction().catch(lostOk);
      if (res.ok && "qr" in res) setSetup({ factorId: res.factorId, qr: res.qr, secret: res.secret });
      else setError(res.message);
    });

  return (
    <form
      className="w-full max-w-sm rounded-2xl border border-border bg-bg p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!asking) return beginSetup();
        start(async () => {
          const res = await verifyCodeAction({ code, factorId: setup?.factorId }).catch(lostOk);
          // Navigation complète : la page demandée est rendue avec le verrou ouvert.
          if (res.ok) window.location.replace(next);
          else {
            setError(res.message);
            setCode("");
          }
        });
      }}
    >
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
        <IconLock width={22} height={22} />
      </span>
      <h1 className="mt-4 text-center text-lg font-semibold">Espace admin verrouillé</h1>

      {enrolled ? (
        <p className="mt-1 text-center text-sm text-fg-muted">
          Tape le code à 6 chiffres affiché dans ton application d&apos;authentification. Sans utilisation pendant {minutes} minutes,
          l&apos;espace se verrouille à nouveau.
        </p>
      ) : setup ? (
        <>
          <p className="mt-1 text-center text-sm text-fg-muted">
            Scanne ce QR code avec Google Authenticator, Microsoft Authenticator ou une autre application, puis tape le code
            qu&apos;elle affiche.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- image générée (data URL), rien à optimiser */}
          <img src={setup.qr} alt="QR code à scanner avec l'application d'authentification" width={220} height={220} className="mx-auto mt-4 rounded-lg bg-white p-2" />
          <details className="mt-3 text-center text-xs text-fg-muted">
            <summary className="cursor-pointer">Impossible de scanner ?</summary>
            <p className="mt-2">Ajoute le compte à la main avec cette clé :</p>
            <code className="mt-1 block break-all rounded-md bg-bg-muted px-2 py-1.5 font-mono text-fg">{setup.secret}</code>
          </details>
        </>
      ) : (
        <p className="mt-1 text-center text-sm text-fg-muted">
          Pour protéger l&apos;administration{email ? ` (${email})` : ""}, lie une application d&apos;authentification à ton compte :
          elle affichera un code qui change toutes les 30 secondes, demandé à chaque entrée.
        </p>
      )}

      {asking ? (
        <>
          <label htmlFor="admin-code" className="mt-5 block text-sm font-medium">
            Code à 6 chiffres
          </label>
          <input
            id="admin-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            required
            className={`${inputClass} mt-2 text-center font-mono text-xl tracking-[0.4em]`}
          />
        </>
      ) : null}

      {error ? (
        <p role="alert" className="booking-shake mt-2 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <Link href="/" className={`${secondaryButton} flex-1 text-center`}>
          Retour au site
        </Link>
        <button type="submit" disabled={pending || (asking && code.length !== 6)} className={`${primaryButton} flex-1`}>
          {pending ? "Un instant…" : asking ? "Entrer" : "Lier l'application"}
        </button>
      </div>
    </form>
  );
}
