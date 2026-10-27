"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type SVGProps,
} from "react";
import {
  IconBook,
  IconChip,
  IconDatabase,
  IconDocument,
  IconLanguage,
  IconMessage,
  IconPlus,
  IconSend,
  IconSettings,
  IconShield,
  IconSparkle,
  IconTrash,
} from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteApiAction } from "./actions";
import { AddApiDialog } from "./AddApiDialog";
import { ApiPanel } from "./ApiPanel";
import { STATUS_STYLES, type FlowEdge, type FlowIcon, type FlowNode } from "./flow";

const ICONS: Record<FlowIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  message: IconMessage,
  shield: IconShield,
  sparkle: IconSparkle,
  settings: IconSettings,
  book: IconBook,
  language: IconLanguage,
  memory: IconDatabase,
  prompt: IconDocument,
  chip: IconChip,
  reply: IconSend,
};

const COLUMNS = 6;
const CLICK_TOLERANCE_PX = 4;

type Path = { key: string; d: string; edge: FlowEdge; start: [number, number]; end: [number, number] };

/** Courbe de Bézier horizontale entre le bord droit de la source et le bord gauche de la cible. */
function computePaths(container: HTMLElement, nodes: Map<string, HTMLElement>, edges: FlowEdge[]): Path[] {
  const box = container.getBoundingClientRect();
  return edges.flatMap((edge) => {
    const a = nodes.get(edge.from)?.getBoundingClientRect();
    const b = nodes.get(edge.to)?.getBoundingClientRect();
    if (!a || !b) return [];
    const x1 = a.right - box.left;
    const y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left;
    const y2 = b.top + b.height / 2 - box.top;
    const dx = Math.max(30, (x2 - x1) / 2);
    return [
      {
        key: `${edge.from}->${edge.to}`,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        edge,
        start: [x1, y1],
        end: [x2, y2],
      },
    ];
  });
}

type Offset = { x: number; y: number };

function NodeCard({
  node,
  offset,
  dragging,
  selected,
  onDragStart,
  onOpen,
  register,
}: {
  node: FlowNode;
  offset: Offset | undefined;
  dragging: boolean;
  selected: boolean;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpen: () => void;
  register: (el: HTMLElement | null) => void;
}) {
  const Icon = ICONS[node.icon];
  const style = STATUS_STYLES[node.status];
  const isModel = node.slot !== undefined;
  return (
    <div
      ref={register}
      title={node.reason ?? (node.href ? "Cliquer pour régler" : undefined)}
      onPointerDown={onDragStart}
      {...((node.href || node.api) && {
        role: node.href ? "link" : "button",
        tabIndex: 0,
        onKeyDown: (event) => {
          if (event.key === "Enter") onOpen();
        },
      })}
      style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      className={`relative w-full touch-none rounded-xl border-2 bg-bg p-2.5 select-none ${style.border} ${
        node.status === "off" ? "opacity-70" : ""
      } ${dragging ? "z-20 cursor-grabbing shadow-lg" : "cursor-grab shadow-sm"} ${
        selected ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-subtle" : ""
      }`}
    >
      {node.inService ? (
        <span className="absolute -top-2.5 right-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg">
          En service
        </span>
      ) : null}
      <div className="flex items-center gap-2.5">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${isModel ? "bg-accent-soft text-accent" : "bg-bg-muted text-fg"}`}
        >
          <Icon width={17} height={17} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{node.title}</p>
          {node.subtitle ? (
            <p className="truncate text-xs text-fg-muted" title={node.subtitle}>
              {node.subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${style.pill}`}>
        <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
        {node.statusLabel}
      </span>
    </div>
  );
}

