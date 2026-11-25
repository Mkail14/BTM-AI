/** Pastille ronde avec le nombre de demandes qui attendent un administrateur (rien à 0). */
export function PendingBadge({
  count,
  className = "",
  tone = "danger",
}: {
  count: number;
  className?: string;
  /** « light » : fond blanc et chiffre rose, posé sur un bouton rose. */
  tone?: "danger" | "light";
}) {
  if (count <= 0) return null;
  const colors = tone === "light" ? "bg-white text-accent" : "bg-danger text-danger-fg";
  return (
    <span
      aria-label={`${count} demande${count > 1 ? "s" : ""} en attente`}
      className={`inline-grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums ${colors} ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
