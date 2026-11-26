import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function VoiceSettingsLoading() {
  return (
    <AdminPageSkeleton section="Voix de Tamilya" width="max-w-3xl">
      <SkeletonText lines={2} />
      <Skeleton className="h-40 rounded-2xl" />
      <SkeletonRows count={3} className="h-16 rounded-2xl" />
    </AdminPageSkeleton>
  );
}
