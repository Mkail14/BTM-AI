import type { Metadata } from "next";
import Link from "next/link";
import { IconWallet } from "@/components/ui/icons";
import { PersonalityPicker } from "@/components/personality/PersonalityPicker";
import { getMemories } from "@/lib/ai/memory-store";
import { PERSONALITIES } from "@/lib/ai/personalities";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import { requireUser } from "@/lib/auth/session";
import { maskPhone } from "@/lib/code-exam/candidate";
import { getProfile } from "@/lib/conversations/repository";
import { getProfileContact } from "@/lib/profile-contact";
import { getMyReview } from "@/lib/reviews";
import { publicName } from "@/lib/reviews/rules";
import { listSavedAddresses } from "@/lib/saved-addresses";
import { loadWallet } from "@/lib/wallet";
import { readDemoWallet, usesDemoWallet } from "@/lib/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";
import { AwaMemory } from "./AwaMemory";
import { AddressBook } from "./AddressBook";
import { PhoneRow } from "./ContactForms";
import { DeleteAccount } from "./DeleteAccount";
import { maskEmail } from "./mask-email";
import { MaskedEmail } from "./MaskedEmail";
import { ProfileForm } from "./ProfileForm";
import { ReviewForm } from "./ReviewForm";
import { SettingsFrame } from "./SettingsFrame";
import { GoToTab, SettingsView, type SettingsTab } from "./SettingsView";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = { title: "Paramètres" };

const TABS: SettingsTab[] = ["apercu", "profil", "adresse", "awa", "avis", "securite", "suppression"];

