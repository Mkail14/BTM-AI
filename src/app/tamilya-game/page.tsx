import type { Metadata } from "next";
import { ComingSoonPage } from "@/components/landing/ComingSoonPage";

export const metadata: Metadata = { title: "Tamilya Game" };

export default function TamilyaGamePage() {
  return <ComingSoonPage title="Tamilya" accent="Game" text="Cette page arrive bientôt." />;
}
