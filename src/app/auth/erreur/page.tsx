import type { Metadata } from "next";
import Link from "next/link";
import { SimplePage } from "@/components/layout/SimplePage";

export const metadata: Metadata = { title: "Lien invalide" };

export default function AuthErrorPage() {
  return (
    <SimplePage title="Ce lien n'est plus valide">
      <div className="space-y-3 rounded-xl border border-border bg-bg p-5 text-sm">
        <p>
          Le lien que vous avez suivi a expiré ou a déjà été utilisé. Pour des raisons de sécurité, les liens de
          confirmation et de réinitialisation ne sont valables qu&apos;une fois et pour une durée limitée.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/auth/mot-de-passe-oublie" className="font-medium text-accent hover:underline">
            Redemander un lien de réinitialisation
          </Link>
          <Link href="/" className="font-medium text-accent hover:underline">
            Revenir à BTM AI
          </Link>
        </div>
      </div>
    </SimplePage>
  );
}
