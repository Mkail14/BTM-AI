import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { MemoryList, type MemoryAccount } from "./MemoryList";

export const metadata: Metadata = { title: "Mémoire d'Awa", robots: { index: false, follow: false } };

/** Comptes affichés : ceux dont un souvenir a changé le plus récemment. */
const MAX_ROWS = 300;
const MAX_ACCOUNTS = 50;

export default async function AdminMemoryPage() {
  const { user } = await requireAdmin("/admin/memoire");
  const admin = getSupabaseAdminClient();

  let accounts: MemoryAccount[] | null = null;
  let total = 0;
  if (admin) {
    const { data, error, count } = await admin
      .from("awa_memories")
      .select("id, user_id, kind, content, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) {
      console.error("[admin] Mémoire illisible", error);
    } else {
      total = count ?? 0;
      const byUser = new Map<string, MemoryAccount>();
      for (const row of data ?? []) {
        if (!byUser.has(row.user_id)) {
          if (byUser.size >= MAX_ACCOUNTS) continue;
          byUser.set(row.user_id, { userId: row.user_id, email: null, facts: [] });
        }
        byUser.get(row.user_id)!.facts.push({ id: row.id, kind: row.kind, content: row.content, updatedAt: row.updated_at });
      }
      accounts = [...byUser.values()];
      const users = await Promise.all(accounts.map((a) => admin.auth.admin.getUserById(a.userId)));
      users.forEach((result, index) => (accounts![index].email = result.data.user?.email ?? null));
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Mémoire d'Awa" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 p-4">
        <PageIntro title="Mémoire d'Awa">
          Ce que les comptes connectés ont dit d&apos;eux-mêmes (prénom, lieu, travail, âge), repéré automatiquement dans
          leurs messages. Une valeur par sorte et par compte ; la plus récente remplace l&apos;ancienne. Vous pouvez
          supprimer un souvenir, ou tout effacer pour un compte qui le demande.
        </PageIntro>
        {!admin ? (
          <p role="alert" className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm">
            La mémoire n&apos;est lisible qu&apos;avec la clé secrète : définissez SUPABASE_SECRET_KEY.
          </p>
        ) : accounts === null ? (
          <MigrationWarning file="20261029000000_awa_brain.sql" />
        ) : (
          <div className="mt-4">
            <MemoryList accounts={accounts} total={total} />
          </div>
        )}
      </main>
    </div>
  );
}
