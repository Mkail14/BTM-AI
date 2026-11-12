"use client";

import { Check, ChevronLeft, Truck } from "lucide-react";
import { Pictogram, WorksIcon } from "@/components/ui/Pictogram";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { boardDone } from "@/lib/voice-live/stage";
import type { BtmDevisChoice, BtmDevisInfo, BtmDevisSaved } from "@/app/api/btm-devis/route";
import type { BtmFournisseursInfo } from "@/app/api/btm-devis/fournisseurs/route";
import type { OffreFournisseur } from "@/lib/btm/partner";
import { parseBtmDevisSpec } from "@/lib/btm/intent";
import {
  BTM_SITE,
  calculerDevis,
  formaterEurosDevis,
  formaterQuantite,
  lienCalculateur,
  validerValeurs,
  type Champ,
  type Ouvrage,
  type OuvrageId,
} from "@/lib/btm/ouvrages";
import { blockKey as keyOf, moveBlockValue, readBlockValue } from "@/lib/chat/block-key";
import { hapticPress, hapticReady } from "@/lib/chat/haptics";
import { BtmScene3D } from "./BtmScene3D";
import { StyledQr } from "./OrderTicket";

const PERSONA = "var(--persona,var(--accent))";
const SAVED_KEY = "btm-devis:";

const blockKey = (el: HTMLElement | null) => keyOf(SAVED_KEY, el, "[data-btm-devis-block]");

/** Devis enregistré ; `valeurs` et `fournisseurId` depuis le choix du fournisseur dans Tamilya. */
type Saved = BtmDevisSaved & { type: OuvrageId; valeurs?: Record<string, string>; fournisseurId?: string };

function savedDevis(key: string): Saved | null {
  try {
    const saved = JSON.parse(readBlockValue(key) ?? "null") as Saved | null;
    return saved?.code ? saved : null;
  } catch {
    return null;
  }
}

type Problem = { reason: string; message: string; email?: string };

/** Le total glisse vers sa nouvelle valeur au lieu de sauter. */
function useTween(target: number, ms = 450) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    // Départ pris sur la première image : même horloge que requestAnimationFrame.
    let start: number | null = null;
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      const v = origin + (target - origin) * (1 - (1 - t) ** 3);
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Code de retrait : QR et chiffres, actif chez le fournisseur choisi. */
function CodeCard({ saved, busy }: { saved: Saved; busy?: boolean }) {
  return (
    <div className="booking-pop mx-auto max-w-xs overflow-hidden rounded-2xl border border-border bg-bg-subtle">
      <div className="px-4 pt-4 text-center">
        <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">Code de retrait BTM</p>
        {saved.fournisseur ? (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: PERSONA }}>
            <Check className="size-3" aria-hidden="true" />
            {busy ? "Changement…" : `Actif chez ${saved.fournisseur}`}
          </p>
        ) : (
          <p className="mt-1 font-semibold">{saved.nom.replace(/\s*\(Tamilya\)$/, "")}</p>
        )}
      </div>
      <div className={`mx-auto mt-3 w-40 rounded-xl bg-white p-2 transition ${busy ? "opacity-40" : ""}`}>
        <StyledQr text={saved.code} label={`QR code du devis ${saved.code}`} />
      </div>
      <p className="mt-2 pb-4 text-center font-mono text-lg font-bold tracking-widest">{saved.code}</p>
    </div>
  );
}

/** Ancien devis (avant le choix du fournisseur dans Tamilya) : le code seul. */
function SavedDevis({ saved }: { saved: Saved }) {
  return (
    <div className="booking-step p-4">
      <CodeCard saved={saved} />
      <p className="mt-3 text-center text-xs text-fg-muted">
        Présente ce code chez un fournisseur partenaire de BTM : tu paies le prix BTM, plus bas qu&apos;au comptoir.
      </p>
    </div>
  );
}

const questionDe = (champ: Champ) => champ.question ?? `${champ.label} ?`;

