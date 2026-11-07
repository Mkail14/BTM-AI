"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Delete, LockKeyhole } from "lucide-react";
import { cancelPayPin, erasePayDigit, getPayPin, PAY_PIN_IDLE, subscribePayPin, typePayDigit } from "@/lib/wallet/pay-pin";

/**
 * Fenêtre du code de paiement, avant chaque paiement fait au doigt.
 * Fenêtre native (showModal) : elle passe au-dessus d'une autre fenêtre déjà
 * ouverte, comme la réservation de l'examen du code.
 */
export function PayPinHost() {
  const pay = useSyncExternalStore(subscribePayPin, getPayPin, () => PAY_PIN_IDLE);
  const ref = useRef<HTMLDialogElement>(null);
  const open = pay.step !== "idle";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Clavier de l'ordinateur : chiffres et effacement.
  useEffect(() => {
    if (pay.step !== "pin") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) typePayDigit(e.key);
      else if (e.key === "Backspace") erasePayDigit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pay.step]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="pay-pin-title"
      onCancel={(e) => {
        e.preventDefault();
        cancelPayPin();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) cancelPayPin();
      }}
      className="confirm-dialog m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-sm"
    >
      {open ? (
        <div className="confirm-dialog-panel rounded-t-3xl border border-border bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <LockKeyhole size={20} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="pay-pin-title" className="text-base font-semibold leading-snug">
                {pay.step === "nopin" ? "Code de paiement nécessaire" : "Ton code de paiement"}
              </h2>
              {pay.label ? <p className="truncate text-xs text-fg-muted">{pay.label}</p> : null}
            </div>
          </div>

          {pay.step === "nopin" ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                Pour payer, crée d&apos;abord ton code à 4 chiffres dans les paramètres. Il protège ton portefeuille si quelqu&apos;un prend ton téléphone.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={cancelPayPin} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-bg-muted">
                  Fermer
                </button>
                <a href="/parametres?rubrique=awa" className="rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-fg hover:bg-accent-hover">
                  Créer mon code
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 flex justify-center gap-3" aria-label={`${pay.typed} chiffre${pay.typed > 1 ? "s" : ""} sur 4`}>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`size-3.5 rounded-full ${i < pay.typed ? "bg-fg" : "border-2 border-border"}`} />
                ))}
              </div>
              <p role={pay.error ? "alert" : undefined} className={`mt-2 min-h-4 text-center text-xs ${pay.error ? "text-danger" : "text-fg-muted"}`}>
                {pay.error ?? (pay.step === "checking" ? "Vérification…" : pay.step === "loading" ? "Un instant…" : "")}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "erase"].map((key, i) =>
                  key ? (
                    <button
                      key={key}
                      type="button"
                      disabled={pay.step !== "pin"}
                      aria-label={key === "erase" ? "Effacer" : key}
                      onClick={() => (key === "erase" ? erasePayDigit() : typePayDigit(key))}
                      className="grid place-items-center rounded-xl bg-bg-muted py-2.5 text-lg font-medium tabular-nums transition active:scale-95 disabled:opacity-40"
                    >
                      {key === "erase" ? <Delete size={20} strokeWidth={1.8} aria-hidden="true" /> : key}
                    </button>
                  ) : (
                    <span key={i} />
                  ),
                )}
              </div>
              <button type="button" onClick={cancelPayPin} className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium text-fg-muted hover:bg-bg-muted">
                Annuler
              </button>
            </>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
