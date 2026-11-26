import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LoadingStatus } from "@/components/ui/Skeleton";

/** Cadre d'attente d'une page d'administration : même barre et même largeur que la vraie page. */
export function AdminPageSkeleton({
  section,
  width = "max-w-3xl",
  fullHeight = false,
  children,
}: {
  section: string;
  width?: string;
  /** Page qui tient dans l'écran sur ordinateur (lexique, connaissances…). */
  fullHeight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-h-dvh flex-col bg-bg-subtle ${fullHeight ? "lg:h-dvh lg:overflow-hidden" : ""}`}>
      <AdminHeader section={section} email={null} />
      <main className={`mx-auto flex w-full ${width} min-h-0 flex-1 flex-col gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8`}>
        <LoadingStatus />
        {children}
      </main>
    </div>
  );
}
