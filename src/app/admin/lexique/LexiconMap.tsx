"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { nodeRatio, type BranchDef, type KnownEntry, type MapNode } from "@/lib/language/curriculum";
import { deleteBranchAction, saveWordAction } from "./actions";
import { BranchCreator } from "./BranchCreator";

/** Bulle « + » de la carte : demande à Tamilya une nouvelle branche. */
const PLUS_ID = "__nouvelle-branche";
const PLUS_NODE: MapNode = { id: PLUS_ID, label: "Nouvelle branche", hue: 0, learned: 0, total: 0 };

/*
 * Carte du shimaoré : la bulle du centre (Tamilya, un thème, un groupe…) et ses
 * sous-bulles autour, reliées par des fibres qui s'allument à mesure que c'est
 * appris. Un clic sur une bulle zoome dedans et montre ses propres sous-bulles,
 * jusqu'aux mots ; un clic sur le centre (ou Échap) remonte d'un niveau.
 * Les tailles sont en unités de conteneur (cqw) : tout suit la taille du carré.
 */

type Point = { x: number; y: number };
type View = { s: number; x: number; y: number };
const HOME: View = { s: 1, x: 0, y: 0 };
/** Zoom maximal, et zoom à partir duquel la bulle visée s'ouvre. */
const MAX_ZOOM = 3.2;
const OPEN_AT = 2.6;
type Placed = { node: MapNode; x: number; y: number; parent: Point; size: number; order: number };

/** Rayon de la bulle du centre (22 % du carré), en unités de la carte (-500 à 500). */
const CENTER_RADIUS = 110;
/** Le contenu doit tenir dans ce rayon (bulles et noms compris). */
const FIT_RADIUS = 485;

/**
 * Bulles en couronnes autour du centre, sans jamais se chevaucher : chaque
 * couronne reçoit autant de bulles que sa circonférence en laisse passer
 * avec un bel espace (nom compris), les suivantes vont sur une couronne plus
 * large, décalée d'un demi-pas. Le tout est ensuite réduit pour tenir dans le
 * carré. Une bulle extérieure est reliée à la plus proche de la couronne d'avant.
 */
function layout(children: MapNode[]): Placed[] {
  const n = children.length;
  if (!n) return [];
  // Taille d'une bulle (en % du carré) : plus il y en a, plus elles sont petites.
  const size = n <= 4 ? 17 : n <= 6 ? 15 : n <= 8 ? 13.5 : n <= 12 ? 12 : n <= 18 ? 11 : 9.5;
  const diameter = size * 10;
  // Distance entre deux centres sur une couronne : la bulle, son nom et de l'air.
  const step = diameter * 1.9;
  const gap = diameter * 2.05;

  // Couronnes nécessaires, chacune avec sa capacité…
  const rings: { radius: number; room: number; count: number }[] = [];
  let radius = CENTER_RADIUS + diameter / 2 + (n <= 8 ? 150 : 90);
  for (let total = 0; total < n; radius += gap) {
    const room = Math.max(3, Math.floor((2 * Math.PI * radius) / step));
    rings.push({ radius, room, count: 0 });
    total += room;
  }
  // …puis les bulles réparties selon la place de chacune (pas une couronne pleine et l'autre presque vide).
  const capacity = rings.reduce((sum, r) => sum + r.room, 0);
  let left = n;
  rings.forEach((r, i) => {
    r.count = i === rings.length - 1 ? left : Math.min(r.room, Math.max(1, Math.round((n * r.room) / capacity)));
    left -= r.count;
  });

  const placed: Placed[] = [];
  let index = 0;
  rings.forEach((ring, r) => {
    const start = -90 + (r % 2 ? 180 / ring.count : 0) + (ring.count === 4 ? -45 : 0);
    const previous = placed.slice();
    for (let i = 0; i < ring.count; i++, index++) {
      const angle = ((start + (360 / ring.count) * i) * Math.PI) / 180;
      const x = Math.cos(angle) * ring.radius;
      const y = Math.sin(angle) * ring.radius;
      const near = r === 0 ? { x: 0, y: 0 } : previous.reduce((best, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(best.x - x, best.y - y) ? q : best));
      placed.push({ node: children[index], x, y, parent: { x: near.x, y: near.y }, size, order: index });
    }
  });

  // Réduit l'ensemble pour qu'il tienne dans le carré, nom sous la bulle compris.
  const extent = rings[rings.length - 1].radius + diameter / 2 + 45;
  const k = Math.min(1, FIT_RADIUS / extent);
  return k === 1
    ? placed
    : placed.map((p) => ({ ...p, x: p.x * k, y: p.y * k, size: p.size * k, parent: { x: p.parent.x * k, y: p.parent.y * k } }));
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
          <p className="mb-2.5 text-[13px] text-white/50">Tamilya ne connaît pas encore ce mot. Comment on le dit ?</p>
          <AddWord key={node.id} french={word.french} category={word.category} />
        </div>
      )}
    </div>
  );
}

