"use client";

import { ArrowUpRight, MapPin, Newspaper } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Headline } from "@/lib/mayotte/news-place";
import { MAP_NEWS_EVENT, type MapNewsDetail } from "./MayotteMap";

/**
 * Les « unes » des journaux de Mayotte, à côté de la carte (page « Mayotte ») :
 * un titre à la fois, le suivant toutes les 5 s, en boucle. Chaque titre envoie
 * son lieu à la carte, qui vole jusque-là. Toucher le titre ouvre l'article sur
 * le site du journal. Les titres viennent des flux des journaux (/api/mayotte/une),
 * sans IA, et se relisent seuls toutes les 10 minutes.
 *
 * La souris sur le cadre (ou le clavier dedans) met la boucle en pause.
 */

/** Durée d'un titre : posée dans le CSS (.une-segment__fill), la fin de l'animation passe au suivant. */
const SLIDE_MS = 5_000;
const REFRESH_MS = 10 * 60_000;
const RETRY_MS = 20_000;

async function fetchHeadlines(): Promise<Headline[]> {
  const response = await fetch("/api/mayotte/une", { signal: AbortSignal.timeout(15_000) });
  const data = (await response.json()) as { headlines?: Headline[] };
  if (!response.ok || !data.headlines?.length) throw new Error(`HTTP ${response.status}`);
  return data.headlines;
}

