import { DevShell } from "@/app/developpeurs/ui";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function CompanySpaceLoading() {
  return (
    <DevShell>
      <LoadingStatus />
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-12 w-full max-w-lg rounded-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </section>
    </DevShell>
  );
}
