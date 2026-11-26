/** Bloc gris animé pour les écrans de chargement (loading.tsx). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-bg-muted ${className}`} />;
}

/** Texte lu par les lecteurs d'écran pendant le chargement. */
export function LoadingStatus() {
  return (
    <p role="status" className="sr-only">
      Chargement…
    </p>
  );
}

/** Titre et quelques lignes de texte en attente. */
export function SkeletonText({ lines = 3, title = true }: { lines?: number; title?: boolean }) {
  return (
    <div className="space-y-3">
      {title ? <Skeleton className="h-7 w-56" /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Liste de lignes de même hauteur. */
export function SkeletonRows({ count = 4, className = "h-14 rounded-xl" }: { count?: number; className?: string }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`w-full ${className}`} />
      ))}
    </div>
  );
}
