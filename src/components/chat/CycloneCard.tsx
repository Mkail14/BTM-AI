"use client";

import { Gauge, Globe, Info, Navigation, ShieldCheck, Wind, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Cyclone, CyclonePoint, CycloneZone, CyclonesResponse } from "@/lib/cyclone/intent";
import { motionOf } from "@/lib/cyclone/motion";
import { loadMapLibre } from "@/lib/geo/maplibre";
import { CycloneTimeline } from "./CycloneTimeline";

// Carte (MapLibre et sa feuille de style) : chargée seulement quand le panneau s'ouvre.
const CycloneMap = dynamic(() => import("./CycloneMap").then((m) => m.CycloneMap), { ssr: false });

const PERSONA = "var(--persona,var(--accent))";
/** Un bloc affiché plus tard que ça après l'ouverture de la page vient d'être écrit par Tamilya. */
const FRESH_AFTER_MS = 3000;

type State = { status: "loading" } | { status: "ok"; cyclones: Cyclone[]; updatedAt: string } | { status: "error"; message: string };

const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", hour: "numeric", timeZone: "Indian/Mayotte" });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });
const km = (n: number) => `${n.toLocaleString("fr-FR")} km`;

/** Symbole du cyclone, pour la petite carte de la conversation. */
function CycloneIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8C12 4.5 15 2.5 19 2.5" />
      <path d="M12 15.2c0 4.3-3 6.3-7 6.3" />
    </svg>
  );
}

/** Sous le pourcentage : le moment le plus probable, ou pourquoi il n'y en a pas. */
function estimateHint(c: Cyclone) {
  const e = c.estimate;
  if (!e) return "pas d'estimation";
  if (!e.when) return "estimation BTM";
  // Donnée trop vieille : le moment calculé est déjà derrière nous.
  return Date.parse(e.when) > Date.now() ? `plutôt ${day.format(new Date(e.when))}` : "donnée trop vieille";
}

const summary = (cyclones: Cyclone[], zone: CycloneZone) => {
  if (!cyclones.length) return zone === "monde" ? "Aucun cyclone en ce moment dans le monde" : "Aucun cyclone en ce moment dans l'océan Indien";
  // Le monde : les systèmes loin de notre océan ne se comptent pas en distance de Mayotte.
  if (zone === "monde" && !cyclones.some((c) => c.local)) return cyclones.length > 1 ? `${cyclones.length} cyclones dans le monde, loin de Mayotte` : `${cyclones[0].name}, loin de Mayotte`;
  const first = cyclones[0];
  const more = cyclones.length > 1 ? ` · ${cyclones.length} systèmes suivis` : "";
  return `${first.name} à ${km(first.distanceKm)} de Mayotte${more}`;
};

/**
 * Cyclones dans la conversation (bloc ```carte-cyclones```) : une carte
 * compacte (« Système n°2 à 960 km de Mayotte »), qui ouvre le panneau : la
 * carte de l'océan Indien avec les trajets, et l'essentiel en bas.
 */
