"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose, IconHelp, IconLock, IconMessage, IconPlus, IconWallet } from "@/components/ui/icons";
import {
  formatEuros,
  parseEuros,
  topupError,
  WALLET_MAX_BALANCE,
  WALLET_MAX_TOPUP,
  WALLET_MIN_TOPUP,
  WALLET_PRESETS,
  type WalletTransaction,
} from "@/lib/wallet/limits";

type Notice = "paid" | "pending" | "failed" | "cancelled" | null;
type Filter = "all" | "topup" | "spent";

const NOTICES: Record<Exclude<Notice, null>, { tone: string; text: string }> = {
  paid: { tone: "border-success/30 bg-success-soft text-success", text: "Recharge réussie : ton solde est à jour." },
  pending: { tone: "border-warning/30 bg-warning-soft text-warning", text: "Paiement en cours de validation : ton solde sera crédité dans quelques minutes." },
  failed: { tone: "border-danger/30 bg-danger-soft text-danger", text: "Le paiement n'a pas abouti : rien n'a été débité." },
  cancelled: { tone: "border-border bg-bg-subtle text-fg-muted", text: "Recharge annulée : rien n'a été débité." },
};

const STATUS: Record<WalletTransaction["status"], string> = { pending: "En attente", succeeded: "", failed: "Échouée" };

const TZ = "Indian/Mayotte";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const monthKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: TZ });
const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const METHODS = ["Carte bancaire", "Apple Pay", "Google Pay", "PayPal"];