export function AIFlow({ nodes, edges, canAddApi }: { nodes: FlowNode[]; edges: FlowEdge[]; canAddApi: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Path[]>([]);
  // Déplacements des blocs : gardés en mémoire seulement, la page rechargée
  // revient à la disposition d'origine.
  const [offsets, setOffsets] = useState<Record<string, Offset>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [openApiId, setOpenApiId] = useState<string | null>(null);
  const openApi = nodes.find((n) => n.id === openApiId && n.api);
  const closeApi = useCallback(() => setOpenApiId(null), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((n) => n.id === selectedId && n.api);
  const [adding, setAdding] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  const [toolbarStatus, setToolbarStatus] = useState<ActionResult | null>(null);
  const [removing, startTransition] = useTransition();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setPaths(computePaths(container, nodeRefs.current, edges));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [edges, nodes, offsets]);

  /** Clic sur un bloc : page de réglage, ou sélection et fiche de l'API. */
  function open(node: FlowNode) {
    if (node.href) {
      router.push(node.href);
    } else if (node.api) {
      setSelectedId(node.id);
      setOpenApiId(node.id);
    } else {
      setSelectedId(null);
    }
  }

  function removeSelected() {
    if (!selected?.apiId || !window.confirm(`Supprimer l'API « ${selected.title} » de la chaîne ?`)) return;
    const apiId = selected.apiId;
    startTransition(async () => {
      const result = await deleteApiAction(apiId);
      setToolbarStatus(result);
      if (result.ok) {
        setSelectedId(null);
        setOpenApiId(null);
        router.refresh();
      }
    });
  }

  function startDrag(node: FlowNode, event: ReactPointerEvent<HTMLDivElement>) {
    const id = node.id;
    if (event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const origin = { x: event.clientX, y: event.clientY };
    const base = offsets[id] ?? { x: 0, y: 0 };
    let moved = false;
    setDraggingId(id);

    const move = (e: PointerEvent) => {
      // Quelques pixels de tolérance : en dessous, c'est un clic, pas un déplacement.
      if (!moved && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < CLICK_TOLERANCE_PX) return;
      moved = true;
      setOffsets((o) => ({ ...o, [id]: { x: base.x + e.clientX - origin.x, y: base.y + e.clientY - origin.y } }));
    };
    const end = (e: PointerEvent) => {
      setDraggingId(null);
      if (!moved && e.type === "pointerup") open(node);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }

  return (
    <section aria-label="Schéma du modèle d'IA" className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border">
      {/* Barre d'outils, en bas à droite du canevas */}
      <div
        role="toolbar"
        aria-label="Outils du schéma"
        className="absolute right-3 bottom-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-xl border border-border bg-bg/95 p-1 shadow-lg backdrop-blur"
      >
        {toolbarStatus && !toolbarStatus.ok ? (
          <span role="alert" className="max-w-64 truncate px-2 text-xs text-danger" title={toolbarStatus.message}>
            {toolbarStatus.message}
          </span>
        ) : null}
        {selected ? (
          <>
            <span className="max-w-48 truncate px-2 text-xs text-fg-muted">
              Sélection : <span className="font-medium text-fg">{selected.title}</span>
            </span>
            <button
              type="button"
              onClick={removeSelected}
              disabled={!selected.deletable || removing}
              title={selected.deletable ? undefined : "Déclarée dans les variables du serveur : retirez-la de .env.local"}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              <IconTrash width={14} height={14} />
              {removing ? "Suppression…" : "Supprimer"}
            </button>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setToolbarStatus(null);
            setAdding(true);
          }}
          disabled={!canAddApi}
          title={canAddApi ? undefined : "Nécessite SUPABASE_SECRET_KEY sur le serveur"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          <IconPlus width={14} height={14} />
          Ajouter une API
        </button>
      </div>

      <div className="flow-canvas size-full overflow-auto">
        <div ref={containerRef} className="relative flex min-h-full min-w-[1100px] items-center p-10">
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {paths.map(({ key, d, edge, start, end }) => {
              const stroke = edge.live ? "var(--accent)" : "var(--fg-muted)";
              return (
                <g key={key} opacity={edge.muted ? 0.35 : edge.live ? 1 : 0.55}>
                  <path
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={edge.live ? 2 : 1.5}
                    strokeDasharray={edge.muted ? "4 5" : undefined}
                    className={edge.live && !edge.muted ? "flow-live" : undefined}
                  />
                  <circle cx={start[0]} cy={start[1]} r={4} fill="var(--bg)" stroke={stroke} strokeWidth={1.5} />
                  <circle cx={end[0]} cy={end[1]} r={4} fill="var(--bg)" stroke={stroke} strokeWidth={1.5} />
                </g>
              );
            })}
          </svg>

          <div className="relative grid w-full grid-cols-6 gap-14">
            {Array.from({ length: COLUMNS }, (_, column) => (
              <div key={column} className="flex flex-col justify-center gap-4">
                {nodes
                  .filter((n) => n.column === column)
                  .map((node) => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      offset={offsets[node.id]}
                      dragging={draggingId === node.id}
                      selected={selectedId === node.id}
                      onDragStart={(event) => startDrag(node, event)}
                      onOpen={() => open(node)}
                      register={(el) => {
                        if (el) nodeRefs.current.set(node.id, el);
                        else nodeRefs.current.delete(node.id);
                      }}
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {openApi ? <ApiPanel node={openApi} onClose={closeApi} /> : null}
      {adding ? <AddApiDialog onClose={closeAdd} /> : null}
    </section>
  );
}
