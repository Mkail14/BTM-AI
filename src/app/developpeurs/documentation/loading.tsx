import { DevShell } from "../ui";
import { LoadingStatus, Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function DocumentationLoading() {
  return (
    <DevShell>
      <LoadingStatus />
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10">
        <Skeleton className="h-4 w-32" />
        <SkeletonText lines={3} />
        <Skeleton className="h-40 rounded-3xl" />
        <SkeletonText lines={4} />
      </section>
    </DevShell>
  );
}
