import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { SettingsFrame } from "./SettingsFrame";

/** Affiché instantanément au clic sur « Paramètres », dans le même cadre fixe. */
export default function SettingsLoading() {
  return (
    <SettingsFrame>
      <LoadingStatus />
      <Skeleton className="h-24 shrink-0 rounded-3xl md:h-[6.5rem]" />
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
        <div className="flex gap-1.5 overflow-hidden md:w-60 md:flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-full md:h-12 md:w-full md:rounded-xl" />
          ))}
        </div>
        <Skeleton className="min-h-0 flex-1 rounded-3xl" />
      </div>
    </SettingsFrame>
  );
}
