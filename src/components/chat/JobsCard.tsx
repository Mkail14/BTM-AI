"use client";

import { Briefcase, ChevronRight, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { jobHaystack, jobQueryWords, normalizeJobs, type JobContract, type JobOffer, type JobsResponse, type JobsSpec } from "@/lib/emploi/intent";

const PERSONA = "var(--persona,var(--accent))";
/** Un bloc affiché plus tard que ça après l'ouverture de la page vient d'être écrit par Tamilya. */
const FRESH_AFTER_MS = 3000;
/** Lignes montrées d'un coup ; « Voir plus » ajoute la suite (des centaines d'offres ralentiraient le téléphone). */
const STEP = 60;

type Loaded = { offers: JobOffer[]; total: number; updatedAt: string; sources: string[] };
type State = { status: "loading" } | ({ status: "ok" } & Loaded) | { status: "off" } | { status: "error"; message: string };

const CONTRACTS: { id: JobContract | "tous"; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "CDI", label: "CDI" },
  { id: "CDD", label: "CDD" },
  { id: "MIS", label: "Intérim" },
  { id: "PUBLIC", label: "Fonction publique" },
  { id: "AUTRE", label: "Autres" },
];

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Mayotte" });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/** « aujourd'hui », « hier », « il y a 3 j », puis la date. */
function published(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return dayFmt.format(new Date(iso));
}

/** « jusqu'au 14 déc. » : date limite de candidature. */
const deadlineOf = (day: string | null) => (day ? `jusqu'au ${dayFmt.format(new Date(`${day}T12:00:00Z`))}` : null);

const plural = (n: number, word: string) => `${n.toLocaleString("fr-FR")} ${word}${n > 1 ? "s" : ""}`;

/**
 * Offres d'emploi dans la conversation (bloc ```offres-emploi```) : une carte
 * compacte (« 523 offres en ce moment »), qui ouvre la liste complète avec la
 * recherche, le contrat et la commune.
 */
