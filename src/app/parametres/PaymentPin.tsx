"use client";

import { useEffect, useState } from "react";

const field = "w-24 rounded-xl border border-border bg-bg px-3 py-2 text-center text-lg tracking-[0.4em] tabular-nums outline-none focus:border-accent";
const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4);

/**
 * Code de paiement à 4 chiffres : obligatoire pour que Tamilya paie à la voix.
 * Changer ou supprimer le code demande l'actuel.
 */
export function PaymentPin() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/wallet/pin", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ hasPin: boolean }>) : null))
      .then((body) => setHasPin(body?.hasPin ?? false))
      .catch(() => setHasPin(false));
  }, []);

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
    setCurrent("");
    setPin("");
    setAgain("");
    setMessage({ ok: true, text: action === "set" ? "Code enregistré." : "Code supprimé : Tamilya ne peut plus payer à ta place." });
  }

  if (hasPin === null) return <div className="h-24 animate-pulse rounded-2xl bg-bg-subtle" />;
  const ready = pin.length === 4 && again.length === 4 && (!hasPin || current.length === 4);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <p className="text-sm">
        {hasPin ? "✅ Ton code est actif : Tamilya peut payer à ta place, après ton accord et ton code." : "Aucun code : Tamilya ne peut pas payer à ta place."}
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy) void send("set");
        }}
      >
        {hasPin ? (
          <label className="text-xs text-fg-muted">
            Code actuel
            <input type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(digitsOnly(e.target.value))} className={`${field} mt-1 block`} />
          </label>
        ) : null}
        <label className="text-xs text-fg-muted">
          {hasPin ? "Nouveau code" : "Code à 4 chiffres"}
          <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))} className={`${field} mt-1 block`} />
        </label>
        <label className="text-xs text-fg-muted">
          Encore une fois
          <input type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(digitsOnly(e.target.value))} className={`${field} mt-1 block`} />
        </label>
        <button type="submit" disabled={!ready || busy} className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-45">
          {hasPin ? "Changer" : "Créer mon code"}
        </button>
      </form>
      {hasPin ? (
        <button type="button" disabled={current.length !== 4 || busy} onClick={() => void send("remove")} className="text-xs text-danger hover:underline disabled:opacity-45">
          Supprimer mon code (avec le code actuel)
        </button>
      ) : null}
      {message ? (
        <p role="status" className={`text-xs ${message.ok ? "text-fg-muted" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
      <p className="text-xs text-fg-muted">Évite ta date de naissance. Un code trop simple (1111, 1234…) est refusé. Après 5 codes faux, le paiement à la voix est bloqué 15 minutes.</p>
    </div>
  );
}
