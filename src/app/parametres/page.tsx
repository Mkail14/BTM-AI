import type { Metadata } from "next";
import { getMemories } from "@/lib/ai/memory-store";
import { requireUser } from "@/lib/auth/session";
import { maskPhone } from "@/lib/code-exam/candidate";
import { getProfile } from "@/lib/conversations/repository";
import { getProfileContact } from "@/lib/profile-contact";
import { getMyReview } from "@/lib/reviews";
import { publicName } from "@/lib/reviews/rules";
import { listSavedAddresses } from "@/lib/saved-addresses";
import { loadWallet } from "@/lib/wallet";
import { canUseWallet } from "@/lib/wallet/access";
import { readDemoWallet, usesDemoWallet } from "@/lib/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";
import { SettingsContent } from "./SettingsContent";
import { SettingsFrame } from "./SettingsFrame";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/parametres");
  // Le solde est lu en même temps que le reste (démo ou vrai portefeuille), pas après.
  // Portefeuille réservé aux admins tant qu'aucun partenariat n'est signé : rien à lire pour les autres.
  const walletOn = canUseWallet(user);
  const balanceTask = walletOn
    ? usesDemoWallet(user).then(async (demo) => ({
        demo,
        balanceCents: demo ? (await readDemoWallet(user.id)).balanceCents : (await loadWallet(supabase, user.id, 1)).balanceCents,
      }))
    : Promise.resolve({ demo: false, balanceCents: 0 });
  const [profile, contact, saved, memories, { demo, balanceCents }, review] = await Promise.all([
    getProfile(supabase, user.id),
    getProfileContact(supabase, user.id),
    listSavedAddresses(supabase),
    getMemories(supabase).catch(() => []),
    balanceTask,
    getMyReview(user.id),
  ]);

  return (
    <SettingsFrame isAdmin={user.isAdmin}>
      <SettingsContent
        data={{
          name: profile.displayName || user.email?.split("@")[0] || "Toi",
          displayName: profile.displayName,
          email: user.email,
          isAdmin: user.isAdmin,
          balance: walletOn ? `${formatEuros(balanceCents)}${demo ? " (démo)" : ""}` : null,
          maskedPhone: contact.phone ? maskPhone(contact.phone) : null,
          home: contact.address,
          saved,
          memories,
          review,
          publicName: publicName(profile.displayName),
        }}
      />
    </SettingsFrame>
  );
}
