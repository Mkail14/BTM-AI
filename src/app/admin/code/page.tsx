import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/auth/session";
import { EXAM_TYPES } from "@/lib/code-exam/candidate";
import { LAPOSTE_SEARCH_URL } from "@/lib/code-exam/laposte";
import { CODE_EXAM_FEE_CENTS, codeExamPartnerReady, type CodeExamRequestRow } from "@/lib/code-exam/partner";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatEuros } from "@/lib/wallet/limits";
import { LaPosteCheck } from "./LaPosteCheck";
import { RequestActions } from "./RequestActions";

export const metadata: Metadata = { title: "Code de la route", robots: { index: false, follow: false } };

/*
 * Demandes de réservation de l'examen du code, faites depuis la conversation.
 * Aujourd'hui : traitées à la main (place réservée sur le site de La Poste,
 * puis « Marquer réservée »). Avec le partenariat La Poste : réservation,
 * débit du portefeuille et convocation automatiques (src/lib/code-exam/partner.ts).
 */

const TZ = "Indian/Mayotte";
const slotFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const birthFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

const TABS = [
  { id: "pending", label: "À traiter" },
  { id: "booked", label: "Réservées" },
  { id: "cancelled", label: "Annulées" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const phone = (p: string) => p.replace(/(\d{2})(?=\d)/g, "$1 ");

/** Étape de l'automatisation à venir : « Bientôt » tant que le partenariat n'est pas branché. */
function Step({ n, title, detail, done }: { n: number; title: string; detail: string; done: boolean | null }) {
  return (
    <li className="flex gap-3">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
          done ? "bg-success-soft text-success" : "border border-dashed border-border text-fg-muted"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {done === null ? <span className="rounded-full bg-bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted">Bientôt</span> : null}
        </span>
        <span className="block text-xs text-fg-muted">{detail}</span>
      </span>
    </li>
  );
}

export default async function AdminCodeExamPage({ searchParams }: PageProps<"/admin/code">) {
  const { user } = await requireAdmin("/admin/code");
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.id === params.statut)?.id ?? "pending";
  const ready = codeExamPartnerReady();

  const admin = getSupabaseAdminClient();
  // « * » : la page marche avant comme après la migration 20261115000000 (colonnes de suivi).
  const [list, counts] = admin
    ? await Promise.all([
        admin.from("code_exam_requests").select("*").eq("status", tab).order("starts_at", { ascending: true }).limit(100),
        Promise.all(TABS.map((t) => admin.from("code_exam_requests").select("id", { count: "exact", head: true }).eq("status", t.id))),
      ])
    : [null, null];
  const requests = (list?.data ?? []) as CodeExamRequestRow[];
  const count = (id: Tab) => counts?.[TABS.findIndex((t) => t.id === id)]?.count ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Code de la route" email={user.email} />

      <main id="contenu" className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Code de la route</h1>
            <p className="mt-1 text-sm text-fg-muted">Demandes de réservation de l&apos;examen faites avec Awa.</p>
          </div>
          <a href={LAPOSTE_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border bg-bg px-3.5 py-2 text-sm font-medium hover:bg-bg-muted">
            Site de La Poste ↗
          </a>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section className="space-y-3">
            <nav aria-label="Statut des demandes" className="flex w-fit rounded-xl bg-bg-muted p-1 text-sm font-medium">
              {TABS.map((t) => (
                <Link
                  key={t.id}
                  href={t.id === "pending" ? "/admin/code" : `/admin/code?statut=${t.id}`}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${tab === t.id ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                >
                  {t.label}
                  <span className="rounded-full bg-bg-subtle px-1.5 text-[11px] tabular-nums">{count(t.id)}</span>
                </Link>
              ))}
            </nav>

            {!admin ? (
              <p className="rounded-2xl border border-border bg-bg p-5 text-sm text-danger">SUPABASE_SECRET_KEY manquante : demandes illisibles.</p>
            ) : requests.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-bg px-5 py-12 text-center text-sm text-fg-muted">Aucune demande ici.</p>
            ) : (
              <ul className="space-y-3">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-border bg-bg p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {r.civility} {r.first_name} {r.last_name.toUpperCase()}
                        </p>
                        <p className="text-sm text-fg-muted">
                          {EXAM_TYPES[r.exam_type as keyof typeof EXAM_TYPES] ?? r.exam_type} · {r.center_name}
                        </p>
                      </div>
                      <p className="rounded-xl bg-bg-subtle px-3 py-1.5 text-sm font-medium first-letter:uppercase">{slotFormat.format(new Date(r.starts_at))}</p>
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        ["NEPH", r.neph],
                        ["Né(e) le", birthFormat.format(new Date(r.birth_date))],
                        ["Ville", r.city],
                        ["Téléphone", phone(r.phone)],
                        ["E-mail", r.email],
                        ["SNU", r.snu ? "Oui" : "Non"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="shrink-0 text-fg-muted">{label}</dt>
                          <dd className="min-w-0 truncate font-medium select-all">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <p className="text-xs text-fg-muted">
                        Demandée le {shortDate.format(new Date(r.created_at))}
                        {r.paid_at ? ` · payée le ${shortDate.format(new Date(r.paid_at))}` : ""}
                        {r.convocation_sent_at ? " · convocation envoyée" : ""}
                      </p>
                      <RequestActions id={r.id} status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Ce qui se fera tout seul avec le partenariat La Poste */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <LaPosteCheck />
            <section className="rounded-2xl border border-border bg-bg p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Traitement automatique</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                  {ready ? "Branché" : "En attente de La Poste"}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                Quand le candidat valide sa demande, BTM AI fera tout seul :
              </p>
              <ol className="mt-4 space-y-3.5">
                <Step n={1} title="Réserver la place chez La Poste" detail="Le créneau choisi, avec le NEPH du candidat." done={ready ? false : null} />
                <Step n={2} title={`Débiter son portefeuille (${formatEuros(CODE_EXAM_FEE_CENTS)})`} detail="Rien n'est débité si la place n'est pas obtenue." done={ready ? false : null} />
                <Step n={3} title="Envoyer sa convocation" detail="Le document de La Poste, par e-mail et dans son compte." done={ready ? false : null} />
              </ol>
            </section>
            <section className="rounded-2xl border border-border bg-bg p-5 text-xs text-fg-muted">
              <h2 className="text-sm font-semibold text-fg">En attendant</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Réserve la place sur le site de La Poste avec les informations du candidat.</li>
                <li>Appelle-le ou écris-lui pour confirmer.</li>
                <li>Clique « Marquer réservée ».</li>
              </ol>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
