import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function WaterLoading() {
  return (
    <AdminPageSkeleton section="Tours d'eau" width="max-w-3xl">
      <SkeletonText lines={2} />
      <SkeletonRows count={6} />
    </AdminPageSkeleton>
  );
}
