"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { loadMapLibre } from "@/lib/geo/maplibre";
import { MAYOTTE, type Cyclone } from "@/lib/cyclone/intent";

/**
 * Carte des cyclones, la même que celle du suivi de commande (MapLibre, fond
 * OpenFreeMap, sans clé) : on zoome et on déplace au doigt. Pour chaque
 * système : le trajet déjà fait en gris, le trajet prévu en pointillés de
 * couleur, la zone où il peut passer en voile léger, et sa position actuelle
 * (le symbole du cyclone tourne). Mayotte est marquée d'une épingle.
 */

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

type Props = {
  cyclones: readonly Cyclone[];
  /** Système choisi en bas : la carte se cadre sur lui. null : vue d'ensemble. */
  focus: string | null;
  onPick: (id: string) => void;
};

type Geo = { type: "FeatureCollection"; features: unknown[] };
const collection = (features: unknown[]): Geo => ({ type: "FeatureCollection", features });

/** Symbole météo du cyclone : un rond et deux bras enroulés. */
const CYCLONE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8C12 4.5 15 2.5 19 2.5"/><path d="M12 15.2c0 4.3-3 6.3-7 6.3"/></svg>';
const PIN_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>';

function pin(className: string, html: string, label?: string) {
  const el = document.createElement("div");
  const inner = document.createElement("div");
  inner.className = className;
  inner.innerHTML = html;
  el.appendChild(inner);
  if (label) el.setAttribute("aria-label", label);
  return el;
}

/** Tout ce qu'on dessine, en GeoJSON. */
function shapes(cyclones: readonly Cyclone[]) {
  const past: unknown[] = [];
  const ahead: unknown[] = [];
  const dots: unknown[] = [];
  const cones: unknown[] = [];
  for (const c of cyclones) {
    const done = c.track.filter((t) => !t.forecast);
    const last = done[done.length - 1] ?? c.track[0];
    const next = [last, ...c.track.filter((t) => t.forecast)];
    if (done.length > 1) past.push({ type: "Feature", properties: { id: c.id }, geometry: { type: "LineString", coordinates: done.map((t) => [t.lng, t.lat]) } });
    if (next.length > 1) ahead.push({ type: "Feature", properties: { id: c.id }, geometry: { type: "LineString", coordinates: next.map((t) => [t.lng, t.lat]) } });
    for (const t of c.track.filter((t) => t.forecast)) dots.push({ type: "Feature", properties: { id: c.id }, geometry: { type: "Point", coordinates: [t.lng, t.lat] } });
    if (c.cone) cones.push({ type: "Feature", properties: { id: c.id }, geometry: { type: "Polygon", coordinates: c.cone } });
  }
  return { past: collection(past), ahead: collection(ahead), dots: collection(dots), cones: collection(cones) };
}

/** Cadre qui montre Mayotte et les systèmes voulus (tout leur trajet). */
function boundsOf(cyclones: readonly Cyclone[]): [[number, number], [number, number]] {
  const pts = [MAYOTTE, ...cyclones.flatMap((c) => c.track)];
  const lngs = pts.map((p) => p.lng);
  const lats = pts.map((p) => p.lat);
  // Sans cyclone : le canal du Mozambique et Madagascar autour de Mayotte.
  const pad = cyclones.length ? 1 : 8;
  return [
    [Math.min(...lngs) - pad, Math.min(...lats) - pad],
    [Math.max(...lngs) + pad, Math.max(...lats) + pad],
  ];
}

const FIT = { padding: { top: 70, bottom: 40, left: 40, right: 40 }, maxZoom: 7 };