const CALM_QUERY = "(prefers-reduced-motion: reduce)";
const isCalm = () => window.matchMedia(CALM_QUERY).matches;
function subscribeCalm(onChange: () => void) {
  const query = window.matchMedia(CALM_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function timeAgo(date: string | null): string {
  if (!date) return "";
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  if (hours < 48) return "hier";
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Mayotte" });
}

export function MayotteHeadlines() {
  const [headlines, setHeadlines] = useState<Headline[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  /** Compte les passages : relance le trait même quand il n'y a qu'un titre. */
  const [turn, setTurn] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const lastLoad = useRef(0);
  /** Article affiché : gardé à l'écran quand la liste se met à jour. */
  const shownLink = useRef<string | null>(null);

  const load = useCallback(() => {
    lastLoad.current = Date.now();
    fetchHeadlines().then(
      (list) => {
        setHeadlines(list);
        setFailed(false);
        const kept = list.findIndex((h) => h.link === shownLink.current);
        setIndex(kept >= 0 ? kept : 0);
      },
      (error: unknown) => {
        console.warn("[unes Mayotte]", error);
        setFailed(true);
      },
    );
  }, []);

  // Premier chargement, puis relecture toutes les 10 minutes (et au retour sur l'onglet si c'est l'heure).
  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const onVisible = () => {
      setHidden(document.hidden);
      if (!document.hidden && Date.now() - lastLoad.current > REFRESH_MS) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Rien reçu : nouvel essai 20 s plus tard.
  useEffect(() => {
    if (!failed || headlines) return;
    const timer = window.setTimeout(load, RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [failed, headlines, load]);

  const current = headlines?.[index] ?? null;
  const next = headlines?.length ? headlines[(index + 1) % headlines.length] : null;

  // Nouveau titre : la carte vole vers son lieu.
  useEffect(() => {
    if (!current) return;
    shownLink.current = current.link;
    window.dispatchEvent(new CustomEvent<MapNewsDetail>(MAP_NEWS_EVENT, { detail: current.place }));
  }, [current]);

  // Toutes les photos chargées d'avance dès que les titres arrivent : chacune apparaît sans attendre.
  // La suivante d'abord, puis les autres.
  useEffect(() => {
    if (next?.image) new Image().src = next.image;
  }, [next]);
  useEffect(() => {
    for (const h of headlines ?? []) {
      if (!h.image) continue;
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.src = h.image;
    }
  }, [headlines]);

  const advance = useCallback(() => {
    setIndex((i) => (headlines?.length ? (i + 1) % headlines.length : 0));
    setTurn((t) => t + 1);
  }, [headlines]);
  const paused = hovered || focused || hidden;

  // Animations réduites (réglage du téléphone) : le trait ne se remplit pas (le CSS coupe les animations), une minuterie passe au titre suivant.
  const calm = useSyncExternalStore(subscribeCalm, isCalm, () => false);
  useEffect(() => {
    if (!calm || paused || !headlines?.length) return;
    const timer = window.setTimeout(advance, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [calm, paused, headlines, turn, index, advance]);

  if (!headlines) {
    if (failed) return <p className="mt-5 text-sm text-fg-muted md:mt-7">Les unes de Mayotte arrivent dans un instant.</p>;
    return <div aria-hidden="true" className="une-loading landing-glass mx-auto mt-4 h-[104px] w-full max-w-[460px] rounded-3xl md:mx-0 md:mt-7 md:h-[min(420px,52vh)]" />;
  }
  if (!current) return null;
  const showImage = current.image && !brokenImages.has(current.image);

  return (
    <section
      aria-label="À la une à Mayotte"
      aria-roledescription="carrousel"
      className="landing-rise mx-auto mt-4 w-full max-w-[460px] text-left [animation-delay:150ms] md:mx-0 md:mt-7"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <div className="mb-2 flex items-center gap-3">
        <p className="flex shrink-0 items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">
          <span aria-hidden="true" className="une-live" />À la une
        </p>
        {/* Un trait par titre : celui affiché se remplit en 5 s, puis on passe au suivant. Toucher un trait montre ce titre. */}
        <div className="flex min-w-0 flex-1 gap-1">
          {headlines.map((h, i) => (
            <button
              key={h.link}
              type="button"
              aria-label={`Titre ${i + 1} sur ${headlines.length}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => {
                setIndex(i);
                setTurn((t) => t + 1);
              }}
              className="group/seg flex-1 cursor-pointer py-2"
            >
              <span className="une-segment">
                {i === index ? (
                  <span
                    key={`${h.link}-${turn}`}
                    className="une-segment__fill"
                    data-paused={paused ? "" : undefined}
                    style={{ animationDuration: `${SLIDE_MS}ms` }}
                    onAnimationEnd={calm ? undefined : advance}
                  />
                ) : i < index ? (
                  <span className="une-segment__fill une-segment__fill--done" />
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      <a
        href={current.link}
        target="_blank"
        rel="noopener noreferrer"
        aria-live={paused ? "polite" : "off"}
        className="landing-glass group flex overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:flex-col"
      >
        <div key={`media-${current.link}`} className="une-in relative w-[104px] shrink-0 self-stretch overflow-hidden bg-accent-soft md:aspect-[16/9] md:max-h-[30vh] md:w-full dark:bg-white/[0.04]">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- photo d'un journal, sur son propre site : rien à optimiser ici
            <img
              src={current.image}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              loading="eager"
              fetchPriority="high"
              onError={() => setBrokenImages((s) => new Set(s).add(current.image!))}
              className="absolute inset-0 size-full object-cover transition-transform duration-[6s] ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="une-placeholder absolute inset-0 grid place-items-center">
              <Newspaper aria-hidden="true" className="size-7 text-accent/70 md:size-10" strokeWidth={1.5} />
            </div>
          )}
          {current.place ? (
            <span className="absolute bottom-3 left-3 hidden items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm md:inline-flex">
              <MapPin aria-hidden="true" className="size-3.5 text-[#ff4dd8]" strokeWidth={2.5} />
              {current.place.name}
            </span>
          ) : null}
        </div>

        <div key={`text-${current.link}`} className="une-in flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 md:gap-2 md:p-5">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <span className="truncate font-semibold text-fg">{current.source}</span>
            {current.date ? <span className="shrink-0">· {timeAgo(current.date)}</span> : null}
            {current.place ? (
              <span className="flex shrink-0 items-center gap-0.5 font-medium text-accent md:hidden">
                · <MapPin aria-hidden="true" className="size-3" strokeWidth={2.5} />
                {current.place.name}
              </span>
            ) : null}
          </p>
          <h2 className="line-clamp-2 min-h-[2lh] text-[15px] leading-snug font-[620] tracking-[-0.01em] text-fg md:line-clamp-3 md:min-h-[3lh] md:text-lg">{current.title}</h2>
          <span className="mt-auto hidden items-center gap-1 text-sm font-semibold text-accent md:inline-flex">
            Lire l&apos;article
            <ArrowUpRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </a>
    </section>
  );
}
