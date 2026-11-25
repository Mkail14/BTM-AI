"use client";

import { useState, useTransition } from "react";
import { lostOk } from "@/lib/safe-action";
import { cancelChangeAction, confirmChangeAction, startChangeAction } from "@/app/admin/verrou/actions";
import { closeEditor, INPUT_CLASS, PRIMARY, QUIET, SECONDARY, RowEditor, SettingsRow } from "./ui";

type Step = { kind: "idle" } | { kind: "current" } | { kind: "scan"; factorId: string; qr: string; secret: string } | { kind: "done"; message: string };

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
 * Changer d'application d'authentification (nouveau téléphone…) : le code de
 * l'application actuelle d'abord, puis le nouveau QR code et son premier code.
 * Ligne de la rubrique Sécurité, admins seulement.
 */
export function ChangeCode() {
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

  const submit = () =>
    start(async () => {
      setError(null);
      if (step.kind === "current") {
        const res = await startChangeAction({ code }).catch(lostOk);
        if (res.ok && "qr" in res) {
          setCode("");
          setStep({ kind: "scan", factorId: res.factorId, qr: res.qr, secret: res.secret });
        } else {
          setError(res.message);
          setCode("");
        }
      } else if (step.kind === "scan") {
        const res = await confirmChangeAction({ code, factorId: step.factorId }).catch(lostOk);
        if (res.ok) {
          const message = res.message;
          closeEditor(() => {
            reset();
            setStep({ kind: "done", message });
          });
        } else {
          setError(res.message);
          setCode("");
        }
      }
    });

  return (
    <>
      {step.kind === "idle" || step.kind === "done" ? (
        <SettingsRow
          label="Code d'accès admin"
          value={step.kind === "done" ? <span className="text-success">{step.message}</span> : "Application liée"}
        >
          <button type="button" className={SECONDARY} onClick={() => setStep({ kind: "current" })}>
            Changer
          </button>
        </SettingsRow>
      ) : (
        <RowEditor onClose={cancel}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {step.kind === "current" ? (
              <div>
                <label htmlFor="code-actuel" className="text-sm font-medium">
                  Code affiché par ton application actuelle
                </label>
                <CodeInput id="code-actuel" value={code} onChange={setCode} />
              </div>
            ) : (
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
            )}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending || code.length !== 6} className={PRIMARY}>
                {pending ? "Un instant…" : step.kind === "current" ? "Continuer" : "Confirmer"}
              </button>
              <button type="button" onClick={() => closeEditor(cancel)} className={QUIET}>
                Annuler
              </button>
            </div>
          </form>
        </RowEditor>
      )}
    </>
  );
}
