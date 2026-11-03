import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";

export const metadata: Metadata = { title: "Développeurs" };

/** Espace développeurs (API de Tamilya) : page réservée, contenu à venir. */
export default function DeveloppeursPage() {
  return (
    <SimplePage title="Développeurs">
      <p className="text-sm text-fg-muted">Cette page est en préparation. Revenez bientôt.</p>
    </SimplePage>
  );
}