export function LexiconMap({ tree, branches = [] }: { tree: MapNode; branches?: readonly BranchDef[] | null }) {
  const router = useRouter();
  const [path, setPath] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  // Branche tout juste créée : elle pousse sur la carte (fibre qui se dessine, bulle qui éclot).
  const [sprout, setSprout] = useState<string | null>(null);
  useEffect(() => {
    if (!sprout) return;
    const timer = window.setTimeout(() => setSprout(null), 3200);
    return () => window.clearTimeout(timer);
  }, [sprout]);
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
  // À la racine, le « + » prend place dans la couronne, après les thèmes (seulement si la table existe).
  const atRoot = trail.length === 1;
  const placed = layout([...(current.children ?? []), ...(atRoot && branches ? [PLUS_NODE] : [])]);
  const branchHere = branches?.find((b) => `branche-${b.id}` === current.id) ?? null;
  const sheetOpen = creating;
  const word = placed.find((p) => p.node.id === wordId)?.node ?? null;
  const missing = leaves(current).filter((n) => n.word && !n.word.shimaore);
  const ratio = nodeRatio(current);

  function enter(p: Placed) {
    if (p.node.id === PLUS_ID) {
      setWordId(null);
      return setCreating(true);
    }
    setCreating(false);
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

  /*
   * Zoom à la molette, au pavé tactile ou à deux doigts, centré sur le
   * pointeur ; on déplace la carte en la faisant glisser. Zoomer fort sur une
   * bulle l'ouvre (comme un clic) ; dézoomer encore, déjà au plus large,
   * remonte d'un niveau.
   */
  const square = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(HOME);
  const viewRef = useRef<View>(HOME);
  const [viewFor, setViewFor] = useState(current.id);
  if (viewFor !== current.id) {
    setViewFor(current.id);
    setView(HOME);
  }
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ dist: number; mid: Point; view: View; start: Point } | null>(null);
  const dragged = useRef(false);
  const outward = useRef(0);

  const width = () => square.current?.clientWidth ?? 1;
  const clampView = (v: View): View => {
    const w = width();
    const scale = Math.min(MAX_ZOOM, Math.max(1, v.s));
    return { s: scale, x: Math.min(0, Math.max(w - w * scale, v.x)), y: Math.min(0, Math.max(w - w * scale, v.y)) };
  };

  /** Bulle (non mot) sous le centre de la vue quand on a beaucoup zoomé : elle s'ouvre. */
  function openUnderZoom(v: View): boolean {
    if (v.s < OPEN_AT) return false;
    const w = width();
    const cx = (w / 2 - v.x) / v.s;
    const cy = (w / 2 - v.y) / v.s;
    const hit = placed.find((q) => {
      if (q.node.word || q.node.id === PLUS_ID) return false;
      const r = ((q.size / 100) * w) / 2;
      return Math.hypot(((q.x + 500) / 1000) * w - cx, ((q.y + 500) / 1000) * w - cy) < r * 2.2;
    });
    if (!hit) return false;
    applyView(HOME);
    enter(hit);
    return true;
  }

  function applyView(v: View) {
    viewRef.current = v;
    setView(v);
  }

  function zoomAt(px: number, py: number, factor: number, base = viewRef.current) {
    const scale = Math.min(MAX_ZOOM, Math.max(1, base.s * factor));
    const k = scale / base.s;
    const next = clampView({ s: scale, x: px - (px - base.x) * k, y: py - (py - base.y) * k });
    if (!openUnderZoom(next)) applyView(next);
  }

  // Molette (et pinch du pavé tactile, qui arrive en molette) : écouteur non passif pour ne pas faire défiler la page.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      e.preventDefault();
      const rect = square.current!.getBoundingClientRect();
      if (e.deltaY > 0 && viewRef.current.s <= 1 && trail.length > 1) {
        outward.current += e.deltaY;
        if (outward.current > 260) {
          outward.current = 0;
          goTo(trail.length - 2);
        }
        return;
      }
      outward.current = 0;
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
  });
  useEffect(() => {
    const el = square.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = square.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  function startGesture() {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    gesture.current = { dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, mid, view: viewRef.current, start: mid };
  }
  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, local(e));
    dragged.current = false;
    startGesture();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length > 1) {
      // Deux doigts : zoom autour du milieu, et déplacement du milieu.
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      dragged.current = true;
      const moved = { ...g.view, x: g.view.x + mid.x - g.mid.x, y: g.view.y + mid.y - g.mid.y };
      zoomAt(mid.x, mid.y, g.dist ? dist / g.dist : 1, moved);
      return;
    }
    const dx = pts[0].x - g.start.x;
    const dy = pts[0].y - g.start.y;
    if (Math.hypot(dx, dy) > 6) dragged.current = true;
    if (dragged.current && g.view.s > 1) applyView(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }));
  }
  function onPointerEnd(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size) startGesture();
    else gesture.current = null;
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
      if (creating) setCreating(false);
      else if (wordId) setWordId(null);
      else if (path.length) {
        setZoom({ dir: "out", origin: { x: 0, y: 0 } });
        setPath((p) => p.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [path.length, wordId, creating]);

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
        {branchHere ? (
          <div className="carte-apparait mt-2 max-w-md px-1">
            {branchHere.reason ? <p className="text-[13px] leading-relaxed text-white/55">« {branchHere.reason} » — Tamilya</p> : null}
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Retirer la branche « ${branchHere.label} » ? Les traductions déjà données restent dans le dictionnaire.`)) return;
                const result = await deleteBranchAction(branchHere.id);
                if (result.ok) {
                  goTo(0);
                  router.refresh();
                }
              }}
              className="mt-1.5 text-[12px] font-medium text-white/35 hover:text-red-300"
            >
              Retirer cette branche
            </button>
          </div>
        ) : null}
      </div>

      {/* Carré de la carte : le plus grand possible dans l'espace restant. */}
      <div
        className={`relative h-[min(92vw,34rem)] transition-[margin] duration-500 ease-out lg:h-auto lg:min-h-0 lg:flex-1 ${
          word || sheetOpen ? "lg:mr-[23rem]" : ""
        }`}
        style={{ containerType: "size" }}
      >
        <div
          ref={square}
          className={`absolute inset-0 m-auto touch-none select-none ${view.s > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
          style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          onClickCapture={(e) => {
            // Un glissement n'est pas un clic sur une bulle.
            if (dragged.current) {
              e.preventDefault();
              e.stopPropagation();
              dragged.current = false;
            }
          }}
        >
          <div className="size-full origin-top-left will-change-transform" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
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
                const dim = (word !== null && word.id !== p.node.id) || (creating && p.node.id !== PLUS_ID);
                if (p.node.id === PLUS_ID) {
                  return (
                    <path
                      key={p.node.id}
                      d={d}
                      fill="none"
                      stroke="rgb(255 255 255 / 0.28)"
                      strokeWidth="1.5"
                      strokeDasharray="4 9"
                      strokeLinecap="round"
                      className="branche-fibre-plus"
                    />
                  );
                }
                const growing = p.node.id === sprout;
                return (
                  <g key={p.node.id} className="transition-opacity duration-500" style={{ opacity: dim ? 0.15 : 1 }}>
                    <path
                      d={d}
                      fill="none"
                      stroke={growing ? tint(p.node.hue, 0.9) : "rgb(255 255 255 / 0.09)"}
                      strokeWidth={growing ? 3 : 1.5}
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray={growing ? "1 1" : undefined}
                      className={growing ? "branche-fibre-pousse" : undefined}
                    />
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
              if (p.node.id === PLUS_ID) {
                return (
                  <div
                    key={p.node.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: at(p.x), top: at(p.y), width: `${p.size}%` }}
                  >
                    <button
                      type="button"
                      onClick={() => enter(p)}
                      aria-label="Nouvelle branche : demander à Tamilya les mots qu'elle aimerait apprendre"
                      aria-pressed={creating}
                      className={`branche-plus carte-bulle relative grid aspect-square w-full place-items-center rounded-full transition duration-500 hover:scale-105 active:scale-95 ${creating ? "is-open" : ""}`}
                      style={{ animationDelay: `${120 + p.order * 45}ms` }}
                    >
                      <span aria-hidden="true" className="branche-plus-anneau absolute inset-0 rounded-full" />
                      <svg viewBox="0 0 24 24" className="relative w-[38%]" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </button>
                    <p
                      className="pointer-events-none absolute top-full left-1/2 mt-[0.8cqw] -translate-x-1/2 text-center font-medium whitespace-nowrap text-white/55"
                      style={{ fontSize: "clamp(10px, 1.8cqw, 14px)" }}
                    >
                      Nouvelle branche
                    </p>
                  </div>
                );
              }
              const isWord = Boolean(p.node.word);
              const known = Boolean(p.node.word?.shimaore);
              const isOpen = word?.id === p.node.id;
              const dim = (word !== null && !isOpen) || creating;
              const r = nodeRatio(p.node);
              return (
                <div
                  key={p.node.id}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${p.node.id === sprout ? "branche-eclot" : ""}`}
                  style={{ left: at(p.x), top: at(p.y), width: `${p.size}%`, "--halo": tint(p.node.hue, 0.6) } as CSSProperties}
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
                          <span className="flex flex-col items-center">
                            {p.node.emoji ? (
                              <span aria-hidden="true" className="leading-none" style={{ fontSize: "0.9em" }}>
                                {p.node.emoji}
                              </span>
                            ) : null}
                            <span>
                            {pct(r)}
                            <span className="text-white/40" style={{ fontSize: "0.6em" }}>
                              %
                            </span>
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
        {view.s > 1 ? (
          <button
            type="button"
            onClick={() => applyView(HOME)}
            className="carte-apparait absolute right-4 bottom-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/80 backdrop-blur hover:bg-white/20"
          >
            Recentrer · {Math.round(view.s * 100)} %
          </button>
        ) : null}
      </div>

      {missing.length && !word && !creating ? (
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

      {creating ? (
        <div className="carte-feuille absolute inset-x-3 bottom-3 z-20 max-h-[85%] overflow-y-auto rounded-[28px] bg-white/[0.07] p-5 ring-1 ring-white/10 backdrop-blur-2xl [scrollbar-width:none] lg:inset-x-auto lg:top-3 lg:right-3 lg:bottom-auto lg:w-[22rem]">
          <BranchCreator
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              setSprout(`branche-${id}`);
              router.refresh();
            }}
          />
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
