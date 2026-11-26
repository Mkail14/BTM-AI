import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Même écran que le verrou : une carte au centre. */
export default function LockLoading() {
  return (
    <main className="persona-surface relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <LoadingStatus />
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </main>
  );
}
