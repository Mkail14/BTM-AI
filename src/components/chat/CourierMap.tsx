"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/geo/maplibre";
import type { MapMouseEvent, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { Point } from "@/lib/food/route";

/**
 * Carte du suivi, vectorielle et fluide (MapLibre, fond OpenFreeMap, données
 * OpenStreetMap, sans clé) : on zoome et on déplace au doigt. Le reste du
 * trajet est tracé finement en couleur sur les vraies routes, la partie déjà
 * faite en gris, et le scooter glisse d'une position à l'autre. Dès qu'il
 * roule, la carte zoome sur lui et le suit, tant qu'on ne l'a pas déplacée soi-même.
 */

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

type Props = {
  from: Point;
  to: Point;
  /** Ce qui reste à parcourir (vraies routes). */
  route: readonly Point[];
  /** Ce que le livreur a déjà parcouru. */
  trail: readonly Point[];
  courier: Point | null;
  /** Le livreur roule : le scooter pulse. */
  moving: boolean;
  /** « trip » : trajet d'une personne (départ, drapeau d'arrivée) au lieu d'une livraison (restaurant, maison). */
  kind?: "delivery" | "trip";
  /**
   * Épingle (trajet) : le repère du départ se déplace au doigt (glisser, ou toucher la carte)
   * et chaque nouvelle place est renvoyée ici. Absent : repère fixe.
   */
  pick?: ((p: Point) => void) | null;
};

/** Zoom pour poser l'épingle : on voit les maisons. */
const PICK_ZOOM = 17;

const lngLat = (p: Point): [number, number] => [p.lng, p.lat];
/** Zoom quand la carte suit le livreur : on voit les rues autour de lui. */
const FOLLOW_ZOOM = 16;
const line = (points: readonly Point[]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: points.map(lngLat) },
});

/**
 * Élément d'un repère. MapLibre place le repère en modifiant la transformation
 * de cet élément : tout le dessin (et ses propres rotations) va dans l'élément intérieur.
 */
function pin(className: string, html: string) {
  const el = document.createElement("div");
  const inner = document.createElement("div");
  inner.className = className;
  inner.innerHTML = html;
  el.appendChild(inner);
  return el;
}

/** Scooter vu de côté, dessiné au trait blanc. */
const PIN_SVG = (paths: string) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const RESTAURANT_SVG = PIN_SVG('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>');
const HOME_SVG = PIN_SVG('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>');
const START_SVG = PIN_SVG('<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>');
const FLAG_SVG = PIN_SVG('<path d="M5 22V4"/><path d="M5 4h11l-2 4 2 4H5"/>');
const SCOOTER_SVG =
  '<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="36" r="7"/><circle cx="50" cy="36" r="7"/><path d="M21 36h16l6-14h-9"/><path d="M43 22l7 14"/><path d="M38 12h7l-2 10"/><rect x="6" y="14" width="16" height="12" rx="2.5" fill="currentColor" fill-opacity="0.25"/><path d="M6 26h20l4 6"/></svg>';

