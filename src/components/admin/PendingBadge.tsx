/** Pastille ronde avec le nombre de demandes qui attendent un administrateur (rien à 0). */
export function PendingBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} demande${count > 1 ? "s" : ""} en attente`}
      className={`inline-grid min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-5 font-semibold text-danger-fg tabular-nums ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
