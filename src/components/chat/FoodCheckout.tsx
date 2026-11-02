"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FoodOrderPlaced, FoodResponse } from "@/app/api/food/route";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/ui/AddressFields";
import { IconClose } from "@/components/ui/icons";
import { addressFieldErrors } from "@/lib/address";
import { fieldError } from "@/lib/code-exam/candidate";
import { kindOf, type GeoPoint } from "@/lib/address";
import type { FoodCartLine, FoodRestaurant } from "@/lib/food/catalog";
import { locateMe } from "@/lib/geo/communes";
import { deliveryPoint, restaurantPoint } from "@/lib/food/route";
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
  here = null,
}: {
  data: FoodResponse;
  restaurant: FoodRestaurant;
  lines: FoodCartLine[];
  itemsCents: number;
  onBack: () => void;
  onChangeQuantity: (itemId: string, delta: number) => void;
  onPlaced: (order: PlacedOrder) => void;
  /** Position donnée plus tôt dans la carte (« près de moi ») : proposée pour livrer là où on est. */
  here?: { commune: string; geo: GeoPoint | null } | null;
}) {
  const id = useId();
  const [address, setAddress] = useState<AddressDraft>(data.address ?? EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(!data.address);
  const [editingAddress, setEditingAddress] = useState(false);
  // Livrer à l'adresse du compte, là où la personne se trouve (position GPS) ou à une adresse du carnet (son id).
  const [where, setWhere] = useState<string>(data.address && !here?.geo ? "home" : "here");
  const [spot, setSpot] = useState<{ commune: string; geo: GeoPoint } | null>(here?.geo ? { commune: here.commune, geo: here.geo } : null);
  const [locating, setLocating] = useState(false);
  const [spotError, setSpotError] = useState<string | null>(null);
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
  // Adresse envoyée : celle du compte (ou corrigée), ou la position GPS du moment.
  const book = data.savedAddresses.find((a) => a.id === where) ?? null;
  const delivery: AddressDraft | null =
    where === "here" ? (spot ? { commune: spot.commune, line: "Position GPS : là où je suis", geo: spot.geo } : null) : (book ?? address);
  const hasAddress = Boolean(delivery?.commune && delivery.line);
  const zoneError =
    delivery?.commune && !data.zones.includes(delivery.commune) ? `On ne livre pas encore à ${delivery.commune}.` : null;

  async function locate() {
    setWhere("here");
    setLocating(true);
    setSpotError(null);
    const found = await locateMe();
    setLocating(false);
    if (found.ok) setSpot({ commune: found.commune, geo: found.geo });
    else setSpotError(found.error);
  }
  const phoneError = editingPhone ? fieldError("phone", phone) : null;

  async function pay() {
    setTried(true);
    if (where === "here" && !spot) return void locate();
    if (!delivery || !hasAddress || zoneError) return where === "home" ? setEditingAddress(true) : undefined;
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
          address: delivery,
          // Position du moment : jamais gardée comme adresse du compte.
          saveAddress: where === "home" && saveAddress,
          phone: editingPhone ? phone : undefined,
          note: note || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<FoodOrderPlaced> & { error?: string };
      if (!res.ok || !body.code || !body.placedAt || !body.readyAt || !body.arrivesAt) {
        setError(body.error ?? "Paiement impossible.");
        return;
      }
      // Places sur la carte du suivi, trouvées par le serveur (vraie rue, posées sur une route) ;
      // à défaut, le restaurant dans sa commune et la livraison au GPS donné, sinon dans la commune.
      const from = body.from ?? restaurantPoint(restaurant.id, restaurant.commune);
      onPlaced({
        code: body.code,
        restaurant: restaurant.name,
        emoji: restaurant.emoji,
        commune: delivery.commune,
        lines: lines.map((l) => `${l.quantity}× ${items.get(l.itemId)?.name ?? ""}`),
        totalCents: body.totalCents ?? totalCents,
        demo: Boolean(body.demo),
        placedAt: body.placedAt,
        readyAt: body.readyAt,
        arrivesAt: body.arrivesAt,
        courier: body.courier ?? null,
        from,
        to: body.to ?? deliveryPoint(body.code, delivery.commune, delivery.geo, from),
        address: where === "here" ? "Position GPS" : delivery.line,
        note: note || undefined,
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

        {/* Où livrer : chez moi (adresse du compte) ou là où je suis (GPS) */}
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-xs font-medium">Où te livrer ?</legend>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 transition ${
              where === "home" ? "border-[var(--persona,var(--accent))] bg-bg-subtle" : "border-border hover:bg-bg-subtle"
            }`}
          >
            <input type="radio" name={`${id}-where`} checked={where === "home"} onChange={() => setWhere("home")} className="sr-only" />
            <span aria-hidden="true" className="text-lg">
              🏠
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Chez moi</span>
              {address.commune && address.line ? (
                <span className="block truncate text-xs text-fg-muted">
                  {address.line} · {address.commune}
                </span>
              ) : (
                <span className="block text-xs text-fg-muted">Aucune adresse enregistrée</span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setWhere("home");
                  setEditingAddress(true);
                }}
                className="mt-0.5 text-xs font-semibold hover:underline"
                style={{ color: PERSONA }}
              >
                {address.commune && address.line ? "Changer" : "Ajouter mon adresse"}
              </button>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 transition ${
              where === "here" ? "border-[var(--persona,var(--accent))] bg-bg-subtle" : "border-border hover:bg-bg-subtle"
            }`}
          >
            <input
              type="radio"
              name={`${id}-where`}
              checked={where === "here"}
              onChange={() => (spot ? setWhere("here") : void locate())}
              className="sr-only"
            />
            <span aria-hidden="true" className="text-lg">
              📍
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Là où je suis</span>
              <span className="block text-xs text-fg-muted">
                {locating
                  ? "Recherche de ta position…"
                  : spot
                    ? `Vers ${spot.commune} · à ${spot.geo.accuracy} m près`
                    : "Le livreur vient à ta position GPS"}
              </span>
              {spotError ? <span className="block text-xs text-danger">{spotError}</span> : null}
            </span>
          </label>
          {data.savedAddresses.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 transition ${
                where === a.id ? "border-[var(--persona,var(--accent))] bg-bg-subtle" : "border-border hover:bg-bg-subtle"
              }`}
            >
              <input type="radio" name={`${id}-where`} checked={where === a.id} onChange={() => setWhere(a.id)} className="sr-only" />
              <span aria-hidden="true" className="text-lg">
                {kindOf(a.kind).emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.label}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {a.line} · {a.commune}
                </span>
              </span>
            </label>
          ))}
          {tried && zoneError ? <p className="text-xs text-danger sm:col-span-2">{zoneError}</p> : null}
          {tried && !hasAddress && where === "home" ? (
            <p className="text-xs text-danger sm:col-span-2">Ajoute ton adresse ou choisis « Là où je suis ».</p>
          ) : null}
        </fieldset>

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

        {/* Une seule note, envoyée avec la commande : le restaurant la lit et la passe au livreur. */}
        <div>
          <label htmlFor={`${id}-note`} className="block text-xs font-medium">
            Un mot pour le restaurant ou le livreur <span className="font-normal text-fg-muted">(facultatif)</span>
          </label>
          <input
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Sans oignon, portail bleu, appelle en arrivant…"
            className={INPUT_CLASS}
          />
        </div>

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
