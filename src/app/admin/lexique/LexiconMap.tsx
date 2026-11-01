"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { nodeRatio, type KnownEntry, type MapNode } from "@/lib/language/curriculum";
import { saveWordAction } from "./actions";

/*
 * Carte du shimaoré : la bulle du centre (Awa, un thème, un groupe…) et ses
 * sous-bulles autour, reliées par des fibres qui s'allument à mesure que c'est
 * appris. Un clic sur une bulle zoome dedans et montre ses propres sous-bulles,
 * jusqu'aux mots ; un clic sur le centre (ou Échap) remonte d'un niveau.
 * Les tailles sont en unités de conteneur (cqw) : tout suit la taille du carré.
 */

type Point = { x: number; y: number };
type Placed = { node: MapNode; x: number; y: number; parent: Point; size: number; order: number };

/** Une couronne si peu d'enfants, deux sinon (les extérieurs reliés à l'intérieur le plus proche). */
function layout(children: MapNode[]): Placed[] {
  const n = children.length;
  const ring = (items: MapNode[], radius: number, start: number, size: number, offset: number) =>
    items.map((node, i) => {
      const angle = ((start + (360 / items.length) * i) * Math.PI) / 180;
      return { node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, parent: { x: 0, y: 0 }, size, order: offset + i };
    });

  if (n <= 8) return ring(children, n <= 4 ? 270 : 320, n === 4 ? -135 : -90, n <= 4 ? 17 : 14, 0);
  const innerCount = n <= 12 ? 4 : Math.min(8, Math.round(n * 0.4));
  const crowded = n > 12;
  const inner = ring(children.slice(0, innerCount), 210, innerCount === 4 ? -135 : -90, crowded ? 13 : 15, 0);
  const outer = ring(children.slice(innerCount), 395, -90 + 180 / (n - innerCount), crowded ? 10 : 11.5, innerCount).map((p) => {
    const near = inner.reduce((best, q) => (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? q : best));
    return { ...p, parent: { x: near.x, y: near.y } };
  });
  return [...inner, ...outer];
}

