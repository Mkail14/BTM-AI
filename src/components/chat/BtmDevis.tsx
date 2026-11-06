"use client";

import { Pictogram, WorksIcon } from "@/components/ui/Pictogram";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { boardDone } from "@/lib/voice-live/stage";
import type { BtmDevisInfo, BtmDevisSaved } from "@/app/api/btm-devis/route";
import { parseBtmDevisSpec } from "@/lib/btm/intent";
import {
  BTM_SITE,
  calculerDevis,
  formaterEurosDevis,
  formaterQuantite,
  lienCalculateur,
  validerValeurs,
  type OuvrageId,
} from "@/lib/btm/ouvrages";
import { blockKey as keyOf, moveBlockValue, readBlockValue } from "@/lib/chat/block-key";
import { StyledQr } from "./OrderTicket";

const PERSONA = "var(--persona,var(--accent))";
const SAVED_KEY = "btm-devis:";

const blockKey = (el: HTMLElement | null) => keyOf(SAVED_KEY, el, "[data-btm-devis-block]");

type Saved = BtmDevisSaved & { type: OuvrageId };

function savedDevis(key: string): Saved | null {
  try {
    const saved = JSON.parse(readBlockValue(key) ?? "null") as Saved | null;
    return saved?.code ? saved : null;
  } catch {
    return null;
  }
}

type Problem = { reason: string; message: string; email?: string };

