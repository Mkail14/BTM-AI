import Link from "next/link";
import { SimplePage } from "@/components/layout/SimplePage";

export default function NotFound() {
  return (
    <SimplePage title="Page introuvable">
      <p className="text-sm text-fg-muted">Cette page n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
      <Link href="/" className="mt-4 inline-block font-medium text-accent hover:underline">
        Revenir à BTM AI
      </Link>
    </SimplePage>
  );
}
