"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loadMapLibre } from "@/lib/geo/maplibre";
import { waterCells } from "@/lib/water/cells";
import type { WaterSpot } from "@/lib/water/map";

/**
 * Carte de l'eau (MapLibre, fond OpenFreeMap) : toute l'île colorée, une zone par lieu (le lieu le
 * plus proche). Les zones sont peintes sous la mer du fond de carte, qui les recoupe au bord de
 * l'eau. Bleu : de l'eau ; rouge : coupé ; hachuré en tirets : pas d'information officielle.
 * Toucher une zone montre ce qu'en dit le planning.
 */

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
/** Mêmes couleurs que la légende (WaterCard). */
const WATER_COLORS = { eau: "#2563eb", coupee: "#dc2626", inconnu: "#6b7280" } as const;
/** Mayotte entière, Petite-Terre comprise. */
const BOUNDS: [[number, number], [number, number]] = [
  [45.0, -13.0],
  [45.3, -12.64],
];

function collection(spots: readonly WaterSpot[]) {
  const cells = waterCells(spots);
  return {
    type: "FeatureCollection",
    features: spots.flatMap((s, i) => {
      const ring = cells[i];
      return ring ? [{ type: "Feature", id: i, properties: { i, state: s.state }, geometry: { type: "Polygon", coordinates: [ring] } }] : [];
    }),
  };
}

/** Motif des zones sans information : des tirets en biais, gris. */
function hatch(dark: boolean) {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = dark ? "rgba(209,213,219,0.7)" : "rgba(75,85,99,0.55)";
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
        fitBoundsOptions: { padding: 16 },
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
        // Sous la mer du fond de carte : elle recoupe les zones au bord de l'eau.
        const under = created.getStyle().layers.find((l) => l.type === "fill" && l.id === "water")?.id;
        created.addImage("hachures", hatch(dark), { pixelRatio: 2 });
        created.addSource("zones", { type: "geojson", data: collection(latest.current.spots) as never });
        const picked = ["boolean", ["feature-state", "picked"], false];
        const known = ["!=", ["get", "state"], "inconnu"] as never;
        const unknown = ["==", ["get", "state"], "inconnu"] as never;
        created.addLayer({ id: "inconnu", type: "fill", source: "zones", filter: unknown, paint: { "fill-pattern": "hachures" } }, under);
        created.addLayer(
          {
            id: "etat",
            type: "fill",
            source: "zones",
            filter: known,
            paint: {
              "fill-color": ["match", ["get", "state"], "eau", WATER_COLORS.eau, WATER_COLORS.coupee] as never,
              "fill-opacity": ["case", picked, 0.75, 0.5] as never,
            },
          },
          under,
        );
        // Limites entre villages : fines ; celles d'une zone sans info en tirets.
        created.addLayer(
          {
            id: "bord",
            type: "line",
            source: "zones",
            paint: { "line-color": dark ? "#0b0f19" : "#ffffff", "line-width": 1, "line-opacity": 0.8 },
          },
          under,
        );
        created.addLayer(
          {
            id: "bord-inconnu",
            type: "line",
            source: "zones",
            filter: unknown,
            paint: { "line-color": WATER_COLORS.inconnu, "line-width": 1, "line-dasharray": [2, 2], "line-opacity": 0.7 },
          },
          under,
        );
        created.addLayer(
          {
            id: "choisi",
            type: "line",
            source: "zones",
            paint: { "line-color": dark ? "#ffffff" : "#111827", "line-width": ["case", picked, 2.5, 0] as never },
          },
          under,
        );
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

  // Lieu choisi : sa zone est entourée. La carte reste sur l'île entière.
  const previous = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (previous.current !== null) m.setFeatureState({ source: "zones", id: previous.current }, { picked: false });
    previous.current = picked;
    if (picked !== null) m.setFeatureState({ source: "zones", id: picked }, { picked: true });
  }, [ready, picked, spots]);

  if (failed) return <div className="grid h-full place-items-center text-sm text-fg-muted">La carte ne se charge pas : vérifie ta connexion.</div>;
  return <div ref={frame} className="h-full w-full" />;
}
