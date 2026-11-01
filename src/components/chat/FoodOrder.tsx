"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { FoodResponse } from "@/app/api/food/route";
import type { FoodCartLine } from "@/lib/food/catalog";
import { formatEuros } from "@/lib/wallet/limits";
import { ChoiceOption } from "./ChoiceOption";
import { FoodCheckoutDialog } from "./FoodCheckoutDialog";

const PERSONA = "var(--persona,var(--accent))";

/** Bouton rond − / + d'une quantité. */
function Step({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-full border border-border text-base leading-none transition-colors hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))] active:scale-90"
    >
      {children}
    </button>
  );
}

/**
 * Commande de repas affichée par Awa dans la conversation quand on lui
 * demande à manger : le restaurant, puis le menu où l'on remplit son panier,
 * puis le paiement avec le portefeuille (FoodCheckoutDialog).
 */
export function FoodOrder() {
  const [data, setData] = useState<FoodResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/food", { cache: "no-store" });
      const body = (await res.json()) as FoodResponse & { error?: string };
      if (!res.ok) setError(body.error ?? "Commande indisponible.");
      else {
        setData(body);
        setError(null);
      }
    } catch {
      setError("Pas de connexion : réessaie.");
    }
  }, []);

  useEffect(() => {
    // Chargement des restaurants à l'affichage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const shell = (children: ReactNode) => (
    <section aria-label="Commander un repas" className="max-w-md overflow-hidden rounded-2xl border border-border bg-bg p-1.5 text-sm leading-normal shadow-sm">
      {children}
    </section>
  );

  if (error) return shell(<p className="p-3 text-fg-muted">{error}</p>);
  if (!data) return shell(<div className="h-48 animate-pulse rounded-xl bg-bg-subtle" aria-label="Chargement des restaurants" />);

  const restaurant = data.restaurants.find((r) => r.id === restaurantId) ?? null;
  const items = restaurant ? restaurant.menu.flatMap((s) => s.items) : [];
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const itemsCents = items.reduce((sum, i) => sum + i.priceCents * (cart[i.id] ?? 0), 0);
  const lines: FoodCartLine[] = Object.entries(cart).map(([itemId, quantity]) => ({ itemId, quantity }));
  const change = (id: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, Math.min(20, (c[id] ?? 0) + delta));
      const rest = { ...c };
      delete rest[id];
      return next ? { ...rest, [id]: next } : rest;
    });

  return shell(
    <>
      {/* En-tête */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        {restaurant ? (
          <button
            type="button"
            onClick={() => {
              setRestaurantId(null);
              setCart({});
            }}
            aria-label="Retour aux restaurants"
            className="-ml-1.5 grid size-7 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            ‹
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{restaurant ? `${restaurant.emoji} ${restaurant.name}` : "Qu'est-ce qui te ferait plaisir ?"}</p>
          <p className="truncate text-xs text-fg-muted">
            {restaurant
              ? `Livré en ${restaurant.etaMinutes[0]}–${restaurant.etaMinutes[1]} min · livraison ${formatEuros(data.deliveryCents)}`
              : `Payé avec ton portefeuille · solde ${formatEuros(data.balanceCents)}`}
          </p>
        </div>
        {data.demo ? (
          <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span>
        ) : null}
      </div>

      {/* 1. Restaurant */}
      {!restaurant
        ? data.restaurants.map((r, i) => (
            <ChoiceOption
              key={r.id}
              index={i + 1}
              label={`${r.emoji}  ${r.name}`}
              hint={`${r.kind} · ${r.etaMinutes[0]}–${r.etaMinutes[1]} min`}
              onClick={() => setRestaurantId(r.id)}
            />
          ))
        : null}

      {/* 2. Menu : un plat par ligne, + pour l'ajouter au panier */}
      {restaurant ? (
        <div className="max-h-[22rem] overflow-y-auto overscroll-contain px-1.5">
          {restaurant.menu.map((section) => (
            <div key={section.title} className="pt-2">
              <p className="px-1.5 pb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">{section.title}</p>
              {section.items.map((item) => {
                const quantity = cart[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      {item.description ? <p className="truncate text-xs text-fg-muted">{item.description}</p> : null}
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">{formatEuros(item.priceCents)}</span>
                    {quantity > 0 ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Step label={`Retirer un ${item.name}`} onClick={() => change(item.id, -1)}>
                          −
                        </Step>
                        <span key={quantity} className="booking-pop w-4 text-center font-semibold tabular-nums">
                          {quantity}
                        </span>
                        <Step label={`Ajouter un ${item.name}`} onClick={() => change(item.id, 1)}>
                          +
                        </Step>
                      </div>
                    ) : (
                      <Step label={`Ajouter ${item.name}`} onClick={() => change(item.id, 1)}>
                        +
                      </Step>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {/* Panier : apparaît dès le premier plat */}
      {restaurant && count > 0 ? (
        <div className="booking-step px-1.5 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setCheckout(true)}
            className="flex w-full items-center justify-between rounded-full px-4 py-2.5 font-medium text-white transition hover:brightness-110 active:scale-[0.99]"
            style={{ background: PERSONA }}
          >
            <span>
              Commander · {count} article{count > 1 ? "s" : ""}
            </span>
            <span className="tabular-nums">{formatEuros(itemsCents)}</span>
          </button>
        </div>
      ) : null}

      {checkout && restaurant ? (
        <FoodCheckoutDialog
          data={data}
          restaurant={restaurant}
          lines={lines}
          itemsCents={itemsCents}
          onClose={() => setCheckout(false)}
          onPaid={() => setCart({})}
        />
      ) : null}
    </>,
  );
}
