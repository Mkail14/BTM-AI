"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FoodResponse } from "@/app/api/food/route";
import { IconClose } from "@/components/ui/icons";
import { fieldError } from "@/lib/code-exam/candidate";
import type { FoodCartLine, FoodRestaurant } from "@/lib/food/catalog";
import { formatEuros } from "@/lib/wallet/limits";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base outline-none transition-colors focus:border-[var(--persona,var(--accent))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--persona,var(--accent))_20%,transparent)] sm:py-2.5";
const PRIMARY =
  "w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 sm:py-2.5 sm:text-sm";
const PERSONA = "var(--persona,var(--accent))";
/** Dernière adresse de livraison, gardée sur l'appareil pour la prochaine commande. */
const STORAGE_KEY = "btm-ai-livraison";

type Step = "delivery" | "pay" | "done";
type Delivery = { address: string; zone: string; phone: string; note: string };

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/**
 * Paiement d'une commande de repas, au centre du site sur fond flouté (même
 * fenêtre que la réservation du code) : adresse de livraison, puis
 * récapitulatif payé avec le portefeuille, puis confirmation.
 */
export function FoodCheckoutDialog({
  data,
  restaurant,
  lines,
  itemsCents,
  onClose,
  onPaid,
}: {
  data: FoodResponse;
  restaurant: FoodRestaurant;
  lines: FoodCartLine[];
  itemsCents: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<Step>("delivery");
  const [delivery, setDelivery] = useState<Delivery>({ address: "", zone: "", phone: "", note: "" });
  const [tried, setTried] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrivesAt, setArrivesAt] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Delivery> | null;
      // Adresse de la dernière commande : pré-remplie.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setDelivery((d) => ({ ...d, ...saved, note: "" }));
    } catch {
      // Rien d'enregistré.
    }
  }, []);

  const totalCents = itemsCents + data.deliveryCents;
  const missingCents = Math.max(0, totalCents - data.balanceCents);
  const errors = {
    address: delivery.address.trim().length < 5 ? "Indique ton adresse (rue, quartier, repère)." : null,
    zone: delivery.zone ? null : "Choisis ta commune.",
    phone: fieldError("phone", delivery.phone),
  };
  const deliveryValid = !errors.address && !errors.zone && !errors.phone;
  const items = new Map(restaurant.menu.flatMap((s) => s.items).map((i) => [i.id, i]));
  const set = (field: keyof Delivery, value: string) => setDelivery((d) => ({ ...d, [field]: value }));

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id, cart: lines, ...delivery, note: delivery.note || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { arrivesAt?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Paiement impossible.");
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: delivery.address, zone: delivery.zone, phone: delivery.phone }));
      setArrivesAt(body.arrivesAt ?? null);
      setStep("done");
      onPaid();
    } catch {
      setError("Pas de connexion : réessaie.");
    } finally {
      setPaying(false);
    }
  }

  const fieldClass = (bad: string | null) => `${INPUT_CLASS} ${tried && bad ? "border-danger" : ""}`;
  const errorLine = (bad: string | null) => (tried && bad ? <p className="booking-shake mt-1 text-xs text-danger">{bad}</p> : null);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="auth-sheet mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none scrollbar-none overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-bg p-0 pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-md sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl sm:border sm:pb-0"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-2">
          {step === "pay" ? (
            <button
              type="button"
              onClick={() => setStep("delivery")}
              aria-label="Retour"
              className="-ml-2 grid size-9 shrink-0 place-items-center rounded-full text-xl text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              ‹
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {step === "delivery" ? "Où te livrer ?" : step === "pay" ? "Ta commande" : "Commande envoyée"}
            </h2>
            <p className="truncate text-sm text-fg-muted">
              {restaurant.emoji} {restaurant.name}
              {data.demo ? " · démonstration" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fermer"
            className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>

        <div key={step} className="booking-step mt-5">
          {step === "delivery" ? (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (deliveryValid) setStep("pay");
              }}
              className="space-y-3.5"
            >
              <div>
                <span id={`${titleId}-zone`} className="block text-sm font-medium">
                  Commune
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${titleId}-zone`}>
                  {data.zones.map((z) => (
                    <button
                      key={z}
                      type="button"
                      role="radio"
                      aria-checked={delivery.zone === z}
                      onClick={() => set("zone", z)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        delivery.zone === z ? "border-transparent text-white" : "border-border hover:bg-bg-muted"
                      }`}
                      style={delivery.zone === z ? { background: PERSONA } : undefined}
                    >
                      {z}
                    </button>
                  ))}
                </div>
                {errorLine(errors.zone)}
              </div>
              <div>
                <label htmlFor={`${titleId}-address`} className="block text-sm font-medium">
                  Adresse
                </label>
                <input
                  id={`${titleId}-address`}
                  value={delivery.address}
                  onChange={(e) => set("address", e.target.value)}
                  autoComplete="street-address"
                  placeholder="Rue, quartier, repère (près de la mosquée…)"
                  className={fieldClass(errors.address)}
                />
                {errorLine(errors.address)}
              </div>
              <div>
                <label htmlFor={`${titleId}-phone`} className="block text-sm font-medium">
                  Téléphone du livreur
                </label>
                <input
                  id={`${titleId}-phone`}
                  value={delivery.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0639 12 34 56"
                  className={fieldClass(errors.phone)}
                />
                {errorLine(errors.phone)}
              </div>
              <div>
                <label htmlFor={`${titleId}-note`} className="block text-sm font-medium">
                  Un mot pour le restaurant <span className="font-normal text-fg-muted">(facultatif)</span>
                </label>
                <input
                  id={`${titleId}-note`}
                  value={delivery.note}
                  onChange={(e) => set("note", e.target.value)}
                  maxLength={200}
                  placeholder="Sans oignon, sauce à part…"
                  className={INPUT_CLASS}
                />
              </div>
              <button type="submit" className={`${PRIMARY} mt-1`} style={{ background: PERSONA }}>
                Continuer
              </button>
            </form>
          ) : null}

          {step === "pay" ? (
            <div>
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {lines.map((l) => {
                  const item = items.get(l.itemId);
                  return item ? (
                    <li key={l.itemId} className="flex justify-between gap-3 px-3.5 py-2.5">
                      <span>
                        <span className="font-semibold tabular-nums">{l.quantity}×</span> {item.name}
                      </span>
                      <span className="tabular-nums">{formatEuros(item.priceCents * l.quantity)}</span>
                    </li>
                  ) : null;
                })}
                <li className="flex justify-between gap-3 px-3.5 py-2.5 text-fg-muted">
                  <span>Livraison · {delivery.zone}</span>
                  <span className="tabular-nums">{formatEuros(data.deliveryCents)}</span>
                </li>
                <li className="flex justify-between gap-3 px-3.5 py-3 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatEuros(totalCents)}</span>
                </li>
              </ul>

              {/* Portefeuille : solde, et ce qu'il manque s'il ne suffit pas */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-bg-subtle px-3.5 py-2.5 text-sm">
                <span className="text-fg-muted">Mon portefeuille</span>
                <span className={`font-medium tabular-nums ${missingCents ? "text-danger" : ""}`}>{formatEuros(data.balanceCents)}</span>
              </div>

              {error ? (
                <p role="alert" className="booking-shake mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              {missingCents > 0 ? (
                <>
                  <button type="button" onClick={() => router.push("/portefeuille")} className={`${PRIMARY} mt-4`} style={{ background: PERSONA }}>
                    Recharger mon portefeuille
                  </button>
                  <p className="mt-2 text-center text-xs text-fg-muted">Il te manque {formatEuros(missingCents)}.</p>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void pay()} disabled={paying} className={`${PRIMARY} mt-4`} style={{ background: PERSONA }}>
                    {paying ? "Paiement…" : `Payer ${formatEuros(totalCents)}`}
                  </button>
                  <p className="mt-2 text-center text-xs text-fg-muted">
                    {data.demo ? "Démonstration : ton solde est vérifié, rien n'est débité." : "Débité de ton portefeuille."}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {step === "done" ? (
            <div className="py-2 text-center">
              <div className="booking-pop mx-auto grid size-14 place-items-center rounded-full text-2xl text-white" style={{ background: PERSONA }}>
                ✓
              </div>
              <p className="mt-4 font-medium">{restaurant.name} prépare ta commande !</p>
              {arrivesAt ? (
                <p className="mt-1 text-sm text-fg-muted">
                  Arrivée prévue vers <span className="font-semibold text-fg">{time.format(new Date(arrivesAt))}</span> · {delivery.zone}
                </p>
              ) : null}
              {data.demo ? <p className="mt-2 text-xs text-fg-muted">Démonstration : aucun restaurant n&apos;a reçu cette commande.</p> : null}
              <button type="button" onClick={() => ref.current?.close()} className={`${PRIMARY} mt-5`} style={{ background: PERSONA }}>
                Fermer
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
