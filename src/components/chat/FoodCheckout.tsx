"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FoodOrderPlaced, FoodResponse } from "@/app/api/food/route";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/ui/AddressFields";
import { IconClose } from "@/components/ui/icons";
import { addressFieldErrors } from "@/lib/address";
import { fieldError } from "@/lib/code-exam/candidate";
import type { FoodCartLine, FoodRestaurant } from "@/lib/food/catalog";
import { formatEuros } from "@/lib/wallet/limits";
import type { PlacedOrder } from "./OrderTracker";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-3 text-base outline-none transition-colors focus:border-[var(--persona,var(--accent))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--persona,var(--accent))_20%,transparent)] sm:py-2.5 sm:text-sm";
const PRIMARY =
  "w-full rounded-full px-4 py-3 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 sm:text-sm";
const PERSONA = "var(--persona,var(--accent))";
/** Ancienne copie de l'adresse et du téléphone en clair sur l'appareil : effacée (ils sont dans le profil). */
const LEGACY_STORAGE_KEY = "btm-ai-livraison";

/**
 * Seule fenêtre de la commande : changer l'adresse de livraison (champs, ou
 * position GPS), avec le choix de la garder pour les prochaines fois.
 */
function AddressDialog({
  initial,
  zones,
  canSave,
  onDone,
  onClose,
}: {
  initial: AddressDraft;
  zones: readonly string[];
  canSave: boolean;
  onDone: (address: AddressDraft, save: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [address, setAddress] = useState(initial);
  const [save, setSave] = useState(true);
  const [tried, setTried] = useState(false);
  const errors = addressFieldErrors(address);
  const zoneError =
    address.commune && !zones.includes(address.commune) ? `On ne livre pas encore à ${address.commune} (seulement ${zones.join(", ")}).` : null;

  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="auth-sheet mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none scrollbar-none overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-bg p-0 pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-md sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl sm:border sm:pb-0"
    >
      <form
        noValidate
        className="p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (errors.commune || errors.line || zoneError) return;
          onDone(address, canSave && save);
          ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            Où te livrer ?
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fermer"
            className="-mr-2 grid size-9 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>
        <div className="mt-4">
          <AddressFields
            id={`${id}-address`}
            value={address}
            onChange={setAddress}
            errors={tried ? errors : { commune: null, line: null }}
            inputClass={INPUT_CLASS}
            gps
          />
          {tried && zoneError ? <p className="booking-shake mt-1 text-xs text-danger">{zoneError}</p> : null}
        </div>
        {canSave ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
              className="size-4 shrink-0 accent-[var(--persona,var(--accent))]"
            />
            Garder cette adresse pour les prochaines fois
          </label>
        ) : null}
        <button type="submit" className={`${PRIMARY} mt-5`} style={{ background: PERSONA }}>
          Livrer ici
        </button>
      </form>
    </dialog>
  );
}

/**
 * Récapitulatif et paiement, directement dans la conversation (dans la carte
 * de la commande) : plats, adresse à confirmer, téléphone du livreur, un mot
 * pour le restaurant, puis « Payer ». Seul le changement d'adresse ouvre une
 * fenêtre. Une fois payé, onPlaced lance le suivi en direct.
 */
