import type { Metadata } from "next";
import Link from "next/link";
import { PersonalityPicker } from "@/components/personality/PersonalityPicker";
import { requireUser } from "@/lib/auth/session";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import { getProfile } from "@/lib/conversations/repository";
import { DeleteAccount } from "./DeleteAccount";
import { ProfileForm } from "./ProfileForm";
import { SettingsFrame } from "./SettingsFrame";
import { SettingsView } from "./SettingsView";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/parametres");
  // Lectures en parallèle (le profil est déjà en mémoire depuis la mise en page).
  const [profile, cards] = await Promise.all([getProfile(supabase, user.id), loadPersonalityCards()]);
  const name = profile.displayName || user.email?.split("@")[0] || "Vous";

  return (
    <SettingsFrame isAdmin={user.isAdmin}>
      <div className="flex shrink-0 items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-hover text-xl font-semibold text-accent-fg uppercase shadow-sm"
        >
          {name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="truncate">{name}</span>
            {user.isAdmin ? (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                Admin
              </span>
            ) : null}
          </h1>
          <p className="truncate text-sm text-fg-muted">{user.email}</p>
        </div>
      </div>

      <SettingsView
        panels={{
          profil: <ProfileForm displayName={profile.displayName} />,
          personnalite:
            profile.personality !== undefined ? (
              <div className="max-w-xl">
                <PersonalityPicker cards={cards} current={profile.personality} />
              </div>
            ) : undefined,
          securite: (
            <div className="max-w-xl divide-y divide-border">
              <Row title="Adresse e-mail" detail={user.email ?? "—"} />
              <Row title="Mot de passe" detail="Choisissez-en un nouveau à tout moment.">
                <Link
                  href="/auth/nouveau-mot-de-passe"
                  className="rounded-xl border border-border px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-bg-muted"
                >
                  Changer
                </Link>
              </Row>
              <Row title="Session" detail="Vous déconnecter de cet appareil.">
                <SignOutButton />
              </Row>
            </div>
          ),
          suppression: <DeleteAccount email={user.email} isAdmin={user.isAdmin} />,
        }}
      />
    </SettingsFrame>
  );
}

function Row({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-sm text-fg-muted">{detail}</p>
      </div>
      {children}
    </div>
  );
}
