"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FoodResponse } from "@/app/api/food/route";
import type { FoodCartLine, FoodItem, FoodRestaurant } from "@/lib/food/catalog";
import { MAYOTTE_COMMUNES, type GeoPoint } from "@/lib/address-fields";
import { blockKey as keyOf, moveBlockValue, readBlockValue } from "@/lib/chat/block-key";
import { DISH_KINDS, dishKindOf, illustrationOf, matchFoodQuery, normalizeFood } from "@/lib/food/match";
import { COMMUNE_CENTERS, distanceKm, locateMe, PETITE_TERRE } from "@/lib/geo/communes";
import { formatEuros } from "@/lib/wallet/limits";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { FoodCheckout } from "./FoodCheckout";
import { ORDER_EVENT, ORDER_KEY, OrderTracker, type PlacedOrder } from "./OrderTracker";

const PERSONA = "var(--persona,var(--accent))";
/** Commande payée depuis ce bloc, gardée sur l'appareil : le suivi reste affiché après un rechargement. */
/** Au-delà, le suivi d'une commande livrée laisse revenir le menu. */
const ORDER_KEPT_MS = 30 * 60_000;

/**
 * Clé d'un bloc de commande : la conversation, le rang du bloc dans la page et
 * la recherche. Deux demandes identiques (« eau » puis « eau ») ont chacune la leur.
 */
function blockKey(el: HTMLElement | null, query: string) {
  return keyOf(ORDER_KEY, el, "[data-food-block]", `:${query}`);
}

/** Commande payée depuis ce bloc ; « received » une fois reçue (le bloc s'efface). */
function savedOrder(key: string, own = false): PlacedOrder | "received" | null {
  try {
    const order = JSON.parse(readBlockValue(key, own) ?? "null") as (PlacedOrder & { receivedAt?: string }) | null;
    if (!order) return null;
    if (order.receivedAt) return "received";
    return Date.parse(order.arrivesAt) + ORDER_KEPT_MS > Date.now() ? order : null;
  } catch {
    return null;
  }
}

/** Couleurs des vignettes illustrées, par type de plat (tant que le restaurant n'a pas fourni de photo). */
const TINTS: Record<string, [string, string]> = {
  tacos: ["#f59e0b", "#b45309"],
  pizza: ["#ef4444", "#9f1239"],
  burger: ["#f97316", "#9a3412"],
  kebab: ["#a16207", "#57340b"],
  mahorais: ["#16a34a", "#14532d"],
  asiatique: ["#dc2626", "#7f1d1d"],
  poulet: ["#eab308", "#a16207"],
  dessert: ["#ec4899", "#9d174d"],
  boisson: ["#0ea5e9", "#075985"],
};

/** illustration : photo créée pour la démonstration, quand le restaurant n'a pas photographié le plat. */
type Dish = { item: FoodItem; restaurant: FoodRestaurant; kind: string | null; illustration: string | null };

/** Tous les plats du catalogue, avec leur type. */
function allDishes(restaurants: readonly FoodRestaurant[]): Dish[] {
  return restaurants.flatMap((restaurant) =>
    restaurant.menu.flatMap((section) =>
      section.items.map((item) => ({
        item,
        restaurant,
        kind: dishKindOf(item, section.title, restaurant.kind),
        illustration: item.photo ? null : illustrationOf(item, section.title),
      })),
    ),
  );
}

const emojiOf = (kind: string | null, fallback: string) => DISH_KINDS.find((k) => k.id === kind)?.emoji ?? fallback;

