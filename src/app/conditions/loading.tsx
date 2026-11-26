import { SimplePage } from "@/components/layout/SimplePage";
import { LoadingStatus, SkeletonText } from "@/components/ui/Skeleton";

/** Affiché instantanément au clic, dans la même mise en page que la page. */
export default function TermsLoading() {
  return (
    <SimplePage title="Conditions d'utilisation">
      <LoadingStatus />
      <div className="space-y-8">
        <SkeletonText lines={3} />
        <SkeletonText lines={4} />
        <SkeletonText lines={3} />
      </div>
    </SimplePage>
  );
}
