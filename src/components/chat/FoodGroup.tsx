"use client";

import { useMemo, useState } from "react";
import type { FoodResponse } from "@/app/api/food/route";
import type { GeoPoint } from "@/lib/address-fields";
import { clientPoint, groupDeliveryCents, groupRestaurant, parseWishes, pickNote, planGroupOrder, stopCart, type GroupPick, type GroupStop } from "@/lib/food/group-order";
import { formatEuros } from "@/lib/wallet/limits";
import { FoodCheckout } from "./FoodCheckout";
import type { PlacedOrder } from "./OrderTracker";

const PERSONA = "var(--persona,var(--accent))";

const listOf = (picks: readonly GroupPick[]) => picks.map((p) => p.item.name).join(", ");

/**
 * Panier composé par Tamilya (bloc ```commande-groupee```). Le premier
 * restaurant est retenu d'office ; chaque restaurant en plus attend la réponse
 * de la personne, avec le prix du détour, avant de passer au paiement.
 */
export function FoodGroup({
  data,
  query,
  here,
  onPlaced,
  onBrowse,
}: {
  data: FoodResponse;
  query: string;
  here: { commune: string; geo: GeoPoint | null } | null;
  onPlaced: (order: PlacedOrder) => void;
  onBrowse: () => void;
}) {
  const place = here ?? (data.address ? { commune: data.address.commune, geo: data.address.geo } : null);
  const client = clientPoint(place?.commune, place?.geo);
  const plan = useMemo(() => planGroupOrder(parseWishes(query), data.restaurants, client), [query, data.restaurants, client]);
  // Réponse à chaque restaurant en plus (son id → oui ou non).
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);

  const [main, ...extras] = plan.stops;
  const quantity = (pick: GroupPick) => pick.quantity + (changes[pick.item.id] ?? 0);
  const kept = plan.stops.filter((stop) => stop === main || answers[stop.restaurant.id]);
  const open = extras.filter((stop) => answers[stop.restaurant.id] === undefined);
  const stops = kept
    .map((stop) => ({ restaurantId: stop.restaurant.id, cart: stopCart(stop).map((l, i) => ({ ...l, quantity: quantity(stop.picks[i]) })).filter((l) => l.quantity > 0) }))
    .filter((stop) => stop.cart.length);
  const restaurants = stops.flatMap((s) => data.restaurants.filter((r) => r.id === s.restaurantId));
  const deliveryFor = (to: { commune: string; geo: GeoPoint | null } | null) => groupDeliveryCents(restaurants, clientPoint(to?.commune, to?.geo) ?? client, data.deliveryCents);
  const prices = new Map(plan.stops.flatMap((s) => s.picks).map((p) => [p.item.id, p.item.priceCents]));
  const lines = stops.flatMap((s) => s.cart);
  const itemsCents = lines.reduce((sum, l) => sum + (prices.get(l.itemId) ?? 0) * l.quantity, 0);
  const note = plan.stops.flatMap((stop) => (kept.includes(stop) ? stop.picks.flatMap((p) => pickNote(p) ?? []) : [])).join(" ; ").slice(0, 200);

  /** Ce que coûte en livraison le fait d'ajouter ce restaurant au panier actuel. */
  const detourCents = (stop: GroupStop) => {
    const withStop = [...kept, stop].map((s) => s.restaurant);
    return groupDeliveryCents(withStop, client, data.deliveryCents) - groupDeliveryCents(kept.map((s) => s.restaurant), client, data.deliveryCents);
  };

  const notFound = plan.missing.length ? (
    <p className="rounded-2xl bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
      Je n&apos;ai trouvé nulle part : {plan.missing.map((w) => `« ${w.text} »`).join(", ")}.
    </p>
  ) : null;
  const seeAll = (
    <button type="button" onClick={onBrowse} className="text-xs font-medium hover:underline" style={{ color: PERSONA }}>
      Voir tous les restaurants
    </button>
  );

  if (!main) {
    return (
      <div className="space-y-3 p-4">
        {notFound}
        {seeAll}
      </div>
    );
  }

  if (checkout && restaurants.length) {
    return (
      <FoodCheckout
        data={data}
        restaurant={restaurants.length > 1 ? groupRestaurant(restaurants) : restaurants[0]}
        lines={lines}
        itemsCents={itemsCents}
        onBack={() => setCheckout(false)}
        onChangeQuantity={(itemId, delta) => {
          const pick = plan.stops.flatMap((s) => s.picks).find((p) => p.item.id === itemId);
          if (!pick) return;
          const next = Math.max(0, Math.min(20, quantity(pick) + delta));
          setChanges((c) => ({ ...c, [itemId]: next - pick.quantity }));
          if (lines.length === 1 && next === 0) setCheckout(false);
        }}
        here={here}
        onPlaced={onPlaced}
        stops={restaurants.length > 1 ? stops : undefined}
        deliveryCentsFor={restaurants.length > 1 ? deliveryFor : undefined}
        initialNote={note}
      />
    );
  }

  return (
    <div className="booking-step space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">Ton panier</p>
          <p className="text-xs text-fg-muted">Composé par Tamilya</p>
        </div>
        {data.demo ? <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span> : null}
      </div>

      <ul className="space-y-2">
        {kept.map((stop) => (
          <li key={stop.restaurant.id} className="rounded-2xl border border-border p-3">
            <p className="font-semibold">
              {stop.restaurant.name}
            </p>
            <ul className="mt-1 space-y-0.5">
              {stop.picks.map((pick) => (
                <li key={pick.item.id} className="flex justify-between gap-3 text-fg-muted">
                  <span className="min-w-0">
                    {quantity(pick)}× {pick.item.name}
                  </span>
                  <span className="tabular-nums">{formatEuros(pick.item.priceCents * quantity(pick))}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {open.slice(0, 1).map((stop) => (
        <div key={stop.restaurant.id} className="space-y-2 rounded-2xl bg-bg-subtle p-3">
          <p>
            {main.restaurant.name} ne vend pas : <span className="font-semibold">{listOf(stop.picks)}</span>. Je peux le prendre chez {stop.restaurant.name} ({stop.restaurant.commune}) : {formatEuros(stop.picks.reduce((sum, p) => sum + p.item.priceCents * p.quantity, 0))}, et +{formatEuros(detourCents(stop))} de livraison.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAnswers((a) => ({ ...a, [stop.restaurant.id]: true }))} className="rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110" style={{ background: PERSONA }}>
              Oui, ajoute-le
            </button>
            <button type="button" onClick={() => setAnswers((a) => ({ ...a, [stop.restaurant.id]: false }))} className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-bg-muted">
              Non, sans ça
            </button>
          </div>
        </div>
      ))}

      {notFound}

      {!open.length ? (
        <>
          <p className="flex justify-between text-fg-muted">
            <span>Livraison{kept.length > 1 ? ` (${kept.length} restaurants)` : ""}</span>
            <span className="tabular-nums">{formatEuros(deliveryFor(place))}</span>
          </p>
          <p className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatEuros(itemsCents + deliveryFor(place))}</span>
          </p>
          <button type="button" onClick={() => setCheckout(true)} className="w-full rounded-full px-4 py-3 font-semibold text-white transition hover:brightness-110" style={{ background: PERSONA }}>
            Passer à la suite
          </button>
        </>
      ) : null}
      {seeAll}
    </div>
  );
}