/** Photo du plat, sinon une photo d'illustration (signalée), sinon une vignette dégradée avec le grand emoji de son type. */
function DishPicture({ dish, className = "" }: { dish: Dish; className?: string }) {
  const [from, to] = TINTS[dish.kind ?? ""] ?? ["#64748b", "#334155"];
  if (dish.item.photo) {
    // eslint-disable-next-line @next/next/no-img-element -- photos des partenaires, domaines inconnus à l'avance.
    return <img src={dish.item.photo} alt="" loading="lazy" className={`object-cover ${className}`} />;
  }
  if (dish.illustration) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- petite vignette locale, déjà compressée. */}
        <img src={dish.illustration} alt="" loading="lazy" className="size-full object-cover" />
        <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] leading-tight text-white">Illustration</span>
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(circle at 30% 20%, ${from}, ${to})` }}
    >
      <div className="absolute -right-6 -bottom-8 size-24 rounded-full bg-white/10" />
      <span className="text-5xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
        {emojiOf(dish.kind, dish.restaurant.emoji)}
      </span>
    </div>
  );
}

/** Bouton rond − / + d'une quantité. */
function Step({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 place-items-center rounded-full border border-border bg-bg text-base leading-none pointer-coarse:size-10 transition-colors hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))] active:scale-90"
    >
      {children}
    </button>
  );
}

function Quantity({ dish, quantity, change }: { dish: Dish; quantity: number; change: (dish: Dish, delta: number) => void }) {
  if (!quantity) {
    return (
      <button
        type="button"
        onClick={() => change(dish, 1)}
        aria-label={`Ajouter ${dish.item.name}`}
        className="grid size-8 place-items-center rounded-full text-lg leading-none text-white shadow-md pointer-coarse:size-10 transition active:scale-90"
        style={{ background: PERSONA }}
      >
        +
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Step label={`Retirer un ${dish.item.name}`} onClick={() => change(dish, -1)}>
        −
      </Step>
      <span key={quantity} className="booking-pop w-4 text-center font-semibold tabular-nums">
        {quantity}
      </span>
      <Step label={`Ajouter un ${dish.item.name}`} onClick={() => change(dish, 1)}>
        +
      </Step>
    </div>
  );
}

type Spot = { commune: string; geo: GeoPoint | null };

/**
 * « Où es-tu ? » : avant une recherche « près de moi » quand le compte n'a
 * pas d'adresse. Position GPS en un geste, ou commune choisie à la main.
 */
function WhereAreYou({ what, onSpot, onSkip }: { what: string; onSpot: (spot: Spot) => void; onSkip: () => void }) {
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="booking-step space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-subtle text-2xl">
          📍
        </span>
        <div>
          <p className="text-base font-semibold">Où es-tu ?</p>
          <p className="text-xs text-fg-muted">Pour te montrer {what} près de toi. Ton adresse n&apos;est pas encore enregistrée.</p>
        </div>
      </div>
      <button
        type="button"
        disabled={locating}
        onClick={async () => {
          setLocating(true);
          setProblem(null);
          const found = await locateMe();
          setLocating(false);
          if (found.ok) onSpot({ commune: found.commune, geo: found.geo });
          else setProblem(found.error);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ background: PERSONA }}
      >
        {locating ? "Recherche de ta position…" : "📍 Utiliser ma position"}
      </button>
      {problem ? <p className="text-center text-xs text-danger">{problem}</p> : null}
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="shrink-0">ou ta commune :</span>
        <select
          defaultValue=""
          onChange={(e) => e.target.value && onSpot({ commune: e.target.value, geo: null })}
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-[var(--persona,var(--accent))]"
        >
          <option value="">Choisir…</option>
          {MAYOTTE_COMMUNES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <a href="/parametres?rubrique=adresse" className="font-medium hover:underline" style={{ color: PERSONA }}>
          Enregistrer mon adresse
        </a>
        <button type="button" onClick={onSkip} className="text-fg-muted hover:underline">
          Montrer sans trier
        </button>
      </div>
    </div>
  );
}

/** Tamilya a écrit « tout » (ou rien de précis) : la personne veut parcourir toute l'application. */
const BROWSE = /\b(?:tout|toute|catalogue|application|appli|menu complet|parcourir|restaurants)\b/;

/**
 * Commande de repas affichée par Tamilya dans la conversation. Elle s'ouvre sur ce
 * que la personne a demandé (query, écrit par Tamilya dans le bloc) : « tacos »
 * montre les tacos de tous les restaurants dans un carrousel, « pizza Pizza
 * Mangrove » ouvre directement les pizzas de ce restaurant. Un clic sur + remplit
 * le panier (un restaurant à la fois), puis le paiement par le portefeuille.
 */
export function FoodOrder({ query = "" }: { query?: string }) {
  const [data, setData] = useState<FoodResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [fullMenu, setFullMenu] = useState(false);
  const [cart, setCart] = useState<{ restaurantId: string | null; items: Record<string, number> }>({ restaurantId: null, items: {} });
  const [checkout, setCheckout] = useState(false);
  // Panier ouvert par « Programmer » : le paiement s'ouvre sur le choix de l'heure.
  const [scheduleFirst, setScheduleFirst] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  // Recherche précise (« tacos ») : seulement les résultats. Parcourir : toute l'application.
  const [browse, setBrowse] = useState(false);
  // Position donnée dans cette carte (compte sans adresse, ou « changer de lieu »).
  const [spot, setSpot] = useState<Spot | null>(null);
  const [askWhere, setAskWhere] = useState(false);
  const [unsorted, setUnsorted] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  // Le bloc dans la page : son rang donne la clé de sa commande (blockKey).
  const root = useRef<HTMLElement>(null);
  // Commande de ce bloc reçue : le bloc s'efface de la conversation.
  const [done, setDone] = useState(false);
  // Clé de la commande payée : elle suit la conversation quand son adresse change (« / » → /c/<id>).
  const savedKey = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!savedKey.current) return;
    const next = blockKey(root.current, query);
    moveBlockValue(savedKey.current, next);
    savedKey.current = next;
  }, [pathname, query]);

  const readOrder = useCallback(() => {
    const key = blockKey(root.current, query);
    const saved = savedOrder(key, savedKey.current === key);
    setDone(saved === "received");
    setPlaced(saved === "received" ? null : saved);
  }, [query]);

  // Commande reçue depuis la pastille ou le panneau : relue tout de suite.
  useEffect(() => {
    window.addEventListener(ORDER_EVENT, readOrder);
    return () => window.removeEventListener(ORDER_EVENT, readOrder);
  }, [readOrder]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/food", { cache: "no-store" });
      const body = (await res.json()) as FoodResponse & { error?: string };
      if (!res.ok) setError(body.error ?? "Commande indisponible.");
      else {
        // Ouverture sur ce que la personne a demandé.
        const wanted = matchFoodQuery(query, body.restaurants);
        readOrder();
        setKind(wanted.kind);
        setRestaurantId(wanted.restaurantId);
        setBrowse(!(wanted.kind || wanted.restaurantId) || BROWSE.test(normalizeFood(query)));
        setData(body);
        setError(null);
      }
    } catch {
      setError("Pas de connexion : réessaie.");
    }
  }, [query, readOrder]);

  useEffect(() => {
    // Chargement des restaurants à l'affichage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const dishes = useMemo(() => (data ? allDishes(data.restaurants) : []), [data]);

  const shell = (children: ReactNode) => (
    <section
      ref={root}
      data-food-block
      aria-label="Commander un repas"
      className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-bg text-sm leading-normal shadow-sm"
    >
      {children}
    </section>
  );

  // Repère invisible : les blocs suivants gardent leur rang (et leur commande).
  if (done) return <section ref={root} data-food-block hidden />;
  if (error) return shell(<p className="p-4 text-fg-muted">{error}</p>);
  if (!data) {
    return shell(
      <div className="flex gap-3 overflow-hidden p-4" aria-label="Chargement des restaurants">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 w-44 shrink-0 animate-pulse rounded-2xl bg-bg-subtle" />
        ))}
      </div>,
    );
  }

  const restaurant = data.restaurants.find((r) => r.id === restaurantId) ?? null;
  const cartRestaurant = data.restaurants.find((r) => r.id === cart.restaurantId) ?? null;
  const cartDishes = dishes.filter((d) => d.restaurant.id === cart.restaurantId && cart.items[d.item.id]);
  const count = Object.values(cart.items).reduce((a, b) => a + b, 0);
  const itemsCents = cartDishes.reduce((sum, d) => sum + d.item.priceCents * cart.items[d.item.id], 0);
  const lines: FoodCartLine[] = Object.entries(cart.items).map(([itemId, quantity]) => ({ itemId, quantity }));
  const quantityOf = (dish: Dish) => (dish.restaurant.id === cart.restaurantId ? (cart.items[dish.item.id] ?? 0) : 0);

  // Quantité changée depuis le récapitulatif ; le panier vide ramène aux plats.
  const changeLine = (itemId: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, Math.min(20, (c.items[itemId] ?? 0) + delta));
      const rest = { ...c.items };
      delete rest[itemId];
      const items = next ? { ...rest, [itemId]: next } : rest;
      if (!Object.keys(items).length) setCheckout(false);
      return { restaurantId: c.restaurantId, items };
    });

  const change = (dish: Dish, delta: number) => {
    // Un panier = un restaurant (un seul livreur).
    if (cart.restaurantId && cart.restaurantId !== dish.restaurant.id && count > 0) {
      void confirmDialog({
        title: "Changer de restaurant ?",
        message: `Ton panier contient des plats de ${cartRestaurant?.name}. Il sera vidé pour commander chez ${dish.restaurant.name}.`,
        confirmLabel: "Vider le panier",
        cancelLabel: "Garder mon panier",
        tone: "danger",
      }).then((ok) => {
        if (ok) setCart({ restaurantId: dish.restaurant.id, items: delta > 0 ? { [dish.item.id]: 1 } : {} });
      });
      return;
    }
    setCart((c) => {
      const next = Math.max(0, Math.min(20, (c.items[dish.item.id] ?? 0) + delta));
      const rest = { ...c.items };
      delete rest[dish.item.id];
      return { restaurantId: dish.restaurant.id, items: next ? { ...rest, [dish.item.id]: next } : rest };
    });
  };

  // Types présents dans le catalogue, pour les filtres.
  const kinds = DISH_KINDS.filter((k) => dishes.some((d) => d.kind === k.id));
  const kindInfo = DISH_KINDS.find((k) => k.id === kind) ?? null;
  // Près de chez toi : depuis la position donnée ici, sinon l'adresse du compte (GPS ou centre de la commune).
  const origin: Spot | null = spot ?? (data.address ? { commune: data.address.commune, geo: data.address.geo } : null);
  const from = origin ? (origin.geo ?? COMMUNE_CENTERS[origin.commune] ?? null) : null;
  const home = origin?.commune ?? null;
  /** km jusqu'au restaurant (barge comptée 15 km), null sans position connue. */
  const kmTo = (r: FoodRestaurant) => {
    const to = COMMUNE_CENTERS[r.commune];
    if (!from || !to || !origin) return null;
    return distanceKm(from, to) + (PETITE_TERRE.has(r.commune) !== PETITE_TERRE.has(origin.commune) ? 15 : 0);
  };
  const nearness = (r: FoodRestaurant) => (kmTo(r) ?? 0) * 3 + r.etaMinutes[0];
  const shown = dishes
    .filter((d) => (kind ? d.kind === kind : !["boisson", "accompagnement"].includes(d.kind ?? "")))
    .sort((a, b) => nearness(a.restaurant) - nearness(b.restaurant));
  const places = data.restaurants
    .filter((r) => !kind || dishes.some((d) => d.restaurant.id === r.id && d.kind === kind))
    .sort((a, b) => nearness(a) - nearness(b));

  const header = (title: string, subtitle: string, back?: () => void) => (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      {back ? (
        <button
          type="button"
          onClick={back}
          aria-label="Retour"
          className="-ml-1.5 grid size-8 place-items-center rounded-full text-lg text-fg-muted pointer-coarse:size-10 hover:bg-bg-muted hover:text-fg"
        >
          ‹
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{title}</p>
        <p className="truncate text-xs text-fg-muted">{subtitle}</p>
      </div>
      {data.demo ? (
        <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span>
      ) : null}
    </div>
  );

  const chips = (
    <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {[{ id: null, label: "Tout", emoji: "✨" }, ...kinds].map((k) => {
        const selected = kind === k.id;
        return (
          <button
            key={k.id ?? "tout"}
            type="button"
            onClick={() => {
              setKind(k.id);
              rail.current?.scrollTo({ left: 0, behavior: "smooth" });
            }}
            aria-pressed={selected}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
              selected ? "border-transparent text-white" : "border-border text-fg-muted hover:text-fg"
            }`}
            style={selected ? { background: PERSONA } : undefined}
          >
            {k.emoji} {k.label}
          </button>
        );
      })}
    </div>
  );

  let body: ReactNode;
  const precise = !browse && Boolean(kind) && !restaurant;
  if (precise && (askWhere || (!origin && !unsorted))) {
    body = (
      <WhereAreYou
        what={kindInfo ? `les ${kindInfo.label.toLowerCase()}` : "les plats"}
        onSpot={(next) => {
          setSpot(next);
          setAskWhere(false);
        }}
        onSkip={() => {
          setUnsorted(true);
          setAskWhere(false);
        }}
      />
    );
  } else if (precise) {
    // Recherche précise : la liste des résultats, du plus proche au plus loin, et rien d'autre.
    body = (
      <>
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">
              {kindInfo?.emoji} {kindInfo?.label} {home ? `près de toi · ${home}` : "à Mayotte"}
            </p>
            <p className="truncate text-xs text-fg-muted">
              {shown.length} résultat{shown.length > 1 ? "s" : ""}
              {home ? " · du plus proche au plus loin" : ""}
            </p>
          </div>
          <button type="button" onClick={() => setAskWhere(true)} className="shrink-0 text-xs font-medium hover:underline" style={{ color: PERSONA }}>
            {home ? "Changer de lieu" : "Où suis-je ?"}
          </button>
          {data.demo ? (
            <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span>
          ) : null}
        </div>
        {shown.length ? (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain px-3 pb-3">
            {shown.map((dish) => {
              const km = kmTo(dish.restaurant);
              return (
                <li key={dish.item.id} className="group flex items-center gap-3 rounded-2xl border border-border p-2">
                  <DishPicture dish={dish} className="size-16 shrink-0 rounded-xl [&_span]:text-3xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{dish.item.name}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {[
                        dish.restaurant.name,
                        dish.restaurant.commune,
                        km !== null ? `~${Math.max(1, Math.round(km))} km` : null,
                        `${dish.restaurant.etaMinutes[0]}–${dish.restaurant.etaMinutes[1]} min`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatEuros(dish.item.priceCents)}</p>
                  </div>
                  <Quantity dish={dish} quantity={quantityOf(dish)} change={change} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 pb-4 text-fg-muted">Aucun restaurant ne propose ce plat pour le moment.</p>
        )}
      </>
    );
  } else if (restaurant) {
    // Un restaurant : ses plats du type demandé d'abord, le reste du menu sur demande.
    const own = dishes.filter((d) => d.restaurant.id === restaurant.id);
    const focus = kind && !fullMenu ? own.filter((d) => d.kind === kind) : own;
    const list = focus.length ? focus : own;
    body = (
      <>
        {header(
          `${restaurant.emoji} ${restaurant.name}`,
          `${restaurant.commune} · ${restaurant.etaMinutes[0]}–${restaurant.etaMinutes[1]} min · livraison ${formatEuros(data.deliveryCents)}`,
          () => {
            setRestaurantId(null);
            setFullMenu(false);
            setBrowse(true);
          },
        )}
        <ul className="grid max-h-[26rem] gap-2 overflow-y-auto overscroll-contain px-3 pb-2 sm:grid-cols-2">
          {list.map((dish) => (
            <li key={dish.item.id} className="group flex items-center gap-3 rounded-2xl border border-border p-2">
              <DishPicture dish={dish} className="size-16 shrink-0 rounded-xl [&_span]:text-3xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{dish.item.name}</p>
                {dish.item.description ? <p className="line-clamp-2 text-xs text-fg-muted">{dish.item.description}</p> : null}
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatEuros(dish.item.priceCents)}</p>
              </div>
              <Quantity dish={dish} quantity={quantityOf(dish)} change={change} />
            </li>
          ))}
        </ul>
        {kind && focus.length && focus.length < own.length ? (
          <button
            type="button"
            onClick={() => setFullMenu((v) => !v)}
            className="mx-4 mb-2 text-xs font-medium hover:underline"
            style={{ color: PERSONA }}
          >
            {fullMenu ? `Seulement les ${kindInfo?.label.toLowerCase()}` : "Voir tout le menu"}
          </button>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        {header(
          kindInfo ? `${kindInfo.emoji} ${kindInfo.label} près de chez toi${home ? ` · ${home}` : ""}` : "Qu'est-ce qui te ferait plaisir ?",
          `${shown.length} plat${shown.length > 1 ? "s" : ""} · payé avec ton portefeuille (solde ${formatEuros(data.balanceCents)})`,
        )}
        {chips}

        {/* Carrousel : on fait défiler les plats de droite à gauche. */}
        <div className="relative">
          <div
            ref={rail}
            className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none]"
          >
            {shown.map((dish) => {
              const quantity = quantityOf(dish);
              return (
                <article
                  key={dish.item.id}
                  className={`group w-44 shrink-0 snap-start overflow-hidden rounded-2xl border bg-bg transition hover:-translate-y-0.5 hover:shadow-lg ${
                    quantity ? "border-[var(--persona,var(--accent))]" : "border-border"
                  }`}
                >
                  <DishPicture dish={dish} className="h-28 w-full" />
                  <div className="p-3">
                    <p className="truncate font-semibold">{dish.item.name}</p>
                    <button
                      type="button"
                      onClick={() => setRestaurantId(dish.restaurant.id)}
                      className="block max-w-full truncate text-xs text-fg-muted hover:underline"
                    >
                      {dish.restaurant.name} · {dish.restaurant.commune}
                    </button>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-semibold tabular-nums">{formatEuros(dish.item.priceCents)}</span>
                      <Quantity dish={dish} quantity={quantity} change={change} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {shown.length > 2 ? (
            <>
              <button
                type="button"
                onClick={() => rail.current?.scrollBy({ left: -200, behavior: "smooth" })}
                aria-label="Plats précédents"
                className="absolute top-1/2 left-1 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg/80 shadow backdrop-blur pointer-fine:grid"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => rail.current?.scrollBy({ left: 200, behavior: "smooth" })}
                aria-label="Plats suivants"
                className="absolute top-1/2 right-1 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg/80 shadow backdrop-blur pointer-fine:grid"
              >
                ›
              </button>
            </>
          ) : null}
        </div>

        {/* Restaurants qui proposent ce type de plat. */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {places.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRestaurantId(r.id)}
              className="flex shrink-0 items-center gap-2 rounded-2xl border border-border px-3 py-2 text-left transition hover:bg-bg-muted"
            >
              <span className="text-xl" aria-hidden="true">
                {r.emoji}
              </span>
              <span>
                <span className="block text-xs font-semibold">{r.name}</span>
                <span className="block text-[11px] text-fg-muted">
                  {r.commune} · {r.etaMinutes[0]}–{r.etaMinutes[1]} min
                </span>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  }

  // Commande payée : le suivi en direct remplace le menu.
  if (placed) return shell(<OrderTracker order={placed} />);

  if (checkout && cartRestaurant && count > 0) {
    return shell(
      <FoodCheckout
        data={data}
        restaurant={cartRestaurant}
        lines={lines}
        itemsCents={itemsCents}
        onBack={() => setCheckout(false)}
        onChangeQuantity={changeLine}
        here={spot}
        initialScheduled={scheduleFirst}
        onPlaced={(order) => {
          savedKey.current = blockKey(root.current, query);
          localStorage.setItem(savedKey.current, JSON.stringify(order));
          window.dispatchEvent(new Event(ORDER_EVENT));
          setPlaced(order);
          setCheckout(false);
          setCart({ restaurantId: null, items: {} });
          // Le solde affiché baisse comme après un vrai paiement (fictif pendant la démonstration).
          setData((d) => (d ? { ...d, balanceCents: Math.max(0, d.balanceCents - order.totalCents) } : d));
          // La barre latérale relit le solde.
          window.dispatchEvent(new Event("focus"));
        }}
      />,
    );
  }

  return shell(
    <>
      {body}

      {/* Panier : apparaît dès le premier plat */}
      {cartRestaurant && count > 0 ? (
        <div className="booking-step border-t border-border p-3">
          <p className="mb-2 truncate px-1 text-xs text-fg-muted">
            {count} article{count > 1 ? "s" : ""} · {cartRestaurant.name} ·{" "}
            <span className="font-semibold text-fg tabular-nums">{formatEuros(itemsCents)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setScheduleFirst(true);
                setCheckout(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold transition hover:bg-bg-subtle active:scale-[0.99]"
            >
              <span aria-hidden="true">⏰</span> Programmer
            </button>
            <button
              type="button"
              onClick={() => {
                setScheduleFirst(false);
                setCheckout(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
              style={{ background: PERSONA }}
            >
              Payer maintenant
            </button>
          </div>
        </div>
      ) : null}
    </>,
  );
}
