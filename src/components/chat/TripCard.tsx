"use client";

import { Bus, CarFront, CarTaxiFront, Clock, Footprints, House, LocateFixed, MapPin, Phone, Ship } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TripResponse } from "@/app/api/trip/route";
import { locateMe, type Point } from "@/lib/geo/communes";
import { formatMinutes, parseTripSpec } from "@/lib/trip/intent";
import type { TripPlan } from "@/lib/trip/plan";

// Carte (MapLibre et sa feuille de style) : chargée seulement quand le panneau s'ouvre.
const CourierMap = dynamic(() => import("./CourierMap").then((m) => m.CourierMap), { ssr: false });

const PERSONA = "var(--persona,var(--accent))";
/** Trajets déjà ouverts d'eux-mêmes une fois : ils ne se rouvrent pas à chaque visite. */
const SEEN_KEY = "btm-trip-seen";
/** Un bloc affiché plus tard que ça après l'ouverture de la page vient d'être écrit par Tamilya. */
const FRESH_AFTER_MS = 3000;

type State = { status: "loading" } | { status: "ok"; plan: TripPlan } | { status: "error"; error: string; message: string };

function seen(spec: string): boolean {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
    if (list.includes(spec)) return true;
    localStorage.setItem(SEEN_KEY, JSON.stringify([spec, ...list].slice(0, 30)));
  } catch {
    // Stockage indisponible : le panneau ne s'ouvre simplement pas de lui-même.
    return true;
  }
  return false;
}

const km = (n: number) => `${n.toString().replace(".", ",")} km`;

/**
 * Trajet dans la conversation (bloc ```itineraire```) : une carte compacte
 * (« 18 min en voiture »), qui ouvre le panneau du trajet : la carte de
 * Mayotte et le chemin, les temps (voiture, taxi, bus, à pied) et les boutons
 * Google Maps et Waze. Départ : le lieu dit, la position du téléphone ou
 * l'adresse des paramètres.
 */
export function TripCard({ spec }: { spec: string }) {
  const parsed = useMemo(() => parseTripSpec(spec), [spec]);
  const [gps, setGps] = useState<Point | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const autoOpen = useRef<boolean | null>(null);
  /** Relance le calcul (maison posée sur la carte). */
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!parsed) return;
    let alive = true;
    const params = new URLSearchParams({ to: parsed.to });
    if (gps) params.set("at", `${gps.lat},${gps.lng}`);
    else if (parsed.from) params.set("from", parsed.from);
    fetch(`/api/trip?${params}`)
      .then(async (res) => ((await res.json().catch(() => null)) as TripResponse | null) ?? { error: "unavailable" as const, message: "Trajet indisponible." })
      .then((body) => {
        if (!alive) return;
        if ("plan" in body) {
          setState({ status: "ok", plan: body.plan });
          // Écrit à l'instant par Tamilya (pas relu dans l'historique) : le panneau s'ouvre de lui-même, une fois.
          if (autoOpen.current === null) {
            autoOpen.current = performance.now() > FRESH_AFTER_MS && !seen(spec);
            if (autoOpen.current) setOpen(true);
          }
        } else setState({ status: "error", error: body.error, message: body.message });
      })
      .catch(() => alive && setState({ status: "error", error: "unavailable", message: "Trajet indisponible : vérifie ta connexion." }));
    return () => {
      alive = false;
    };
  }, [parsed, gps, spec, reload]);

  const locate = async () => {
    setLocating(true);
    setLocateError(null);
    const found = await locateMe();
    setLocating(false);
    if (found.ok) {
      setState({ status: "loading" });
      setGps({ lat: found.geo.lat, lng: found.geo.lng });
    }
    else setLocateError(found.error);
  };

  if (!parsed) return null;
  const plan = state.status === "ok" ? state.plan : null;

  return (
    <>
      <div className="booking-step flex w-full items-center gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
          <CarFront size={24} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{plan ? `Trajet vers ${plan.to.label}` : "Trajet"}</span>
          <span className="block text-xs text-fg-muted">
            {state.status === "loading"
              ? "Je calcule le trajet…"
              : plan
                ? plan.car
                  ? `${formatMinutes(plan.car.minutes)} en voiture · ${km(plan.car.km)}${plan.from.approx ? " · départ approximatif" : ""}`
                  : plan.walk
                    ? `${formatMinutes(plan.walk.minutes)} à pied`
                    : ""
                : state.status === "error"
                  ? state.message
                  : ""}
          </span>
          {locateError ? <span className="mt-1 block text-xs text-fg-muted">{locateError}</span> : null}
        </span>
        {plan ? (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: PERSONA }} aria-haspopup="dialog">
            Voir
          </button>
        ) : state.status === "error" && state.error === "no_origin" ? (
          <button type="button" onClick={locate} disabled={locating} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-60" style={{ background: PERSONA }}>
            {locating ? "…" : "Ma position"}
          </button>
        ) : null}
      </div>
      {open && plan ? (
        <TripPanel
          plan={plan}
          onClose={() => setOpen(false)}
          locate={locate}
          locating={locating}
          locateError={locateError}
          onHomeSaved={() => setReload((n) => n + 1)}
          backHome={
            gps
              ? () => {
                  setState({ status: "loading" });
                  setGps(null);
                }
              : null
          }
        />
      ) : null}
    </>
  );
}