/** « Aujourd'hui », « Hier » ou « Lundi 10 novembre ». */
function dayTitle(key: string) {
  const today = dayKey.format(new Date());
  const yesterday = dayKey.format(new Date(Date.now() - 86_400_000));
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return "Hier";
  const text = dayLabel.format(new Date(`${key}T12:00:00+03:00`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Montant en grand, les centimes plus discrets (« 42,50 € »). */
function BigAmount({ cents, className = "" }: { cents: number; className?: string }) {
  const [whole, decimals] = formatEuros(cents).replace(/\s?€$/, "").split(",");
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="text-[2.75rem] leading-none font-semibold tracking-tight">{whole}</span>
      <span className="text-xl font-semibold text-fg-muted">
        {decimals ? `,${decimals}` : ""} €
      </span>
    </span>
  );
}


/** Panneau qui monte du bas (téléphone) ou fenêtre centrée (ordinateur), fond flouté. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="auth-sheet mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none scrollbar-none overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-bg p-0 pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl sm:border sm:pb-0"
    >
      <div className="p-5 sm:p-6">
        {/* Poignée du panneau, sur téléphone */}
        <div aria-hidden="true" className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Fermer"
            className="-mr-2 grid size-9 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Portefeuille : à gauche le solde, le plafond et les actions ; à droite
 * l'activité, groupée par jour. Sobre, comme une application bancaire. La
 * recharge s'ouvre dans un panneau ; le paiement se fait sur la page sécurisée
 * de Stripe (en démonstration, l'argent fictif est ajouté tout de suite).
 */
export function WalletView({
  balanceCents,
  transactions,
  paymentsOpen,
  demo = false,
  notice,
}: {
  balanceCents: number;
  transactions: WalletTransaction[];
  paymentsOpen: boolean;
  /** Mode démo : solde fictif, « Recharger » crédite tout de suite, sans carte. */
  demo?: boolean;
  notice: Notice;
}) {
  const router = useRouter();
  const [topup, setTopup] = useState(false);
  const [amount, setAmount] = useState<number>(WALLET_PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [shownNotice, setShownNotice] = useState(notice);

  // L'adresse de retour (?recharge=…) est nettoyée : un rechargement de page ne la rejoue pas.
  useEffect(() => {
    if (notice) router.replace("/portefeuille", { scroll: false });
  }, [notice, router]);

  const room = Math.max(0, WALLET_MAX_BALANCE - balanceCents);
  const usedPercent = Math.min(100, (balanceCents / WALLET_MAX_BALANCE) * 100);
  const chosen = custom ? parseEuros(custom) : amount;
  const problem = chosen === null ? "Montant illisible." : topupError(chosen, balanceCents);

  // Résumé du mois en cours (opérations réussies).
  const thisMonth = monthKey.format(new Date());
  const month = transactions.filter((t) => t.status === "succeeded" && monthKey.format(new Date(t.createdAt)) === thisMonth);
  const addedCents = month.filter((t) => t.kind !== "payment").reduce((sum, t) => sum + t.amountCents, 0);
  const spentCents = month.filter((t) => t.kind === "payment").reduce((sum, t) => sum + t.amountCents, 0);

  const shown = transactions.filter((t) => (filter === "all" ? true : filter === "topup" ? t.kind !== "payment" : t.kind === "payment"));
  // Opérations groupées par jour (heure de Mayotte), les plus récentes d'abord.
  const days = new Map<string, WalletTransaction[]>();
  for (const t of shown) {
    const key = dayKey.format(new Date(t.createdAt));
    days.set(key, [...(days.get(key) ?? []), t]);
  }

  const openTopup = () => {
    setError(null);
    setTopup(true);
  };

  async function pay() {
    if (chosen === null || problem) return setError(problem);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: chosen }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; demo?: boolean; error?: string } | null;
      if (res.ok && data?.demo) {
        // Démonstration : solde crédité tout de suite, la page relit le solde et les opérations.
        setTopup(false);
        setShownNotice("paid");
        setCustom("");
        setPending(false);
        router.refresh();
        return;
      }
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Le paiement n'a pas pu démarrer.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le paiement n'a pas pu démarrer.");
      setPending(false);
    }
  }

  return (
    // Seule cette colonne défile.
    <div className="md:-mx-4 md:-my-8 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:px-4 md:py-8">
      <div className="mx-auto grid w-full max-w-5xl gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        {/* Colonne gauche : solde et actions */}
        <div className="space-y-5 lg:sticky lg:top-0">
          <section aria-label="Solde" className="rounded-3xl border border-border bg-bg p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
                <IconWallet width={16} height={16} /> Solde disponible
              </p>
              {demo ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">Démo</span> : null}
            </div>
            <p className="mt-4">
              <BigAmount cents={balanceCents} />
            </p>

            {/* Plafond : jauge fine */}
            <div className="mt-6">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-bg-muted"
                role="meter"
                aria-label="Solde par rapport au plafond"
                aria-valuemin={0}
                aria-valuemax={WALLET_MAX_BALANCE}
                aria-valuenow={balanceCents}
              >
                <div className="h-full rounded-full bg-fg transition-[width] duration-500" style={{ width: `${usedPercent}%` }} />
              </div>
              <p className="mt-2 flex justify-between text-xs text-fg-muted">
                <span>Encore {formatEuros(room)} possible</span>
                <span>Plafond {formatEuros(WALLET_MAX_BALANCE)}</span>
              </p>
            </div>

            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={openTopup}
                disabled={room < WALLET_MIN_TOPUP}
                className="flex items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3 text-sm font-semibold text-bg transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconPlus width={16} height={16} /> Recharger mon portefeuille
              </button>
              <Link
                href="/"
                className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-bg-muted"
              >
                <IconMessage width={16} height={16} /> Payer avec Tamilya
              </Link>
            </div>
            {room < WALLET_MIN_TOPUP ? <p className="mt-2 text-center text-xs text-fg-muted">Ton solde est au plafond.</p> : null}
          </section>

          {/* Bon à savoir : discret, ouvert seulement à la demande. */}
          <details className="group px-1 text-xs text-fg-muted">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md py-1 hover:text-fg [&::-webkit-details-marker]:hidden">
              <IconHelp width={14} height={14} />
              Comment ça marche ?
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="mt-2 space-y-1.5 border-l border-border pl-3 leading-relaxed">
              <li>Il sert à payer tes réservations et commandes faites avec Tamilya, en un geste.</li>
              <li>Plafond de {formatEuros(WALLET_MAX_BALANCE)} : en cas de vol de ton compte, la perte reste limitée.</li>
              <li>{demo ? "Démonstration : l'argent est fictif, aucune carte n'est demandée." : "Paiement par Stripe : ta carte n'est jamais enregistrée chez BTM."}</li>
            </ul>
          </details>
        </div>

        {/* Colonne droite : activité */}
        <div className="space-y-4">
          {shownNotice ? (
            <p role="status" className={`booking-step flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${NOTICES[shownNotice].tone}`}>
              <span className="flex-1">{NOTICES[shownNotice].text}</span>
              <button type="button" onClick={() => setShownNotice(null)} aria-label="Masquer" className="opacity-70 hover:opacity-100">
                ✕
              </button>
            </p>
          ) : null}

          <section aria-labelledby="operations" className="rounded-3xl border border-border bg-bg shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 id="operations" className="font-semibold">
                  Activité
                </h2>
                <p className="text-xs text-fg-muted">
                  Ce mois-ci : <span className="font-medium text-success">+{formatEuros(addedCents)}</span> rechargés ·{" "}
                  <span className="font-medium text-fg">−{formatEuros(spentCents)}</span> dépensés
                </p>
              </div>
              {/* Contrôle segmenté */}
              <div role="tablist" aria-label="Filtrer les opérations" className="flex rounded-xl bg-bg-muted p-1 text-xs font-medium">
                {(
                  [
                    ["all", "Tout"],
                    ["topup", "Recharges"],
                    ["spent", "Dépenses"],
                  ] as const
                ).map(([id, text]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-lg px-3 py-1.5 transition ${filter === id ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {days.size ? (
              <div className="px-2 pb-2">
                {[...days.entries()].map(([key, list]) => (
                  <div key={key}>
                    <p className="px-3 pt-4 pb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{dayTitle(key)}</p>
                    <ul>
                      {list.map((t) => {
                        const out = t.kind === "payment";
                        const failed = t.status === "failed";
                        return (
                          <li key={t.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-bg-subtle">
                            <span
                              aria-hidden="true"
                              className={`grid size-9 shrink-0 place-items-center rounded-full text-sm ${
                                failed ? "bg-bg-muted text-fg-muted" : out ? "bg-bg-muted text-fg" : "bg-success-soft text-success"
                              }`}
                            >
                              {out ? "↗" : "↙"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{t.label}</span>
                              <span className="block truncate text-xs text-fg-muted">
                                {[clock.format(new Date(t.createdAt)), t.method].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="text-right">
                              <span
                                className={`block text-sm font-semibold tabular-nums ${failed ? "text-fg-muted line-through" : out ? "" : "text-success"}`}
                              >
                                {out ? "−" : "+"}
                                {formatEuros(t.amountCents)}
                              </span>
                              {STATUS[t.status] ? (
                                <span
                                  className={`inline-block rounded-full px-1.5 text-[10px] font-medium ${
                                    t.status === "pending" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"
                                  }`}
                                >
                                  {STATUS[t.status]}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto grid size-11 place-items-center rounded-xl bg-bg-muted text-fg-muted">
                  <IconWallet />
                </span>
                <p className="mt-3 font-medium">{filter === "all" ? "Aucune opération pour l'instant" : "Rien dans cette catégorie"}</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-fg-muted">Tes recharges et tes paiements apparaîtront ici.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Recharge : montant en grand, montants rapides, paiement */}
      {topup ? (
        <Sheet title="Recharger mon portefeuille" onClose={() => setTopup(false)}>
          <p className="mt-6 text-center">
            {chosen !== null && chosen > 0 ? <BigAmount cents={chosen} /> : <span className="text-[2.75rem] font-semibold text-fg-muted">0 €</span>}
          </p>
          <p className="mt-2 text-center text-xs text-fg-muted">
            De {formatEuros(WALLET_MIN_TOPUP)} à {formatEuros(Math.min(WALLET_MAX_TOPUP, room))}
          </p>

          <div className="mt-6 grid grid-cols-5 gap-1.5">
            {WALLET_PRESETS.map((preset) => {
              const selected = !custom && amount === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={preset > room}
                  onClick={() => {
                    setAmount(preset);
                    setCustom("");
                    setError(null);
                  }}
                  aria-pressed={selected}
                  className={`rounded-xl border py-2.5 text-sm font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected ? "border-fg bg-fg text-bg" : "border-border hover:bg-bg-muted"
                  }`}
                >
                  {formatEuros(preset)}
                </button>
              );
            })}
          </div>
          <label className={`mt-3 flex items-center rounded-xl border px-4 transition focus-within:border-fg ${custom ? "border-fg" : "border-border"}`}>
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setError(null);
              }}
              placeholder="Autre montant"
              aria-label="Autre montant en euros"
              className="w-full min-w-0 bg-transparent py-2.5 text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-fg-muted"
            />
            <span className="text-fg-muted">€</span>
          </label>

          <button
            type="button"
            onClick={pay}
            disabled={!paymentsOpen || pending || Boolean(problem)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-fg px-4 py-3.5 text-base font-semibold text-bg transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {demo ? <IconPlus width={16} height={16} /> : <IconLock width={16} height={16} />}
            {demo
              ? pending
                ? "Recharge…"
                : chosen && !problem
                  ? `Recharger ${formatEuros(chosen)}`
                  : "Recharger"
              : pending
                ? "Ouverture du paiement…"
                : chosen && !problem
                  ? `Payer ${formatEuros(chosen)}`
                  : "Payer"}
          </button>
          {error || (custom && problem) ? (
            <p role="alert" className="booking-shake mt-2 text-center text-sm text-danger">
              {error ?? problem}
            </p>
          ) : null}
          {!paymentsOpen ? <p className="mt-2 text-center text-sm text-fg-muted">Le paiement en ligne ouvre bientôt.</p> : null}
          <p className="mt-4 text-center text-[11px] text-fg-muted">
            {demo ? "Démonstration : argent fictif, aucune carte demandée." : `${METHODS.join(" · ")} · sécurisé par Stripe`}
          </p>
        </Sheet>
      ) : null}
    </div>
  );
}
