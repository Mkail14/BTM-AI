import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function CharacterLoading() {
  return (
    <AdminPageSkeleton section="Caractère et règles" width="max-w-[1600px]" fullHeight>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl lg:h-auto" />
        <Skeleton className="h-96 rounded-2xl lg:h-auto" />
      </div>
    </AdminPageSkeleton>
  );
}