export function FoodCheckout({
  data,
  restaurant,
  lines,
  itemsCents,
  onBack,
  onChangeQuantity,
  onPlaced,
}: {
  data: FoodResponse;
  restaurant: FoodRestaurant;
  lines: FoodCartLine[];
  itemsCents: number;
  onBack: () => void;
  onChangeQuantity: (itemId: string, delta: number) => void;
  onPlaced: (order: PlacedOrder) => void;
}) {
  const id = useId();
  const [address, setAddress] = useState<AddressDraft>(data.address ?? EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(!data.address);
  const [editingAddress, setEditingAddress] = useState(false);
  // Numéro enregistré : seule sa version masquée est connue ici, le serveur le réutilise.
  const [editingPhone, setEditingPhone] = useState(!data.savedPhone);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => localStorage.removeItem(LEGACY_STORAGE_KEY), []);

  const items = new Map(restaurant.menu.flatMap((s) => s.items).map((i) => [i.id, i]));
  const totalCents = itemsCents + data.deliveryCents;
  const missingCents = Math.max(0, totalCents - data.balanceCents);
  const hasAddress = Boolean(address.commune && address.line);
  const zoneError = address.commune && !data.zones.includes(address.commune) ? `On ne livre pas encore à ${address.commune}.` : null;
  const phoneError = editingPhone ? fieldError("phone", phone) : null;

  async function pay() {
    setTried(true);
    if (!hasAddress || zoneError) return setEditingAddress(true);
    if (phoneError) return;
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
          saveAddress,
          phone: editingPhone ? phone : undefined,
          note: note || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<FoodOrderPlaced> & { error?: string };
      if (!res.ok || !body.code || !body.placedAt || !body.readyAt || !body.arrivesAt) {
        setError(body.error ?? "Paiement impossible.");
        return;
      }
      onPlaced({
        code: body.code,
        restaurant: restaurant.name,
        emoji: restaurant.emoji,
        commune: address.commune,
        lines: lines.map((l) => `${l.quantity}× ${items.get(l.itemId)?.name ?? ""}`),
        totalCents: body.totalCents ?? totalCents,
        demo: Boolean(body.demo),
        placedAt: body.placedAt,
        readyAt: body.readyAt,
        arrivesAt: body.arrivesAt,
      });
    } catch {
      setError("Pas de connexion : réessaie.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="booking-step">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour aux plats"
          className="-ml-1.5 grid size-8 place-items-center rounded-full text-lg text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">Ta commande</p>
          <p className="truncate text-xs text-fg-muted">
            {restaurant.emoji} {restaurant.name} · {restaurant.etaMinutes[0]}–{restaurant.etaMinutes[1]} min
          </p>
        </div>
        {data.demo ? (
          <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pb-4">
        {/* Plats, quantités modifiables */}
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {lines.map((l) => {
            const item = items.get(l.itemId);
            return item ? (
              <li key={l.itemId} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(l.itemId, -1)}
                    aria-label={`Retirer un ${item.name}`}
                    className="grid size-6 place-items-center rounded-full border border-border text-sm leading-none hover:bg-bg-muted"
                  >
                    −
                  </button>
                  <span className="w-4 text-center font-semibold tabular-nums">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(l.itemId, 1)}
                    aria-label={`Ajouter un ${item.name}`}
                    className="grid size-6 place-items-center rounded-full border border-border text-sm leading-none hover:bg-bg-muted"
                  >
                    +
                  </button>
                </span>
                <span className="w-16 text-right tabular-nums">{formatEuros(item.priceCents * l.quantity)}</span>
              </li>
            ) : null;
          })}
          <li className="flex justify-between px-3 py-2 text-fg-muted">
            <span>Livraison</span>
            <span className="tabular-nums">{formatEuros(data.deliveryCents)}</span>
          </li>
          <li className="flex justify-between px-3 py-2.5 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatEuros(totalCents)}</span>
          </li>
        </ul>

        {/* Adresse : reconfirmée à chaque commande, changée dans une petite fenêtre */}
        <div className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${tried && (!hasAddress || zoneError) ? "border-danger" : "border-border"}`}>
          <span aria-hidden="true" className="text-lg">
            📍
          </span>
          <div className="min-w-0 flex-1">
            {hasAddress ? (
              <>
                <p className="truncate font-medium">{address.line}</p>
                <p className="text-xs text-fg-muted">
                  {address.commune}
                  {address.geo ? " · position GPS" : ""}
                </p>
                {zoneError ? <p className="mt-0.5 text-xs text-danger">{zoneError}</p> : null}
              </>
            ) : (
              <p className="text-fg-muted">Aucune adresse de livraison</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditingAddress(true)}
            className="shrink-0 text-xs font-semibold hover:underline"
            style={{ color: PERSONA }}
          >
            {hasAddress ? "Changer" : "Ajouter"}
          </button>
        </div>

        {/* Téléphone du livreur */}
        {editingPhone ? (
          <div>
            <label htmlFor={`${id}-phone`} className="block text-xs font-medium">
              Téléphone pour le livreur
            </label>
            <input
              id={`${id}-phone`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              placeholder="0639 12 34 56"
              className={`${INPUT_CLASS} ${tried && phoneError ? "border-danger" : ""}`}
            />
            {tried && phoneError ? <p className="booking-shake mt-1 text-xs text-danger">{phoneError}</p> : null}
          </div>
        ) : (
          <p className="flex items-center gap-3 px-1 text-xs text-fg-muted">
            <span aria-hidden="true" className="text-base">
              📞
            </span>
            <span className="flex-1">
              Le livreur t&apos;appellera au <span className="font-medium text-fg tabular-nums">{data.savedPhone}</span>
            </span>
            <button type="button" onClick={() => setEditingPhone(true)} className="font-semibold hover:underline" style={{ color: PERSONA }}>
              Changer
            </button>
          </p>
        )}

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          aria-label="Un mot pour le restaurant (facultatif)"
          placeholder="Un mot pour le restaurant ? (sans oignon, sauce à part…)"
          className={INPUT_CLASS.replace("mt-1.5 ", "")}
        />

        <div className="flex items-center justify-between rounded-xl bg-bg-subtle px-3 py-2 text-xs">
          <span className="text-fg-muted">{data.demo ? "Portefeuille (démo)" : "Portefeuille"}</span>
          <span className={`font-semibold tabular-nums ${missingCents ? "text-danger" : ""}`}>{formatEuros(data.balanceCents)}</span>
        </div>

        {error ? (
          <p role="alert" className="booking-shake rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {missingCents > 0 ? (
          <Link href="/portefeuille" className={`${PRIMARY} block text-center`} style={{ background: PERSONA }}>
            Il manque {formatEuros(missingCents)} · recharger
          </Link>
        ) : (
          <button type="button" onClick={() => void pay()} disabled={paying} className={PRIMARY} style={{ background: PERSONA }}>
            {paying ? "Paiement…" : `Payer ${formatEuros(totalCents)}`}
          </button>
        )}
      </div>

      {editingAddress ? (
        <AddressDialog
          initial={address}
          zones={data.zones}
          canSave={Boolean(data.address)}
          onDone={(next, save) => {
            setAddress(next);
            setSaveAddress(save || !data.address);
          }}
          onClose={() => setEditingAddress(false)}
        />
      ) : null}
    </div>
  );
}
