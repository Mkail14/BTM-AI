import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function MemoryLoading() {
  return (
    <AdminPageSkeleton section="Mémoire de Tamilya" width="max-w-[1600px]">
      <SkeletonText lines={3} />
      <SkeletonRows count={6} className="h-16 rounded-2xl" />
    </AdminPageSkeleton>
  );
}
