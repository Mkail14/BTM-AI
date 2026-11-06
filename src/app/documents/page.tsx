import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { isDriveConnected } from "@/lib/drive/connection";
import { driveConfigured } from "@/lib/drive/oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SettingsFrame } from "../parametres/SettingsFrame";
import { DocumentsView } from "./DocumentsView";

export const metadata: Metadata = { title: "Mes documents" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const { user } = await requireUser("/documents");
  const { drive } = await searchParams;
  const admin = getSupabaseAdminClient();
  const connected = admin ? await isDriveConnected(admin, user.id).catch(() => false) : false;

  return (
    <SettingsFrame isAdmin={user.isAdmin} section="Mes documents">
      <DocumentsView connected={connected} available={driveConfigured()} notice={typeof drive === "string" ? drive : null} />
    </SettingsFrame>
  );
}
