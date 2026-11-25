"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { lostOk } from "@/lib/safe-action";
import { ADMIN_IDLE_CHOICES, idleLabel } from "@/lib/admin/idle";
import {
  cancelChangeAction,
  confirmChangeAction,
  removeCodeAction,
  restoreCodeAction,
  setIdleAction,
  startChangeAction,
} from "@/app/admin/verrou/actions";
import { closeEditor, DANGER, INPUT_CLASS, PRIMARY, QUIET, SECONDARY, RowEditor, SettingsRow } from "./ui";

type Step =
  | { kind: "idle" }
  | { kind: "current" }
  | { kind: "remove" }
  | { kind: "scan"; factorId: string; qr: string; secret: string }
  | { kind: "done"; message: string };

/** Retour ici après la page du code (src/app/admin/verrou/page.tsx l'autorise). */
const LOCK_HERE = `/admin/verrou?suite=${encodeURIComponent("/parametres?rubrique=securite")}`;

/** Champ du code à 6 chiffres. */
function CodeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      autoFocus
      required
      className={`${INPUT_CLASS} text-center font-mono text-lg tracking-[0.4em]`}
    />
  );
}

/**
 * Délai avant que l'admin se reverrouille tout seul (5 minutes à 4 heures, ou
 * jamais). Le verrou doit être ouvert pour le changer : sinon, lien vers le code.
 */
function IdleChoice({ initial }: { initial: number }) {
  const [idle, setIdle] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (minutes: number) =>
    start(async () => {
      setError(null);
      const before = idle;
      setIdle(minutes);
      const res = await setIdleAction({ minutes }).catch(lostOk);
      if (!res.ok) {
        setIdle(before);
        setError(res.message);
      }
    });

  return (
    <SettingsRow
      label={<label htmlFor="admin-idle">Verrouillage auto</label>}
      value={
        error ? (
          <span className="text-danger">
            {error}{" "}
            <Link href={LOCK_HERE} className="font-medium underline">
              Entrer le code
            </Link>
          </span>
        ) : idle > 0 ? (
          `Après ${idleLabel(idle)} sans utilisation`
        ) : (
          "Jamais : l'admin reste ouvert"
        )
      }
    >
      <select
        id="admin-idle"
        value={idle}
        disabled={pending}
        onChange={(e) => change(Number(e.target.value))}
        className={`${SECONDARY} cursor-pointer appearance-none pr-4`}
      >
        {ADMIN_IDLE_CHOICES.map((m) => (
          <option key={m} value={m}>
            {m > 0 ? idleLabel(m).replace("minutes", "min") : "Jamais"}
          </option>
        ))}
      </select>
    </SettingsRow>
  );
}

/**
 * Code d'accès admin (rubrique Sécurité, admins seulement) : changer
 * d'application (nouveau téléphone…), la retirer (plus de code pour entrer),
 * ou la remettre ; et le délai avant que l'admin se reverrouille.
 */
