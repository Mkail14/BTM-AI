import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function FeaturesLoading() {
  return (
    <AdminPageSkeleton section="Fonctionnalités" width="max-w-5xl">
      <SkeletonText lines={2} />
      <SkeletonRows count={7} className="h-16 rounded-2xl" />
    </AdminPageSkeleton>
  );
}