/** Devis enregistré : le code de retrait à présenter au fournisseur. */
function SavedDevis({ saved }: { saved: Saved }) {
  return (
    <div className="booking-step p-4">
      <div className="mx-auto max-w-xs overflow-hidden rounded-2xl border border-border bg-bg-subtle">
        <div className="px-4 pt-4 text-center">
          <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">Code de retrait BTM</p>
          <p className="mt-1 font-semibold">{saved.nom.replace(/\s*\(Tamilya\)$/, "")}</p>
          <p className="text-xs text-fg-muted tabular-nums">Matériaux : {formaterEurosDevis(saved.total)}</p>
        </div>
        <div className="mx-auto mt-3 w-44 rounded-xl bg-white p-2">
          <StyledQr text={saved.code} label={`QR code du devis ${saved.code}`} />
        </div>
        <p className="mt-2 pb-4 text-center font-mono text-lg font-bold tracking-widest">{saved.code}</p>
      </div>
      <p className="mt-3 text-center text-xs text-fg-muted">
        Présente ce code chez un fournisseur partenaire de BTM : tu paies le prix BTM, plus bas qu&apos;au comptoir.
      </p>
      <a
        href={`${BTM_SITE}/dashboard`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center text-xs font-semibold hover:underline"
        style={{ color: PERSONA }}
      >
        Comparer les fournisseurs dans « Mes projets » sur btm.yt
      </a>
    </div>
  );
}

/**
 * Devis BTM dans la conversation (bloc ```devis-btm```) : l'ouvrage et les
 * mesures (lus dans le message quand la personne les a donnés), le détail des
 * matériaux aux prix de btm.yt, puis l'enregistrement dans son compte btm.yt,
 * qui donne le code de retrait. Sans compte btm.yt : le devis s'y ouvre tout prêt.
 */
export function BtmDevis({ query = "" }: { query?: string }) {
  const root = useRef<HTMLElement>(null);
  const uid = useId();
  const initial = useMemo(() => parseBtmDevisSpec(query), [query]);
  const [info, setInfo] = useState<BtmDevisInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState<OuvrageId | null>(initial.type);
  const [valeurs, setValeurs] = useState<Record<string, string>>(initial.valeurs);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const savedKey = useRef<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!savedKey.current) return;
    const next = blockKey(root.current);
    moveBlockValue(savedKey.current, next);
    savedKey.current = next;
  }, [pathname]);

  useEffect(() => {
    const previous = savedDevis(blockKey(root.current));
    if (previous) {
      setSaved(previous);
      return;
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
  const check = ouvrage ? validerValeurs(ouvrage, valeurs) : null;
  const resultat = type && info && check?.valide ? calculerDevis(type, valeurs, info.prix) : null;

  const choose = (id: OuvrageId) => {
    setType(id);
    setValeurs({});
    setTouched(false);
    setProblem(null);
  };
  const edit = (nom: string, value: string) => {
    setProblem(null);
    setValeurs((v) => ({ ...v, [nom]: value }));
  };

  async function save() {
    if (!type || !resultat || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch("/api/btm-devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, valeurs }),
      });
      const body = (await res.json().catch(() => null)) as (BtmDevisSaved & { error?: string; reason?: string; email?: string }) | null;
      if (!res.ok || !body?.ok) {
        setProblem({ reason: body?.reason ?? "error", message: body?.error ?? "L'enregistrement a échoué. Réessaie.", email: body?.email });
        return;
      }
      const value: Saved = { ...body, type };
      savedKey.current = blockKey(root.current);
      try {
        localStorage.setItem(savedKey.current, JSON.stringify(value));
      } catch {
        // Stockage plein ou bloqué : le code reste affiché, et il est dans « Mes projets » sur btm.yt.
      }
      setSaved(value);
      boardDone(root.current);
    } catch {
      setProblem({ reason: "error", message: "Connexion impossible : vérifie ton réseau." });
    } finally {
      setSaving(false);
    }
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

  if (saved) return shell(<SavedDevis saved={saved} />);
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
        <div className="h-24 animate-pulse rounded-xl bg-bg-subtle" />
      </div>,
    );
  }

  const header = (
    <div className="flex items-center gap-3 px-4 pt-4">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-subtle text-xl">
        <Pictogram of={ouvrage?.emoji} fallback={WorksIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{ouvrage ? `Devis BTM · ${ouvrage.libelle}` : "Devis BTM"}</p>
        <p className="truncate text-xs text-fg-muted">{ouvrage ? ouvrage.accroche : "Matériaux au meilleur prix à Mayotte"}</p>
      </div>
      {ouvrage ? (
        <button type="button" onClick={() => setType(null)} className="shrink-0 text-xs text-fg-muted hover:text-fg">
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
        <p className="px-4 pt-3 text-xs text-fg-muted">Que veux-tu construire ?</p>
        <ul className="grid grid-cols-2 gap-1.5 p-4 pt-2">
          {info.ouvrages.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => choose(o.id)}
                className="flex w-full items-center gap-2 rounded-xl border border-border px-2.5 py-2 text-left transition hover:bg-bg-muted"
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

  // 2. Mesures, puis détail des matériaux
  const link = lienCalculateur(ouvrage.id, resultat?.dimensions ?? valeurs);
  return shell(
    <>
      {header}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        {ouvrage.champs.map((champ, i) => {
          const error = touched || valeurs[champ.nom] ? check?.erreurs[champ.nom] : undefined;
          const id = `${uid}-${champ.nom}`;
          // Le dernier champ d'une liste impaire prend toute la largeur.
          const wide = champ.type === "choix" || (ouvrage.champs.length % 2 === 1 && i === ouvrage.champs.length - 1);
          return (
            <label key={champ.nom} htmlFor={id} className={wide ? "col-span-2" : ""}>
              <span className="block text-xs text-fg-muted">{champ.label}</span>
              {champ.type === "choix" ? (
                <select
                  id={id}
                  value={valeurs[champ.nom] ?? champ.defaut}
                  onChange={(e) => edit(champ.nom, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2"
                >
                  {champ.options.map((o) => (
                    <option key={o.valeur} value={o.valeur}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`mt-1 flex items-center rounded-xl border bg-bg px-3 ${error ? "border-danger" : "border-border"}`}>
                  <input
                    id={id}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={champ.exemple}
                    value={valeurs[champ.nom] ?? ""}
                    onChange={(e) => edit(champ.nom, e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={Boolean(error)}
                    className="w-full min-w-0 bg-transparent py-2 tabular-nums outline-none"
                  />
                  <span className="shrink-0 text-xs text-fg-muted">{champ.unite}</span>
                </span>
              )}
              {error ? (
                <span className="mt-0.5 block text-[11px] text-danger">{error}</span>
              ) : champ.type === "nombre" && champ.aide ? (
                <span className="mt-0.5 block text-[11px] text-fg-muted">{champ.aide}</span>
              ) : null}
            </label>
          );
        })}
      </div>

      {resultat ? (
        <div className="booking-step px-4 pt-3">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {resultat.lignes.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{l.libelle}</span>
                  <span className="block text-xs text-fg-muted tabular-nums">{formaterQuantite(l.quantite, l.unite)}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formaterEurosDevis(l.sousTotal)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 bg-bg-subtle px-3 py-2 font-semibold">
              <span>Total des matériaux</span>
              <span className="tabular-nums">{formaterEurosDevis(resultat.total)}</span>
            </li>
          </ul>
          <p className="mt-1.5 text-[11px] text-fg-muted">
            Prix moyens de btm.yt{info.prix.source === "local" ? " (indicatifs)" : ""}. Le prix exact de chaque fournisseur s&apos;affiche dans ton devis sur btm.yt.
          </p>
        </div>
      ) : (
        <p className="px-4 pt-3 text-xs text-fg-muted">Donne les mesures : le détail des matériaux s&apos;affiche tout de suite.</p>
      )}

      <div className="p-4 pt-3">
        {problem ? (
          <div role="alert" className="mb-2 rounded-xl bg-bg-subtle px-3 py-2 text-center text-xs">
            <p className={problem.reason === "no_account" ? "" : "text-danger"}>
              {problem.reason === "no_account"
                ? `Aucun compte btm.yt avec ton adresse ${problem.email ?? "e-mail"}. Ouvre ton devis sur btm.yt, crée ton compte gratuit avec cette adresse, puis enregistre-le : tu recevras ton code.`
                : problem.message}
            </p>
          </div>
        ) : null}
        {info.signedIn && info.canSave && problem?.reason !== "no_account" ? (
          <button
            type="button"
            data-voice-finger
            onClick={() => void save()}
            disabled={!resultat || saving}
            className="flex w-full items-center justify-between gap-3 rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-45"
            style={{ background: PERSONA }}
          >
            <span className="truncate">{saving ? "Enregistrement…" : "Recevoir mon code de retrait"}</span>
            {resultat ? <span className="shrink-0 tabular-nums">{formaterEurosDevis(resultat.total)}</span> : null}
          </button>
        ) : (
          <a
            href={resultat ? link : `${BTM_SITE}/calculateur?type=${ouvrage.id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!resultat}
            className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110 ${resultat ? "" : "pointer-events-none opacity-45"}`}
            style={{ background: PERSONA }}
          >
            Ouvrir mon devis sur btm.yt
          </a>
        )}
        <p className="mt-2 text-center text-[11px] text-fg-muted">
          {info.signedIn && info.canSave
            ? "Enregistré dans « Mes projets » de ton compte btm.yt (même adresse e-mail)."
            : info.signedIn
              ? "Enregistre-le sur btm.yt (compte gratuit) pour recevoir ton code de retrait."
              : "Connecte-toi à BTM AI pour recevoir ton code ici, ou enregistre-le sur btm.yt."}
        </p>
      </div>
    </>,
  );
}
