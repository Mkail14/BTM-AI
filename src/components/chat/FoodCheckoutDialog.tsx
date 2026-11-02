"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FoodResponse } from "@/app/api/food/route";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/ui/AddressFields";
import { IconClose } from "@/components/ui/icons";
import { addressFieldErrors } from "@/lib/address";
import { fieldError } from "@/lib/code-exam/candidate";
import type { FoodCartLine, FoodRestaurant } from "@/lib/food/catalog";
import { formatEuros } from "@/lib/wallet/limits";
import { OrderTicket } from "./OrderTicket";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base outline-none transition-colors focus:border-[var(--persona,var(--accent))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--persona,var(--accent))_20%,transparent)] sm:py-2.5";
const PRIMARY =
  "w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 sm:py-2.5 sm:text-sm";
const PERSONA = "var(--persona,var(--accent))";
/** Ancienne copie de l'adresse et du téléphone en clair sur l'appareil : effacée (ils sont dans le profil). */
const LEGACY_STORAGE_KEY = "btm-ai-livraison";

type Step = "delivery" | "pay" | "done";

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/**
 * Paiement d'une commande de repas, au centre du site sur fond flouté (même
 * fenêtre que la réservation du code) : adresse de livraison, puis
 * récapitulatif payé avec le portefeuille, puis confirmation.
 *
 * L'adresse du compte peut être fausse ou ancienne : elle est reconfirmée à
 * chaque commande (« Oui, c'est ici »), sinon corrigée ou remplacée par la
 * position GPS, et gardée pour la fois suivante.
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
  const [address, setAddress] = useState<AddressDraft>(data.address ?? EMPTY_ADDRESS);
  // Pas d'adresse enregistrée : le formulaire est ouvert d'emblée.
  const [editingAddress, setEditingAddress] = useState(!data.address);
  const [saveAddress, setSaveAddress] = useState(true);
  // Numéro enregistré : seule sa version masquée est connue ici, le serveur le réutilise.
  const [editingPhone, setEditingPhone] = useState(!data.savedPhone);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrivesAt, setArrivesAt] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  const totalCents = itemsCents + data.deliveryCents;
  const missingCents = Math.max(0, totalCents - data.balanceCents);
  const addressErrors = addressFieldErrors(address);
  const zoneError =
    address.commune && !data.zones.includes(address.commune)
      ? `On ne livre pas encore à ${address.commune} (seulement ${data.zones.join(", ")}).`
      : null;
  const phoneError = editingPhone ? fieldError("phone", phone) : null;
  const deliveryValid = !addressErrors.commune && !addressErrors.line && !zoneError && !phoneError;
  const items = new Map(restaurant.menu.flatMap((s) => s.items).map((i) => [i.id, i]));

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          cart: lines,
          address,
          // Adresse corrigée : gardée pour la prochaine fois si la personne le veut.
          saveAddress: editingAddress && saveAddress,
          phone: editingPhone ? phone : undefined,
          note: note || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { arrivesAt?: string; code?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Paiement impossible.");
        return;
      }
      setArrivesAt(body.arrivesAt ?? null);
      setCode(body.code ?? null);
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
              {editingAddress ? (
                <div>
                  <AddressFields
                    id={`${titleId}-address`}
                    value={address}
                    onChange={setAddress}
                    errors={tried ? addressErrors : { commune: null, line: null }}
                    inputClass={INPUT_CLASS}
                    gps
                  />
                  {errorLine(zoneError)}
                  {data.address ? (
                    <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                        className="size-4 shrink-0 accent-[var(--persona,var(--accent))]"
                      />
                      Garder cette adresse pour les prochaines fois
                    </label>
                  ) : null}
                </div>
              ) : (
                // Adresse du compte : on redemande à chaque fois si elle est toujours exacte.
                <div className="rounded-xl border border-border p-3.5">
                  <p className="text-sm text-fg-muted">Est-ce bien ici qu&apos;on te livre ?</p>
                  <p className="mt-1 font-medium">{address.line}</p>
                  <p className="text-sm text-fg-muted">
                    {address.commune}
                    {address.geo ? " · 📍 position GPS enregistrée" : ""}
                  </p>
                  {errorLine(zoneError)}
                  <button
                    type="button"
                    onClick={() => setEditingAddress(true)}
                    className="mt-2.5 text-sm font-medium underline underline-offset-2"
                  >
                    Non, corriger ou utiliser ma position
                  </button>
                </div>
              )}

              {editingPhone ? (
                <div>
                  <label htmlFor={`${titleId}-phone`} className="block text-sm font-medium">
                    Téléphone pour le livreur
                  </label>
                  <input
                    id={`${titleId}-phone`}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={30}
                    placeholder="0639 12 34 56"
                    className={fieldClass(phoneError)}
                  />
                  {errorLine(phoneError)}
                </div>
              ) : (
                <p className="text-sm text-fg-muted">
                  Le livreur t&apos;appellera au <span className="font-medium text-fg tabular-nums">{data.savedPhone}</span> ·{" "}
                  <button type="button" onClick={() => setEditingPhone(true)} className="font-medium text-fg underline underline-offset-2">
                    Changer
                  </button>
                </p>
              )}

              <div>
                <label htmlFor={`${titleId}-note`} className="block text-sm font-medium">
                  Un mot pour le restaurant <span className="font-normal text-fg-muted">(facultatif)</span>
                </label>
                <input
                  id={`${titleId}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  placeholder="Sans oignon, sauce à part…"
                  className={INPUT_CLASS}
                />
              </div>
              <button type="submit" className={`${PRIMARY} mt-1`} style={{ background: PERSONA }}>
                {editingAddress ? "Continuer" : "Oui, c'est la bonne adresse"}
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
                  <span>Livraison · {address.commune}</span>
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
                  Arrivée prévue vers <span className="font-semibold text-fg">{time.format(new Date(arrivesAt))}</span> · {address.commune}
                </p>
              ) : null}
              {code ? (
                <OrderTicket code={code} summary={`${restaurant.name} · ${formatEuros(itemsCents + data.deliveryCents)}`} />
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
