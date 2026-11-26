import { LandingNav } from "@/components/landing/LandingNav";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Même écran que la page Partenaires : le titre puis la frise. */
export default function PartnersLoading() {
  return (
    <div className="landing fixed inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <LoadingStatus />
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-12 w-72 rounded-2xl" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex w-full max-w-5xl gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 min-w-48 flex-1 rounded-3xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
