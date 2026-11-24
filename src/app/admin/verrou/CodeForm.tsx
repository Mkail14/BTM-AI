"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconArrowLeft, IconBackspace, IconLock } from "@/components/ui/icons";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { hapticPress } from "@/lib/chat/haptics";
import { lostOk } from "@/lib/safe-action";
import { requestCodeResetAction, startEnrollAction, verifyCodeAction } from "./actions";

type Setup = { factorId: string; qr: string; secret: string };

/** Tablette tenue en paysage : le clavier du système cacherait la carte, on montre notre pavé à côté. */
const PAD_QUERY = "(orientation: landscape) and (pointer: coarse) and (min-width: 900px)";

function usePadMode() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PAD_QUERY);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return on;
}

const padKey =
  "grid h-14 place-items-center rounded-xl bg-bg-muted text-2xl font-medium text-fg transition active:scale-95 active:bg-border disabled:opacity-40";

/**
 * « Code oublié ? » : plus d'application du tout. Après confirmation, la
 * demande part à l'administrateur principal, qui réinitialisera le compte.
 */
function ForgotCode() {
  const [pending, start] = useTransition();
  const [answer, setAnswer] = useState<{ ok: boolean; message: string } | null>(null);

  const ask = () =>
    void confirmDialog({
      title: "Tu n'as plus accès à ton application ?",
      message:
        "L'administrateur principal sera prévenu. Il supprimera ton compte en entier ; tu le recréeras avec la même adresse et il te redonnera l'accès admin.",
      confirmLabel: "Envoyer la demande",
      tone: "danger",
    }).then((ok) => {
      if (!ok) return;
      start(async () => setAnswer(await requestCodeResetAction().catch(lostOk)));
    });

  if (answer) {
    return (
      <p role="status" className={`mt-3 text-center text-sm ${answer.ok ? "text-success" : "text-danger"}`}>
        {answer.message}
      </p>
    );
  }
  return (
    <button type="button" onClick={ask} disabled={pending} className="mx-auto mt-3 block text-sm font-medium text-fg-muted hover:text-fg hover:underline">
      {pending ? "Envoi…" : "Code oublié ?"}
    </button>
  );
}

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
  const pad = usePadMode() && asking;

  const press = (key: string) => {
    hapticPress();
    setError(null);
    setCode((c) => (key === "del" ? c.slice(0, -1) : (c + key).slice(0, 6)));
  };

  const beginSetup = () =>
    start(async () => {
      setError(null);
      const res = await startEnrollAction().catch(lostOk);
      if (res.ok && "qr" in res) setSetup({ factorId: res.factorId, qr: res.qr, secret: res.secret });
      else setError(res.message);
    });

  return (
    <form
      className={`verrou-carte relative z-10 w-full rounded-2xl border border-border bg-bg/90 p-6 shadow-lg backdrop-blur ${pad ? "grid max-w-3xl grid-cols-2 items-center gap-8 pt-12" : "max-w-sm"}`}
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
      {pad ? (
        <Link
          href="/"
          className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          <IconArrowLeft width={16} height={16} />
          Retour au site
        </Link>
      ) : null}

      <div>
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
            inputMode={pad ? "none" : "numeric"}
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

      {enrolled ? <ForgotCode /> : null}

      {pad ? null : (
        <div className="mt-6 flex gap-2">
          <Link href="/" className={`${secondaryButton} flex-1 text-center`}>
            Retour au site
          </Link>
          <button type="submit" disabled={pending || (asking && code.length !== 6)} className={`${primaryButton} flex-1`}>
            {pending ? "Un instant…" : asking ? "Entrer" : "Lier l'application"}
          </button>
        </div>
      )}
      </div>

      {pad ? (
        <div className="grid grid-cols-3 gap-3" aria-label="Pavé numérique">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <button key={n} type="button" onClick={() => press(n)} disabled={pending} className={padKey}>
              {n}
            </button>
          ))}
          <button type="button" onClick={() => press("del")} disabled={pending || code === ""} aria-label="Effacer" className={padKey}>
            <IconBackspace width={26} height={26} />
          </button>
          <button type="button" onClick={() => press("0")} disabled={pending} className={padKey}>
            0
          </button>
          <button type="submit" onClick={() => hapticPress()} disabled={pending || code.length !== 6} className={`${primaryButton} h-14 rounded-xl text-base`}>
            {pending ? "…" : "Entrer"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