function Mode({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-bg-subtle px-3 py-2.5">
      <span aria-hidden="true" className="shrink-0 text-fg-muted">
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

/** Panneau du trajet : la carte en haut, l'essentiel en bas, sans défilement. */
function TripPanel({
  plan,
  onClose,
  locate,
  locating,
  locateError,
  backHome,
  onHomeSaved,
}: {
  plan: TripPlan;
  onClose: () => void;
  locate: () => void;
  locating: boolean;
  locateError: string | null;
  /** Revenir au départ par défaut (adresse ou lieu dit), quand on est parti de la position. */
  backHome: (() => void) | null;
  /** Maison posée sur la carte et enregistrée : le trajet est recalculé depuis elle. */
  onHomeSaved: () => void;
}) {
  // Épingle : undefined = pas en cours ; null = en cours, pas encore posée ; un point = posée.
  const [pinned, setPinned] = useState<Point | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const picking = pinned !== undefined;
  const approx = plan.from.kind === "home" && plan.from.approx;
  const saveHome = async () => {
    if (!pinned) return;
    setSaving(true);
    setPinError(null);
    const res = await fetch("/api/trip/home", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pinned) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setSaving(false);
    if (!body?.ok) return setPinError(body?.error ?? "Épingle non enregistrée : vérifie ta connexion.");
    setPinned(undefined);
    onHomeSaved();
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

  const from = plan.from.point;
  const to = plan.to.point;
  const route = useMemo(() => (plan.car?.path.length ? plan.car.path.map(([lat, lng]) => ({ lat, lng })) : [from, to]), [plan, from, to]);
  const google = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
  const waze = `https://www.waze.com/ul?ll=${to.lat}%2C${to.lng}&navigate=yes`;
  const carTime = plan.car ? formatMinutes(plan.car.minutes) : "—";

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-closing={closing || undefined}>
      <div aria-hidden="true" onClick={close} className="order-backdrop absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Trajet vers ${plan.to.label}`}
        tabIndex={-1}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}
        className="order-sheet absolute inset-0 flex flex-col overflow-hidden bg-bg shadow-2xl outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[440px] sm:rounded-3xl sm:border sm:border-border"
      >
        {/* Carte de Mayotte et le chemin : toute la place libre. */}
        <div className="relative min-h-[8rem] flex-1">
          <div className="absolute inset-0">
            <CourierMap key={`${from.lat},${from.lng}>${to.lat},${to.lng}`} from={from} to={to} route={route} trail={[]} courier={null} moving={false} kind="trip" pick={picking ? setPinned : null} />
          </div>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={close}
              aria-label="Fermer le trajet"
              className="grid size-10 place-items-center rounded-full bg-bg/90 text-xl leading-none shadow-lg backdrop-blur hover:bg-bg"
            >
              ×
            </button>
          </div>
        </div>

        {/* Fiche du bas : tout l'essentiel, sans défilement. */}
        <div className="relative -mt-5 shrink-0 space-y-3 rounded-t-3xl bg-bg px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.35)]">
          <div className="order-rise flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="line-clamp-2 text-lg leading-tight font-semibold">{plan.to.label}</p>
              {plan.to.detail ? <p className="mt-0.5 truncate text-xs text-fg-muted">{plan.to.detail}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{carTime}</p>
              <p className="mt-1 text-[11px] text-fg-muted">{plan.car ? `en voiture · ${km(plan.car.km)}` : "en voiture"}</p>
            </div>
          </div>

          {/* Départ, et changer de départ. */}
          <div className="order-rise flex items-center gap-2 text-xs [animation-delay:40ms]">
            <span aria-hidden="true" className="shrink-0 text-fg-muted">
              {plan.from.kind === "gps" ? <LocateFixed size={16} /> : <House size={16} />}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-fg-muted">Départ : </span>
              <span className="font-medium">{plan.from.label}</span>
              {plan.from.detail ? <span className="text-fg-muted"> · {plan.from.detail}</span> : null}
            </span>
            {plan.from.kind === "gps" ? (
              backHome ? (
                <button type="button" onClick={backHome} className="shrink-0 rounded-full border border-border px-2.5 py-1 font-semibold hover:bg-bg-subtle">
                  Mon adresse
                </button>
              ) : null
            ) : (
              <button type="button" onClick={locate} disabled={locating} className="shrink-0 rounded-full border border-border px-2.5 py-1 font-semibold hover:bg-bg-subtle disabled:opacity-60">
                {locating ? "Je cherche…" : "Ma position"}
              </button>
            )}
          </div>
          {locateError ? <p className="-mt-1 text-xs text-fg-muted">{locateError}</p> : null}

          {/* Adresse pas trouvée au numéro près : on le dit, et on propose de poser la maison sur la carte. */}
          {approx ? (
            picking ? (
              <div className="flex items-center gap-2 rounded-2xl bg-bg-subtle px-3 py-2 text-xs">
                <MapPin size={16} aria-hidden="true" className="shrink-0" style={{ color: PERSONA }} />
                <span className="min-w-0 flex-1">{pinError ?? (pinned ? "C'est bien chez toi ?" : "Touche ta maison sur la carte, ou fais glisser le repère.")}</span>
                <button type="button" onClick={() => setPinned(undefined)} className="shrink-0 rounded-full border border-border px-2.5 py-1 font-semibold hover:bg-bg">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveHome}
                  disabled={!pinned || saving}
                  className="shrink-0 rounded-full px-2.5 py-1 font-semibold text-accent-fg disabled:opacity-50"
                  style={{ background: PERSONA }}
                >
                  {saving ? "…" : "Enregistrer"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl bg-bg-subtle px-3 py-2 text-xs">
                <MapPin size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  Adresse pas trouvée au numéro près : départ approximatif ({plan.from.approxLabel}).
                </span>
                <button type="button" onClick={() => setPinned(null)} className="shrink-0 rounded-full px-2.5 py-1 font-semibold text-accent-fg" style={{ background: PERSONA }}>
                  Placer ma maison
                </button>
              </div>
            )
          ) : null}

          {/* Temps selon le moyen de transport. */}
          <div className="order-rise grid grid-cols-2 gap-2 [animation-delay:80ms]">
            <Mode icon={<CarFront size={18} />} label="Voiture" value={carTime} hint="sans les bouchons" />
            <Mode icon={<CarTaxiFront size={18} />} label="Taxi" value={carTime} hint="prix bientôt" />
            <Mode icon={<Bus size={18} />} label="Bus" value="Bientôt" hint="horaires à venir" />
            <Mode icon={<Footprints size={18} />} label="À pied" value={plan.walk ? formatMinutes(plan.walk.minutes) : "—"} hint={plan.walk ? km(plan.walk.km) : undefined} />
          </div>

          {plan.barge ? (
            <p className="flex items-center gap-2 text-xs text-fg-muted">
              <Ship size={16} aria-hidden="true" className="shrink-0" /> Traversée en barge entre Grande-Terre et Petite-Terre en plus.
            </p>
          ) : null}
          {plan.to.hours || plan.to.phones[0] ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
              {plan.to.hours ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Clock size={14} aria-hidden="true" className="shrink-0" />
                  <span className="line-clamp-2">Ouvert {plan.to.hours}</span>
                </span>
              ) : null}
              {plan.to.phones[0] ? (
                <a href={`tel:${plan.to.phones[0].replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 font-medium text-fg">
                  <Phone size={14} aria-hidden="true" /> {plan.to.phones[0]}
                </a>
              ) : null}
            </div>
          ) : null}

          {/* Ouvrir le GPS du téléphone. */}
          <div className="order-rise grid grid-cols-2 gap-2 [animation-delay:120ms]">
            <a
              href={google}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-full px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
              style={{ background: PERSONA }}
            >
              Google Maps
            </a>
            <a
              href={waze}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-full border border-border px-3 py-3 text-sm font-semibold transition hover:bg-bg-subtle"
            >
              Waze
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
