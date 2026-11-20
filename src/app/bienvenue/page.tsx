import type { Metadata } from "next";
import { requireUser } from "@/server/middlewares/session";
import { getProfile } from "@/server/models/profiles.model";
import { canUse } from "@/server/services/site/features";
import { canUseWallet } from "@/server/services/wallet/access";
import { WelcomeSteps } from "./WelcomeSteps";

export const metadata: Metadata = { title: "Bienvenue" };

/** Premiers pas après l'inscription ou l'installation de l'app : chaque étape peut attendre. */
export default async function WelcomePage() {
  const { supabase, user } = await requireUser("/bienvenue");
  const [profile, wallet, documents] = await Promise.all([
    getProfile(supabase, user.id).catch(() => null),
    canUseWallet(user),
    canUse(user, "documents"),
  ]);
  return <WelcomeSteps userId={user.id} hasName={Boolean(profile?.displayName)} wallet={wallet} email={user.email} documents={documents} />;
}
