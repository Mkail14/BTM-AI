import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { DEFAULT_IDENTITY, DEFAULT_RULES } from "@/lib/ai/system-prompt";
import { requireAdmin } from "@/lib/auth/session";
import { CharacterEditor } from "./CharacterEditor";

export const metadata: Metadata = { title: "Caractère et règles", robots: { index: false, follow: false } };

export default async function AdminCharacterPage() {
  const { supabase, user } = await requireAdmin("/admin/caractere");
  const { data, error } = await supabase
    .from("awa_settings")
    .select("name, identity, rules, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.error("[admin] Caractère illisible", error);

  const saved = {
    name: data?.name ?? "Awa",
    identity: data?.identity ?? DEFAULT_IDENTITY,
    rules: data?.rules ?? DEFAULT_RULES,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Caractère et règles" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 p-4">
        <PageIntro title="Caractère et règles">
          Le nom d&apos;Awa, sa façon d&apos;être commune à toutes les personnalités, et les règles qu&apos;elle suit
          toujours. Ces textes sont envoyés au modèle à chaque message.
        </PageIntro>
        {error || !data ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
        <div className="mt-4">
          <CharacterEditor
            key={data?.updated_at ?? ""}
            saved={saved}
            defaults={{ name: "Awa", identity: DEFAULT_IDENTITY, rules: DEFAULT_RULES }}
          />
        </div>
      </main>
    </div>
  );
}
