import { AdminHeader } from "@/components/admin/AdminHeader";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic sur une page d'administration. */
export default function AdminLoading() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="" email={null} />
      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-4 p-4">
        <LoadingStatus />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </main>
    </div>
  );
}
