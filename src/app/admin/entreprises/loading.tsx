import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function CompaniesLoading() {
  return (
    <AdminPageSkeleton section="Entreprises" width="max-w-5xl">
      <SkeletonText lines={2} />
      <Skeleton className="h-11 w-full rounded-xl" />
      <SkeletonRows count={6} />
    </AdminPageSkeleton>
  );
}
