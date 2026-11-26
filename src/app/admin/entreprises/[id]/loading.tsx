import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function CompanyLoading() {
  return (
    <AdminPageSkeleton section="Entreprises" width="max-w-4xl">
      <Skeleton className="h-4 w-32" />
      <SkeletonText lines={1} />
      <Skeleton className="h-[28rem] rounded-2xl" />
    </AdminPageSkeleton>
  );
}
