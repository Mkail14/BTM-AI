import Link from "next/link";
import { ChatShell } from "@/components/layout/ChatShell";
import { getAuthContext } from "@/lib/auth/session";
import { getSiteFlags } from "@/lib/site/settings";
import { SITE_STATUS_LABELS } from "@/lib/site/status";
import { AddressCheckNotice } from "@/components/layout/AddressCheckNotice";
import { needsAddressCheck } from "@/lib/auth/address-notice";

export default async function ChatLayout({ children }: LayoutProps<"/">) {
  // Les administrateurs ont aussi le chat : c'est là qu'ils apprennent le shimaoré à Tamilya.
  const { supabase, user } = await getAuthContext();

  // Adresse d'inscription peut-être abîmée (faute du 2026-11-02, address-notice.ts) : on prévient.
  // Lu en même temps que les réglages ; une erreur ne bloque jamais la page.
  const [flags, profile] = await Promise.all([
    user?.isAdmin ? getSiteFlags() : null,
    user && supabase
      ? supabase
          .from("profiles")
          .select("address_line, address_updated_at, created_at")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data }) => data, () => null)
      : null,
  ]);
  const damagedLine = needsAddressCheck(profile) ? String(profile?.address_line) : null;

  return (
    <>
      {/* Rappel pour les administrateurs : ce qu'ils voient n'est pas le site public. */}
      {flags?.demoMode || (flags && flags.status !== "online") ? (
        <Link
          href={user?.isPrincipalAdmin ? "/admin/profil" : "/admin"}
          className="fixed top-[calc(0.5rem+env(safe-area-inset-top))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-warning px-3 py-1 text-[11px] font-semibold text-warning-fg shadow-md hover:brightness-110"
        >
          {[flags.demoMode ? "Mode démo" : null, flags.status !== "online" ? SITE_STATUS_LABELS[flags.status] : null].filter(Boolean).join(" · ")}
        </Link>
      ) : null}
      {damagedLine ? <AddressCheckNotice line={damagedLine} /> : null}
      <ChatShell>{children}</ChatShell>
    </>
  );
}
