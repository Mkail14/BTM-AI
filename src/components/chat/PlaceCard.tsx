"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CarFront, MapPin, X } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loadMapLibre } from "@/lib/geo/maplibre";
import { locateMe, type Point } from "@/lib/geo/communes";
import { findTown, type Town } from "@/lib/mayotte/towns";
import { ISLAND_NAME } from "@/lib/mayotte/place-intent";
import type { TripResponse } from "@/server/controllers/trip/trip.controller";
import type { TripPlan } from "@/server/services/trip/plan";
import { closeBigPage, enterAppFullscreen, isBigPage, whenBigOpen } from "./app-fullscreen";
import { isFreshCard } from "./fresh-card";
import { TripPanel } from "./TripCard";

/**
 * Lieu de Mayotte dans la conversation (bloc ```carte-lieu```, « c'est où Chiconi ? ») :
 * la carte s'ouvre sur l'île entière, puis vole jusqu'au lieu et y pose un repère lumineux à son nom.
 * « Voir en grand » ouvre le panneau de la carte (à droite sur tablette et ordinateur, comme le suivi
 * de livraison) ; sur grand écran il s'ouvre de lui-même quand Tamilya vient d'écrire la carte.
 * « Y aller » y trace le chemin depuis la position (ou l'adresse du compte) jusqu'au lieu.
 * Fond OpenFreeMap, comme les autres cartes de la conversation.
 */

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
const PERSONA = "var(--persona,var(--accent))";
/** Mayotte entière, Petite-Terre comprise. */
const ISLAND: [[number, number], [number, number]] = [
  [45.0, -13.0],
  [45.3, -12.64],
];
/** Lieux déjà ouverts d'eux-mêmes une fois : ils ne se rouvrent pas à chaque visite. */
const SEEN_KEY = "btm-place-seen";

function seen(name: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
    if (list.includes(name)) return true;
    localStorage.setItem(SEEN_KEY, JSON.stringify([name, ...list].slice(0, 30)));
  } catch {
    return true;
  }
  return false;
}

/** Carte de l'île qui vole jusqu'au lieu, dans `frame`. */
function usePlaceMap(frame: RefObject<HTMLDivElement | null>, town: Town | null, island: boolean, onFail: () => void) {
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  useEffect(() => {
    if (!town && !island) return;
    let cancelled = false;
    let created: MapLibreMap | null = null;
    let flight: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const maplibre = await loadMapLibre();
      if (cancelled || !frame.current) return;
      const dark = document.documentElement.dataset.theme === "dark";
      created = new maplibre.Map({
        container: frame.current,
        style: dark ? STYLE_DARK : STYLE_LIGHT,
        bounds: ISLAND,
        fitBoundsOptions: { padding: 16 },
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
        cooperativeGestures: true,
        fadeDuration: 150,
      });
      created.touchZoomRotate.disableRotation();
      created.on("error", (e) => console.warn("[carte lieu]", e.error?.message));
      if (town) {
        const mark = document.createElement("div");
        mark.className = "town-pin";
        const label = document.createElement("span");
        label.className = "town-pin__name";
        label.textContent = town.name;
        mark.append(label);
        new maplibre.Marker({ element: mark, anchor: "center" }).setLngLat([town.point.lng, town.point.lat]).addTo(created);
      }
      created.on("load", () => {
        frame.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        if (!town) return;
        // L'île d'abord, puis le lieu : on voit où il se trouve sur Mayotte.
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        flight = setTimeout(() => created?.flyTo({ center: [town.point.lng, town.point.lat], zoom: 12.5, duration: reduced ? 0 : 2200, essential: true }), reduced ? 0 : 500);
      });
    })().catch((error) => {
      console.warn("[carte lieu] Chargement impossible", error);
      failRef.current();
    });
    return () => {
      cancelled = true;
      if (flight) clearTimeout(flight);
      created?.remove();
    };
  }, [frame, town, island]);
}

