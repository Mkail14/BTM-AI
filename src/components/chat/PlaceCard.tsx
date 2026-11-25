"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loadMapLibre } from "@/lib/geo/maplibre";
import { findTown } from "@/lib/mayotte/towns";
import { ISLAND_NAME } from "@/lib/mayotte/place-intent";

/**
 * Lieu de Mayotte dans la conversation (bloc ```carte-lieu```, « c'est où Chiconi ? ») :
 * la carte s'ouvre sur l'île entière, puis vole jusqu'au lieu et y pose un repère lumineux à son nom.
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

export function PlaceCard({ place }: { place: string }) {
  // « Mayotte » : l'île entière, sans repère ni vol.
  const island = place === ISLAND_NAME;
  const town = useMemo(() => (island ? null : findTown(place)), [island, place]);
  const frame = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

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
      setFailed(true);
    });
    return () => {
      cancelled = true;
      if (flight) clearTimeout(flight);
      created?.remove();
    };
  }, [town, island]);

  if (!town && !island) return null;
  const title = town?.name ?? ISLAND_NAME;
  const detail = !town ? "Grande-Terre et Petite-Terre" : town.isCommune ? "Commune de Mayotte" : `Village de la commune de ${town.commune}`;
  return (
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
        <Link href="/mayotte" className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: PERSONA }}>
          Voir en grand
        </Link>
      </div>
      {failed ? (
        <div className="grid h-56 place-items-center text-sm text-fg-muted">La carte ne se charge pas : vérifie ta connexion.</div>
      ) : (
        <div ref={frame} className="h-56 w-full sm:h-64" aria-label={town ? `Carte de Mayotte : ${town.name}` : "Carte de Mayotte"} role="img" />
      )}
    </div>
  );
}
