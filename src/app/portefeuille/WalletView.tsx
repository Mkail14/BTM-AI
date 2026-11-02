"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { IconClose, IconLock, IconMessage, IconPlus, IconShield, IconWallet } from "@/components/ui/icons";
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
  paid: { tone: "bg-success-soft text-success", text: "Recharge réussie : ton solde est à jour." },
  pending: { tone: "bg-warning-soft text-warning", text: "Paiement en cours de validation : ton solde sera crédité dans quelques minutes." },
  failed: { tone: "bg-danger-soft text-danger", text: "Le paiement n'a pas abouti : rien n'a été débité." },
  cancelled: { tone: "bg-bg-muted text-fg-muted", text: "Recharge annulée : rien n'a été débité." },
};

const STATUS: Record<WalletTransaction["status"], string> = { pending: "En attente", succeeded: "", failed: "Échouée" };

const TZ = "Indian/Mayotte";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
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

/** Solde en grand, les centimes plus petits (« 42,50 € »). */
function BigAmount({ cents }: { cents: number }) {
  const [whole, decimals] = formatEuros(cents).replace(/\s?€$/, "").split(",");
  return (
    <span className="tabular-nums">
      <span className="text-5xl font-semibold tracking-tight">{whole}</span>
      <span className="text-2xl font-semibold opacity-80">{decimals ? `,${decimals}` : ""} €</span>
    </span>
  );
}

