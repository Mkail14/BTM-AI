import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { isPersonalityId, PERSONALITIES, PERSONALITY_IDS, type PersonalityId } from "@/lib/ai/personalities";
import { getPersonalityRecordsForAdmin, type PersonalityRecords } from "@/lib/ai/personality-store";
import { requireAdmin } from "@/lib/auth/session";
import { PersonalityWorkbench } from "./PersonalityWorkbench";

export const metadata: Metadata = { title: "Personnalités d'Awa", robots: { index: false, follow: false } };

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "Indian/Mayotte",
});

export default async function AdminPersonalitiesPage({ searchParams }: PageProps<"/admin/personnalites">) {
  const { supabase, user } = await requireAdmin("/admin/personnalites");
  const requested = (await searchParams).p;
  const selected: PersonalityId = isPersonalityId(requested) ? requested : PERSONALITY_IDS[0];

  let records: PersonalityRecords | null = null;
  try {
    records = await getPersonalityRecordsForAdmin(supabase);
  } catch (error) {
    console.error("[admin] Personnalités indisponibles", error);
  }

  const current = PERSONALITIES[selected];
  const record = records?.[selected];

  return (
    // Page fixe : elle tient dans l'écran, sans barre de défilement.
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-subtle">
      <AdminHeader section="Personnalités d'Awa" email={user.email} />

      {/* Tout est centré, en largeur comme en hauteur. */}
      <main id="contenu" className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center px-4 py-4">
          <div className="w-full max-w-2xl">
            <div className="text-center">
              <span
                aria-hidden="true"
                className="mx-auto grid size-16 place-items-center rounded-2xl border border-border bg-bg text-4xl shadow-sm"
              >
                {current.emoji}
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">Personnalités d&apos;Awa</h1>
              <p className="mt-2 text-sm text-fg-muted">
                {record?.behavior
                  ? `${current.label} · personnalisée${record.updatedAt ? ` le ${dateFormat.format(new Date(record.updatedAt))}` : ""}`
                  : `${current.label} · réglages d'origine`}
              </p>
            </div>

            {records ? null : (
              <p role="alert" className="mt-6 rounded-xl bg-warning-soft px-4 py-3 text-center text-sm">
                Réglages illisibles : appliquez la migration{" "}
                <code className="font-mono">20261029180000_awa_personality_behavior.sql</code> dans Supabase.
              </p>
            )}

            {/* Sélecteur à onglets */}
            <nav aria-label="Choisir une personnalité" className="mt-5 flex justify-center">
              <div className="inline-flex w-full rounded-2xl border border-border bg-bg p-1 shadow-sm sm:w-auto">
                {PERSONALITY_IDS.map((id) => {
                  const p = PERSONALITIES[id];
                  const active = id === selected;
                  return (
                    <Link
                      key={id}
                      href={`/admin/personnalites?p=${id}`}
                      aria-current={active ? "page" : undefined}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-5 ${
                        active ? "bg-accent text-accent-fg shadow-sm" : "text-fg-muted hover:bg-bg-muted hover:text-fg"
                      }`}
                    >
                      <span aria-hidden="true">{p.emoji}</span>
                      {p.label}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="mt-6">
              <PersonalityWorkbench
                key={`${selected}-${record?.updatedAt ?? ""}`}
                id={selected}
                saved={record?.behavior ?? current.defaults}
                defaults={current.defaults}
                customized={Boolean(record?.behavior)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
