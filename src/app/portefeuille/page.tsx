import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MigrationWarning } from "@/components/admin/form";
import { requireUser } from "@/lib/auth/session";
import { loadWallet, settleTopup } from "@/lib/wallet";
import { canUseWallet } from "@/lib/wallet/access";
import { readDemoWallet, usesDemoWallet } from "@/lib/wallet/demo";
import { stripeConfigured } from "@/lib/wallet/stripe";
import { SettingsFrame } from "../parametres/SettingsFrame";
import { WalletView } from "./WalletView";

export const metadata: Metadata = { title: "Portefeuille" };

export default async function WalletPage({ searchParams }: PageProps<"/portefeuille">) {
  const { supabase, user } = await requireUser("/portefeuille");
  // Réservé aux admins tant qu'aucun partenariat n'est signé.
  if (!canUseWallet(user)) redirect("/parametres");
  const params = await searchParams;
  const sessionId = typeof params.recharge === "string" ? params.recharge : null;

  // Mode démo : solde fictif (150 € au départ), recharges sans carte.
  if (await usesDemoWallet(user)) {
    const demo = await readDemoWallet(user.id);
    return (
      <SettingsFrame isAdmin={user.isAdmin} section="Portefeuille">
        <WalletView balanceCents={demo.balanceCents} transactions={demo.transactions} paymentsOpen demo notice={null} />
      </SettingsFrame>
    );
  }

  // Retour de la page de paiement : on crédite tout de suite, sans attendre le webhook.
  let notice: "paid" | "pending" | "failed" | "cancelled" | null = params.annule ? "cancelled" : null;
  if (sessionId && /^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) {
    notice = await settleTopup(sessionId).catch((error: unknown) => {
      console.error("[portefeuille] Vérification de la recharge impossible", error);
      return "pending" as const;
    });
  }

  const wallet = await loadWallet(supabase, user.id);

  return (
    <SettingsFrame isAdmin={user.isAdmin} section="Portefeuille">
      {wallet.error ? <MigrationWarning file="20261111000000_wallets.sql" /> : null}
      <WalletView
        balanceCents={wallet.balanceCents}
        transactions={wallet.transactions}
        paymentsOpen={stripeConfigured()}
        notice={notice}
      />
    </SettingsFrame>
  );
}
