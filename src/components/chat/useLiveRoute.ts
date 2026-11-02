"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteResponse } from "@/app/api/route/route";
import { closestOnPath, OFF_ROUTE_KM, type Point } from "@/lib/food/route";

/** Trajets sur les vraies routes (le plus rapide, puis un de rechange), ou null si le calcul échoue. */
async function fetchRoutes(from: Point, to: Point, alternatives = true): Promise<Point[][] | null> {
  try {
    const res = await fetch(`/api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${alternatives ? "" : "&alt=0"}`);
    if (!res.ok) return null;
    const body = (await res.json()) as RouteResponse;
    return body.routes.map((r) => r.path.map(([lat, lng]) => ({ lat, lng })));
  } catch {
    return null;
  }
}

/** Trajets du restaurant à la livraison, calculés une fois (null tant qu'ils chargent ou s'ils échouent). */
export function useRoadRoutes(from: Point, to: Point) {
  const [routes, setRoutes] = useState<{ key: string; main: Point[]; alt: Point[] | null } | null>(null);
  const key = `${from.lat},${from.lng}>${to.lat},${to.lng}`;

  useEffect(() => {
    let alive = true;
    fetchRoutes(from, to).then((found) => {
      if (alive && found?.length) setRoutes({ key, main: found[0], alt: found[1] ?? null });
    });
    return () => {
      alive = false;
    };
    // key résume from et to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return routes?.key === key ? routes : null;
}

/** Délai minimal entre deux recalculs, comme un GPS de voiture. */
const REROUTE_EVERY_MS = 5000;

/**
 * Itinéraire suivi en direct : celui prévu au départ, puis recalculé depuis
 * la position du livreur dès qu'il s'en écarte de plus de 60 m (raccourci,
 * route barrée, autre chemin). `rerouted` passe à vrai quelques secondes
 * après chaque recalcul, pour le signaler.
 */
export function useLiveRoute(planned: Point[], courier: Point | null, to: Point) {
  const [plan, setPlan] = useState({ base: planned, path: planned });
  const [reroutedAt, setReroutedAt] = useState(0);
  const busy = useRef(false);
  const last = useRef(0);

  // Nouveau trajet prévu (les vraies routes viennent d'arriver) : il remplace l'ancien.
  if (plan.base !== planned) setPlan({ base: planned, path: planned });

  const offRoute = courier !== null && plan.path.length > 1 && closestOnPath(plan.path, courier).km > OFF_ROUTE_KM;

  useEffect(() => {
    if (!offRoute || !courier || busy.current || Date.now() - last.current < REROUTE_EVERY_MS) return;
    busy.current = true;
    last.current = Date.now();
    fetchRoutes(courier, to, false).then((found) => {
      busy.current = false;
      if (!found?.length) return;
      setPlan((p) => ({ ...p, path: found[0] }));
      setReroutedAt(Date.now());
    });
  }, [offRoute, courier, to]);

  // Bandeau « Itinéraire recalculé » : 4 secondes, effacé par un minuteur.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!reroutedAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 4000);
    return () => window.clearTimeout(timer);
  }, [reroutedAt]);

  return { path: plan.path, rerouted: reroutedAt > now };
}