/** Premier champ sans réponse valable (les choix ont une valeur par défaut, mais on les pose quand même). */
function premiereQuestion(ouvrage: Ouvrage, valeurs: Record<string, string>) {
  const { erreurs } = validerValeurs(ouvrage, valeurs);
  const i = ouvrage.champs.findIndex((c) => (c.type === "choix" ? !valeurs[c.nom] : erreurs[c.nom] || valeurs[c.nom] === undefined));
  return i === -1 ? ouvrage.champs.length : i;
}

function valeurAffichee(champ: Champ, v: string | undefined) {
  if (champ.type === "choix") return champ.options.find((o) => o.valeur === v)?.label ?? "";
  if (champ.optionnel && (!v || v === "0")) return "aucune";
  return `${v} ${champ.unite}`;
}

/**
 * Devis BTM dans la conversation (bloc ```devis-btm```) :
 * 1. l'ouvrage, puis les mesures une question à la fois, avec l'ouvrage en 3D qui suit les réponses ;
 * 2. « Voir le devis » : les matériaux, puis les fournisseurs partenaires de btm.yt avec leur prix ;
 * 3. toucher un fournisseur : le total passe à son prix et le code de retrait s'active chez lui
 *    (enregistré dans « Mes projets » de btm.yt ; changer de fournisseur garde le même code).
 */
