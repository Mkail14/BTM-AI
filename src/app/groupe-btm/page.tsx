import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";

export const metadata: Metadata = { title: "GROUPE BTM" };

/** Présentation du Groupe BTM : page réservée, contenu à venir. */
export default function GroupeBtmPage() {
  return (
    <SimplePage title="GROUPE BTM">
      <p className="text-sm text-fg-muted">Cette page est en préparation. Reviens bientôt.</p>
    </SimplePage>
  );
}
