"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { ProfileFormState } from "./actions";

/** Styles communs des Paramètres : tous les champs et boutons de la page viennent d'ici. */
export const INPUT_CLASS =
  "mt-1.5 h-11 w-full rounded-xl border border-border bg-bg px-3.5 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft sm:text-sm";
export const PRIMARY = "btn-rose h-10 rounded-full px-5 text-sm font-medium";
export const SECONDARY =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg px-4 text-sm font-medium whitespace-nowrap transition hover:bg-bg-muted disabled:opacity-50";
export const DANGER =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-bg px-4 text-sm font-medium whitespace-nowrap text-danger transition hover:bg-danger-soft disabled:opacity-50";
/** Petite action dans une liste (« Oublier »), sans cadre. */
export const QUIET = "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-bg-muted hover:text-fg disabled:opacity-50";

export function Feedback({ state }: { state: ProfileFormState | null }) {
  if (!state?.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}>
      {state.message}
    </p>
  );
}

/** Lance une action serveur, garde son résultat et relit la page si elle a réussi. */
export function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ProfileFormState | null>(null);
  const run = (action: () => Promise<ProfileFormState>, after?: () => void) =>
    start(async () => {
      const result = await action();
      setState(result);
      if (result.status === "saved") {
        after?.();
        router.refresh();
      }
    });
  return { pending, state, run };
}

/** Bloc de réglages : un titre facultatif, puis des lignes dans un même cadre. */
export function SettingsGroup({ title, description, footer, children }: { title?: string; description?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      {title ? (
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </div>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg">{children}</div>
      {footer}
    </section>
  );
}

/** Ligne : le nom du réglage, sa valeur, et l'action à droite. */
export function SettingsRow({ label, value, children }: { label: ReactNode; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="text-sm font-medium sm:w-40 sm:shrink-0">{label}</div>
        {value !== undefined ? <div className="min-w-0 flex-1 text-sm break-words text-fg-muted">{value}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Zone qui s'ouvre à la place d'une ligne pour la modifier. */
export function RowEditor({ children }: { children: ReactNode }) {
  return <div className="profile-swap px-4 py-4 sm:px-5 sm:py-5">{children}</div>;
}

/** Choix unique dans un groupe : vrai bouton radio, utilisable au clavier. */
export function RadioRow({
  name,
  checked,
  onSelect,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5 transition hover:bg-bg-subtle sm:px-5">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
          checked ? "border-accent" : "border-border"
        }`}
      >
        {checked ? <span className="size-2.5 rounded-full bg-accent" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {detail ? <span className="block text-sm text-fg-muted">{detail}</span> : null}
      </span>
    </label>
  );
}
