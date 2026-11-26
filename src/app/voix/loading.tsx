import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Même écran que la voix : le grand rond au centre, les boutons en bas. */
export default function VoiceLoading() {
  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-10 bg-bg">
      <LoadingStatus />
      <Skeleton className="size-48 rounded-full" />
      <div className="flex gap-6">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="size-14 rounded-full" />
      </div>
    </main>
  );
}
