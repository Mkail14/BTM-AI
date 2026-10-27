import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { isPersonalityId, PERSONALITIES, PERSONALITY_IDS, type PersonalityId } from "@/lib/ai/personalities";
import { getPersonalityRecordsForAdmin, type PersonalityRecords } from "@/lib/ai/personality-store";
import { requireAdmin } from "@/lib/auth/session";
import { PersonalityWorkbench } from "./PersonalityWorkbench";

export const metadata: Metadata = { title: "Personnalités d'Awa", robots: { index: false, follow: false } };

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
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
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Personnalités d'Awa" email={user.email} />

      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 p-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Personnalités d&apos;Awa</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Chaque utilisateur choisit l&apos;une de ces trois personnalités à la création de son compte. Réglez ici
            comment Awa se comporte dans chacune, essayez, puis mettez en ligne.
          </p>
        </div>

        {records ? null : (
          <p role="alert" className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm">
            Les réglages ne peuvent pas être lus : appliquez la migration{" "}
            <code className="font-mono">20261029180000_awa_personality_behavior.sql</code> dans Supabase. En attendant,
            les réglages d&apos;origine s&apos;affichent et l&apos;enregistrement échouera.
          </p>
        )}

        <nav aria-label="Choisir une personnalité" className="mt-5 grid gap-2 sm:grid-cols-3">
          {PERSONALITY_IDS.map((id) => {
            const p = PERSONALITIES[id];
            const r = records?.[id];
            const active = id === selected;
            return (
              <Link
                key={id}
                href={`/admin/personnalites?p=${id}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  active ? "border-accent bg-accent-soft" : "border-border bg-bg hover:bg-bg-muted"
                }`}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {p.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {r?.behavior
                      ? `Personnalisée${r.updatedAt ? ` · ${dateFormat.format(new Date(r.updatedAt))}` : ""}`
                      : "Réglages d'origine"}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4">
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
