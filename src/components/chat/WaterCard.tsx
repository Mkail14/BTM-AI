"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconDrop } from "@/components/ui/icons";
import type { WaterMapData, WaterSpot } from "@/lib/water/map";
import { waterKey } from "@/lib/water/schedule";

// Carte (MapLibre) : chargée seulement quand le panneau s'ouvre.
const WaterMap = dynamic(() => import("./WaterMap").then((m) => m.WaterMap), { ssr: false });

const PERSONA = "var(--persona,var(--accent))";
const COLORS = { eau: "#2563eb", coupee: "#dc2626", inconnu: "#6b7280" } as const;
const LABELS = { eau: "De l'eau", coupee: "Pas d'eau", inconnu: "Pas d'info officielle" } as const;
const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

type State = { status: "loading" } | { status: "ok"; data: WaterMapData } | { status: "error"; message: string };

/** Pastille de la légende ; les zones sans information sont hachurées en tirets, comme sur la carte. */
function Swatch({ state }: { state: keyof typeof COLORS }) {
  const style =
    state === "inconnu"
      ? { backgroundImage: `repeating-linear-gradient(135deg, ${COLORS.inconnu} 0 2px, transparent 2px 5px)`, border: `1.5px dashed ${COLORS.inconnu}` }
      : { background: `${COLORS[state]}88`, border: `1.5px solid ${COLORS[state]}` };
  return <span aria-hidden="true" className="inline-block size-3.5 shrink-0 rounded-[4px]" style={style} />;
}

function periodOf(data: WaterMapData) {
  return data.period
    ? `Planning SMAE du ${day.format(new Date(`${data.period.from}T00:00:00Z`))} au ${day.format(new Date(`${data.period.to}T00:00:00Z`))} · à ${clock.format(new Date(data.at))}`
    : "Pas de planning officiel de la SMAE pour aujourd'hui";
}

function SpotLine({ spot }: { spot: WaterSpot }) {
  return (
    <div className="flex items-start gap-2.5">
      <Swatch state={spot.state} />
      <p className="min-w-0 text-sm">
        <span className="font-medium">{spot.name}</span>
        {spot.sector ? <span className="text-fg-muted"> · secteur {spot.sector}</span> : null}
        <span className="block text-fg-muted">{spot.detail}</span>
      </p>
    </div>
  );
}

/** Panneau de la carte : glisse depuis la droite (plein écran sur téléphone), comme le suivi du livreur. */
function WaterSheet({ data, start, onClose }: { data: WaterMapData; start: number | null; onClose: () => void }) {
  const [picked, setPicked] = useState<number | null>(start);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // Sans animation (réglage « réduire les animations »), rien ne signalerait la fin de la sortie : fermeture immédiate.
  const close = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? onClose() : setClosing(true));
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  const counts = useMemo(() => {
    const c = { eau: 0, coupee: 0, inconnu: 0 };
    for (const s of data.spots) c[s.state]++;
    return c;
  }, [data]);
  const spot = picked !== null ? data.spots[picked] : null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-closing={closing || undefined}>
      <div aria-hidden="true" onClick={close} className="order-backdrop absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Carte de l'eau à Mayotte"
        tabIndex={-1}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}
        className="order-sheet absolute inset-0 flex flex-col overflow-hidden bg-bg shadow-2xl outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[480px] sm:rounded-3xl sm:border sm:border-border"
      >
        {/* Mayotte entière : prend toute la place libre */}
        <div className="relative min-h-[12rem] flex-1 bg-bg-muted">
          <WaterMap spots={data.spots} picked={picked} onPick={setPicked} />
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={close}
              aria-label="Fermer la carte"
              className="grid size-11 place-items-center rounded-full bg-bg/90 shadow-lg backdrop-blur hover:bg-bg"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        {/* Fiche du bas : tout l'essentiel, sans défilement */}
        <div className="relative -mt-5 shrink-0 space-y-3 rounded-t-3xl bg-bg px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.35)]">
          <div className="order-rise">
            <p className="text-lg leading-tight font-semibold">L&apos;eau à Mayotte en ce moment</p>
            <p className="mt-0.5 text-xs text-fg-muted">{periodOf(data)}</p>
          </div>
          <div className="order-rise min-h-[2.75rem] [animation-delay:40ms]">
            {spot ? <SpotLine spot={spot} /> : <p className="text-sm text-fg-muted">Touche un village pour voir ce que dit le planning.</p>}
          </div>
          <div className="order-rise flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted [animation-delay:80ms]">
            {(["eau", "coupee", "inconnu"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <Swatch state={s} />
                {LABELS[s]} ({counts[s]})
              </span>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-fg-muted">
            Données : planning officiel de la SMAE (Mahoraise des Eaux), lu automatiquement sur son site. Limites des villages approchées : la SMAE ne
            publie pas le tracé de ses secteurs, et l&apos;eau peut arriver plus tard selon le quartier. Fuite : 02 69 61 11 42.
          </p>
          {data.unplaced.length ? <p className="text-xs text-danger">Admin : pas encore placés sur la carte : {data.unplaced.join(", ")}.</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Carte de l'eau dans la conversation (bloc ```carte-eau```) ; `place` : lieu demandé, montré d'abord. */
export function WaterCard({ place }: { place: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/eau", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as (WaterMapData & { error?: string }) | null;
        if (!r.ok || !body?.spots) throw new Error(body?.error ?? "Carte de l'eau indisponible pour le moment.");
        if (alive) setState({ status: "ok", data: body });
      })
      .catch((error: unknown) => alive && setState({ status: "error", message: error instanceof Error ? error.message : "Carte de l'eau indisponible." }));
    return () => {
      alive = false;
    };
  }, []);

  const data = state.status === "ok" ? state.data : null;
  // Lieu demandé (« y a de l'eau à Koungou ? ») : montré dans la carte de la conversation et choisi à l'ouverture.
  const asked = useMemo(() => {
    const key = waterKey(place);
    if (!data || key.length < 3) return null;
    const found = data.spots.findIndex((s) => waterKey(s.name).startsWith(key));
    const loose = found >= 0 ? found : data.spots.findIndex((s) => waterKey(s.name).includes(key));
    return loose >= 0 ? loose : null;
  }, [data, place]);
  const spot = data && asked !== null ? data.spots[asked] : null;

  return (
    <div className="booking-step carte-cadre w-full overflow-hidden">
      {/* Même rangée que les cartes Emploi et Cyclones : pastille, texte, petit bouton à droite. */}
      <div className="flex items-center gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
          <IconDrop width={24} height={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">L&apos;eau à Mayotte en ce moment</span>
          <span className="block text-xs text-fg-muted">
            {state.status === "loading" ? "Je regarde le planning de la SMAE…" : state.status === "error" ? state.message : periodOf(state.data)}
          </span>
        </span>
        {data ? (
          // Même petit bouton « Voir » que les cartes Emploi et Cyclones.
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: PERSONA }} aria-haspopup="dialog">
            Voir
          </button>
        ) : null}
      </div>
      {spot ? (
        <div className="px-4 pb-4">
          <SpotLine spot={spot} />
        </div>
      ) : null}
      {open && data ? <WaterSheet data={data} start={asked} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
