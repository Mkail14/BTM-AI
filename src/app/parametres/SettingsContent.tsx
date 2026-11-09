import Link from "next/link";
import type { ReactNode } from "react";
import type { AddressDraft } from "@/components/ui/AddressFields";
import type { SavedAddress } from "@/lib/address";
import type { MyReview } from "@/lib/reviews/rules";
import { AddressBook } from "./AddressBook";
import { AwaMemory } from "./AwaMemory";
import { DeleteAccount } from "./DeleteAccount";
import { maskEmail } from "./mask-email";
import { MaskedEmail } from "./MaskedEmail";
import { PaymentPin } from "./PaymentPin";
import { NameRow, PhoneRow } from "./ProfileForm";
import { ReviewForm } from "./ReviewForm";
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
  /** Null : pas de portefeuille pour ce compte (réservé aux admins pour l'instant). */
  balance: string | null;
  maskedPhone: string | null;
  home: AddressDraft | null;
  saved: SavedAddress[] | null;
  memories: { kind: string; content: string }[];
  memoryOn: boolean;
  review: MyReview | null;
  publicName: string;
};

/** Contenu de chaque rubrique, une fois les données du compte chargées. */
export function SettingsContent({ data }: { data: SettingsData }) {
  const panels: Record<SettingsTab, ReactNode> = {
    profil: (
      <SettingsGroup>
        <NameRow displayName={data.displayName} />
        <PhoneRow maskedPhone={data.maskedPhone} />
        <SettingsRow label="Adresse e-mail" value={<MaskedEmail email={data.email} />} />
      </SettingsGroup>
    ),
    adresse: <AddressBook home={data.home} saved={data.saved} />,
    securite: (
      <>
        <SettingsGroup>
          <SettingsRow label="Mot de passe" value="Choisis-en un nouveau à tout moment.">
            <Link href="/auth/nouveau-mot-de-passe" className={SECONDARY}>
              Changer
            </Link>
          </SettingsRow>
          <SettingsRow label="Session" value="Te déconnecter de cet appareil.">
            <SignOutButton />
          </SettingsRow>
        </SettingsGroup>
        <DeleteAccount email={data.email} isAdmin={data.isAdmin} />
      </>
    ),
    awa: (
      <>
        {/* Le vocal n'est ouvert qu'aux administrateurs pour l'instant. */}
        {data.isAdmin ? <VoiceTalkMode /> : null}
        {data.isAdmin ? <PaymentPin /> : null}
        {data.isAdmin ? <VoicePrint /> : null}
        <AwaMemory facts={data.memories} on={data.memoryOn} />
      </>
    ),
    apparence: <ThemeChoice />,
    avis: <ReviewForm review={data.review} publicName={data.publicName} defaultCommune={data.home?.commune ?? null} />,
  };

  const toComplete: SettingsTab[] = [];
  if (!data.displayName || !data.maskedPhone) toComplete.push("profil");
  if (!data.home) toComplete.push("adresse");

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
