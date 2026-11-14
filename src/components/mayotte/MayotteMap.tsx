"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { TamilyaBlob } from "@/components/chat/TamilyaBlob";
import { useLiveVoiceConversation } from "@/components/chat/useLiveVoiceConversation";
import { personaStyle } from "@/components/personality/PersonalityContext";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadMapLibre } from "@/lib/geo/maplibre";
import { describeRoute, describeTown, findTown, type Town, type TownRoute } from "@/lib/mayotte/towns";

/**
 * Carte de Mayotte de la page « Mayotte », la même que celle du suivi de
 * commande (MapLibre, fond OpenFreeMap, sans clé) : on zoome et on déplace au
 * doigt. Elle s'ouvre cadrée sur l'île entière (Grande-Terre et Petite-Terre)
 * et suit le thème clair ou sombre.
 *
 * Toucher le globe : Tamilya écoute. Ici elle ne parle que des villes et
 * villages de l'île (map-mode.ts) : on en nomme un, la carte vole jusque-là ;
 * on en nomme deux, la route entre eux se trace en rose.
 */

const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

/** L'île entière : [ouest, sud], [est, nord]. */
const ISLAND: [[number, number], [number, number]] = [
  [45.01, -13.01],
  [45.31, -12.63],
];
/** On ne s'éloigne pas au-delà du lagon et des îlots autour. */
const LIMITS: [[number, number], [number, number]] = [
  [44.3, -13.6],
  [46.0, -12.1],
];

/** Vol jusqu'à une ville : durée, zoom d'arrivée et inclinaison de la vue. */
const FLIGHT_MS = 4_200;
const TOWN_ZOOM = 14.3;
const TOWN_PITCH = 55;
/** Une fois arrivée, la vue tourne très lentement autour de la ville (jusqu'au premier toucher). */
const ORBIT_MS = 40_000;
const ORBIT_DEG = 70;

/** Trajet entre deux villes : la ligne rose (le rose des repères), posée sur un liseré blanc pour rester lisible. */
const ROUTE = "trajet";
const ROUTE_PINK = "#ff4dd8";
const ROUTE_FIT_MS = 2_600;

/** Envoyé par le mot « Mayotte » du titre de la page : la carte revient à sa vue de départ. */
export const MAP_RESET_EVENT = "tamilya:carte-mayotte-depart";

const isDark = () => document.documentElement.dataset.theme === "dark";
const isCalm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pose (ou remplace) le tracé du trajet sur la carte. */
function drawRoute(view: MapLibreMap, line: [number, number][]) {
  const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: line } };
  const source = view.getSource(ROUTE) as { setData?: (d: typeof data) => void } | undefined;
  if (source?.setData) return source.setData(data);
  view.addSource(ROUTE, { type: "geojson", data });
  const layout = { "line-cap": "round" as const, "line-join": "round" as const };
  view.addLayer({ id: `${ROUTE}-bord`, type: "line", source: ROUTE, layout, paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 } });
  view.addLayer({ id: ROUTE, type: "line", source: ROUTE, layout, paint: { "line-color": ROUTE_PINK, "line-width": 4.5 } });
}