function curve(a: Point, b: Point): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} Q ${mx - (b.y - a.y) * 0.16} ${my + (b.x - a.x) * 0.16} ${b.x} ${b.y}`;
}

const tint = (hue: number, alpha = 1) => `oklch(0.74 0.19 ${hue} / ${alpha})`;
const tintEnd = (hue: number) => `oklch(0.84 0.16 ${hue + 35})`;
const pct = (ratio: number) => Math.round(ratio * 100);
const at = (v: number) => `${(v + 500) / 10}%`;

function leaves(node: MapNode): MapNode[] {
  return node.children ? node.children.flatMap(leaves) : [node];
}

/** Anneau de progression épais, extrémité arrondie, dégradé de couleur. */
function Ring({ id, ratio, hue, width = 11 }: { id: string; ratio: number; hue: number; width?: number }) {
  const r = 50 - width / 2;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id={`anneau-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tint(hue)} />
          <stop offset="100%" stopColor={tintEnd(hue)} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" stroke={tint(hue, 0.16)} strokeWidth={width} />
      {ratio > 0 ? (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#anneau-${id})`}
          strokeWidth={width}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${Math.min(ratio, 0.9999)} 1`}
          className="carte-trace"
        />
      ) : null}
    </svg>
  );
}

/**
 * Donne ou corrige la traduction d'un mot. Un mot du dictionnaire est mis à
 * jour ; un mot connu seulement par une expression reçoit sa propre entrée.
 */
function AddWord({
  french,
  category,
  source,
  onDone,
}: {
  french: string;
  category: string;
  source?: KnownEntry;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [shimaore, setShimaore] = useState(source?.shimaore ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="carte-apparait"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveWordAction(
            source?.id
              ? { id: source.id, french: source.french, shimaore, category: source.category || category, isActive: true }
              : { id: null, french, shimaore, category, isActive: true },
          );
          if (!result.ok) return setError(result.message);
          router.refresh();
          onDone?.();
        });
      }}
    >
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.08] p-1.5 pl-4 ring-1 ring-white/10 focus-within:ring-white/30">
        <input
          autoFocus
          value={shimaore}
          onChange={(e) => {
            setShimaore(e.target.value);
            setError(null);
          }}
          placeholder="En shimaoré…"
          aria-label={`Traduction de ${french} en shimaoré`}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/35"
        />
        <button
          type="submit"
          disabled={pending || !shimaore.trim() || shimaore.trim() === source?.shimaore}
          className="rounded-xl bg-white px-3.5 py-1.5 text-sm font-semibold text-black transition active:scale-95 disabled:opacity-30"
        >
          {pending ? "…" : source ? "Corriger" : "Apprendre"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function WordSheet({ node, trail, onClose }: { node: MapNode; trail: string; onClose: () => void }) {
  const word = node.word!;
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium text-white/45">{trail}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <h3 className="mt-1 text-3xl font-semibold tracking-tight text-white">{word.french}</h3>
      {word.shimaore && editing ? (
        <div className="mt-5">
          <p className="mb-2.5 text-[13px] text-white/50">Corrige la traduction :</p>
          <AddWord key={`${node.id}-edit`} french={word.french} category={word.category} source={word.source} onDone={() => setEditing(false)} />
          <button type="button" onClick={() => setEditing(false)} className="mt-2 px-1 text-[13px] text-white/45 hover:text-white">
            Annuler
          </button>
        </div>
      ) : word.shimaore ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="carte-apparait group mt-5 block w-full rounded-2xl bg-white/[0.06] p-4 text-left transition hover:bg-white/[0.1] active:scale-[0.99]"
        >
          <span className="flex items-center justify-between text-[13px] text-white/45">
            En shimaoré
            <span className="font-medium text-white/60 group-hover:text-white">Modifier</span>
          </span>
          <span className="mt-1 block text-2xl font-semibold" style={{ color: tint(node.hue) }}>
            {word.shimaore}
          </span>
        </button>
      ) : (
        <div className="mt-5">
          <p className="mb-2.5 text-[13px] text-white/50">Awa ne connaît pas encore ce mot. Comment on le dit ?</p>
          <AddWord key={node.id} french={word.french} category={word.category} />
        </div>
      )}
    </div>
  );
}

export function LexiconMap({ tree }: { tree: MapNode }) {
  const [path, setPath] = useState<string[]>([]);
  const [zoom, setZoom] = useState<{ dir: "in" | "out"; origin: Point }>({ dir: "in", origin: { x: 0, y: 0 } });
  const [wordId, setWordId] = useState<string | null>(null);

  // Chemin du centre actuel (un id disparu après un rafraîchissement arrête la descente).
  const trail: MapNode[] = [tree];
  for (const id of path) {
    const next = trail[trail.length - 1].children?.find((c) => c.id === id);
    if (!next) break;
    trail.push(next);
  }
  const current = trail[trail.length - 1];
  const placed = layout(current.children ?? []);
  const word = placed.find((p) => p.node.id === wordId)?.node ?? null;
  const missing = leaves(current).filter((n) => n.word && !n.word.shimaore);
  const ratio = nodeRatio(current);

  function enter(p: Placed) {
    if (p.node.word) return setWordId(wordId === p.node.id ? null : p.node.id);
    setWordId(null);
    setZoom({ dir: "in", origin: { x: p.x, y: p.y } });
    setPath(trail.slice(1).map((n) => n.id).concat(p.node.id));
  }

  function goTo(depth: number) {
    if (depth >= trail.length - 1) return;
    setWordId(null);
    setZoom({ dir: "out", origin: { x: 0, y: 0 } });
    setPath(trail.slice(1, depth + 1).map((n) => n.id));
  }

  /** Mot manquant choisi en bas : on va dans son groupe et on ouvre sa fiche. */
  function openMissing(target: MapNode) {
    const route: string[] = [];
    const find = (node: MapNode): boolean => {
      if (node.id === target.id) return true;
      for (const child of node.children ?? []) {
        route.push(child.id);
        if (find(child)) return true;
        route.pop();
      }
      return false;
    };
    find(tree);
    setZoom({ dir: "in", origin: { x: 0, y: 0 } });
    setPath(route.slice(0, -1));
    setWordId(target.id);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (wordId) setWordId(null);
      else if (path.length) {
        setZoom({ dir: "out", origin: { x: 0, y: 0 } });
        setPath((p) => p.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [path.length, wordId]);

  return (
    <section
      aria-labelledby="carte-titre"
      className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl bg-black text-white"
      style={{ backgroundImage: `radial-gradient(60% 50% at 50% 50%, oklch(0.32 0.1 ${current.hue} / 0.35), transparent)` }}
    >
      <div className="relative z-10 p-5 sm:p-6">
        <nav aria-label="Niveau de la carte" className="flex flex-wrap items-center gap-1 text-[13px] font-medium">
          <h2 id="carte-titre" className="sr-only">
            Carte du shimaoré
          </h2>
          {trail.map((node, depth) => (
            <span key={node.id} className="flex items-center gap-1">
              {depth > 0 ? <span className="text-white/25">›</span> : null}
              {depth < trail.length - 1 ? (
                <button type="button" onClick={() => goTo(depth)} className="rounded-md px-1 text-white/50 hover:text-white">
                  {depth === 0 ? "Carte du shimaoré" : node.label}
                </button>
              ) : (
                <span className="px-1 text-white" aria-current="location">
                  {depth === 0 ? "Carte du shimaoré" : node.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        <p className="mt-1 px-1 text-4xl font-semibold tracking-tight tabular-nums">
          {current.learned}
          <span className="text-xl font-medium text-white/35"> / {current.total} mots</span>
        </p>
      </div>

      {/* Carré de la carte : le plus grand possible dans l'espace restant. */}
      <div
        className={`relative h-[min(92vw,34rem)] transition-[margin] duration-500 ease-out lg:h-auto lg:min-h-0 lg:flex-1 ${
          word ? "lg:mr-[23rem]" : ""
        }`}
        style={{ containerType: "size" }}
      >
        <div className="absolute inset-0 m-auto" style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}>
          <div
            key={current.id}
            className={`relative size-full ${zoom.dir === "in" ? "carte-zoom-entre" : "carte-zoom-sort"}`}
            style={{ containerType: "inline-size", transformOrigin: `${at(zoom.origin.x)} ${at(zoom.origin.y)}` }}
          >
            <svg viewBox="-500 -500 1000 1000" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              <defs>
                {placed.map((p) => (
                  <linearGradient
                    key={p.node.id}
                    id={`fibre-${p.node.id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={p.parent.x}
                    y1={p.parent.y}
                    x2={p.x}
                    y2={p.y}
                  >
                    <stop offset="0%" stopColor={tint(p.node.hue)} />
                    <stop offset="100%" stopColor={tintEnd(p.node.hue)} />
                  </linearGradient>
                ))}
              </defs>
              {placed.map((p) => {
                const d = curve(p.parent, p);
                const r = nodeRatio(p.node);
                const dim = word !== null && word.id !== p.node.id;
                return (
                  <g key={p.node.id} className="transition-opacity duration-500" style={{ opacity: dim ? 0.15 : 1 }}>
                    <path d={d} fill="none" stroke="rgb(255 255 255 / 0.09)" strokeWidth="1.5" />
                    {r > 0 ? (
                      <>
                        <path
                          d={d}
                          fill="none"
                          stroke={`url(#fibre-${p.node.id})`}
                          strokeWidth="3"
                          strokeLinecap="round"
                          pathLength={1}
                          strokeDasharray={`${r} 1`}
                          className="carte-trace"
                          style={{ animationDelay: `${150 + p.order * 50}ms` }}
                        />
                        <circle r="3.5" fill="white" className="carte-etincelle">
                          <animateMotion dur={`${2.6 + (p.order % 4) * 0.5}s`} repeatCount="indefinite" path={d} />
                        </circle>
                      </>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {/* Centre : clic pour remonter d'un niveau */}
            <button
              type="button"
              onClick={() => goTo(trail.length - 2)}
              disabled={trail.length === 1}
              aria-label={trail.length > 1 ? `Revenir à ${trail[trail.length - 2].label}` : `${current.label} : ${pct(ratio)} %`}
              className="carte-bulle absolute top-1/2 left-1/2 aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full transition hover:enabled:scale-[1.03]"
            >
              <span className="carte-halo absolute inset-[-18%] rounded-full" aria-hidden="true" style={{ "--halo": tint(current.hue, 0.35) } as CSSProperties} />
              <Ring id={`centre-${current.id}`} ratio={ratio} hue={current.hue} width={9} />
              <span className="absolute inset-[14%] flex flex-col items-center justify-center rounded-full bg-[oklch(0.17_0.02_300)] px-[6%] text-center">
                <span className="line-clamp-2 text-[2.1cqw] leading-tight font-medium text-white/60">{current.label}</span>
                <span className="mt-[0.4cqw] text-[5cqw] leading-none font-semibold tracking-tight tabular-nums">
                  {pct(ratio)}
                  <span className="text-[2.6cqw] text-white/40">%</span>
                </span>
              </span>
            </button>

            {placed.map((p) => {
              const isWord = Boolean(p.node.word);
              const known = Boolean(p.node.word?.shimaore);
              const isOpen = word?.id === p.node.id;
              const dim = word !== null && !isOpen;
              const r = nodeRatio(p.node);
              return (
                <div
                  key={p.node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: at(p.x), top: at(p.y), width: `${p.size}%` }}
                >
                  <div className="carte-flotte" style={{ animationDelay: `${-p.order * 0.9}s` }}>
                    <button
                      type="button"
                      onClick={() => enter(p)}
                      aria-pressed={isWord ? isOpen : undefined}
                      aria-label={
                        isWord
                          ? `${p.node.label} : ${known ? p.node.word!.shimaore : "à apprendre"}`
                          : `${p.node.label} : ${pct(r)} %, ouvrir`
                      }
                      className="carte-bulle relative block aspect-square w-full rounded-full transition duration-500 ease-out hover:scale-105 active:scale-95"
                      style={{
                        animationDelay: `${120 + p.order * 45}ms`,
                        opacity: dim ? 0.3 : 1,
                        scale: isOpen ? "1.12" : undefined,
                        filter: isOpen || (isWord && known) ? `drop-shadow(0 0 14px ${tint(p.node.hue, 0.45)})` : undefined,
                      }}
                    >
                      <Ring id={p.node.id} ratio={r} hue={p.node.hue} width={isWord ? 8 : 11} />
                      <span
                        className={`absolute grid place-items-center rounded-full bg-[oklch(0.16_0.01_300)] px-[10%] text-center leading-tight font-semibold tracking-tight ${
                          isWord ? "inset-[12%]" : "inset-[17%] tabular-nums"
                        } ${isWord && !known ? "text-white/55" : ""}`}
                        style={{ fontSize: `${p.size * (isWord ? 0.16 : 0.22)}cqw` }}
                      >
                        {isWord ? (
                          <span className="line-clamp-3 break-words">{p.node.label}</span>
                        ) : (
                          <span>
                            {pct(r)}
                            <span className="text-white/40" style={{ fontSize: "0.6em" }}>
                              %
                            </span>
                          </span>
                        )}
                      </span>
                    </button>
                    <p
                      className="pointer-events-none absolute top-full left-1/2 mt-[0.8cqw] max-w-[16cqw] -translate-x-1/2 truncate text-center font-medium transition-opacity duration-500"
                      style={{
                        fontSize: "clamp(10px, 1.8cqw, 14px)",
                        opacity: dim ? 0.3 : 0.85,
                        color: isWord ? (known ? tint(p.node.hue) : "rgb(255 255 255 / 0.45)") : undefined,
                      }}
                    >
                      {isWord ? (known ? p.node.word!.shimaore : "à apprendre") : p.node.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {missing.length && !word ? (
        <div className="relative z-10 flex items-center gap-2 overflow-x-auto px-5 pb-5 [scrollbar-width:none] sm:px-6 sm:pb-6">
          <span className="shrink-0 text-[13px] text-white/45">À apprendre ici · {missing.length}</span>
          {missing.slice(0, 8).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openMissing(n)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-sm transition hover:bg-white/[0.14] active:scale-95"
            >
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: tint(n.hue) }} />
              {n.label}
            </button>
          ))}
        </div>
      ) : null}

      {word ? (
        <div
          key={word.id}
          className="carte-feuille absolute inset-x-3 bottom-3 z-20 max-h-[78%] overflow-y-auto rounded-[28px] bg-white/[0.07] p-5 ring-1 ring-white/10 backdrop-blur-2xl lg:inset-x-auto lg:top-3 lg:right-3 lg:bottom-auto lg:w-[22rem]"
        >
          <WordSheet node={word} trail={trail.slice(1).map((n) => n.label).join(" › ")} onClose={() => setWordId(null)} />
        </div>
      ) : null}
    </section>
  );
}
