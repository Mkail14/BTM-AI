import Link from "next/link";
import type { ReactNode } from "react";
import type { AddressDraft } from "@/components/ui/AddressFields";
import type { SavedAddress } from "@/lib/address";
import type { MyReview } from "@/lib/reviews/rules";
import { AddressBook } from "./AddressBook";
import { AdminSection } from "./administration/AdminSection";
import { ChangeCode } from "./ChangeCode";
import { TamilyaMemory } from "./TamilyaMemory";
import { DeleteAccount } from "./DeleteAccount";
import { maskEmail } from "./mask-email";
import { MaskedEmail } from "./MaskedEmail";
import { PaymentPin } from "./PaymentPin";
import { NameRow, PhoneRow } from "./ProfileForm";
import { ReviewForm } from "./ReviewForm";
import { SosContacts } from "./SosContacts";
import { SettingsView, type SettingsTab } from "./SettingsView";
import { SignOutButton } from "./SignOutButton";
import { ThemeChoice } from "./ThemeChoice";
import { SECONDARY, SettingsGroup, SettingsRow } from "./ui";
import { VoicePrint } from "./VoicePrint";
import { VoiceTalkMode } from "./VoiceTalkMode";

export type SettingsData = {
  name: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  isPrincipalAdmin: boolean;
  userId: string;
  /** Null : pas de portefeuille pour ce compte (réservé aux admins pour l'instant). */
  balance: string | null;
  maskedPhone: string | null;
  home: AddressDraft | null;
  saved: SavedAddress[] | null;
  memories: { kind: string; content: string }[];
  memoryOn: boolean;
  review: MyReview | null;
  publicName: string;
  /** Proches à prévenir (SOS de Tamilya Connect). */
  sosContacts: string[];
  /** Admins : application d'authentification liée, code retiré, délai du verrou (minutes, 0 = jamais). */
  adminCode: { linked: boolean; codeOff: boolean; idle: number } | null;
};

/** Contenu de chaque rubrique, une fois les données du compte chargées. */
export function SettingsContent({ data }: { data: SettingsData }) {
  const panels: Record<SettingsTab, ReactNode> = {
    profil: (
      <SettingsGroup>
        <NameRow displayName={data.displayName} />
        <PhoneRow maskedPhone={data.maskedPhone} />
        <SettingsRow label="Adresse e-mail" value={<MaskedEmail email={data.email} />} />
        <div id="adresses" className="scroll-mt-24 divide-y divide-border">
          <AddressBook home={data.home} saved={data.saved} />
        </div>
      </SettingsGroup>
    ),
    securite: (
      <div className="space-y-6">
        <SettingsGroup title="Connexion">
          <SettingsRow label="Mot de passe">
            <Link href="/auth/nouveau-mot-de-passe" className={SECONDARY}>
              Changer
            </Link>
          </SettingsRow>
          {data.adminCode ? <ChangeCode {...data.adminCode} /> : null}
          <SettingsRow label="Session">
            <SignOutButton />
          </SettingsRow>
        </SettingsGroup>
        {/* Paiement et voix : réservés aux administrateurs pour l'instant, comme le portefeuille. */}
        {data.isAdmin ? (
          <SettingsGroup title="Paiement et voix">
            <PaymentPin />
            <VoicePrint />
          </SettingsGroup>
        ) : null}
        <div id="sos" className="scroll-mt-24">
          <SettingsGroup title="Urgence" description="Les proches prévenus quand tu lances un SOS.">
            <SosContacts contacts={data.sosContacts} />
          </SettingsGroup>
        </div>
        <SettingsGroup>
          <DeleteAccount email={data.email} isAdmin={data.isAdmin} />
        </SettingsGroup>
      </div>
    ),
    // Administrateurs seulement (la rubrique n'est pas proposée aux autres).
    administration: data.isAdmin ? <AdminSection userId={data.userId} principal={data.isPrincipalAdmin} /> : null,
    tamilya: (
      <SettingsGroup>
        {/* Le vocal n'est ouvert qu'aux administrateurs pour l'instant. */}
        {data.isAdmin ? <VoiceTalkMode /> : null}
        <TamilyaMemory facts={data.memories} on={data.memoryOn} />
      </SettingsGroup>
    ),
    apparence: <ThemeChoice />,
    avis: <ReviewForm review={data.review} publicName={data.publicName} defaultCommune={data.home?.commune ?? null} />,
  };

  const toComplete: SettingsTab[] = [];
  if (!data.displayName || !data.maskedPhone || !data.home) toComplete.push("profil");
  if (!data.sosContacts.length) toComplete.push("securite");

  return (
    <SettingsView
      name={data.name}
      email={data.email ? maskEmail(data.email) : null}
      isAdmin={data.isAdmin}
      balance={data.balance}
      panels={panels}
      toComplete={toComplete}
    />
  );
}
