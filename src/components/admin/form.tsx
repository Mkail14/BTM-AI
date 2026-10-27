import type { ReactNode } from "react";

/** Éléments de formulaire communs aux pages d'édition de l'administration. */

export const inputClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent";

export const primaryButton =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50";

export const secondaryButton =
  "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-bg-muted disabled:opacity-60";

export function AdminCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-bg p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-fg-muted">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`mt-1 block text-right text-xs tabular-nums ${value.length > max * 0.9 ? "text-danger" : "text-fg-muted"}`}>
      {value.length} / {max}
    </span>
  );
}

/** Intitulé de page : titre et phrase d'explication. */
export function PageIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-fg-muted">{children}</p>
    </div>
  );
}

export function MigrationWarning({ file }: { file: string }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm">
      Les données ne peuvent pas être lues : appliquez la migration <code className="font-mono">{file}</code> dans
      Supabase. En attendant, l&apos;enregistrement échouera.
    </p>
  );
}

/** Message d'état après une action (role=status, rouge en cas d'échec). */
export function ActionStatus({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-sm ${result.ok ? "text-fg-muted" : "text-danger"}`}>
      {result.message}
    </p>
  );
}
