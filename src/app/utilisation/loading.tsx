import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { SettingsFrame } from "../parametres/SettingsFrame";

/** Affiché instantanément au clic, dans le même cadre que la page. */
export default function UsageLoading() {
  return (
    <SettingsFrame section="Utilisation">
      <LoadingStatus />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </SettingsFrame>
  );
}