export default async function SettingsPage({ searchParams }: PageProps<"/parametres">) {
  const { supabase, user } = await requireUser("/parametres");
  const params = await searchParams;
  const [profile, contact, saved, cards, memories, demo, review] = await Promise.all([
    getProfile(supabase, user.id),
    getProfileContact(supabase, user.id),
    listSavedAddresses(supabase),
    loadPersonalityCards(),
    getMemories(supabase).catch(() => []),
    usesDemoWallet(user),
    getMyReview(user.id),
  ]);
  const balanceCents = demo ? (await readDemoWallet(user.id)).balanceCents : (await loadWallet(supabase, user.id, 1)).balanceCents;
  const name = profile.displayName || user.email?.split("@")[0] || "Vous";
  const personality = profile.personality ? PERSONALITIES[profile.personality] : null;
  // ?rubrique=adresse : ouvre directement une rubrique (lien depuis la commande, Tamilya…).
  const initial = TABS.find((t) => t === params.rubrique);

  const done = {
    name: Boolean(profile.displayName),
    phone: Boolean(contact.phone),
    home: Boolean(contact.address),
    awa: Boolean(personality),
  };
  const checklist: { key: keyof typeof done; label: string; tab: SettingsTab }[] = [
    { key: "name", label: "Ton prénom", tab: "profil" },
    { key: "phone", label: "Ton téléphone", tab: "profil" },
    { key: "home", label: "L'adresse de ta maison", tab: "adresse" },
    { key: "awa", label: "Le caractère de Tamilya", tab: "awa" },
  ];
  const completed = checklist.filter((c) => done[c.key]).length;
  const addressCount = (contact.address ? 1 : 0) + (saved?.length ?? 0);
  const tile =
    "group flex flex-col gap-3 rounded-2xl border border-border bg-bg p-4 text-left transition hover:-translate-y-0.5 hover:border-fg-muted/40 hover:shadow-md";

  return (
    <SettingsFrame isAdmin={user.isAdmin}>
      <SettingsView
        initial={initial}
        badges={{ adresse: !contact.address, profil: !contact.phone }}
        identity={
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-hover p-4 text-accent-fg">
            <div aria-hidden="true" className="absolute -top-12 -right-8 size-36 rounded-full bg-white/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-lg font-semibold uppercase ring-1 ring-white/30"
              >
                {name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{name}</span>
                  {user.isAdmin ? <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[10px] font-medium">Admin</span> : null}
                </p>
                <p className="truncate text-xs opacity-80">{user.email ? maskEmail(user.email) : null}</p>
              </div>
            </div>
            <Link href="/portefeuille" className="relative mt-3 flex items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm hover:bg-white/25">
              <span className="inline-flex items-center gap-1.5 opacity-90">
                <IconWallet width={15} height={15} /> Portefeuille
              </span>
              <span className="font-semibold">
                {formatEuros(balanceCents)}
                {demo ? <span className="ml-1 text-xs font-normal opacity-75">démo</span> : null}
              </span>
            </Link>
          </div>
        }
        panels={{
          apercu: (
            <div className="space-y-6">
              {/* Compte à compléter */}
              <div className="rounded-2xl border border-border bg-bg-subtle p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{completed === checklist.length ? "Ton compte est complet 🎉" : "Complète ton compte"}</p>
                    <p className="text-sm text-fg-muted">
                      {completed === checklist.length
                        ? "Tamilya a tout ce qu'il faut pour t'aider au mieux."
                        : "Plus Tamilya en sait, mieux elle t'aide : livraisons, services près de chez toi…"}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xl font-semibold tabular-nums">
                    {completed}/{checklist.length}
                  </span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(completed / checklist.length) * 100}%` }} />
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {checklist.map((c) => (
                    <li key={c.key}>
                      {done[c.key] ? (
                        <span className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-fg-muted">
                          <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-success text-[11px] font-bold text-white">
                            ✓
                          </span>
                          <span className="line-through decoration-fg-muted/40">{c.label}</span>
                        </span>
                      ) : (
                        <GoToTab
                          tab={c.tab}
                          className="flex w-full items-center gap-2.5 rounded-xl bg-bg px-3 py-2 text-left text-sm font-medium ring-1 ring-border hover:ring-accent"
                        >
                          <span aria-hidden="true" className="size-5 rounded-full border-2 border-dashed border-warning" />
                          <span className="flex-1">{c.label}</span>
                          <span aria-hidden="true" className="text-accent">
                            →
                          </span>
                        </GoToTab>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Raccourcis */}
              <div className="grid gap-3 sm:grid-cols-2">
                <GoToTab tab="adresse" className={tile}>
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-lg">
                    📍
                  </span>
                  <span>
                    <span className="block font-medium">Mes adresses</span>
                    <span className="block text-sm text-fg-muted">
                      {addressCount === 0 ? "Aucune adresse" : addressCount === 1 ? "1 adresse enregistrée" : `${addressCount} adresses enregistrées`}
                    </span>
                  </span>
                </GoToTab>
                <Link href="/portefeuille" className={tile}>
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-lg">
                    💳
                  </span>
                  <span>
                    <span className="block font-medium">Portefeuille</span>
                    <span className="block text-sm text-fg-muted">
                      {formatEuros(balanceCents)} disponibles{demo ? " (démo)" : ""}
                    </span>
                  </span>
                </Link>
                <GoToTab tab="awa" className={tile}>
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-lg">
                    {personality?.emoji ?? "✨"}
                  </span>
                  <span>
                    <span className="block font-medium">Tamilya</span>
                    <span className="block text-sm text-fg-muted">
                      {personality ? `Caractère ${personality.label.toLowerCase()}` : "Choisis son caractère"} · {memories.length} souvenir
                      {memories.length > 1 ? "s" : ""}
                    </span>
                  </span>
                </GoToTab>
                <GoToTab tab="securite" className={tile}>
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-lg">
                    🔒
                  </span>
                  <span>
                    <span className="block font-medium">Sécurité</span>
                    <span className="block text-sm text-fg-muted">Mot de passe et session</span>
                  </span>
                </GoToTab>
              </div>
            </div>
          ),
          profil: (
            <Group>
              <div className="p-4">
                <ProfileForm displayName={profile.displayName} />
              </div>
              <div className="p-4">
                <PhoneRow maskedPhone={contact.phone ? maskPhone(contact.phone) : null} />
              </div>
            </Group>
          ),
          adresse: (
            <div className="space-y-5">
              <AddressBook home={contact.address} saved={saved} />
              <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
                <li className="rounded-2xl bg-bg-subtle px-4 py-3">🛵 Choisis l&apos;une de ces adresses à chaque commande.</li>
                <li className="rounded-2xl bg-bg-subtle px-4 py-3">🧭 Tamilya sait ce qui est près de chez toi : bureau du code, restaurants…</li>
              </ul>
            </div>
          ),
          awa: (
            <div className="space-y-8">
              {profile.personality !== undefined ? (
                <section className="space-y-3">
                  <div>
                    <h3 className="font-medium">Son caractère</h3>
                    <p className="text-sm text-fg-muted">La façon dont Tamilya te parle. Tu peux en changer quand tu veux.</p>
                  </div>
                  <PersonalityPicker cards={cards} current={profile.personality} />
                </section>
              ) : null}
              <section className="space-y-3">
                <div>
                  <h3 className="font-medium">Ce qu&apos;elle retient de toi</h3>
                  <p className="text-sm text-fg-muted">Tamilya s&apos;en sert seulement pour mieux te répondre. Tu peux tout effacer.</p>
                </div>
                <AwaMemory facts={memories} />
              </section>
            </div>
          ),
          avis: <ReviewForm review={review} publicName={publicName(profile.displayName)} defaultCommune={contact.address?.commune ?? null} />,
          securite: (
            <Group>
              <Row icon="✉️" title="Adresse e-mail" detail={<MaskedEmail email={user.email} />} />
              <Row icon="🔑" title="Mot de passe" detail="Choisis-en un nouveau à tout moment.">
                <Link
                  href="/auth/nouveau-mot-de-passe"
                  className="rounded-xl border border-border px-3.5 py-2 text-sm font-medium whitespace-nowrap hover:bg-bg-muted"
                >
                  Changer
                </Link>
              </Row>
              <Row icon="💻" title="Session" detail="Te déconnecter de cet appareil.">
                <SignOutButton />
              </Row>
            </Group>
          ),
          suppression: <DeleteAccount email={user.email} isAdmin={user.isAdmin} />,
        }}
      />
    </SettingsFrame>
  );
}

/** Groupe de lignes dans un cadre, comme les réglages d'un téléphone. */
function Group({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{children}</div>;
}

function Row({ icon, title, detail, children }: { icon: string; title: string; detail: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 p-4">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-subtle text-lg">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="truncate text-sm text-fg-muted">{detail}</div>
      </div>
      {children}
    </div>
  );
}
