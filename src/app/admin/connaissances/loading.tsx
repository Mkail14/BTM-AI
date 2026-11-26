import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function KnowledgeLoading() {
  return (
    <AdminPageSkeleton section="Connaissances" width="max-w-[1600px]" fullHeight>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <Skeleton className="h-[70dvh] rounded-2xl lg:h-auto lg:flex-1" />
    </AdminPageSkeleton>
  );
}
