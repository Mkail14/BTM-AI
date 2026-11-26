import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function AdminDevelopersLoading() {
  return (
    <AdminPageSkeleton section="Développeurs" width="max-w-3xl">
      <SkeletonText lines={2} />
      <SkeletonRows count={4} className="h-24 rounded-2xl" />
    </AdminPageSkeleton>
  );
}
