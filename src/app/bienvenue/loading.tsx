import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Même écran que les étapes de bienvenue : une question au centre, le bouton en bas. */
export default function WelcomeLoading() {
  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <div className="relative z-10 flex h-full w-full flex-col items-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <LoadingStatus />
        <Skeleton className="h-1.5 w-full max-w-md rounded-full" />
        <div className="flex w-full max-w-md flex-1 flex-col justify-center gap-4">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-4 h-12 w-full rounded-xl" />
        </div>
        <Skeleton className="h-12 w-full max-w-md rounded-full" />
      </div>
    </main>
  );
}
