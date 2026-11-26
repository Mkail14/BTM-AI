import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function LearningLoading() {
  return (
    <AdminPageSkeleton section="Apprentissage du shimaoré" width="max-w-4xl">
      <SkeletonText lines={2} />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <SkeletonRows count={6} />
    </AdminPageSkeleton>
  );
}
