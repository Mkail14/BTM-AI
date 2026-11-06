import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { SettingsFrame } from "./SettingsFrame";

/** Affiché instantanément au clic sur « Paramètres », dans la même mise en page. */
export default function SettingsLoading() {
  return (
    <SettingsFrame>
      <LoadingStatus />
      <div className="flex min-h-0 flex-1 flex-col gap-5 md:flex-row md:gap-10">
        <div className="flex flex-col gap-2 md:w-56">
          <Skeleton className="mb-3 h-[4.75rem] rounded-2xl md:h-10" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl md:h-9" />
          ))}
        </div>
        <div className="hidden max-w-2xl min-w-0 flex-1 space-y-4 md:block">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="mt-6 h-48 rounded-2xl" />
        </div>
      </div>
    </SettingsFrame>
  );
}
