"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FoodOrderPlaced, FoodResponse } from "@/app/api/food/route";
import { AddressFields, EMPTY_ADDRESS, type AddressDraft } from "@/components/ui/AddressFields";
import { IconClose } from "@/components/ui/icons";
import { addressFieldErrors } from "@/lib/address";
import { fieldError } from "@/lib/code-exam/candidate";
import { kindOf, type GeoPoint } from "@/lib/address";
import type { FoodCartLine, FoodRestaurant } from "@/lib/food/catalog";
import { locateMe } from "@/lib/geo/communes";
import { deliveryPoint, restaurantPoint } from "@/lib/food/route";
import { dayLabel, deliverySlots, slotDay, slotTime } from "@/lib/food/schedule";
import { formatEuros } from "@/lib/wallet/limits";
import { speak } from "@/lib/chat/voice";
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
  initialScheduled = false,
  stops,
  deliveryCentsFor,
  initialNote = "",
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
  /** Ouvert par « Programmer » : l'heure de livraison est à choisir. */
  initialScheduled?: boolean;
  /** Commande groupée : les paniers par restaurant (`restaurant` les présente comme un seul). */
  stops?: { restaurantId: string; cart: FoodCartLine[] }[];
  /** Commande groupée : la livraison dépend du trajet, donc de l'adresse choisie. */
  deliveryCentsFor?: (place: { commune: string; geo: GeoPoint | null } | null) => number;
  /** Précisions déjà données à Tamilya (« trois sauces »). */
  initialNote?: string;
}) {
  const id = useId();
  // Quand livrer : dès que possible, ou à une heure choisie (créneaux de 30 min).
  const [slots, setSlots] = useState(() => deliverySlots(Date.now(), restaurant.etaMinutes[1]));
  const [scheduled, setScheduled] = useState(initialScheduled && slots.length > 0);
  const [slot, setSlot] = useState<number | null>(slots[0] ?? null);
  const days = [...new Set(slots.map(slotDay))];
  const [day, setDay] = useState(days[0] ?? "");

  // Les créneaux sont recalculés chaque minute (et au moment de payer) : un créneau
  // passé pendant qu'on remplit le formulaire disparaît. Renvoie faux si le créneau choisi n'est plus possible.
  const refreshSlots = useCallback(() => {
    const fresh = deliverySlots(Date.now(), restaurant.etaMinutes[1]);
    setSlots(fresh);
    if (slot !== null && fresh.includes(slot)) return true;
    const next = fresh.find((s) => slotDay(s) === day) ?? fresh[0] ?? null;
    setSlot(next);
    if (next !== null) setDay(slotDay(next));
    else setScheduled(false);
    return false;
  }, [restaurant.etaMinutes, slot, day]);
  useEffect(() => {
    const timer = window.setInterval(refreshSlots, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshSlots]);
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
  const [note, setNote] = useState(initialNote);
  const [tried, setTried] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => localStorage.removeItem(LEGACY_STORAGE_KEY), []);

  // Solde insuffisant : Tamilya prend la parole d'elle-même et explique quoi faire.
  const [explained, setExplained] = useState<string | null>(null);
  const stopVoice = useRef<(() => void) | null>(null);
  useEffect(() => () => stopVoice.current?.(), []);
  function explainNoMoney(missing: number) {
    const text =
      data.balanceCents <= 0
        ? `Ton portefeuille est vide : ton solde est à zéro, donc je ne peux pas payer ta commande de ${formatEuros(totalCents)}. Recharge ton portefeuille, puis reviens ici : ta commande t'attend.`
        : `Il te manque ${formatEuros(missing)} pour payer ta commande de ${formatEuros(totalCents)}. Ton solde est de ${formatEuros(data.balanceCents)}. Recharge ton portefeuille, puis reviens ici : ta commande t'attend.`;
    setExplained(text);
    stopVoice.current?.();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      stopVoice.current = speak(text, { onDone: () => (stopVoice.current = null) });
    }
  }

  const items = new Map(restaurant.menu.flatMap((s) => s.items).map((i) => [i.id, i]));
  // Adresse envoyée : celle du compte (ou corrigée), ou la position GPS du moment.
  const book = data.savedAddresses.find((a) => a.id === where) ?? null;
  const delivery: AddressDraft | null =
    where === "here" ? (spot ? { commune: spot.commune, line: "Position GPS : là où je suis", geo: spot.geo } : null) : (book ?? address);
  const deliveryCents = deliveryCentsFor ? deliveryCentsFor(delivery) : data.deliveryCents;
  const totalCents = itemsCents + deliveryCents;
  const missingCents = Math.max(0, totalCents - data.balanceCents);
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
    if (scheduled && !refreshSlots()) {
      setError("Ce créneau est passé : choisis une autre heure.");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: stops?.[0]?.restaurantId ?? restaurant.id,
          cart: stops?.[0]?.cart ?? lines,
          extraStops: stops?.slice(1),
          address: delivery,
          // Position du moment : jamais gardée comme adresse du compte.
          saveAddress: where === "home" && saveAddress,
          phone: editingPhone ? phone : undefined,
          note: note || undefined,
          scheduledFor: scheduled && slot ? new Date(slot).toISOString() : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<FoodOrderPlaced> & { error?: string };
      if (res.status === 402) {
        explainNoMoney(Math.max(missingCents, 1));
        return;
      }
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
        scheduled: Boolean(body.scheduled),
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
          className="-ml-1.5 grid size-8 place-items-center rounded-full text-lg text-fg-muted pointer-coarse:size-10 hover:bg-bg-muted hover:text-fg"
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
                    className="grid size-9 place-items-center rounded-full border border-border text-sm leading-none pointer-coarse:size-10 hover:bg-bg-muted"
                  >
                    −
                  </button>
                  <span className="w-4 text-center font-semibold tabular-nums">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(l.itemId, 1)}
                    aria-label={`Ajouter un ${item.name}`}
                    className="grid size-9 place-items-center rounded-full border border-border text-sm leading-none pointer-coarse:size-10 hover:bg-bg-muted"
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
            <span className="tabular-nums">{formatEuros(deliveryCents)}</span>
          </li>
          <li className="flex justify-between px-3 py-2.5 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatEuros(totalCents)}</span>
          </li>
        </ul>

        {/* Quand livrer : dès que possible, ou programmé à une heure */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium">Quand ?</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: false, emoji: "⚡", label: "Dès que possible", hint: `${restaurant.etaMinutes[0]}–${restaurant.etaMinutes[1]} min` },
              { value: true, emoji: "⏰", label: "Programmer", hint: slots.length ? "Choisis l'heure" : "Plus de créneau" },
            ].map((o) => (
              <label
                key={o.label}
                className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition ${
                  scheduled === o.value ? "border-[var(--persona,var(--accent))] bg-bg-subtle" : "border-border hover:bg-bg-subtle"
                } ${o.value && !slots.length ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name={`${id}-when`}
                  checked={scheduled === o.value}
                  disabled={o.value && !slots.length}
                  onChange={() => setScheduled(o.value)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="text-lg">
                  {o.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{o.label}</span>
                  <span className="block truncate text-xs text-fg-muted">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {scheduled ? (
            <div className="booking-step mt-2 space-y-2">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {days.map((d) => {
                  const first = slots.find((s) => slotDay(s) === d)!;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDay(d);
                        setSlot(first);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        day === d ? "border-transparent text-white" : "border-border hover:bg-bg-subtle"
                      }`}
                      style={day === d ? { background: PERSONA } : undefined}
                    >
                      {dayLabel(first)}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Heure de livraison">
                {slots
                  .filter((s) => slotDay(s) === day)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={slot === s}
                      onClick={() => setSlot(s)}
                      className={`rounded-xl border px-2.5 py-1.5 text-sm tabular-nums transition ${
                        slot === s ? "border-[var(--persona,var(--accent))] bg-bg-subtle font-semibold" : "border-border hover:bg-bg-subtle"
                      }`}
                    >
                      {slotTime(s)}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </fieldset>

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

        {explained ? (
          <div role="alert" className="booking-step flex gap-2.5 rounded-2xl border border-border bg-bg-subtle px-3 py-2.5 text-sm">
            <span aria-hidden="true" className="mt-0.5 size-5 shrink-0 rounded-full" style={{ background: PERSONA }} />
            <p>
              <span className="block text-xs font-semibold" style={{ color: PERSONA }}>
                Tamilya
              </span>
              {explained}
            </p>
          </div>
        ) : null}

        {explained ? (
          <Link href="/portefeuille" className={`${PRIMARY} block text-center`} style={{ background: PERSONA }}>
            Recharger mon portefeuille
          </Link>
        ) : missingCents > 0 ? (
          <button type="button" onClick={() => explainNoMoney(missingCents)} className={PRIMARY} style={{ background: PERSONA }}>
            Payer {formatEuros(totalCents)}
          </button>
        ) : (
          <button type="button" onClick={() => void pay()} disabled={paying} className={PRIMARY} style={{ background: PERSONA }}>
            {paying
              ? "Paiement…"
              : scheduled && slot
                ? `Payer ${formatEuros(totalCents)} · livré ${dayLabel(slot).toLowerCase()} à ${slotTime(slot)}`
                : `Payer ${formatEuros(totalCents)}`}
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
