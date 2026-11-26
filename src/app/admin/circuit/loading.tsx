import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Plein écran comme le schéma du circuit : quelques blocs à la place des nœuds. */
export default function CircuitLoading() {
  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-bg-subtle">
      <LoadingStatus />
      <div className="flex items-center gap-10">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
