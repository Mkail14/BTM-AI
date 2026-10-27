import { SimplePage } from "@/components/layout/SimplePage";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic sur « Paramètres ». */
export default function SettingsLoading() {
  return (
    <SimplePage title="Paramètres">
      <LoadingStatus />
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </SimplePage>
  );
}
