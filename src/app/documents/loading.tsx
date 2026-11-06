import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { SettingsFrame } from "../parametres/SettingsFrame";

/** Affiché instantanément au clic, dans la même mise en page que Mes documents. */
export default function DocumentsLoading() {
  return (
    <SettingsFrame section="Mes documents">
      <LoadingStatus />
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </SettingsFrame>
  );
}
