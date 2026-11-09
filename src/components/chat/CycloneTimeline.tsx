"use client";

import { Pause, Play, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAYOTTE, type Cyclone, type CyclonePoint } from "@/lib/cyclone/intent";
import { ageHours, km, motionOf, positionAt, STALE_AFTER_H } from "@/lib/cyclone/motion";
import { hapticPress } from "@/lib/chat/haptics";

/**
 * Le trajet dans le temps, sous la carte des cyclones :
 * - une phrase « depuis hier 15 h : 375 km vers l'ouest, 16 km/h, 375 km plus près » ;
 * - un avertissement si la dernière mesure est vieille (sinon on croit qu'il ne bouge pas) ;
 * - la courbe de sa distance à Mayotte (trait plein : mesuré ; pointillés : prévu) ;
 * - un curseur du temps et « Rejouer » : le cyclone parcourt son trajet sur la carte.
 */

const PERSONA = "var(--persona,var(--accent))";
/** Durée de la relecture complète du trajet. */
const REPLAY_MS = 6000;

const when = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", hour: "numeric", timeZone: "Indian/Mayotte" });
const since = new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "numeric", timeZone: "Indian/Mayotte" });

type Props = {
  cyclone: Cyclone;
  /** Position rejouée (null : on regarde la dernière mesure). */
  onMove: (p: CyclonePoint | null) => void;
};

export function CycloneTimeline({ cyclone, onMove }: Props) {
  const track = cyclone.track;
  const t0 = Date.parse(track[0]?.at ?? cyclone.now.at);
  const t1 = Date.parse(track[track.length - 1]?.at ?? cyclone.now.at);
  const tNow = Date.parse(cyclone.now.at);
  const [t, setT] = useState(tNow);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  const motion = useMemo(() => motionOf(cyclone), [cyclone]);
  const age = ageHours(cyclone);

  // Rendu avec key={cyclone.id} : un autre système repart de sa dernière mesure. En partant, le cyclone revient à sa dernière mesure.
  useEffect(() => () => onMove(null), [onMove]);

  const moveTo = (value: number) => {
    setT(value);
    onMove(value === tNow ? null : positionAt(track, value));
  };
  const moveRef = useRef(moveTo);
  useEffect(() => {
    moveRef.current = moveTo;
  });

  // Relecture : le cyclone part du début et va jusqu'au bout de la prévision.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / REPLAY_MS);
      moveRef.current(Math.round(t0 + (t1 - t0) * k));
      if (k < 1) frame.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, t0, t1]);

  const here = positionAt(track, t);
  const distance = here ? Math.round(km(MAYOTTE, here)) : cyclone.distanceKm;
  const forecast = t > tNow;
  const canPlay = track.length > 1 && t1 > t0;

  const toward = !motion
    ? null
    : motion.closerKm > 20
      ? `${motion.closerKm.toLocaleString("fr-FR")} km plus près de Mayotte`
      : motion.closerKm < -20
        ? `${(-motion.closerKm).toLocaleString("fr-FR")} km plus loin de Mayotte`
        : "même distance de Mayotte";

  return (
    <div className="space-y-2">
      {age >= STALE_AFTER_H ? (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[11px] leading-snug text-warning">
          <TriangleAlert size={14} aria-hidden="true" className="mt-px shrink-0" />
          <span>
            Dernière mesure publiée il y a {Math.round(age)} h : il a sûrement bougé depuis. Position du moment : Météo-France La Réunion.
          </span>
        </p>
      ) : null}
      {motion ? (
        <p className="text-xs leading-snug">
          <span className="text-fg-muted">Depuis {since.format(new Date(motion.since))} : </span>
          <span className="font-semibold">
            {motion.movedKm.toLocaleString("fr-FR")} km vers {motion.direction}
          </span>
          <span className="text-fg-muted">
            {" "}
            · {motion.speedKmh} km/h · {toward}
          </span>
        </p>
      ) : null}

      {canPlay ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              hapticPress();
              if (playing) setPlaying(false);
              else setPlaying(true);
            }}
            aria-label={playing ? "Arrêter" : "Rejouer le trajet"}
            className="grid size-10 shrink-0 place-items-center rounded-full text-white shadow"
            style={{ background: PERSONA }}
          >
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" className="translate-x-px" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
              <span className="truncate font-semibold tabular-nums">
                {when.format(new Date(t))} · {distance.toLocaleString("fr-FR")} km
              </span>
              <span className={forecast ? "shrink-0 font-semibold" : "shrink-0 text-fg-muted"} style={forecast ? { color: PERSONA } : undefined}>
                {forecast ? "prévu" : t === tNow ? "dernière mesure" : "mesuré"}
              </span>
            </div>
            <div className="relative mt-1 h-8">
              <DistanceCurve track={track} t0={t0} t1={t1} tNow={tNow} t={t} />
              <input
                type="range"
                min={t0}
                max={t1}
                step={3_600_000}
                value={t}
                onChange={(e) => {
                  setPlaying(false);
                  moveTo(Number(e.target.value));
                }}
                aria-label="Heure du trajet"
                aria-valuetext={`${when.format(new Date(t))}, ${distance} km de Mayotte, ${forecast ? "prévu" : "mesuré"}`}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Distance à Mayotte dans le temps : plus la courbe descend, plus il s'approche.
 * Trait plein jusqu'à la dernière mesure, pointillés ensuite ; un rond marque l'heure choisie.
 */
function DistanceCurve({ track, t0, t1, tNow, t }: { track: readonly CyclonePoint[]; t0: number; t1: number; tNow: number; t: number }) {
  const pts = track.map((p) => ({ t: Date.parse(p.at), d: km(MAYOTTE, p) }));
  const max = Math.max(...pts.map((p) => p.d));
  const min = Math.min(0, ...pts.map((p) => p.d));
  const W = 100;
  const Hh = 32;
  const x = (time: number) => ((time - t0) / (t1 - t0 || 1)) * W;
  const y = (d: number) => 3 + (1 - (d - min) / (max - min || 1)) * (Hh - 6);
  const done = pts.filter((p) => p.t <= tNow);
  const ahead = pts.filter((p) => p.t >= tNow);
  const path = (list: typeof pts) => list.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.d).toFixed(2)}`).join(" ");
  const here = positionAt(track, t);
  const hd = here ? km(MAYOTTE, here) : 0;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
        <line x1={x(tNow)} x2={x(tNow)} y1={0} y2={Hh} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {done.length > 1 ? <path d={path(done)} fill="none" stroke="#9aa1ab" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
        {ahead.length > 1 ? (
          <path d={path(ahead)} fill="none" stroke={PERSONA} strokeWidth={2.5} strokeDasharray="4 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : null}
        <line x1={x(t)} x2={x(t)} y1={0} y2={Hh} stroke={PERSONA} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Le rond en HTML : dans le dessin étiré, il deviendrait ovale. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white"
        style={{ left: `${x(t)}%`, top: `${(y(hd) / Hh) * 100}%`, borderColor: PERSONA }}
      />
    </>
  );
}
