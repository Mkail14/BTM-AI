import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic (accueil, conversation), la barre latérale reste en place. */
export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <LoadingStatus />
      <div className="h-14 shrink-0" />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-3 sm:px-6">
        <Skeleton className="mx-auto h-14 w-full max-w-3xl rounded-2xl" />
      </div>
    </div>
  );
}
