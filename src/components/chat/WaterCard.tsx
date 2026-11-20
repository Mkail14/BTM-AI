"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { IconDrop } from "@/components/ui/icons";
import type { WaterMapData } from "@/lib/water/map";
import { waterKey } from "@/lib/water/schedule";

// Carte (MapLibre) : chargée seulement quand la carte de l'eau s'affiche.
const WaterMap = dynamic(() => import("./WaterMap").then((m) => m.WaterMap), { ssr: false });

const PERSONA = "var(--persona,var(--accent))";
const COLORS = { eau: "#2563eb", coupee: "#dc2626", inconnu: "#6b7280" } as const;
const LABELS = { eau: "De l'eau", coupee: "Pas d'eau", inconnu: "Pas d'info officielle" } as const;
const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

type State = { status: "loading" } | { status: "ok"; data: WaterMapData } | { status: "error"; message: string };

/** Pastille de la légende ; les lieux sans information sont hachurés en tirets, comme sur la carte. */
function Swatch({ state }: { state: keyof typeof COLORS }) {
  const style =
    state === "inconnu"
      ? { backgroundImage: `repeating-linear-gradient(135deg, ${COLORS.inconnu} 0 2px, transparent 2px 5px)`, border: `1.5px dashed ${COLORS.inconnu}` }
      : { background: `${COLORS[state]}88`, border: `1.5px solid ${COLORS[state]}` };
  return <span aria-hidden="true" className="inline-block size-3.5 shrink-0 rounded-full" style={style} />;
}

/** Carte de l'eau dans la conversation (bloc ```carte-eau```) ; `place` : lieu à montrer d'abord. */
export function WaterCard({ place }: { place: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/eau", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as (WaterMapData & { error?: string }) | null;
        if (!r.ok || !body?.spots) throw new Error(body?.error ?? "Carte de l'eau indisponible pour le moment.");
        if (!alive) return;
        setState({ status: "ok", data: body });
        // Lieu demandé (« y a de l'eau à Koungou ? ») : montré tout de suite.
        const key = waterKey(place);
        if (key.length >= 3) {
          const found = body.spots.findIndex((s) => waterKey(s.name).startsWith(key));
          const loose = found >= 0 ? found : body.spots.findIndex((s) => waterKey(s.name).includes(key));
          if (loose >= 0) setPicked(loose);
        }
      })
      .catch((error: unknown) => alive && setState({ status: "error", message: error instanceof Error ? error.message : "Carte de l'eau indisponible." }));
    return () => {
      alive = false;
    };
  }, [place]);

  const data = state.status === "ok" ? state.data : null;
  const counts = useMemo(() => {
    const c = { eau: 0, coupee: 0, inconnu: 0 };
    for (const s of data?.spots ?? []) c[s.state]++;
    return c;
  }, [data]);
  const spot = data && picked !== null ? data.spots[picked] : null;

  return (
    <div className="booking-step w-full overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
          <IconDrop width={24} height={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">L&apos;eau à Mayotte en ce moment</span>
          <span className="block text-xs text-fg-muted">
            {state.status === "loading"
              ? "Je regarde le planning de la SMAE…"
              : state.status === "error"
                ? state.message
                : data?.period
                  ? `Planning SMAE du ${day.format(new Date(`${data.period.from}T00:00:00Z`))} au ${day.format(new Date(`${data.period.to}T00:00:00Z`))} · à ${clock.format(new Date(data.at))}`
                  : "Pas de planning officiel de la SMAE pour aujourd'hui"}
          </span>
        </span>
      </div>
      {data ? (
        <>
          <div className="relative h-80 border-y border-border bg-bg-muted">
            <WaterMap spots={data.spots} picked={picked} onPick={setPicked} />
          </div>
          <div className="space-y-2 p-4 text-sm">
            {spot ? (
              <div className="flex items-start gap-2.5">
                <Swatch state={spot.state} />
                <p className="min-w-0">
                  <span className="font-medium">{spot.name}</span>
                  {spot.sector ? <span className="text-fg-muted"> · secteur {spot.sector}</span> : null}
                  <span className="block text-fg-muted">{spot.detail}</span>
                </p>
              </div>
            ) : (
              <p className="text-fg-muted">Touche un village pour voir ce que dit le planning.</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted">
              {(["eau", "coupee", "inconnu"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <Swatch state={s} />
                  {LABELS[s]} ({counts[s]})
                </span>
              ))}
            </div>
            <p className="text-xs text-fg-muted">
              Données : planning officiel de la SMAE (Mahoraise des Eaux), lu automatiquement sur son site. Positions approchées : la SMAE ne publie pas le
              tracé de ses secteurs, et l&apos;eau peut arriver plus tard selon le quartier. Fuite : 02 69 61 11 42.
            </p>
            {data.unplaced.length ? <p className="text-xs text-danger">Admin : pas encore placés sur la carte : {data.unplaced.join(", ")}.</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
