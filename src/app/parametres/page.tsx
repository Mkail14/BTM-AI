import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { codeOffFromMetadata, idleFromMetadata } from "@/server/services/admin/gate";
import { getMemories, isMemoryOn } from "@/server/services/ai/memory-store";
import { requireUser } from "@/server/middlewares/session";
import { maskPhone } from "@/lib/code-exam/candidate";
import { getProfile } from "@/server/models/profiles.model";
import { getProfileContact } from "@/server/services/profile-contact";
import { getMyReview } from "@/server/services/reviews";
import { publicName } from "@/lib/reviews/rules";
import { listSosContacts } from "@/server/services/sos/contacts";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { listSavedAddresses } from "@/server/services/saved-addresses";
import { loadWallet } from "@/server/services/wallet";
import { canUseWallet } from "@/server/services/wallet/access";
import { readDemoWallet, usesDemoWallet } from "@/server/services/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";
import { SettingsContent } from "./SettingsContent";
import { SettingsFrame } from "./SettingsFrame";

/** Code d'accès admin (Mon compte, Sécurité) : application liée ou retirée, délai du verrou. */
async function loadAdminCode(supabase: SupabaseClient) {
  const [{ data: factors }, { data: fresh }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getUser()]);
  const meta = fresh.user?.app_metadata;
  return {
    linked: Boolean(factors?.all.some((f) => f.factor_type === "totp" && f.status === "verified")),
    codeOff: codeOffFromMetadata(meta),
    idle: idleFromMetadata(meta),
  };
}

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/parametres");
  // Le solde est lu en même temps que le reste (démo ou vrai portefeuille), pas après.
  // Portefeuille réservé aux admins tant qu'aucun partenariat n'est signé : rien à lire pour les autres.
  const walletOn = await canUseWallet(user);
  const balanceTask = walletOn
    ? usesDemoWallet(user).then(async (demo) => ({
        demo,
        balanceCents: demo ? (await readDemoWallet(user.id)).balanceCents : (await loadWallet(supabase, user.id, 1)).balanceCents,
      }))
    : Promise.resolve({ demo: false, balanceCents: 0 });
  const admin = getSupabaseAdminClient();
  const [profile, contact, saved, memories, { demo, balanceCents }, review, memoryOn, sosContacts, adminCode] = await Promise.all([
    getProfile(supabase, user.id),
    getProfileContact(supabase, user.id),
    listSavedAddresses(supabase),
    getMemories(supabase).catch(() => []),
    balanceTask,
    getMyReview(user.id),
    isMemoryOn(supabase),
    admin ? listSosContacts(admin, user.id).catch(() => []) : Promise.resolve([]),
    user.isAdmin ? loadAdminCode(supabase) : Promise.resolve(null),
  ]);

  return (
    <SettingsFrame isAdmin={user.isAdmin}>
      <SettingsContent
        data={{
          name: profile.displayName || user.email?.split("@")[0] || "Toi",
          displayName: profile.displayName,
          email: user.email,
          isAdmin: user.isAdmin,
          isPrincipalAdmin: Boolean(user.isPrincipalAdmin),
          userId: user.id,
          balance: walletOn ? `${formatEuros(balanceCents)}${demo ? " (démo)" : ""}` : null,
          maskedPhone: contact.phone ? maskPhone(contact.phone) : null,
          home: contact.address,
          saved,
          memories,
          memoryOn,
          review,
          publicName: publicName(profile.displayName),
          sosContacts,
          adminCode,
        }}
      />
    </SettingsFrame>
  );
}