export function PlaceCard({ place }: { place: string }) {
  // « Mayotte » : l'île entière, sans repère ni vol.
  const island = place === ISLAND_NAME;
  const town = useMemo(() => (island ? null : findTown(place)), [island, place]);
  const frame = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // Page en grand de l'app : seulement le panneau, ouvert quand l'app le demande ; la petite carte n'y est pas dessinée.
  const [big] = useState(isBigPage);
  const [bigOpen, setBigOpen] = useState(false);
  useEffect(() => (big ? whenBigOpen(() => setBigOpen(true)) : undefined), [big]);
  usePlaceMap(frame, big ? null : town, big ? false : island, () => setFailed(true));
  // Dans l'app, le bouton (data-grand) ouvre la page en grand ; ancienne app : plein écran d'abord.
  const show = () => void enterAppFullscreen().then(() => setOpen(true));

  // Écrite à l'instant par Tamilya, sur tablette ou ordinateur : le panneau s'ouvre à droite, une fois.
  useEffect(() => {
    if (!town && !island) return;
    // L'écran, pas la page : dans l'app, la carte vit dans un cadre plus étroit que l'écran de la tablette.
    if (Math.min(window.screen.width, window.screen.height) < 600) return;
    if (big || !isFreshCard()) return;
    // Un court instant : la carte apparaît dans la conversation, puis le panneau glisse à droite.
    const timer = setTimeout(() => {
      // Le bouton lui-même : dans l'app, il ouvre la page en grand.
      if (!seen(town?.name ?? ISLAND_NAME)) button.current?.click();
    }, 400);
    return () => clearTimeout(timer);
  }, [town, island, big]);

  if (!town && !island) return null;
  const title = town?.name ?? ISLAND_NAME;
  const detail = !town ? "Grande-Terre et Petite-Terre" : town.isCommune ? "Commune de Mayotte" : `Village de la commune de ${town.commune}`;
  if (big) {
    const closeBig = () => {
      setBigOpen(false);
      closeBigPage();
    };
    return bigOpen ? <PlacePanel town={town} island={island} title={title} detail={detail} onClose={closeBig} /> : null;
  }
  return (
    <>
      <div className="booking-step carte-cadre w-full overflow-hidden">
        {/* Même rangée que les cartes Eau, Emploi et Cyclones : pastille, texte, petit bouton à droite. */}
        <div className="flex items-center gap-4 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
            <MapPin width={24} height={24} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block leading-snug font-semibold">{title}</span>
            <span className="block text-xs text-fg-muted">{detail}</span>
          </span>
          <button
            type="button"
            ref={button}
            onClick={show}
            aria-haspopup="dialog"
            data-grand=""
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg"
            style={{ background: PERSONA }}
          >
            Voir en grand
          </button>
        </div>
        {failed ? (
          <div className="grid h-56 place-items-center text-sm text-fg-muted">La carte ne se charge pas : vérifie ta connexion.</div>
        ) : (
          <div ref={frame} className="h-56 w-full sm:h-64" aria-label={town ? `Carte de Mayotte : ${town.name}` : "Carte de Mayotte"} role="img" />
        )}
      </div>
      {open ? <PlacePanel town={town} island={island} title={title} detail={detail} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type Trip = { status: "idle" } | { status: "loading" } | { status: "ok"; plan: TripPlan; gps: Point | null } | { status: "error"; message: string };

/** Panneau de la carte : plein écran au téléphone, à droite sur grand écran (comme le suivi de livraison). */
function PlacePanel({ town, island, title, detail, onClose }: { town: Town | null; island: boolean; title: string; detail: string; onClose: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [trip, setTrip] = useState<Trip>({ status: "idle" });
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  usePlaceMap(frame, town, island, () => setFailed(true));

  const close = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? onClose() : setClosing(true));
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  /** Trajet jusqu'au lieu : depuis `gps`, sinon depuis l'adresse du compte. */
  const plan = async (gps: Point | null) => {
    if (!town) return;
    const params = new URLSearchParams({ to: town.name });
    if (gps) params.set("at", `${gps.lat},${gps.lng}`);
    const body = (await fetch(`/api/trip?${params}`)
      .then((res) => res.json())
      .catch(() => null)) as TripResponse | null;
    if (body && "plan" in body) setTrip({ status: "ok", plan: body.plan, gps });
    else setTrip({ status: "error", message: body && "message" in body ? body.message : "Trajet indisponible : vérifie ta connexion." });
  };

  /** « Y aller » : la position du téléphone d'abord ; sans elle, l'adresse du compte. */
  const go = async () => {
    setTrip({ status: "loading" });
    setLocateError(null);
    const found = await locateMe();
    if (!found.ok) setLocateError(found.error);
    await plan(found.ok ? { lat: found.geo.lat, lng: found.geo.lng } : null);
  };

  const locate = async () => {
    setLocating(true);
    setLocateError(null);
    const found = await locateMe();
    setLocating(false);
    if (!found.ok) return setLocateError(found.error);
    await plan({ lat: found.geo.lat, lng: found.geo.lng });
  };

  // Chemin trouvé : le panneau du trajet prend la place (même panneau que « comment aller à … »).
  if (trip.status === "ok") {
    return (
      <TripPanel
        plan={trip.plan}
        onClose={onClose}
        locate={locate}
        locating={locating}
        locateError={locateError}
        onHomeSaved={() => void plan(trip.gps)}
        backHome={trip.gps ? () => void plan(null) : null}
      />
    );
  }

  const maps = town
    ? `https://www.google.com/maps/search/?api=1&query=${town.point.lat},${town.point.lng}`
    : "https://www.google.com/maps/search/?api=1&query=Mayotte";

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-closing={closing || undefined}>
      <div aria-hidden="true" onClick={close} className="order-backdrop absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Carte : ${title}`}
        tabIndex={-1}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}
        className="order-sheet absolute inset-0 flex flex-col overflow-hidden bg-bg shadow-2xl outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[440px] sm:rounded-3xl sm:border sm:border-border"
      >
        {/* Carte de l'île : toute la place libre. */}
        <div className="relative min-h-[8rem] flex-1">
          {failed ? (
            <div className="grid h-full place-items-center text-sm text-fg-muted">La carte ne se charge pas : vérifie ta connexion.</div>
          ) : (
            // MapLibre remet son cadre en position relative : le cadre absolu est autour, la carte le remplit.
            <div className="absolute inset-0">
              <div ref={frame} className="h-full w-full" aria-label={town ? `Carte de Mayotte : ${town.name}` : "Carte de Mayotte"} role="img" />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={close} aria-label="Fermer la carte" className="grid size-11 place-items-center rounded-full bg-bg/90 shadow-lg backdrop-blur hover:bg-bg">
              <X aria-hidden="true" className="size-5" />
            </button>
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-bg/90 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:bg-bg"
            >
              Ouvrir dans Maps
            </a>
          </div>
        </div>

        {/* Fiche du bas : le lieu, et le chemin pour y aller. */}
        <div className="relative -mt-5 shrink-0 space-y-3 rounded-t-3xl bg-bg px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.35)]">
          <div className="order-rise flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
              <MapPin size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg leading-tight font-semibold">{title}</p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">{detail}</p>
            </div>
          </div>
          {town ? (
            <>
              {trip.status === "error" ? <p className="text-xs text-fg-muted">{locateError ? `${locateError} ${trip.message}` : trip.message}</p> : null}
              <button
                type="button"
                onClick={go}
                disabled={trip.status === "loading"}
                className="order-rise flex w-full items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-70 [animation-delay:40ms]"
                style={{ background: PERSONA }}
              >
                <CarFront size={18} aria-hidden="true" />
                {trip.status === "loading" ? "Je cherche le chemin…" : `Y aller depuis ma position`}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