export function MayotteMap() {
  const frame = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const engine = useRef<typeof import("maplibre-gl") | null>(null);
  /** Repères posés sur la carte : un pour une ville, deux pour un trajet. */
  const pins = useRef<Marker[]>([]);
  /** Tracé du trajet affiché ([longitude, latitude]) : reposé quand la carte change de fond (thème). */
  const routeLine = useRef<[number, number][] | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    let theme: MutationObserver | null = null;
    (async () => {
      const maplibre = await loadMapLibre();
      if (cancelled || !frame.current) return;
      let dark = isDark();
      created = new maplibre.Map({
        container: frame.current,
        style: dark ? STYLE_DARK : STYLE_LIGHT,
        bounds: ISLAND,
        fitBoundsOptions: { padding: 24 },
        maxBounds: LIMITS,
        // Pas de mention sur la carte : le crédit (obligatoire) est dans les Conditions, rubrique 13 « Propriété intellectuelle ».
        attributionControl: false,
        pitchWithRotate: false,
        dragRotate: false,
        fadeDuration: 150,
      });
      created.touchZoomRotate.disableRotation();
      created.on("error", (e) => console.warn("[carte Mayotte]", e.error?.message));
      created.on("load", () => setReady(true));
      // Changement de fond (thème) : le tracé du trajet est effacé avec l'ancien fond, on le repose.
      created.on("style.load", () => {
        if (created && routeLine.current) drawRoute(created, routeLine.current);
      });
      engine.current = maplibre;
      map.current = created;

      // Changement de thème : la carte change de fond sans se recharger.
      theme = new MutationObserver(() => {
        if (isDark() === dark) return;
        dark = isDark();
        created?.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
      });
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })().catch((error) => {
      console.warn("[carte Mayotte] Chargement impossible", error);
      setFailed(true);
    });
    return () => {
      cancelled = true;
      theme?.disconnect();
      pins.current.forEach((p) => p.remove());
      pins.current = [];
      routeLine.current = null;
      map.current = null;
      created?.remove();
    };
  }, []);

  /** Retire les repères et le tracé du trajet. */
  const clearMarks = useCallback(() => {
    pins.current.forEach((p) => p.remove());
    pins.current = [];
    routeLine.current = null;
    const view = map.current;
    if (!view?.getSource(ROUTE)) return;
    view.removeLayer(`${ROUTE}-bord`);
    view.removeLayer(ROUTE);
    view.removeSource(ROUTE);
  }, []);

  /** Pose un repère lumineux au nom du lieu. */
  const addPin = useCallback((town: Town) => {
    const [view, maplibre] = [map.current, engine.current];
    if (!view || !maplibre) return null;
    const mark = document.createElement("div");
    mark.className = "town-pin";
    const name = document.createElement("span");
    name.className = "town-pin__name";
    name.textContent = town.name;
    mark.append(name);
    pins.current.push(new maplibre.Marker({ element: mark, anchor: "center" }).setLngLat([town.point.lng, town.point.lat]).addTo(view));
    return mark;
  }, []);

  /** La carte vole jusqu'à la ville, s'incline, pose un repère lumineux à son nom, puis tourne doucement autour. */
  const showTown = useCallback((town: Town) => {
    const [view, maplibre] = [map.current, engine.current];
    if (!view || !maplibre) return false;
    const center: [number, number] = [town.point.lng, town.point.lat];
    clearMarks();
    const mark = addPin(town);
    view.stop();
    if (isCalm()) {
      view.jumpTo({ center, zoom: TOWN_ZOOM, pitch: 0, bearing: 0 });
      return true;
    }
    const bearing = Math.random() * 50 - 25;
    view.flyTo({ center, zoom: TOWN_ZOOM, pitch: TOWN_PITCH, bearing, duration: FLIGHT_MS, curve: 1.5, essential: true });
    view.once("moveend", () => {
      // Vol coupé au doigt, ou autre ville demandée entre-temps : pas de tour.
      const at = view.getCenter();
      if (pins.current[0]?.getElement() !== mark || Math.abs(at.lng - center[0]) > 0.0005 || Math.abs(at.lat - center[1]) > 0.0005) return;
      view.easeTo({ bearing: bearing + ORBIT_DEG, duration: ORBIT_MS, easing: (t) => t, essential: true });
    });
    return true;
  }, [addPin, clearMarks]);

  /** Trajet entre deux lieux : un repère à chaque bout, la route en rose (si elle a pu être calculée), et la carte cadrée sur le tout. */
  const showRoute = useCallback(
    (from: Town, to: Town, line: [number, number][] | null) => {
      const [view, maplibre] = [map.current, engine.current];
      if (!view || !maplibre) return false;
      clearMarks();
      addPin(from);
      addPin(to);
      view.stop();
      const ends: [number, number][] = [
        [from.point.lng, from.point.lat],
        [to.point.lng, to.point.lat],
      ];
      if (line && line.length > 1) {
        routeLine.current = line;
        drawRoute(view, line);
      }
      const bounds = new maplibre.LngLatBounds(ends[0], ends[0]);
      for (const point of [...ends, ...(line ?? [])]) bounds.extend(point);
      view.fitBounds(bounds, { padding: 64, maxZoom: 14, pitch: 0, bearing: 0, duration: isCalm() ? 0 : ROUTE_FIT_MS, essential: true });
      return true;
    },
    [addPin, clearMarks],
  );

  /** Retour à l'île entière, vue du dessus, sans repère. */
  const showIsland = useCallback(() => {
    const view = map.current;
    if (!view) return false;
    clearMarks();
    view.stop();
    view.fitBounds(ISLAND, { padding: 24, pitch: 0, bearing: 0, duration: isCalm() ? 0 : 1_100, essential: true });
    return true;
  }, [clearMarks]);

  // Mot « Mayotte » du titre touché : vue de départ.
  useEffect(() => {
    window.addEventListener(MAP_RESET_EVENT, showIsland);
    return () => window.removeEventListener(MAP_RESET_EVENT, showIsland);
  }, [showIsland]);

  // Boutons de Tamilya sur cette page : montrer une ville, tracer un trajet, revenir à l'île.
  const options = useMemo(
    () => ({
      map: true,
      onTool: async (name: string, args: Record<string, unknown>) => {
        if (name === "montrer_ile") return showIsland() ? "La carte revient sur Mayotte en entier. Dis-le en quelques mots, à ta façon." : "La carte n'est pas encore chargée : dis-lui de réessayer dans un instant.";
        if (name === "montrer_trajet") {
          const [from, to] = [findTown(String(args.depart ?? "")), findTown(String(args.arrivee ?? ""))];
          if (!from || !to) return `${!from ? "Le lieu de départ" : "Le lieu d'arrivée"} n'est pas sur la carte de Mayotte : demande-lui de redire ce nom, sans rien inventer.`;
          if (from.name === to.name) return "Le départ et l'arrivée sont le même lieu : demande-lui vers où elle veut aller.";
          if (!map.current) return "La carte n'est pas encore chargée : dis-lui de réessayer dans un instant.";
          // La route (OSRM) est calculée par le site ; sans elle, les deux repères sont quand même montrés.
          const route = await fetch("/api/voice/live/tool", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "montrer_trajet", args: { depart: from.name, arrivee: to.name } }),
            signal: AbortSignal.timeout(8_000),
          })
            .then((r) => (r.ok ? (r.json() as Promise<{ route?: TownRoute | null }>) : null))
            .then((data) => data?.route ?? null)
            .catch(() => null);
          if (!showRoute(from, to, route?.line ?? null)) return "La carte n'est pas encore chargée : dis-lui de réessayer dans un instant.";
          return describeRoute(from, to, route);
        }
        if (name !== "montrer_ville") return null;
        const town = findTown(String(args.ville ?? ""));
        if (!town) return "Ce nom n'est pas sur la carte de Mayotte : demande-lui de redire le nom de la ville ou du village, sans rien inventer.";
        if (!showTown(town)) return "La carte n'est pas encore chargée : dis-lui de réessayer dans un instant.";
        // Habitants de la commune (INSEE) : demandés au site pendant que la carte vole.
        const population = await fetch("/api/voice/live/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "montrer_ville", args: { commune: town.commune } }),
          signal: AbortSignal.timeout(3_500),
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ population?: string | null }>) : null))
          .then((data) => data?.population ?? null)
          .catch(() => null);
        return describeTown(town, population);
      },
    }),
    [showIsland, showRoute, showTown],
  );

  // Toucher le globe : le micro s'ouvre et Tamilya écoute, sans changer de page. Chaque échange est enregistré comme sur /voix.
  const conversationId = useRef<string | null>(null);
  const voice = useLiveVoiceConversation(
    (user, tamilya) => {
      void fetch("/api/voice/live/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, tamilya, ...(conversationId.current ? { conversationId: conversationId.current } : {}) }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ conversationId?: string }>) : null))
        .then((saved) => {
          if (saved?.conversationId) conversationId.current = saved.conversationId;
        })
        .catch(() => {});
    },
    null,
    options,
  );
  const listening = voice.state !== "off";

  return (
    <div className="relative size-full overflow-hidden bg-[#eef0f2] dark:bg-[#1b1e22]">
      <div ref={frame} role="region" aria-label="Carte de Mayotte" className="size-full" />
      {/* La lueur de Tamilya sur les bords de la carte : éteinte au repos, elle s'allume tant que Tamilya écoute ou parle. */}
      <div aria-hidden="true" className="voice-edge" data-on={listening ? "" : undefined} data-state={voice.state} style={{ "--edge-width": "clamp(1rem, 4vmin, 2rem)" } as CSSProperties} />
      {/* Le globe de Tamilya, en haut à droite de la carte : le même qu'à l'accueil, en petit. Le toucher ouvre le micro (Tamilya écoute) ; le retoucher coupe tout. */}
      <div className="absolute top-[7%] right-[9%] z-[60]" style={personaStyle(DEFAULT_PERSONALITY)}>
        <TamilyaBlob
          label={listening ? "Arrêter de parler à Tamilya" : "Parler à Tamilya"}
          onActivate={listening ? voice.stop : voice.listen}
          immediate
          busy={voice.state === "waiting"}
          size="clamp(3rem, 9vmin, 4.5rem)"
          goo={3}
        />
      </div>
      {voice.error && !listening ? (
        <p role="status" className="absolute inset-x-4 bottom-4 z-[60] mx-auto w-fit max-w-full rounded-2xl bg-black/70 px-4 py-2 text-center text-sm text-white">
          {voice.error}
        </p>
      ) : null}
      {!ready && !failed ? <div aria-hidden="true" className="map-loading absolute inset-0" /> : null}
      {failed ? <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-fg-muted">Carte indisponible pour le moment.</p> : null}
    </div>
  );
}
