"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconLock, IconWallet } from "@/components/ui/icons";
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

const STATUS: Record<WalletTransaction["status"], string> = {
  pending: "En attente",
  succeeded: "",
  failed: "Échouée",
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Indian/Mayotte",
});

const METHODS = ["Carte bancaire", "Apple Pay", "Google Pay", "PayPal"];

/**
 * Portefeuille en un écran : solde et recharge à gauche, historique à droite
 * (seule la liste défile). Le paiement se fait sur la page sécurisée de Stripe.
 */
export function WalletView({
  balanceCents,
  transactions,
  paymentsOpen,
  notice,
}: {
  balanceCents: number;
  transactions: WalletTransaction[];
  paymentsOpen: boolean;
  notice: Notice;
}) {
  const router = useRouter();
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
  const fill = Math.min(100, (balanceCents / WALLET_MAX_BALANCE) * 100);

  const totalIn = transactions
    .filter((t) => t.status === "succeeded" && t.kind !== "payment")
    .reduce((s, t) => s + t.amountCents, 0);
  const totalOut = transactions
    .filter((t) => t.status === "succeeded" && t.kind === "payment")
    .reduce((s, t) => s + t.amountCents, 0);
  const shown = transactions.filter((t) =>
    filter === "all" ? true : filter === "topup" ? t.kind !== "payment" : t.kind === "payment",
  );

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
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Le paiement n'a pas pu démarrer.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le paiement n'a pas pu démarrer.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-visible">
      <div className="flex min-h-0 flex-col gap-4">
        {shownNotice ? (
          <p role="status" className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${NOTICES[shownNotice].tone}`}>
            <span className="flex-1">{NOTICES[shownNotice].text}</span>
            <button type="button" onClick={() => setShownNotice(null)} aria-label="Masquer" className="opacity-70 hover:opacity-100">
              ✕
            </button>
          </p>
        ) : null}

        {/* Carte du solde */}
        <section
          aria-label="Solde"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-hover p-5 text-accent-fg shadow-lg"
        >
          <div aria-hidden="true" className="absolute -top-16 -right-10 size-48 rounded-full bg-white/10" />
          <div aria-hidden="true" className="absolute -bottom-20 -left-8 size-40 rounded-full bg-white/5" />
          <div className="relative">
            <p className="flex items-center gap-2 text-sm opacity-90">
              <IconWallet width={16} height={16} /> Mon solde
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{formatEuros(balanceCents)}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${fill}%` }} />
            </div>
            <p className="mt-1.5 text-xs opacity-80">
              Plafond {formatEuros(WALLET_MAX_BALANCE)} · encore {formatEuros(room)} possible
            </p>
          </div>
        </section>

        {/* Recharge */}
        <section aria-labelledby="recharger" className="rounded-3xl border border-border bg-bg p-5">
          <h2 id="recharger" className="font-semibold">
            Ajouter de l&apos;argent
          </h2>
          <p className="text-xs text-fg-muted">
            De {formatEuros(WALLET_MIN_TOPUP)} à {formatEuros(WALLET_MAX_TOPUP)}, pour payer réservations et services partenaires.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {WALLET_PRESETS.map((preset) => {
              const selected = !custom && amount === preset;
              const blocked = preset > room;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setAmount(preset);
                    setCustom("");
                    setError(null);
                  }}
                  aria-pressed={selected}
                  className={`rounded-xl border py-2.5 text-sm font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-accent/40 hover:bg-bg-muted"
                  }`}
                >
                  {formatEuros(preset)}
                </button>
              );
            })}
            <label
              className={`flex items-center rounded-xl border px-2.5 text-sm transition focus-within:border-accent ${
                custom ? "border-accent bg-accent-soft" : "border-border"
              }`}
            >
              <input
                inputMode="decimal"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setError(null);
                }}
                placeholder="Autre"
                aria-label="Autre montant en euros"
                className="w-full min-w-0 bg-transparent py-2.5 font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-fg-muted"
              />
              <span className="text-fg-muted">€</span>
            </label>
          </div>

          <button
            type="button"
            onClick={pay}
            disabled={!paymentsOpen || pending || Boolean(problem)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconLock width={16} height={16} />
            {pending ? "Ouverture du paiement…" : chosen && !problem ? `Payer ${formatEuros(chosen)}` : "Payer"}
          </button>
          {error || (custom && problem) ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error ?? problem}
            </p>
          ) : null}
          {!paymentsOpen ? (
            <p className="mt-2 text-sm text-fg-muted">Le paiement en ligne ouvre bientôt.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <span key={m} className="rounded-full bg-bg-muted px-2.5 py-1 text-[11px] font-medium text-fg-muted">
                {m}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
            Paiement sécurisé par Stripe. Ta carte n&apos;est jamais enregistrée chez BTM : seul ton solde l&apos;est,
            plafonné à {formatEuros(WALLET_MAX_BALANCE)}.
          </p>
        </section>
      </div>

      {/* Historique */}
      <section
        aria-labelledby="historique"
        className="flex min-h-[60dvh] flex-col overflow-hidden rounded-3xl border border-border bg-bg md:min-h-0"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="mr-auto">
            <h2 id="historique" className="font-semibold">
              Historique
            </h2>
            <p className="text-xs text-fg-muted">
              <span className="text-success">+{formatEuros(totalIn)}</span> ajoutés ·{" "}
              <span>−{formatEuros(totalOut)}</span> dépensés
            </p>
          </div>
          <div role="tablist" aria-label="Filtrer l'historique" className="flex rounded-full bg-bg-muted p-1 text-xs font-medium">
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
                className={`rounded-full px-3 py-1 transition ${filter === id ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          {shown.length ? (
            <ul className="divide-y divide-border">
              {shown.map((t) => {
                const out = t.kind === "payment";
                const failed = t.status === "failed";
                return (
                  <li key={t.id} className="flex items-center gap-3 px-2 py-3">
                    <span
                      aria-hidden="true"
                      className={`grid size-9 shrink-0 place-items-center rounded-full text-base font-semibold ${
                        failed ? "bg-bg-muted text-fg-muted" : out ? "bg-bg-muted text-fg" : "bg-success-soft text-success"
                      }`}
                    >
                      {out ? "−" : "+"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.label}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {[dateFormat.format(new Date(t.createdAt)), t.method].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span
                        className={`block text-sm font-semibold tabular-nums ${
                          failed ? "text-fg-muted line-through" : out ? "" : "text-success"
                        }`}
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
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <IconWallet />
                </span>
                <p className="mt-3 font-medium">Aucune opération pour l&apos;instant</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-fg-muted">
                  Tes recharges, paiements et remboursements apparaîtront ici.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
