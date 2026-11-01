"use client";

/** Une option, comme dans les questions à choix de Claude : numéro, libellé, détail discret. */
export function ChoiceOption({ index, label, hint, onClick }: { index: number; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-bg-muted pointer-coarse:py-3"
    >
      <span
        className="grid size-6 shrink-0 place-items-center rounded-md border border-border text-xs text-fg-muted tabular-nums transition-colors group-hover:border-[var(--persona,var(--accent))] group-hover:text-[var(--persona,var(--accent))]"
        aria-hidden="true"
      >
        {index}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {hint ? <span className="shrink-0 text-xs text-fg-muted">{hint}</span> : null}
    </button>
  );
}