export function CourierMap({ from, to, route, trail, courier, moving, kind = "delivery", pick = null }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const startMarker = useRef<Marker | null>(null);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  const map = useRef<MapLibreMap | null>(null);
  const courierMarker = useRef<Marker | null>(null);
  const courierEl = useRef<HTMLDivElement | null>(null);
  const shown = useRef<Point | null>(null);
  const followed = useRef(true);
  const [ready, setReady] = useState(false);
  const [free, setFree] = useState(false);
  const [failed, setFailed] = useState(false);

  // Derniers tracés, relus quand la carte finit de charger.
  const latest = useRef({ from, to, route, trail });
  useEffect(() => {
    latest.current = { from, to, route, trail };
  });

  // Création de la carte (une seule fois).
  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    (async () => {
      const maplibre = await loadMapLibre();
      if (cancelled || !frame.current) return;
      const dark = document.documentElement.dataset.theme === "dark";
      const { from: a, to: b } = latest.current;
      created = new maplibre.Map({
        container: frame.current,
        style: dark ? STYLE_DARK : STYLE_LIGHT,
        bounds: [
          [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat)],
          [Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)],
        ],
        fitBoundsOptions: { padding: { top: 80, bottom: 60, left: 50, right: 50 }, maxZoom: 16 },
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
        fadeDuration: 150,
      });
      map.current = created;
      created.touchZoomRotate.disableRotation();
      created.on("error", (e) => console.warn("[carte]", e.error?.message));
      // Déplacée à la main : on arrête de recadrer, le bouton « Recentrer » apparaît.
      created.on("dragstart", () => {
        followed.current = false;
        setFree(true);
      });

      const trip = kind === "trip";
      const startPin = pin("map-pin", `<span class="map-pin-head">${trip ? START_SVG : RESTAURANT_SVG}</span><span class="map-pin-tip"></span>`);
      startMarker.current = new maplibre.Marker({ element: startPin, anchor: "bottom" }).setLngLat(lngLat(a)).addTo(created);
      new maplibre.Marker({ element: pin("map-pin map-pin-home", `<span class="map-pin-head">${trip ? FLAG_SVG : HOME_SVG}</span><span class="map-pin-tip"></span>`), anchor: "bottom" }).setLngLat(lngLat(b)).addTo(created);
      courierEl.current = pin("map-courier", `<span class="map-courier-ring"></span><span class="map-courier-dot">${SCOOTER_SVG}</span>`);
      courierMarker.current = new maplibre.Marker({ element: courierEl.current });

      created.on("load", () => {
        if (!created) return;
        const accent = getComputedStyle(frame.current!).getPropertyValue("--persona").trim() || getComputedStyle(frame.current!).getPropertyValue("--accent").trim() || "#c8295f";
        const { route: r, trail: t } = latest.current;
        created.addSource("trail", { type: "geojson", data: line(t) });
        created.addSource("route", { type: "geojson", data: line(r) });
        // Traits fins, plus épais seulement de près : déjà parcouru en gris, reste à parcourir en couleur par-dessus.
        const round = { "line-cap": "round", "line-join": "round" } as const;
        const width = (near: number) => ["interpolate", ["linear"], ["zoom"], 11, near * 0.5, 16, near] as unknown as number;
        created.addLayer({ id: "trail", type: "line", source: "trail", layout: round, paint: { "line-color": "#9aa1ab", "line-width": width(3), "line-opacity": 0.8 } });
        created.addLayer({ id: "route-casing", type: "line", source: "route", layout: round, paint: { "line-color": "#ffffff", "line-width": width(5.5), "line-opacity": 0.9 } });
        created.addLayer({ id: "route", type: "line", source: "route", layout: round, paint: { "line-color": accent, "line-width": width(3.5) } });
        // Crédits de la carte (obligatoires) : repliés en un petit « i », dépliés seulement au toucher.
        frame.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        setReady(true);
      });
    })().catch((error) => {
      console.warn("[carte] Chargement impossible", error);
      setFailed(true);
    });
    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
    };
    // La carte est créée une fois ; les tracés suivent par les effets ci-dessous (kind ne change pas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracés : mis à jour sans recharger la carte.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("route") as { setData?: (d: unknown) => void } | undefined)?.setData?.(line(route));
    (m.getSource("trail") as { setData?: (d: unknown) => void } | undefined)?.setData?.(line(trail));
  }, [ready, route, trail]);

  // Recadrage sur le reste du trajet (livreur compris), tant qu'on n'a pas déplacé la carte.
  const frameKey = `${route.length}:${route[route.length - 1]?.lat}:${route[0]?.lat.toFixed(3)}:${route[0]?.lng.toFixed(3)}`;
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !followed.current || courier) return;
    const pts = [...route, from, to];
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 80, bottom: 60, left: 50, right: 50 }, maxZoom: 16, duration: 900 },
    );
    // frameKey résume le trajet : inutile de recadrer à chaque seconde pour quelques mètres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, frameKey, Boolean(courier)]);

  // Scooter : glisse en douceur jusqu'à sa nouvelle position (une par seconde).
  useEffect(() => {
    const m = map.current;
    const marker = courierMarker.current;
    if (!m || !marker) return;
    if (!courier) {
      marker.remove();
      shown.current = null;
      return;
    }
    const start = shown.current ?? courier;
    if (!shown.current) {
      marker.setLngLat(lngLat(courier)).addTo(m);
      // Premier signal du livreur : la carte zoome sur lui.
      if (followed.current) m.easeTo({ center: lngLat(courier), zoom: Math.max(m.getZoom(), FOLLOW_ZOOM), duration: 1200 });
    }
    // Le scooter (vu de côté) regarde dans le sens où il roule.
    if (Math.abs(courier.lng - start.lng) > 1e-6) {
      courierEl.current?.firstElementChild?.classList.toggle("is-west", courier.lng < start.lng);
    }
    let frameId = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 950);
      const p = { lat: start.lat + (courier.lat - start.lat) * k, lng: start.lng + (courier.lng - start.lng) * k };
      marker.setLngLat(lngLat(p));
      shown.current = p;
      // Suivi : la carte reste centrée sur le livreur pendant qu'il glisse.
      if (followed.current && !m.isMoving()) m.setCenter(lngLat(p));
      if (k < 1) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [courier, ready]);

  useEffect(() => {
    courierEl.current?.firstElementChild?.classList.toggle("is-moving", moving);
  }, [moving, ready]);

  // Épingle : la carte zoome sur le départ, le repère se glisse ou saute là où on touche.
  const picking = Boolean(pick);
  useEffect(() => {
    const m = map.current;
    const marker = startMarker.current;
    if (!ready || !m || !marker) return;
    marker.setDraggable(picking);
    if (!picking) {
      marker.setLngLat(lngLat(latest.current.from));
      return;
    }
    followed.current = false;
    m.easeTo({ center: marker.getLngLat(), zoom: Math.max(m.getZoom(), PICK_ZOOM), duration: 800 });
    const report = () => {
      const p = marker.getLngLat();
      pickRef.current?.({ lat: p.lat, lng: p.lng });
    };
    const onTap = (e: MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      report();
    };
    marker.on("dragend", report);
    m.on("click", onTap);
    return () => {
      marker.off("dragend", report);
      m.off("click", onTap);
    };
  }, [ready, picking]);

  return (
    <div className="relative size-full overflow-hidden bg-[#eef0f2] dark:bg-[#1b1e22]">
      <div ref={frame} className="size-full" />
      {!ready && !failed ? <div aria-hidden="true" className="map-loading absolute inset-0" /> : null}
      {failed ? <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-fg-muted">Carte indisponible pour le moment.</p> : null}
      {free ? (
        <button
          type="button"
          onClick={() => {
            followed.current = true;
            setFree(false);
            if (shown.current) {
              map.current?.easeTo({ center: lngLat(shown.current), zoom: FOLLOW_ZOOM, duration: 700 });
              return;
            }
            const pts = [...latest.current.route, from, to];
            map.current?.fitBounds(
              [
                [Math.min(...pts.map((p) => p.lng)), Math.min(...pts.map((p) => p.lat))],
                [Math.max(...pts.map((p) => p.lng)), Math.max(...pts.map((p) => p.lat))],
              ],
              { padding: { top: 80, bottom: 60, left: 50, right: 50 }, maxZoom: 16, duration: 700 },
            );
          }}
          className="absolute right-3 bottom-9 rounded-full bg-bg/95 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:bg-bg"
        >
          ◎ Recentrer
        </button>
      ) : null}
    </div>
  );
}
