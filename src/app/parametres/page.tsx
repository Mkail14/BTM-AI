import type { Metadata } from "next";
import Link from "next/link";
import { SimplePage } from "@/components/layout/SimplePage";
import { PersonalityPicker } from "@/components/personality/PersonalityPicker";
import { requireUser } from "@/lib/auth/session";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import { getProfile } from "@/lib/conversations/repository";
import { ProfileForm } from "./ProfileForm";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/parametres");
  const profile = await getProfile(supabase, user.id);

  return (
    <SimplePage title="Paramètres">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-bg p-5" aria-labelledby="profil">
          <h2 id="profil" className="font-semibold">
            Profil
          </h2>
          <div className="mt-4">
            <ProfileForm displayName={profile.displayName} />
          </div>
        </section>

        {profile.personality !== undefined ? (
          <section className="rounded-xl border border-border bg-bg p-5" aria-labelledby="personnalite">
            <h2 id="personnalite" className="font-semibold">
              Personnalité d&apos;Awa
            </h2>
            <p className="mt-1 text-sm text-fg-muted">Le caractère qu&apos;Awa prend quand elle te parle.</p>
            <div className="mt-4">
              <PersonalityPicker cards={await loadPersonalityCards()} current={profile.personality} />
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-bg p-5" aria-labelledby="compte">
          <h2 id="compte" className="font-semibold">
            Compte
          </h2>
          <dl className="mt-3 text-sm">
            <dt className="text-fg-muted">Adresse e-mail</dt>
            <dd className="mt-0.5">{user.email}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href="/auth/nouveau-mot-de-passe"
              className="rounded-lg border border-border px-3 py-2 font-medium hover:bg-bg-muted"
            >
              Changer de mot de passe
            </Link>
            <SignOutButton />
          </div>
        </section>
      </div>
    </SimplePage>
  );
}
