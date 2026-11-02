import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { SettingsFrame } from "../parametres/SettingsFrame";

/** Affiché instantanément au clic, dans la même mise en page que le portefeuille. */
export default function WalletLoading() {
  return (
    <SettingsFrame section="Portefeuille">
      <LoadingStatus />
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Skeleton className="h-80 w-full rounded-3xl" />
          <Skeleton className="hidden h-44 w-full rounded-3xl lg:block" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </SettingsFrame>
  );
}
