import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function SoundsLoading() {
  return (
    <AdminPageSkeleton section="Sons" width="max-w-3xl">
      <SkeletonText lines={2} />
      <SkeletonRows count={6} className="h-16 rounded-2xl" />
    </AdminPageSkeleton>
  );
}