export function ChangeCode({ linked, codeOff, idle }: { linked: boolean; codeOff: boolean; idle: number }) {
  const [hasApp, setHasApp] = useState(linked);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setCode("");
    setError(null);
  };

  const cancel = () => {
    if (step.kind === "scan") void cancelChangeAction({ factorId: step.factorId }).catch(() => {});
    reset();
    setStep({ kind: "idle" });
  };

  const finish = (message: string) =>
    closeEditor(() => {
      reset();
      setStep({ kind: "done", message });
    });

  const failed = (message: string) => {
    setError(message);
    setCode("");
  };

  const submit = () =>
    start(async () => {
      setError(null);
      if (step.kind === "current") {
        const res = await startChangeAction({ code }).catch(lostOk);
        if (res.ok && "qr" in res) {
          setCode("");
          setStep({ kind: "scan", factorId: res.factorId, qr: res.qr, secret: res.secret });
        } else failed(res.message);
      } else if (step.kind === "scan") {
        const res = await confirmChangeAction({ code, factorId: step.factorId }).catch(lostOk);
        if (res.ok) finish(res.message);
        else failed(res.message);
      } else if (step.kind === "remove") {
        const res = await removeCodeAction({ code }).catch(lostOk);
        if (res.ok) {
          setHasApp(false);
          finish(res.message);
        } else failed(res.message);
      }
    });

  const restore = () =>
    start(async () => {
      const res = await restoreCodeAction().catch(lostOk);
      // Navigation complète : le verrou vient d'être refermé côté serveur.
      if (res.ok) window.location.replace(LOCK_HERE);
      else setStep({ kind: "done", message: res.message });
    });

  if (step.kind === "idle" || step.kind === "done") {
    const done = step.kind === "done" ? <span className="text-success">{step.message}</span> : null;
    // Jamais liée (nouvel admin) : la page du code propose le QR code.
    if (!hasApp && !codeOff && !done) {
      return (
        <SettingsRow label="Code d'accès admin" value="Aucune application liée">
          <Link href={LOCK_HERE} className={SECONDARY}>
            Lier une application
          </Link>
        </SettingsRow>
      );
    }
    if (!hasApp) {
      return (
        <SettingsRow label="Code d'accès admin" value={done ?? "Aucun code : l'admin s'ouvre directement"}>
          <button type="button" className={SECONDARY} onClick={restore} disabled={pending}>
            {pending ? "Un instant…" : "Remettre un code"}
          </button>
        </SettingsRow>
      );
    }
    return (
      <>
        <SettingsRow label="Code d'accès admin" value={done ?? "Application liée"}>
          <div className="flex gap-2">
            <button type="button" className={SECONDARY} onClick={() => setStep({ kind: "current" })}>
              Changer
            </button>
            <button type="button" className={DANGER} onClick={() => setStep({ kind: "remove" })}>
              Retirer
            </button>
          </div>
        </SettingsRow>
        <IdleChoice initial={idle} />
      </>
    );
  }

  return (
    <RowEditor onClose={cancel}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {step.kind === "scan" ? (
          <div>
            <p className="text-sm text-fg-muted">
              Scanne ce QR code avec la nouvelle application (Google Authenticator, Microsoft Authenticator…), puis tape le code qu&apos;elle affiche.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- image générée (data URL), rien à optimiser */}
            <img src={step.qr} alt="QR code à scanner avec la nouvelle application" width={200} height={200} className="mx-auto mt-3 rounded-lg bg-white p-2" />
            <details className="mt-2 text-center text-xs text-fg-muted">
              <summary className="cursor-pointer">Impossible de scanner ?</summary>
              <code className="mt-1 block break-all rounded-md bg-bg-muted px-2 py-1.5 font-mono text-fg">{step.secret}</code>
            </details>
            <label htmlFor="code-nouveau" className="mt-3 block text-sm font-medium">
              Code de la nouvelle application
            </label>
            <CodeInput id="code-nouveau" value={code} onChange={setCode} />
          </div>
        ) : (
          <div>
            {step.kind === "remove" ? (
              <p className="mb-3 text-sm text-fg-muted">
                Sans code, l&apos;admin s&apos;ouvre dès que tu es connecté. Tu pourras remettre un code quand tu veux.
              </p>
            ) : null}
            <label htmlFor="code-actuel" className="text-sm font-medium">
              Code affiché par ton application actuelle
            </label>
            <CodeInput id="code-actuel" value={code} onChange={setCode} />
          </div>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || code.length !== 6} className={step.kind === "remove" ? DANGER : PRIMARY}>
            {pending ? "Un instant…" : step.kind === "current" ? "Continuer" : step.kind === "remove" ? "Retirer le code" : "Confirmer"}
          </button>
          <button type="button" onClick={() => closeEditor(cancel)} className={QUIET}>
            Annuler
          </button>
        </div>
      </form>
    </RowEditor>
  );
}
