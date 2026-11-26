import { DevShell } from "./ui";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function DevelopersLoading() {
  return (
    <DevShell>
      <LoadingStatus />
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10">
        <div className="flex flex-col items-center gap-5 py-16">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-12 w-full max-w-lg rounded-2xl" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-11 w-44 rounded-full" />
        </div>
        <Skeleton className="h-64 rounded-3xl" />
      </section>
    </DevShell>
  );
}