export function CycloneMap({ cyclones, focus, onPick }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ cyclones, onPick });
  useEffect(() => {
    latest.current = { cyclones, onPick };
  });

  // Création de la carte (une seule fois).
  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    (async () => {
      const maplibre = await loadMapLibre();
      if (cancelled || !frame.current) return;
      const dark = document.documentElement.dataset.theme === "dark";
      created = new maplibre.Map({
        container: frame.current,
        style: dark ? STYLE_DARK : STYLE_LIGHT,
        bounds: boundsOf(latest.current.cyclones),
        fitBoundsOptions: FIT,
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
        fadeDuration: 150,
      });
      map.current = created;
      created.touchZoomRotate.disableRotation();
      created.on("error", (e) => console.warn("[carte cyclones]", e.error?.message));

      new maplibre.Marker({ element: pin("map-pin map-pin-home", `<span class="map-pin-head">${PIN_SVG}</span><span class="map-pin-tip"></span>`, "Mayotte"), anchor: "bottom" })
        .setLngLat([MAYOTTE.lng, MAYOTTE.lat])
        .addTo(created);

      created.on("load", () => {
        if (!created || !frame.current) return;
        const css = getComputedStyle(frame.current);
        const accent = css.getPropertyValue("--persona").trim() || css.getPropertyValue("--accent").trim() || "#c8295f";
        const s = shapes(latest.current.cyclones);
        created.addSource("cones", { type: "geojson", data: s.cones as never });
        created.addSource("past", { type: "geojson", data: s.past as never });
        created.addSource("ahead", { type: "geojson", data: s.ahead as never });
        created.addSource("dots", { type: "geojson", data: s.dots as never });
        const round = { "line-cap": "round", "line-join": "round" } as const;
        created.addLayer({ id: "cones", type: "fill", source: "cones", paint: { "fill-color": accent, "fill-opacity": 0.12 } });
        created.addLayer({ id: "cones-edge", type: "line", source: "cones", paint: { "line-color": accent, "line-width": 1, "line-opacity": 0.45 } });
        created.addLayer({ id: "past", type: "line", source: "past", layout: round, paint: { "line-color": "#9aa1ab", "line-width": 3, "line-opacity": 0.85 } });
        created.addLayer({ id: "ahead-casing", type: "line", source: "ahead", layout: round, paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.85 } });
        created.addLayer({ id: "ahead", type: "line", source: "ahead", layout: round, paint: { "line-color": accent, "line-width": 3, "line-dasharray": [1.5, 1.5] } });
        created.addLayer({ id: "dots", type: "circle", source: "dots", paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-stroke-color": accent, "circle-stroke-width": 2 } });
        frame.current.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");

        // Position actuelle de chaque système : le symbole tourne (dans le sens des aiguilles, comme dans l'hémisphère sud).
        for (const c of latest.current.cyclones) {
          const el = pin("map-cyclone", `<span class="map-cyclone-ring"></span><span class="map-cyclone-dot">${CYCLONE_SVG}</span>`, c.name);
          el.style.cursor = "pointer";
          el.addEventListener("click", () => latest.current.onPick(c.id));
          markers.current.push(new maplibre.Marker({ element: el }).setLngLat([c.now.lng, c.now.lat]).addTo(created));
        }
        setReady(true);
      });
    })().catch((error) => {
      console.warn("[carte cyclones] Chargement impossible", error);
      setFailed(true);
    });
    return () => {
      cancelled = true;
      markers.current = [];
      created?.remove();
      map.current = null;
    };
  }, []);

  // Système choisi : la carte se cadre sur lui (et sur Mayotte) ; sinon, sur tous.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const chosen = focus ? cyclones.filter((c) => c.id === focus) : cyclones;
    m.fitBounds(boundsOf(chosen.length ? chosen : cyclones), { ...FIT, duration: 800 });
  }, [ready, focus, cyclones]);

  return (
    <div className="relative size-full overflow-hidden bg-[#eef0f2] dark:bg-[#1b1e22]">
      <div ref={frame} className="size-full" />
      {!ready && !failed ? <div aria-hidden="true" className="map-loading absolute inset-0" /> : null}
      {failed ? <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-fg-muted">Carte indisponible pour le moment.</p> : null}
    </div>
  );
}
