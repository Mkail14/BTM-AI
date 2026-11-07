import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { isDriveConnected } from "@/lib/drive/connection";
import { googleLoginEmail } from "@/lib/drive/identity";
import { driveConfigured } from "@/lib/drive/oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SettingsFrame } from "../parametres/SettingsFrame";
import { DocumentsView } from "./DocumentsView";

export const metadata: Metadata = { title: "Mes documents" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const { supabase, user } = await requireUser("/documents");
  const { drive } = await searchParams;
  const admin = getSupabaseAdminClient();
  const connected = admin ? await isDriveConnected(admin, user.id).catch(() => false) : false;
  // Connecté au site avec Google : son Drive se relie à ce même Gmail, en un clic.
  const gmail = connected ? null : googleLoginEmail((await supabase.auth.getUserIdentities().catch(() => ({ data: null }))).data?.identities);

  return (
    <SettingsFrame isAdmin={user.isAdmin} section="Mes documents">
      <DocumentsView connected={connected} available={driveConfigured()} gmail={gmail} notice={typeof drive === "string" ? drive : null} />
    </SettingsFrame>
  );
}
