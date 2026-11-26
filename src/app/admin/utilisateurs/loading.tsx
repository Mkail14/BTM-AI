import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function UsersLoading() {
  return (
    <AdminPageSkeleton section="Utilisateurs" width="max-w-[1600px]">
      <SkeletonText lines={2} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[28rem] rounded-2xl" />
    </AdminPageSkeleton>
  );
}
