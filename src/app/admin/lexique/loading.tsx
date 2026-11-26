import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function LexiconLoading() {
  return (
    <AdminPageSkeleton section="Lexique shimaoré" width="max-w-[1600px]" fullHeight>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Skeleton className="h-[60dvh] rounded-2xl lg:h-auto" />
        <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
          <SkeletonRows count={8} className="h-12 rounded-xl" />
        </div>
      </div>
    </AdminPageSkeleton>
  );
}
