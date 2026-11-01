import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { DEFAULT_IDENTITY, DEFAULT_RULES } from "@/lib/ai/system-prompt";
import { requireAdmin } from "@/lib/auth/session";
import { CharacterForm } from "./CharacterForm";

export const metadata: Metadata = { title: "Caractère et règles", robots: { index: false, follow: false } };

export default async function AdminCharacterPage() {
  const { supabase, user } = await requireAdmin("/admin/caractere");
  const { data, error } = await supabase
    .from("awa_settings")
    .select("identity, rules, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) console.error("[admin] Caractère illisible", error);

  const saved = {
    identity: data?.identity ?? DEFAULT_IDENTITY,
    rules: data?.rules ?? DEFAULT_RULES,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle lg:h-dvh lg:overflow-hidden">
      <AdminHeader section="Caractère et règles" email={user.email} />
      <main
        id="contenu"
        className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <h1 className="sr-only">Caractère et règles</h1>
        {error || !data ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
        <CharacterForm
          key={data?.updated_at ?? ""}
          saved={saved}
          defaults={{ identity: DEFAULT_IDENTITY, rules: DEFAULT_RULES }}
        />
      </main>
    </div>
  );
}