export function BtmDevis({ query = "" }: { query?: string }) {
  const root = useRef<HTMLElement>(null);
  const uid = useId();
  const initial = useMemo(() => parseBtmDevisSpec(query), [query]);
  const [info, setInfo] = useState<BtmDevisInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState<OuvrageId | null>(initial.type);
  const [valeurs, setValeurs] = useState<Record<string, string>>(initial.valeurs);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"questions" | "devis">("questions");
  // Fournisseurs lus pour ces quantités-là (clé) : d’autres mesures, et la liste est relue.
  const [offresLues, setOffresLues] = useState<{ key: string; list: OffreFournisseur[] | null } | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [legacy, setLegacy] = useState<Saved | null>(null);
  const savedKey = useRef<string | null>(null);
  const savedRef = useRef<Saved | null>(null);
  const wanted = useRef<string | null>(null);
  const busy = useRef(false);
  // Clavier ouvert seulement après un geste de la personne, jamais au chargement de la conversation.
  const focusNext = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!savedKey.current) return;
    const next = blockKey(root.current);
    moveBlockValue(savedKey.current, next);
    savedKey.current = next;
  }, [pathname]);

  useEffect(() => {
    const previous = savedDevis(blockKey(root.current));
    if (previous && !previous.valeurs) {
      setLegacy(previous);
      return;
    }
    if (previous?.valeurs) {
      savedKey.current = blockKey(root.current);
      savedRef.current = previous;
      setSaved(previous);
      setType(previous.type);
      setValeurs(previous.valeurs);
      setChoisi(previous.fournisseurId ?? null);
      setPhase("devis");
    }
    let cancelled = false;
    fetch("/api/btm-devis", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as BtmDevisInfo | null;
        if (cancelled) return;
        if (!res.ok || !body) setLoadError(true);
        else setInfo(body);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const ouvrage = info?.ouvrages.find((o) => o.id === type) ?? null;

  // Première question : celle qui manque (les mesures déjà dites dans le message sont gardées).
  const started = useRef(false);
  useEffect(() => {
    if (!ouvrage || started.current || phase !== "questions") return;
    started.current = true;
    const i = premiereQuestion(ouvrage, valeurs);
    setStep(i);
    setDraft(valeurs[ouvrage.champs[i]?.nom] ?? "");
  }, [ouvrage, valeurs, phase]);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    input.current?.focus({ preventScroll: true });
  }, [step, type]);

  const check = ouvrage ? validerValeurs(ouvrage, valeurs) : null;
  const resultat = type && info && check?.valide ? calculerDevis(type, valeurs, info.prix) : null;

  const canActivate = Boolean(info?.signedIn && info.canSave);

  // Fournisseurs, dès que le devis s'affiche
  const lignesKey = resultat ? JSON.stringify(resultat.lignes.map((l) => [l.id, l.quantite])) : "";
  const lues = offresLues?.key === lignesKey ? offresLues : null;
  const offres = lues?.list ?? null;
  const offresError = Boolean(lues && !lues.list);
  const offre = offres?.find((o) => o.id === choisi) ?? null;
  const totalAffiche = useTween(offre?.total ?? resultat?.total ?? 0);
  useEffect(() => {
    if (phase !== "devis" || !type || !lignesKey) return;
    let cancelled = false;
    fetch("/api/btm-devis/fournisseurs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, valeurs }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as BtmFournisseursInfo | null;
        if (cancelled) return;
        setOffresLues({ key: lignesKey, list: res.ok && body ? body.fournisseurs : null });
      })
      .catch(() => !cancelled && setOffresLues({ key: lignesKey, list: null }));
    return () => {
      cancelled = true;
    };
    // valeurs est déjà résumé par lignesKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, type, lignesKey]);

  const persist = (value: Saved) => {
    savedRef.current = value;
    savedKey.current = blockKey(root.current);
    try {
      localStorage.setItem(savedKey.current, JSON.stringify(value));
    } catch {
      // Stockage plein ou bloqué : le code reste affiché, et il est dans « Mes projets » sur btm.yt.
    }
    setSaved(value);
  };

  /** Active le code chez le dernier fournisseur touché ; les touchers rapides sont regroupés. */
  async function activate() {
    if (busy.current || !type) return;
    busy.current = true;
    setActivating(true);
    try {
      while (wanted.current && wanted.current !== savedRef.current?.fournisseurId) {
        const fid = wanted.current;
        const current = savedRef.current;
        const res = current
          ? await fetch("/api/btm-devis", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: current.code, fournisseurId: fid }),
            })
          : await fetch("/api/btm-devis", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type, valeurs, fournisseurId: fid }),
            });
        const body = (await res.json().catch(() => null)) as
          | ((BtmDevisSaved | BtmDevisChoice) & { error?: string; reason?: string; email?: string })
          | null;
        if (!res.ok || !body?.ok) {
          setProblem({ reason: body?.reason ?? "error", message: body?.error ?? "L'activation a échoué. Réessaie.", email: body?.email });
          wanted.current = current?.fournisseurId ?? null;
          setChoisi(current?.fournisseurId ?? fid);
          break;
        }
        setProblem(null);
        const next: Saved = current
          ? { ...current, total: body.total, fournisseur: body.fournisseur, fournisseurId: fid }
          : { ...(body as BtmDevisSaved), type, valeurs, fournisseurId: fid };
        persist(next);
        if (!current) {
          hapticReady();
          boardDone(root.current);
        }
      }
    } catch {
      setProblem({ reason: "error", message: "Connexion impossible : vérifie ton réseau." });
    } finally {
      busy.current = false;
      setActivating(false);
    }
  }

  function choose(o: OffreFournisseur) {
    hapticPress();
    setChoisi(o.id);
    if (!canActivate) return;
    wanted.current = o.id;
    void activate();
  }

  const shell = (children: ReactNode) => (
    <section
      ref={root}
      data-btm-devis-block
      aria-label="Devis BTM"
      className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-bg text-sm leading-normal shadow-sm"
    >
      {children}
    </section>
  );

  if (legacy) return shell(<SavedDevis saved={legacy} />);
  if (loadError) {
    return shell(
      <p className="p-4 text-fg-muted">
        Le devis BTM est indisponible pour le moment. Tu peux le faire directement sur{" "}
        <a href={`${BTM_SITE}/calculateur`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          btm.yt
        </a>
        .
      </p>,
    );
  }
  if (!info) {
    return shell(
      <div aria-label="Chargement du devis" className="space-y-3 p-4">
        <div className="h-10 animate-pulse rounded-xl bg-bg-subtle" />
        <div className="h-40 animate-pulse rounded-xl bg-bg-subtle" />
      </div>,
    );
  }

  const restart = () => {
    hapticPress();
    started.current = false;
    setType(null);
    setValeurs({});
    setPhase("questions");
    setChoisi(null);
    setProblem(null);
  };

  const header = (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-subtle text-xl">
        <Pictogram of={ouvrage?.emoji} fallback={WorksIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{ouvrage ? `Devis BTM · ${ouvrage.libelle}` : "Devis BTM"}</p>
        <p className="truncate text-xs text-fg-muted">{ouvrage ? ouvrage.accroche : "Matériaux au meilleur prix à Mayotte"}</p>
      </div>
      {ouvrage && !saved ? (
        <button type="button" onClick={restart} className="shrink-0 text-xs text-fg-muted hover:text-fg">
          Changer
        </button>
      ) : null}
    </div>
  );

  // 1. Quel ouvrage ?
  if (!ouvrage) {
    return shell(
      <>
        {header}
        <p className="px-4 text-base font-semibold">Que veux-tu construire ?</p>
        <ul className="grid grid-cols-2 gap-1.5 p-4 pt-3">
          {info.ouvrages.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                data-voice-finger
                onClick={() => {
                  hapticPress();
                  started.current = false;
                  focusNext.current = true;
                  setType(o.id);
                  setValeurs({});
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-border px-2.5 py-2.5 text-left transition hover:bg-bg-muted active:scale-[0.98]"
              >
                <Pictogram of={o.emoji} fallback={WorksIcon} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{o.libelle}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{o.accroche}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>,
    );
  }

  const champs = ouvrage.champs;

  // 2. Les mesures, une question à la fois
  if (phase === "questions") {
    const champ = champs[step] as Champ | undefined;
    const live = champ ? { ...valeurs, [champ.nom]: draft } : valeurs;

    const goTo = (i: number) => {
      hapticPress();
      focusNext.current = true;
      setDraftError(null);
      setStep(i);
      setDraft(valeurs[champs[i]?.nom] ?? "");
    };
    const answer = (value: string) => {
      if (!champ) return;
      const next = { ...valeurs, [champ.nom]: value };
      const { erreurs } = validerValeurs(ouvrage, next);
      if (erreurs[champ.nom]) {
        setDraftError(erreurs[champ.nom]);
        return;
      }
      hapticPress();
      focusNext.current = true;
      setValeurs(next);
      setDraftError(null);
      // Prochaine question sans réponse ; sinon c'est fini.
      let i = step + 1;
      while (i < champs.length && next[champs[i].nom] !== undefined && !validerValeurs(ouvrage, next).erreurs[champs[i].nom]) i++;
      setStep(i);
      setDraft(next[champs[i]?.nom] ?? "");
    };

    return shell(
      <>
        {header}
        <BtmScene3D type={ouvrage.id} valeurs={live} />

        <div className="px-4 pt-3">
          {/* Réponses déjà données : on peut y revenir */}
          <div className="flex flex-wrap gap-1.5">
            {champs.map((c, i) =>
              valeurs[c.nom] !== undefined && i !== step ? (
                <button
                  key={c.nom}
                  type="button"
                  onClick={() => goTo(i)}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-muted transition hover:bg-bg-muted"
                >
                  {c.label} : <span className="font-semibold text-fg">{valeurAffichee(c, valeurs[c.nom])}</span>
                </button>
              ) : null,
            )}
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {champs.map((c, i) => (
              <span
                key={c.nom}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ background: i < step || (i > step && valeurs[c.nom] !== undefined) ? PERSONA : i === step ? "var(--fg-muted)" : "var(--border)" }}
              />
            ))}
          </div>
        </div>

        {champ ? (
          <div key={champ.nom} className="booking-step p-4 pt-3">
            <p className="text-[11px] text-fg-muted">
              Question {step + 1} sur {champs.length}
            </p>
            <label htmlFor={`${uid}-q`} className="mt-0.5 block text-base font-semibold">
              {questionDe(champ)}
            </label>

            {champ.type === "choix" ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {champ.options.map((o) => (
                  <button
                    key={o.valeur}
                    type="button"
                    data-voice-finger
                    onClick={() => answer(o.valeur)}
                    onPointerEnter={() => setDraft(o.valeur)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition active:scale-[0.98] ${valeurs[champ.nom] === o.valeur ? "border-transparent text-white" : "border-border hover:bg-bg-muted"}`}
                    style={valeurs[champ.nom] === o.valeur ? { background: PERSONA } : undefined}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="mt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  answer(draft);
                }}
              >
                <div className="flex gap-2">
                  <span
                    className={`flex min-w-0 flex-1 items-center rounded-xl border bg-bg px-3 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft ${draftError ? "booking-shake border-danger" : "border-border"}`}
                  >
                    <input
                      id={`${uid}-q`}
                      inputMode="decimal"
                      autoComplete="off"
                      ref={input}
                      enterKeyHint="next"
                      placeholder={champ.exemple}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        setDraftError(null);
                      }}
                      aria-invalid={Boolean(draftError)}
                      className="w-full min-w-0 bg-transparent py-2.5 text-base tabular-nums outline-none"
                    />
                    <span className="shrink-0 text-sm text-fg-muted">{champ.unite}</span>
                  </span>
                  <button
                    type="submit"
                    data-voice-finger
                    disabled={!draft.trim()}
                    className="shrink-0 rounded-full px-4 font-medium text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-45"
                    style={{ background: PERSONA }}
                  >
                    Suivant
                  </button>
                </div>
                {draftError ? (
                  <p className="mt-1 text-[11px] text-danger">{draftError}</p>
                ) : champ.aide ? (
                  <p className="mt-1 text-[11px] text-fg-muted">{champ.aide}</p>
                ) : null}
                {champ.optionnel ? (
                  <button type="button" onClick={() => answer("0")} className="mt-2 text-xs font-semibold hover:underline" style={{ color: PERSONA }}>
                    Il n&apos;y en a pas
                  </button>
                ) : null}
              </form>
            )}
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)} className="mt-3 inline-flex items-center gap-0.5 text-xs text-fg-muted hover:text-fg">
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Question précédente
              </button>
            ) : null}
          </div>
        ) : (
          <div className="booking-step p-4 pt-3">
            <p className="text-base font-semibold">C&apos;est noté.</p>
            <p className="mt-0.5 text-xs text-fg-muted">Ton devis est prêt, avec les prix des fournisseurs de Mayotte.</p>
            <button
              type="button"
              data-voice-finger
              disabled={!resultat}
              onClick={() => {
                hapticPress();
                setPhase("devis");
              }}
              className="mt-3 w-full rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-45"
              style={{ background: PERSONA }}
            >
              Voir le devis
            </button>
          </div>
        )}
      </>,
    );
  }

  // 3. Le devis, les fournisseurs et le code de retrait
  if (!resultat) return shell(<>{header}</>);
  const prixDe = (id: string) => offre?.prix.find((p) => p.id === id);
  const link = lienCalculateur(ouvrage.id, resultat.dimensions);

  return shell(
    <>
      {header}
      <BtmScene3D type={ouvrage.id} valeurs={valeurs} compact />

      <div className="booking-step px-4 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-fg-muted">{offre ? `Chez ${offre.nom}` : "Prix moyen BTM"}</p>
            <p className="text-2xl font-bold tabular-nums">{formaterEurosDevis(Math.round(totalAffiche * 100) / 100)}</p>
          </div>
          {offre && offre.totalComptoir > offre.total ? (
            <p className="shrink-0 text-right text-[11px] text-fg-muted">
              <span className="line-through tabular-nums">{formaterEurosDevis(offre.totalComptoir)}</span>
              <span className="block font-semibold" style={{ color: PERSONA }}>
                {formaterEurosDevis(offre.totalComptoir - offre.total)} de moins qu&apos;au comptoir
              </span>
            </p>
          ) : null}
        </div>

        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {resultat.lignes.map((l) => {
            const p = prixDe(l.id);
            const manque = offre?.manquants.includes(l.id);
            return (
              <li key={l.id} className={`flex items-baseline justify-between gap-3 px-3 py-2 ${manque ? "opacity-50" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate">{l.libelle}</span>
                  <span className="block text-xs text-fg-muted tabular-nums">{formaterQuantite(l.quantite, l.unite)}</span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {manque ? <span className="text-xs">Pas chez lui</span> : formaterEurosDevis(p?.sousTotal ?? l.sousTotal)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Fournisseurs */}
      <div className="px-4 pt-4">
        <p className="font-semibold">{saved ? "Ton fournisseur" : "Choisis ton fournisseur"}</p>
        <p className="text-[11px] text-fg-muted">Touche un fournisseur : le prix change et ton code de retrait s&apos;active chez lui.</p>
        {offresError ? (
          <p className="mt-2 rounded-xl bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
            Les fournisseurs ne répondent pas pour le moment. Compare-les sur{" "}
            <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              btm.yt
            </a>
            .
          </p>
        ) : !offres ? (
          <div className="mt-2 space-y-1.5" aria-label="Chargement des fournisseurs">
            <div className="h-14 animate-pulse rounded-xl bg-bg-subtle" />
            <div className="h-14 animate-pulse rounded-xl bg-bg-subtle" />
          </div>
        ) : !offres.length ? (
          <p className="mt-2 rounded-xl bg-bg-subtle px-3 py-2 text-xs text-fg-muted">Aucun fournisseur partenaire ne vend encore ces matériaux.</p>
        ) : (
          <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Fournisseurs">
            {offres.map((o) => {
              const on = o.id === choisi;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-voice-finger
                    onClick={() => choose(o)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${on ? "border-transparent ring-2" : "border-border hover:bg-bg-muted"}`}
                    style={on ? { ["--tw-ring-color" as string]: PERSONA } : undefined}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-5 shrink-0 place-items-center rounded-full border-2 transition"
                      style={{ borderColor: on ? PERSONA : "var(--border)", background: on ? PERSONA : "transparent" }}
                    >
                      {on ? <Check className="size-3 text-white" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.nom}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                        <span>{o.commune}</span>
                        {o.livraison ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Truck className="size-3" aria-hidden="true" />
                            Livre
                          </span>
                        ) : null}
                        {o.manquants.length ? <span>{o.manquants.length} matériau{o.manquants.length > 1 ? "x" : ""} manquant{o.manquants.length > 1 ? "s" : ""}</span> : null}
                        {o.demonstration ? <span className="rounded bg-bg-subtle px-1">Démo</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formaterEurosDevis(o.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {offres?.some((o) => o.demonstration) ? (
          <p className="mt-1.5 text-[11px] text-fg-muted">« Démo » : fiche fictive de btm.yt, en attendant ses premiers partenaires.</p>
        ) : null}
      </div>

      {/* Code de retrait */}
      <div className="p-4">
        {problem ? (
          <div role="alert" className="mb-2 rounded-xl bg-bg-subtle px-3 py-2 text-center text-xs">
            <p className={problem.reason === "no_account" ? "" : "text-danger"}>
              {problem.reason === "no_account"
                ? `Aucun compte btm.yt avec ton adresse ${problem.email ?? "e-mail"}. Crée ton compte gratuit sur btm.yt avec cette adresse, puis touche à nouveau le fournisseur : ton code s'activera.`
                : problem.message}
            </p>
            {problem.reason === "no_account" ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold hover:underline" style={{ color: PERSONA }}>
                Ouvrir mon devis sur btm.yt
              </a>
            ) : null}
          </div>
        ) : null}

        {saved ? (
          <>
            <CodeCard saved={saved} busy={activating} />
            <p className="mt-3 text-center text-xs text-fg-muted">
              Présente ce code chez {saved.fournisseur ?? "ton fournisseur"} : tu paies le prix BTM. Il est aussi dans « Mes projets » sur btm.yt.
            </p>
          </>
        ) : activating ? (
          <div className="mx-auto h-56 max-w-xs animate-pulse rounded-2xl bg-bg-subtle" aria-label="Activation du code de retrait" />
        ) : choisi && !canActivate ? (
          <div className="rounded-xl bg-bg-subtle px-3 py-3 text-center text-xs">
            <p>
              {info.signedIn
                ? "Enregistre ton devis sur btm.yt (compte gratuit) pour activer ton code de retrait."
                : "Connecte-toi à BTM AI pour activer ton code de retrait ici."}
            </p>
            <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold hover:underline" style={{ color: PERSONA }}>
              Ouvrir mon devis sur btm.yt
            </a>
          </div>
        ) : offresError || offres?.length === 0 ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110"
            style={{ background: PERSONA }}
          >
            Ouvrir mon devis sur btm.yt
          </a>
        ) : null}
      </div>
    </>,
  );
}
