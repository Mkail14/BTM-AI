"use client";

import { useEffect, useState } from "react";
import { DANGER, PRIMARY, RowEditor, SECONDARY, SettingsGroup, SettingsRow } from "./ui";

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4);

/** Champ de code à 4 chiffres (aussi demandé pour inscrire ou effacer la voix, VoicePrint). */
export function PinField({ label, value, onChange, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        className="mt-1.5 block h-11 w-28 rounded-xl border border-border bg-bg px-3 text-center text-lg tracking-[0.4em] tabular-nums outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
      />
    </label>
  );
}

/**
 * Code de paiement à 4 chiffres : obligatoire pour que Tamilya paie à la voix.
 * Changer ou supprimer le code demande l'actuel.
 */
export function PaymentPin() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [consented, setConsented] = useState(false);
  const [mode, setMode] = useState<"set" | "remove" | null>(null);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/wallet/pin", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ hasPin: boolean; consented?: boolean }>) : null))
      .then((body) => {
        setHasPin(body?.hasPin ?? false);
        setConsented(Boolean(body?.consented));
      })
      .catch(() => setHasPin(false));
  }, []);

  function close() {
    setMode(null);
    setCurrent("");
    setPin("");
    setAgain("");
  }

  async function send(action: "set" | "remove") {
    if (action === "set" && pin !== again) return setMessage({ ok: false, text: "Les deux codes ne sont pas pareils." });
    setBusy(true);
    setMessage(null);
    const body = action === "set" ? { action, pin, ...(hasPin ? { current } : {}) } : { action, current };
    const response = await fetch("/api/wallet/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (!result?.ok) return setMessage({ ok: false, text: result?.error ?? "Connexion impossible : réessaie." });
    setHasPin(action === "set");
    if (action === "remove") setConsented(false);
    close();
    setMessage({ ok: true, text: action === "set" ? "Code enregistré." : "Code supprimé : Tamilya ne peut plus payer à ta place." });
  }

  /** Retire l'autorisation donnée une fois : l'avertissement sera réaffiché au prochain paiement. */
  async function revoke() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/wallet/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke" }) }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (!result?.ok) return setMessage({ ok: false, text: result?.error ?? "Connexion impossible : réessaie." });
    setConsented(false);
    setMessage({ ok: true, text: "Autorisation retirée : Tamilya te la redemandera avant de payer." });
  }

  const ready = mode === "remove" ? current.length === 4 : pin.length === 4 && again.length === 4 && (!hasPin || current.length === 4);
  const openForm = (next: "set" | "remove") => {
    setMessage(null);
    setMode(next);
  };

  return (
    <SettingsGroup
      title="Payer à la voix"
      description="Ton code à 4 chiffres, obligatoire pour que Tamilya paie à ta place."
      footer={
        message ? (
          <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        ) : null
      }
    >
      {hasPin === null ? (
        <div className="m-4 h-8 animate-pulse rounded-lg bg-bg-muted" />
      ) : mode === null ? (
        <SettingsRow label="Code de paiement" value={hasPin ? "Actif" : "Aucun code"}>
          <div className="flex gap-2">
            {hasPin ? (
              <button type="button" onClick={() => openForm("remove")} className={DANGER}>
                Supprimer
              </button>
            ) : null}
            <button type="button" onClick={() => openForm("set")} className={SECONDARY}>
              {hasPin ? "Changer" : "Créer"}
            </button>
          </div>
        </SettingsRow>
      ) : null}
      {hasPin && mode === null && consented ? (
        <SettingsRow label="Autorisation de payer" value="Donnée une fois pour toutes">
          <button type="button" disabled={busy} onClick={() => void revoke()} className={DANGER}>
            Retirer
          </button>
        </SettingsRow>
      ) : null}
      {hasPin === null || mode === null ? null : (
        <RowEditor>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready && !busy) void send(mode);
            }}
          >
            <div className="flex flex-wrap gap-4">
              {hasPin ? <PinField label="Code actuel" value={current} onChange={setCurrent} autoFocus /> : null}
              {mode === "set" ? (
                <>
                  <PinField label={hasPin ? "Nouveau code" : "Code à 4 chiffres"} value={pin} onChange={setPin} autoFocus={!hasPin} />
                  <PinField label="Encore une fois" value={again} onChange={setAgain} />
                </>
              ) : null}
            </div>
            {mode === "set" ? (
              <p className="text-xs text-fg-muted">Évite ta date de naissance. Un code trop simple (1111, 1234…) est refusé. Après 5 codes faux, le code est bloqué 15 minutes, puis 1 heure, puis 24 heures. Un code juste remet tout à zéro.</p>
            ) : (
              <p className="text-xs text-fg-muted">Sans code, Tamilya ne pourra plus payer à ta place.</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {mode === "set" ? (
                <button type="submit" disabled={!ready || busy} className={PRIMARY}>
                  {busy ? "Enregistrement…" : hasPin ? "Changer le code" : "Créer mon code"}
                </button>
              ) : (
                <button type="submit" disabled={!ready || busy} className={DANGER}>
                  {busy ? "Suppression…" : "Supprimer mon code"}
                </button>
              )}
              <button type="button" disabled={busy} onClick={close} className={SECONDARY}>
                Annuler
              </button>
            </div>
          </form>
        </RowEditor>
      )}
    </SettingsGroup>
  );
}
