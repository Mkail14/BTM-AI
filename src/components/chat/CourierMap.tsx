"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/food/route";

/**
 * Carte du suivi : tuiles OpenStreetMap (sans clé ni bibliothèque), cadrée
 * sur le restaurant et le lieu de livraison. Trajet en pointillés, partie
 * déjà faite en couleur, livreur qui avance. Le cadrage suit la taille du
 * cadre : la carte prend la place qui reste dans le panneau.
 */

const TILE = 256;
const MAX_ZOOM = 17;
const PERSONA = "var(--persona,var(--accent))";

/** Coordonnées « monde » en pixels au zoom z (projection de Mercator, comme les tuiles). */
function project(p: Point, z: number) {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

type Props = {
  from: Point;
  to: Point;
  path: readonly Point[];
  courier: Point | null;
  /** Part du trajet déjà faite (0 à 1). */
  done: number;
  restaurantEmoji: string;
  /** Le livreur roule : le scooter bouge et pulse. */
  moving: boolean;
};

export function CourierMap({ from, to, path, courier, done, restaurantEmoji, moving }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { w, h } = size;
  // Zoom le plus fort qui garde le restaurant et la livraison dans le cadre, avec une marge pour les épingles.
  let z = MAX_ZOOM;
  while (z > 10) {
    const a = project(from, z);
    const b = project(to, z);
    if (Math.abs(a.x - b.x) <= w - 90 && Math.abs(a.y - b.y) <= h - 100) break;
    z--;
  }
  const a = project(from, z);
  const b = project(to, z);
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 8 };
  const left = center.x - w / 2;
  const top = center.y - h / 2;
  const toScreen = (p: Point) => {
    const q = project(p, z);
    return { x: q.x - left, y: q.y - top };
  };

  const tiles: { x: number; y: number; key: string }[] = [];
  if (w && h) {
    const max = 2 ** z;
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) {
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
        if (ty >= 0 && ty < max) tiles.push({ x: tx, y: ty, key: `${z}/${((tx % max) + max) % max}/${ty}` });
      }
    }
  }

  const points = path.map(toScreen);
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const cut = Math.max(1, Math.round(done * (points.length - 1)));
  const travelled = points.slice(0, cut + 1).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  const c = courier ? toScreen(courier) : null;
  if (c && done > 0) travelled.push(`${c.x.toFixed(1)},${c.y.toFixed(1)}`);
  const r = toScreen(from);
  const d = toScreen(to);

  return (
    <div ref={frame} className="relative size-full overflow-hidden bg-[#e8e4dc] dark:bg-[#1d2024]">
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- tuiles OpenStreetMap, déjà à la bonne taille
        <img
          key={t.key}
          src={`https://tile.openstreetmap.org/${t.key}.png`}
          alt=""
          draggable={false}
          loading="lazy"
          className="map-tile pointer-events-none absolute size-64 max-w-none select-none"
          style={{ left: t.x * TILE - left, top: t.y * TILE - top }}
        />
      ))}

      {w ? (
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          <polyline points={line} fill="none" stroke="white" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <polyline points={line} fill="none" stroke={PERSONA} strokeWidth={3} strokeDasharray="1 7" strokeLinecap="round" opacity={0.8} />
          {done > 0 ? (
            <polyline points={travelled.join(" ")} fill="none" stroke={PERSONA} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </svg>
      ) : null}

      {w ? (
        <>
          {/* Restaurant */}
          <span className="absolute -translate-x-1/2 -translate-y-full" style={{ left: r.x, top: r.y }}>
            <span className="grid size-9 place-items-center rounded-full border-2 border-white bg-bg text-lg shadow-lg">{restaurantEmoji}</span>
          </span>
          {/* Livraison */}
          <span className="absolute -translate-x-1/2 -translate-y-full" style={{ left: d.x, top: d.y }}>
            <span className="grid size-9 place-items-center rounded-full border-2 border-white text-base text-white shadow-lg" style={{ background: PERSONA }}>
              🏠
            </span>
          </span>
          {/* Livreur */}
          {c ? (
            <span className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-1000 ease-linear" style={{ left: c.x, top: c.y }}>
              {moving ? <span className="map-courier-pulse absolute inset-0 rounded-full" style={{ background: PERSONA }} /> : null}
              <span className="relative grid size-10 place-items-center rounded-full border-[3px] border-white bg-fg text-lg shadow-xl">🛵</span>
            </span>
          ) : null}
        </>
      ) : null}

      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-1 bottom-1 rounded bg-white/80 px-1 text-[9px] text-neutral-700"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