export function CycloneCard({ zone = "ocean-indien" }: { zone?: CycloneZone }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const autoOpen = useRef<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    // En même temps que les données : le moteur de la carte et son dessin (déjà dans l'app Android).
    loadMapLibre().catch(() => {});
    import("./CycloneMap").catch(() => {});
    fetch(zone === "monde" ? "/api/cyclones?zone=monde" : "/api/cyclones")
      .then(async (res) => ((await res.json().catch(() => null)) as CyclonesResponse | null) ?? { error: "Carte des cyclones indisponible." })
      .then((body) => {
        if (!alive) return;
        if ("cyclones" in body) {
          setState({ status: "ok", cyclones: body.cyclones, updatedAt: body.updatedAt });
          // Écrit à l'instant par Tamilya (pas relu dans l'historique) : le panneau s'ouvre de lui-même.
          if (autoOpen.current === null) {
            autoOpen.current = performance.now() > FRESH_AFTER_MS;
            if (autoOpen.current) setOpen(true);
          }
        } else setState({ status: "error", message: body.error });
      })
      .catch(() => alive && setState({ status: "error", message: "Carte des cyclones indisponible : vérifie ta connexion." }));
    return () => {
      alive = false;
    };
  }, [zone]);

  const data = state.status === "ok" ? state : null;

  return (
    <>
      <div className="booking-step flex w-full items-center gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
          <CycloneIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{zone === "monde" ? "Cyclones dans le monde" : "Cyclones autour de Mayotte"}</span>
          <span className="block text-xs text-fg-muted">
            {state.status === "loading" ? (zone === "monde" ? "Je regarde le monde entier…" : "Je regarde l'océan Indien…") : state.status === "ok" ? summary(state.cyclones, zone) : state.message}
          </span>
        </span>
        {data ? (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: PERSONA }} aria-haspopup="dialog">
            Voir
          </button>
        ) : null}
      </div>
      {open && data ? <CyclonePanel key={zone} cyclones={data.cyclones} world={zone === "monde"} updatedAt={data.updatedAt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Panneau des cyclones : la carte en haut, l'essentiel en bas, sans défilement. */
function CyclonePanel({ cyclones: given, world: worldGiven = false, updatedAt, onClose }: { cyclones: Cyclone[]; world?: boolean; updatedAt: string; onClose: () => void }) {
  // Le reste du monde : chargé seulement si la personne le demande (déjà là si elle a demandé « les autres cyclones »).
  const [world, setWorld] = useState<{ status: "idle" | "loading" | "error" } | { status: "ok"; cyclones: Cyclone[] }>(worldGiven ? { status: "ok", cyclones: given } : { status: "idle" });
  const nearby = worldGiven ? given.filter((c) => c.local) : given;
  const cyclones = world.status === "ok" ? world.cyclones : nearby;
  const [focus, setFocus] = useState<string | null>(worldGiven ? null : (nearby[0]?.id ?? null));
  // Position rejouée par le curseur du temps (null : dernière mesure).
  const [ghost, setGhost] = useState<CyclonePoint | null>(null);
  const showWorld = () => {
    setWorld({ status: "loading" });
    fetch("/api/cyclones?zone=monde")
      .then(async (res) => (await res.json()) as CyclonesResponse)
      .then((body) => {
        if (!("cyclones" in body)) return setWorld({ status: "error" });
        setWorld({ status: "ok", cyclones: body.cyclones });
        setFocus(null);
      })
      .catch(() => setWorld({ status: "error" }));
  };
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
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

  const chosen = cyclones.find((c) => c.id === focus) ?? cyclones[0] ?? null;
  const heading = chosen && !chosen.local ? motionOf(chosen) : null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-closing={closing || undefined}>
      <div aria-hidden="true" onClick={close} className="order-backdrop absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Cyclones autour de Mayotte"
        tabIndex={-1}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}
        className="order-sheet absolute inset-0 flex flex-col overflow-hidden bg-bg shadow-2xl outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[440px] sm:rounded-3xl sm:border sm:border-border"
      >
        {/* Carte de l'océan Indien : toute la place libre. */}
        <div className="relative min-h-[8rem] flex-1">
          <div className="absolute inset-0">
            <CycloneMap key={world.status === "ok" ? "monde" : "ocean-indien"} cyclones={cyclones} focus={focus} onPick={setFocus} ghost={ghost && chosen ? { id: chosen.id, lat: ghost.lat, lng: ghost.lng } : null} />
          </div>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={close}
              aria-label="Fermer la carte des cyclones"
              className="grid size-11 place-items-center rounded-full bg-bg/90 shadow-lg backdrop-blur hover:bg-bg"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
            {/* Plusieurs systèmes : on choisit celui à regarder. */}
            {cyclones.length > 1 ? (
              <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                {cyclones.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFocus(c.id)}
                    aria-pressed={c.id === chosen?.id}
                    className="shrink-0 rounded-full bg-bg/90 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur aria-pressed:text-accent-fg"
                    style={c.id === chosen?.id ? { background: PERSONA } : undefined}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Fiche du bas : l'essentiel, sans défilement. */}
        <div className="relative -mt-5 shrink-0 space-y-3 rounded-t-3xl bg-bg px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.35)]">
          {chosen ? (
            <>
              <div className="order-rise flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-lg leading-tight font-semibold">{chosen.name}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{chosen.forming ? `${chosen.status} en formation, pas encore nommée` : chosen.status}</p>
                </div>
                {chosen.local ? (
                  <div className="shrink-0 text-right">
                    <p className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{km(chosen.distanceKm)}</p>
                    <p className="mt-1 text-[11px] text-fg-muted">de Mayotte</p>
                  </div>
                ) : (
                  <p className="flex shrink-0 items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1.5 text-xs font-semibold">
                    <ShieldCheck size={14} aria-hidden="true" />
                    Aucun danger pour Mayotte
                  </p>
                )}
              </div>
              <div className="order-rise [animation-delay:20ms]">
                <CycloneTimeline key={chosen.id} cyclone={chosen} onMove={setGhost} />
              </div>
              {chosen.local ? (
                <div className="order-rise grid grid-cols-3 gap-2 [animation-delay:40ms]">
                  <Fact icon={<Wind size={18} />} label="Vents" value={chosen.windKmh ? `${chosen.windKmh} km/h` : "—"} />
                  <Fact
                    icon={<Navigation size={18} />}
                    label="Au plus près"
                    value={chosen.closest ? km(chosen.closest.km) : "—"}
                    hint={chosen.closest ? day.format(new Date(chosen.closest.at)) : "prévu"}
                  />
                  <Fact
                    icon={<Gauge size={18} />}
                    label="À moins de 200 km"
                    value={chosen.estimate ? `${chosen.estimate.within200} %` : "—"}
                    hint={estimateHint(chosen)}
                  />
                </div>
              ) : (
                // Loin de notre océan : ce qui compte, c'est où il est et où il va, pas Mayotte.
                <div className="order-rise grid grid-cols-3 gap-2 [animation-delay:40ms]">
                  <Fact icon={<Wind size={18} />} label="Vents" value={chosen.windKmh ? `${chosen.windKmh} km/h` : "—"} />
                  <Fact icon={<Globe size={18} />} label="Océan" value={chosen.region.split(" ")[0]} hint={chosen.region.split(" ").slice(1).join(" ") || undefined} />
                  <Fact icon={<Navigation size={18} />} label="Va vers" value={heading ? heading.direction.replace(/^(le |l')/, "") : "—"} hint={heading ? `${heading.speedKmh} km/h` : undefined} />
                </div>
              )}
            </>
          ) : (
            <div className="order-rise">
              <p className="text-lg leading-tight font-semibold">Aucun cyclone en ce moment</p>
              <p className="mt-0.5 text-xs text-fg-muted">{world.status === "ok" ? "Rien n’est suivi dans le monde, même en formation." : "Rien n’est suivi dans le sud-ouest de l’océan Indien, même en formation."}</p>
            </div>
          )}
          <p className="order-rise flex items-start gap-2 text-[11px] leading-snug text-fg-muted [animation-delay:80ms]">
            <Info size={14} aria-hidden="true" className="mt-px shrink-0" />
            <span>
              {chosen?.local === false
                ? `Prévisions du centre météo de cet océan, via GDACS, à ${clock.format(new Date(updatedAt))}. Trait plein : trajet fait ; pointillés : prévu ; voile : où il peut passer. Loin de notre océan : il ne peut pas atteindre Mayotte.`
                : `Prévisions de Météo-France La Réunion, via GDACS, à ${clock.format(new Date(updatedAt))}. Trait plein : trajet fait ; pointillés : prévu ; voile : où il peut passer ; traits fins : anciens cyclones semblables depuis 1980.`}
              {chosen?.local === false
                ? ""
                : " Le pourcentage est une estimation BTM (prévision officielle et anciens cyclones), pas une alerte : les alertes viennent de la préfecture de Mayotte."}
              {chosen ? (
                <>
                  {" "}
                  <a href={chosen.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-fg underline">
                    Détails
                  </a>
                </>
              ) : null}
            </span>
          </p>
          {world.status !== "ok" ? (
            <button
              type="button"
              onClick={showWorld}
              disabled={world.status === "loading"}
              className="w-full rounded-full border border-border px-3 py-2.5 text-sm font-semibold transition hover:bg-bg-subtle disabled:opacity-60"
            >
              {world.status === "loading" ? "Je regarde le reste du monde…" : world.status === "error" ? "Réessayer : voir les autres" : "Voir les autres cyclones du monde"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Fact({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-bg-subtle px-3 py-2.5">
      <span aria-hidden="true" className="hidden shrink-0 text-fg-muted min-[420px]:inline">
        {icon}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] text-fg-muted">{label}</span>
        <span className="block truncate text-sm font-semibold tabular-nums">{value}</span>
        {hint ? <span className="block truncate text-[10px] text-fg-muted">{hint}</span> : null}
      </span>
    </div>
  );
}