export function JobsCard({ spec }: { spec: JobsSpec }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const autoOpen = useRef<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/emploi")
      .then(async (res) => ((await res.json().catch(() => null)) as JobsResponse | null) ?? { error: "Offres indisponibles." })
      .then((body) => {
        if (!alive) return;
        if ("error" in body) return setState({ status: "error", message: body.error });
        if (!body.configured) return setState({ status: "off" });
        setState({ status: "ok", offers: body.offers, total: body.total, updatedAt: body.updatedAt, sources: body.sources ?? [] });
        // Écrit à l'instant par Tamilya (pas relu dans l'historique) : la liste s'ouvre d'elle-même.
        if (autoOpen.current === null) {
          autoOpen.current = performance.now() > FRESH_AFTER_MS;
          if (autoOpen.current) setOpen(true);
        }
      })
      .catch(() => alive && setState({ status: "error", message: "Offres indisponibles : vérifie ta connexion." }));
    return () => {
      alive = false;
    };
  }, []);

  const data = state.status === "ok" ? state : null;
  const line =
    state.status === "loading"
      ? "Je regarde les offres…"
      : state.status === "ok"
        ? state.total
          ? `${plural(state.total, "offre")} en ce moment${spec.ville ? ` · ${spec.ville}` : ""}`
          : "Aucune offre en ce moment"
        : state.status === "off"
          ? "Bientôt disponible"
          : state.message;

  return (
    <>
      <div className="booking-step carte-cadre flex w-full items-center gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
          <Briefcase aria-hidden="true" className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block leading-snug font-semibold">{spec.metier ? `Offres : ${spec.metier}` : "Offres d'emploi à Mayotte"}</span>
          <span className="block text-xs text-fg-muted">{line}</span>
        </span>
        {data?.offers.length ? (
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: PERSONA }} aria-haspopup="dialog">
            Voir
          </button>
        ) : null}
      </div>
      {open && data ? <JobsPanel data={data} spec={spec} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Liste complète : recherche et filtres en haut, offres en dessous (seule la liste défile). */
function JobsPanel({ data, spec, onClose }: { data: Loaded; spec: JobsSpec; onClose: () => void }) {
  const towns = useMemo(() => {
    const count = new Map<string, number>();
    for (const o of data.offers) if (o.place) count.set(o.place, (count.get(o.place) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [data.offers]);
  const startTown = towns.find(([t]) => normalizeJobs(t) === normalizeJobs(spec.ville))?.[0] ?? "";

  // Familles de contrat présentes : un filtre qui ne trie rien n'est pas montré.
  const contracts = useMemo(() => {
    const kinds = new Set(data.offers.map((o) => o.kind));
    return kinds.size > 1 ? CONTRACTS.filter((c) => c.id === "tous" || kinds.has(c.id)) : [];
  }, [data.offers]);

  const [query, setQuery] = useState(spec.metier);
  const [contract, setContract] = useState<JobContract | "tous">("tous");
  const [town, setTown] = useState(startTown);
  const [more, setMore] = useState({ key: "", n: STEP });
  const deferredQuery = useDeferredValue(query);

  const indexed = useMemo(() => data.offers.map((o) => ({ o, text: jobHaystack(o) })), [data.offers]);
  const results = useMemo(() => {
    const words = jobQueryWords(deferredQuery);
    return indexed
      .filter(({ o, text }) => (contract === "tous" || o.kind === contract) && (!town || o.place === town) && words.every((w) => text.includes(w)))
      .map(({ o }) => o);
  }, [indexed, deferredQuery, contract, town]);

  // Nouveau filtre : on repart du début de la liste (le « Voir plus » ne vaut que pour ces filtres-là).
  const filterKey = `${deferredQuery}|${contract}|${town}`;
  const shown = more.key === filterKey ? more.n : STEP;
  const showMore = () => setMore({ key: filterKey, n: shown + STEP });
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [filterKey]);

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

  const filtered = Boolean(query.trim() || town || contract !== "tous");

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-closing={closing || undefined}>
      <div aria-hidden="true" onClick={close} className="order-backdrop absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Offres d'emploi à Mayotte"
        tabIndex={-1}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}
        className="order-sheet absolute inset-0 flex flex-col overflow-hidden bg-bg shadow-2xl outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[440px] sm:rounded-3xl sm:border sm:border-border"
      >
        {/* En-tête : titre, nombre, recherche et filtres. */}
        <div className="shrink-0 space-y-3 border-b border-border px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={close} aria-label="Fermer les offres d'emploi" className="grid size-11 shrink-0 place-items-center rounded-full bg-bg-subtle hover:bg-border">
              <X aria-hidden="true" className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-lg leading-tight font-semibold">Offres d&apos;emploi à Mayotte</p>
              <p className="truncate text-xs text-fg-muted" aria-live="polite">
                {filtered ? `${plural(results.length, "offre")} sur ${data.total.toLocaleString("fr-FR")}` : `${plural(data.total, "offre")} en ce moment`}
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-bg-subtle px-4 py-2.5">
            <Search aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Métier, employeur…"
              aria-label="Chercher un métier ou un employeur"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-muted"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="text-fg-muted">
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {contracts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContract(c.id)}
                aria-pressed={contract === c.id}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold aria-pressed:border-transparent aria-pressed:text-accent-fg"
                style={contract === c.id ? { background: PERSONA } : undefined}
              >
                {c.label}
              </button>
            ))}
            <select
              value={town}
              onChange={(e) => setTown(e.target.value)}
              aria-label="Commune"
              className="shrink-0 rounded-full border border-border bg-bg px-3 py-1.5 text-xs font-semibold"
            >
              <option value="">Toute l&apos;île</option>
              {towns.map(([t, n]) => (
                <option key={t} value={t}>
                  {t} ({n})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Les offres : seule partie qui défile. */}
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {results.length ? (
            <ul className="divide-y divide-border">
              {results.slice(0, shown).map((o) => (
                <li key={o.id}>
                  <a href={o.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-bg-subtle">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-snug font-semibold">{o.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-fg-muted">
                        {[o.company, o.place].filter(Boolean).join(" · ") || "Mayotte"}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
                        <span className="rounded-full bg-bg-subtle px-2 py-0.5 font-semibold text-fg">{o.kind === "MIS" ? "Intérim" : o.kind === "AUTRE" || o.kind === "PUBLIC" ? (o.contract ?? "Autre") : o.kind}</span>
                        {o.hours ? <span>{o.hours}</span> : null}
                        {deadlineOf(o.deadline) ? <span>· {deadlineOf(o.deadline)}</span> : published(o.date) ? <span>· {published(o.date)}</span> : null}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid place-items-center px-6 py-16 text-center">
              <Search aria-hidden="true" className="mb-2 size-6 text-fg-muted" />
              <p className="font-semibold">Aucune offre avec ces filtres</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setContract("tous");
                  setTown("");
                }}
                className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-bg-subtle"
              >
                Tout montrer
              </button>
            </div>
          )}
          {results.length > shown ? (
            <button type="button" onClick={showMore} className="mx-auto my-3 block rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-bg-subtle">
              Voir plus ({(results.length - shown).toLocaleString("fr-FR")})
            </button>
          ) : null}
          <p className="px-3 pt-2 text-center text-[11px] text-fg-muted">
            {data.sources.includes("France Travail") ? null : "Postes des mairies, du Département et des intercommunalités. "}
            Offres publiées sur {data.sources.join(" et ") || "les sites d'emploi"}, lues à {clock.format(new Date(data.updatedAt))}. Touche une offre pour la lire et postuler.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
