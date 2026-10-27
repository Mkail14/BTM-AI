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
