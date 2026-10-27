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
    <div className="flex min-h-dvh flex-col bg-bg-subtle lg:h-dvh lg:overflow-hidden">
      <AdminHeader section="Personnalités d'Awa" email={user.email} />
      <main
        id="contenu"
        className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <h1 className="sr-only">Personnalités d&apos;Awa</h1>
        {records ? null : (
          <p role="alert" className="mb-3 rounded-xl bg-warning-soft px-4 py-2.5 text-sm">
            Réglages illisibles : appliquez la migration{" "}
            <code className="font-mono">20261029180000_awa_personality_behavior.sql</code> dans Supabase.
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-bg-subtle">
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg px-4 py-2.5">
            <nav aria-label="Choisir une personnalité" className="inline-flex rounded-lg bg-bg-muted p-1">
              {PERSONALITY_IDS.map((id) => {
                const p = PERSONALITIES[id];
                const active = id === selected;
                return (
                  <Link
                    key={id}
                    href={`/admin/personnalites?p=${id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      active ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    <span aria-hidden="true">{p.emoji}</span>
                    {p.label}
                  </Link>
                );
              })}
            </nav>
            <p className="text-xs text-fg-muted">
              {record?.behavior
                ? `Personnalisée${record.updatedAt ? ` le ${dateFormat.format(new Date(record.updatedAt))}` : ""}`
                : "Réglages d'origine"}
            </p>
          </div>

          <PersonalityWorkbench
            key={`${selected}-${record?.updatedAt ?? ""}`}
            id={selected}
            saved={record?.behavior ?? current.defaults}
            defaults={current.defaults}
            customized={Boolean(record?.behavior)}
          />
        </div>
      </main>
    </div>
  );
}
