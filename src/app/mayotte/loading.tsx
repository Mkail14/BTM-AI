import { LandingNav } from "@/components/landing/LandingNav";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Même écran que la page Mayotte : le titre à gauche, la carte à droite. */
export default function MayotteLoading() {
  return (
    <div className="landing fixed inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1024px] flex-1 flex-col gap-5 px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:flex-row md:items-center md:gap-10 md:px-6 md:py-8">
        <LoadingStatus />
        <div className="flex shrink-0 flex-col items-center gap-3 md:flex-1 md:items-start">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="min-h-0 flex-1 rounded-3xl md:h-full md:max-h-[640px]" />
      </main>
    </div>
  );
}