/** Bouton rond sous le solde, avec son libellé dessous (comme les actions d'une appli bancaire). */
function Action({
  icon: Icon,
  label,
  onClick,
  href,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const circle = (
    <span className="grid size-12 place-items-center rounded-full bg-white/20 backdrop-blur transition group-hover:bg-white/30 group-active:scale-95">
      <Icon width={20} height={20} />
    </span>
  );
  const className = "group flex flex-col items-center gap-1.5 text-xs font-medium";
  return href ? (
    <Link href={href} className={className}>
      {circle}
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {circle}
      {label}
    </button>
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
      className="auth-sheet mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none scrollbar-none overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-bg p-0 pb-[env(safe-area-inset-bottom)] text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-md sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl sm:border sm:pb-0"
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
 * Portefeuille, pensé pour le téléphone comme une appli bancaire : le solde en
 * grand sur la couleur du site, trois actions rondes, puis les opérations
 * groupées par jour. La recharge s'ouvre dans un panneau ; le paiement se fait
 * sur la page sécurisée de Stripe.
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
  /** Mode démo : solde fictif, « Ajouter » crédite tout de suite, sans carte. */
  demo?: boolean;
  notice: Notice;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"topup" | "info" | null>(null);
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
  const chosen = custom ? parseEuros(custom) : amount;
  const problem = chosen === null ? "Montant illisible." : topupError(chosen, balanceCents);

  const shown = transactions.filter((t) =>
    filter === "all" ? true : filter === "topup" ? t.kind !== "payment" : t.kind === "payment",
  );
  // Opérations groupées par jour (heure de Mayotte), les plus récentes d'abord.
  const days = new Map<string, WalletTransaction[]>();
  for (const t of shown) {
    const key = dayKey.format(new Date(t.createdAt));
    days.set(key, [...(days.get(key) ?? []), t]);
  }

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
        setSheet(null);
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
    // Seule cette colonne défile ; centrée et étroite sur ordinateur, comme une appli.
    <div className="-mx-4 -my-5 min-h-0 flex-1 overflow-y-auto overscroll-contain md:-my-8">
      <div className="mx-auto w-full max-w-lg pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Solde, en grand sur la couleur du site */}
        <section
          aria-label="Solde"
          className="relative overflow-hidden bg-gradient-to-b from-accent to-accent-hover px-5 pt-8 pb-6 text-center text-accent-fg sm:mt-6 sm:rounded-3xl"
        >
          <div aria-hidden="true" className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <p className="text-sm font-medium opacity-85">Portefeuille · Euro{demo ? " · démo" : ""}</p>
            <p className="mt-2">
              <BigAmount cents={balanceCents} />
            </p>
            <p className="mt-2 text-xs opacity-75">
              Encore {formatEuros(room)} possible · plafond {formatEuros(WALLET_MAX_BALANCE)}
            </p>

            <div className="mx-auto mt-7 flex max-w-xs justify-around">
              <Action
                icon={IconPlus}
                label="Ajouter"
                onClick={() => {
                  setError(null);
                  setSheet("topup");
                }}
              />
              <Action icon={IconMessage} label="Utiliser" href="/" />
              <Action icon={IconShield} label="Infos" onClick={() => setSheet("info")} />
            </div>
          </div>
        </section>

        <div className="space-y-4 px-4 pt-4">
          {shownNotice ? (
            <p role="status" className={`booking-step flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${NOTICES[shownNotice].tone}`}>
              <span className="flex-1">{NOTICES[shownNotice].text}</span>
              <button type="button" onClick={() => setShownNotice(null)} aria-label="Masquer" className="opacity-70 hover:opacity-100">
                ✕
              </button>
            </p>
          ) : null}

          {/* Opérations */}
          <section aria-labelledby="operations" className="rounded-3xl bg-bg p-2 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
              <h2 id="operations" className="font-semibold">
                Opérations
              </h2>
              <div role="tablist" aria-label="Filtrer les opérations" className="flex gap-1 text-xs font-medium">
                {(
                  [
                    ["all", "Tout"],
                    ["topup", "Ajouts"],
                    ["spent", "Dépenses"],
                  ] as const
                ).map(([id, text]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-full px-3 py-1.5 transition ${filter === id ? "bg-fg text-bg" : "text-fg-muted hover:bg-bg-muted"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {days.size ? (
              [...days.entries()].map(([key, list]) => (
                <div key={key}>
                  <p className="px-3 pt-3 pb-1 text-xs font-medium text-fg-muted">{dayTitle(key)}</p>
                  <ul>
                    {list.map((t) => {
                      const out = t.kind === "payment";
                      const failed = t.status === "failed";
                      return (
                        <li key={t.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-bg-subtle">
                          <span
                            aria-hidden="true"
                            className={`grid size-10 shrink-0 place-items-center rounded-full text-lg font-semibold ${
                              failed ? "bg-bg-muted text-fg-muted" : out ? "bg-bg-muted text-fg" : "bg-success-soft text-success"
                            }`}
                          >
                            {out ? "↗" : "+"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{t.label}</span>
                            <span className="block truncate text-xs text-fg-muted">
                              {[clock.format(new Date(t.createdAt)), t.method].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="text-right">
                            <span
                              className={`block font-semibold tabular-nums ${failed ? "text-fg-muted line-through" : out ? "" : "text-success"}`}
                            >
                              {out ? "−" : "+"}
                              {formatEuros(t.amountCents)}
                            </span>
                            {STATUS[t.status] ? (
                              <span className={`text-[11px] ${t.status === "pending" ? "text-warning" : "text-danger"}`}>
                                {STATUS[t.status]}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            ) : (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <IconWallet />
                </span>
                <p className="mt-3 font-medium">Aucune opération pour l&apos;instant</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-fg-muted">Ajoute de l&apos;argent pour payer tes réservations et commandes avec Awa.</p>
                <button
                  type="button"
                  onClick={() => setSheet("topup")}
                  className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
                >
                  Ajouter de l&apos;argent
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Recharge : montant en grand, montants rapides, paiement Stripe */}
      {sheet === "topup" ? (
        <Sheet title="Ajouter de l'argent" onClose={() => setSheet(null)}>
          <p className="mt-6 text-center">
            {chosen !== null && chosen > 0 ? <BigAmount cents={chosen} /> : <span className="text-5xl font-semibold text-fg-muted">0 €</span>}
          </p>
          <p className="mt-1 text-center text-xs text-fg-muted">
            De {formatEuros(WALLET_MIN_TOPUP)} à {formatEuros(Math.min(WALLET_MAX_TOPUP, room))}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
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
                  className={`rounded-full border px-4 py-2 text-sm font-semibold tabular-nums transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected ? "border-transparent bg-fg text-bg" : "border-border hover:bg-bg-muted"
                  }`}
                >
                  {formatEuros(preset)}
                </button>
              );
            })}
          </div>
          <label
            className={`mx-auto mt-3 flex max-w-48 items-center rounded-full border px-4 transition focus-within:border-accent ${
              custom ? "border-accent" : "border-border"
            }`}
          >
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setError(null);
              }}
              placeholder="Autre montant"
              aria-label="Autre montant en euros"
              className="w-full min-w-0 bg-transparent py-2 text-center text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-fg-muted"
            />
            <span className="text-fg-muted">€</span>
          </label>

          <button
            type="button"
            onClick={pay}
            disabled={!paymentsOpen || pending || Boolean(problem)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3.5 text-base font-semibold text-accent-fg transition hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {demo ? <IconPlus width={16} height={16} /> : <IconLock width={16} height={16} />}
            {demo
              ? pending
                ? "Ajout…"
                : chosen && !problem
                  ? `Ajouter ${formatEuros(chosen)}`
                  : "Ajouter"
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

      {/* Infos : plafonds et sécurité */}
      {sheet === "info" ? (
        <Sheet title="Ton portefeuille" onClose={() => setSheet(null)}>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              ["À quoi il sert", "Payer tes réservations et commandes faites avec Awa, en un geste."],
              ["Plafond", `Ton solde ne dépasse jamais ${formatEuros(WALLET_MAX_BALANCE)} : en cas de vol de ton compte, la perte reste limitée.`],
              ["Recharges", `De ${formatEuros(WALLET_MIN_TOPUP)} à ${formatEuros(WALLET_MAX_TOPUP)} par carte, Apple Pay, Google Pay ou PayPal.`],
              ["Sécurité", "Le paiement se fait sur la page de Stripe : ta carte n'est jamais enregistrée chez BTM."],
            ].map(([title, text]) => (
              <li key={title} className="rounded-2xl bg-bg-subtle px-4 py-3">
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-fg-muted">{text}</p>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
    </div>
  );
}
