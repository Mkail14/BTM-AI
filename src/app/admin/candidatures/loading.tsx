import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function ApplicationsLoading() {
  return (
    <AdminPageSkeleton section="Candidatures" width="max-w-5xl">
      <SkeletonText lines={2} />
      <SkeletonRows count={5} className="h-20 rounded-2xl" />
    </AdminPageSkeleton>
  );
}
