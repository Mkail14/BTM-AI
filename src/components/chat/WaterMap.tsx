"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loadMapLibre } from "@/lib/geo/maplibre";
import type { WaterSpot } from "@/lib/water/map";

/**
 * Carte de l'eau (MapLibre, fond OpenFreeMap, comme la carte des cyclones) : une tache par
 * lieu du planning de la SMAE. Bleu : de l'eau ; rouge : coupé ; hachuré en tirets : pas
 * d'information officielle. Toucher une tache montre ce qu'en dit le planning.
 */

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
/** Mêmes couleurs que la légende (WaterCard). */
const WATER_COLORS ={ eau: "#2563eb", coupee: "#dc2626", inconnu: "#6b7280" } as const;
/** Mayotte entière, Petite-Terre comprise. */
const BOUNDS: [[number, number], [number, number]] = [
  [44.99, -13.01],
  [45.31, -12.63],
];
const RADIUS_M = 380;

/** Disque autour d'un lieu, en polygone (MapLibre ne sait pas hachurer un cercle). */
function disc(lat: number, lng: number, radius = RADIUS_M) {
  const ring: [number, number][] = [];
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

function collection(spots: readonly WaterSpot[]) {
  return {
    type: "FeatureCollection",
    features: spots.map((s, i) => ({ type: "Feature", id: i, properties: { i, state: s.state }, geometry: { type: "Polygon", coordinates: [disc(s.lat, s.lng)] } })),
  };
}

/** Motif des lieux sans information : des tirets en biais, gris. */
function hatch(dark: boolean) {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = dark ? "rgba(209,213,219,0.85)" : "rgba(75,85,99,0.75)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  // Deux tirets sur la diagonale (et leur suite au bord, pour que le motif se raccorde).
  for (const [x1, y1, x2, y2] of [
    [2, 14, 6, 10],
    [10, 6, 14, 2],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

type Props = { spots: readonly WaterSpot[]; picked: number | null; onPick: (index: number | null) => void };

export function WaterMap({ spots, picked, onPick }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ spots, onPick });
  useEffect(() => {
    latest.current = { spots, onPick };
  });

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
        bounds: BOUNDS,
        fitBoundsOptions: { padding: 12 },
        attributionControl: { compact: true },
        pitchWithRotate: false,
        dragRotate: false,
        fadeDuration: 150,
      });
      map.current = created;
      created.touchZoomRotate.disableRotation();
      created.on("error", (e) => console.warn("[carte eau]", e.error?.message));
      created.on("load", () => {
        if (!created || !frame.current) return;
        created.addImage("hachures", hatch(dark), { pixelRatio: 2 });
        created.addSource("lieux", { type: "geojson", data: collection(latest.current.spots) as never });
        const known = ["!=", ["get", "state"], "inconnu"] as never;
        const unknown = ["==", ["get", "state"], "inconnu"] as never;
        created.addLayer({ id: "inconnu", type: "fill", source: "lieux", filter: unknown, paint: { "fill-pattern": "hachures" } });
        created.addLayer({
          id: "inconnu-bord",
          type: "line",
          source: "lieux",
          filter: unknown,
          paint: { "line-color": WATER_COLORS.inconnu, "line-width": 1.2, "line-dasharray": [2, 2], "line-opacity": 0.9 },
        });
        created.addLayer({
          id: "etat",
          type: "fill",
          source: "lieux",
          filter: known,
          paint: {
            "fill-color": ["match", ["get", "state"], "eau", WATER_COLORS.eau, WATER_COLORS.coupee] as never,
            "fill-opacity": ["case", ["boolean", ["feature-state", "picked"], false], 0.8, 0.5] as never,
          },
        });
        created.addLayer({
          id: "etat-bord",
          type: "line",
          source: "lieux",
          filter: known,
          paint: {
            "line-color": ["match", ["get", "state"], "eau", WATER_COLORS.eau, WATER_COLORS.coupee] as never,
            "line-width": ["case", ["boolean", ["feature-state", "picked"], false], 3, 1.2] as never,
          },
        });
        for (const layer of ["etat", "inconnu"]) {
          created.on("click", layer, (e) => {
            const i = e.features?.[0]?.properties?.i;
            if (typeof i === "number") latest.current.onPick(i);
          });
          created.on("mouseenter", layer, () => (created!.getCanvas().style.cursor = "pointer"));
          created.on("mouseleave", layer, () => (created!.getCanvas().style.cursor = ""));
        }
        frame.current.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        setReady(true);
      });
    })().catch((error) => {
      console.warn("[carte eau] Chargement impossible", error);
      setFailed(true);
    });
    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
    };
  }, []);

  // Lieu choisi : mis en avant, et la carte s'en approche.
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (previous.current !== null) m.setFeatureState({ source: "lieux", id: previous.current }, { picked: false });
    previous.current = picked;
    if (picked === null) return;
    m.setFeatureState({ source: "lieux", id: picked }, { picked: true });
    const spot = spots[picked];
    if (spot) m.easeTo({ center: [spot.lng, spot.lat], zoom: Math.max(m.getZoom(), 12.5), duration: 700 });
  }, [ready, picked, spots]);

  if (failed) return <div className="grid h-full place-items-center text-sm text-fg-muted">La carte ne se charge pas : vérifie ta connexion.</div>;
  return <div ref={frame} className="h-full w-full" />;
}
