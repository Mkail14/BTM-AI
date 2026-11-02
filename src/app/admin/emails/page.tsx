import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/email/device";
import { EMAIL_SAMPLES, renderSample } from "@/lib/email/samples";
import { EMAIL_FROM_ADDRESS, emailConfigured } from "@/lib/email/send";
import { EmailPreview } from "./EmailPreview";

export const metadata: Metadata = { title: "E-mails", robots: { index: false, follow: false } };

export default async function AdminEmailsPage() {
  const { user } = await requireAdmin("/admin/emails");
  const host = (await headers()).get("host");
  const origin = siteOrigin(host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}` : "https://btm.yt");
  const email = user.email ?? "vous@exemple.fr";

  const samples = EMAIL_SAMPLES.map((s) => {
    const rendered = renderSample(s.id, origin, email);
    return { ...s, subject: rendered.subject, html: rendered.html };
  });

  return (
    // Écran fixe : la liste et l'aperçu tiennent dans la fenêtre ; seul l'aperçu défile.
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-subtle">
      <AdminHeader section="E-mails" email={user.email} />
      <main id="contenu" className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col p-4">
        <EmailPreview
          samples={samples}
          from={EMAIL_FROM_ADDRESS}
          smtpReady={emailConfigured()}
          hookReady={Boolean(process.env.SEND_EMAIL_HOOK_SECRET)}
        />
      </main>
    </div>
  );
}
