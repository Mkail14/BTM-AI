"use client";

import { useSyncExternalStore } from "react";
import { acceptPayment, cancelPayment, eraseDigit, getPay, subscribePay, typeDigit } from "@/lib/voice-live/voice-pay";

const idle = () => ({ step: "idle" as const, label: "", typed: 0, error: null });

/**
 * Paiement à la voix, à l'écran : l'avertissement à accepter (une seule fois), puis le code à
 * 4 chiffres (dit à Tamilya ou tapé ici). Rien n'est payé avant le code juste.
 */
export function VoicePay() {
  const pay = useSyncExternalStore(subscribePay, getPay, idle);
  if (pay.step === "idle") return null;

  return (
    <div
      role="dialog"
      aria-label="Paiement par Tamilya"
      className="voice-pay pointer-events-auto mx-auto mb-3 w-full max-w-sm rounded-3xl bg-white p-4 text-sm text-neutral-900 shadow-2xl"
    >
      {pay.step === "nopin" ? (
        <>
          <p className="font-semibold">Code de paiement nécessaire</p>
          <p className="mt-1 text-neutral-600">
            Pour que Tamilya paie à ta place, crée d&apos;abord ton code à 4 chiffres dans les paramètres. Sinon, touche toi-même le bouton.
          </p>
          <div className="mt-3 flex gap-2">
            <a href="/parametres?rubrique=tamilya" className="flex-1 rounded-full bg-neutral-900 px-4 py-2.5 text-center font-medium text-white">
              Créer mon code
            </a>
            <button type="button" onClick={cancelPayment} className="rounded-full px-4 py-2.5 font-medium hover:bg-neutral-100">
              Fermer
            </button>
          </div>
        </>
      ) : pay.step === "consent" ? (
        <>
          <p className="font-semibold">Laisser Tamilya payer à ta place ?</p>
          <p className="mt-0.5 text-xs text-neutral-500">Demandé une seule fois : ensuite, seul ton code sera demandé.</p>
          <p className="mt-1 truncate text-xs text-neutral-500">{pay.label}</p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-neutral-700">
            <li>Tamilya peut mal comprendre ce que tu dis. Si tu l&apos;autorises à payer, c&apos;est sous ta responsabilité : vérifie toujours le montant.</li>
            <li>BTM ne garantit pas le résultat d&apos;un paiement fait par Tamilya et ne rembourse pas un paiement que tu as autorisé.</li>
            <li>Ton code à 4 chiffres est obligatoire. Tamilya ne le garde pas et le site ne l&apos;enregistre pas. Si tu le dis à voix haute, Google (Gemini) l&apos;entend pour le comprendre, et les gens autour de toi aussi : tu peux le taper ici à la place.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={acceptPayment} className="flex-1 rounded-full bg-neutral-900 px-4 py-2.5 font-medium text-white">
              J&apos;autorise
            </button>
            <button type="button" onClick={cancelPayment} className="rounded-full px-4 py-2.5 font-medium hover:bg-neutral-100">
              Annuler
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Ton code de paiement</p>
            <button type="button" onClick={cancelPayment} className="text-xs text-neutral-500 hover:underline">
              Annuler
            </button>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">Dis-le à Tamilya ou tape-le ici.</p>
          <div className="mt-3 flex justify-center gap-3" aria-label={`${pay.typed} chiffre${pay.typed > 1 ? "s" : ""} sur 4`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`size-3.5 rounded-full ${i < pay.typed ? "bg-neutral-900" : "border-2 border-neutral-300"}`} />
            ))}
          </div>
          {pay.error ? (
            <p role="alert" className="mt-2 text-center text-xs text-red-600">
              {pay.error}
            </p>
          ) : pay.step === "checking" ? (
            <p className="mt-2 text-center text-xs text-neutral-500">Vérification…</p>
          ) : null}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key, i) =>
              key ? (
                <button
                  key={key}
                  type="button"
                  // Hors de portée de Tamilya : le clavier n'est pas dans un tableau.
                  disabled={pay.step === "checking"}
                  aria-label={key === "⌫" ? "Effacer" : key}
                  onClick={() => (key === "⌫" ? eraseDigit() : typeDigit(key))}
                  className="rounded-xl bg-neutral-100 py-2.5 text-lg font-medium tabular-nums transition active:scale-95 disabled:opacity-40"
                >
                  {key}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
