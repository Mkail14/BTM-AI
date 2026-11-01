import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { SettingsFrame } from "./SettingsFrame";

/** Affiché instantanément au clic sur « Paramètres », dans le même cadre fixe. */
export default function SettingsLoading() {
  return (
    <SettingsFrame>
      <LoadingStatus />
      <div className="flex shrink-0 items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex gap-1.5 md:w-64 md:flex-col">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-36 rounded-xl md:w-full" />
          ))}
        </div>
        <Skeleton className="min-h-0 flex-1 rounded-2xl" />
      </div>
    </SettingsFrame>
  );
}
