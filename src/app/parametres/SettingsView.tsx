"use client";

import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { IconLock, IconTrash, IconUser } from "@/components/ui/icons";

export type SettingsTab = "profil" | "securite" | "suppression";

type Section = {
  id: SettingsTab;
  label: string;
  /** Libellé des onglets sur téléphone, où les trois rubriques tiennent côte à côte. */
  short: string;
  hint: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  danger?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "profil",
    label: "Profil",
    short: "Profil",
    hint: "Votre nom dans BTM AI",
    icon: IconUser,
  },
  {
    id: "securite",
    label: "Connexion et sécurité",
    short: "Sécurité",
    hint: "E-mail, mot de passe, session",
    icon: IconLock,
  },
  {
    id: "suppression",
    label: "Supprimer le compte",
    short: "Supprimer",
    hint: "Effacer vos données",
    icon: IconTrash,
    danger: true,
  },
];

/**
 * Paramètres en écran fixe : la page ne défile jamais. Le menu change de
 * rubrique sans rechargement ; seul le panneau défile si son contenu déborde.
 */
export function SettingsView({ panels }: { panels: Partial<Record<SettingsTab, ReactNode>> }) {
  const sections = SECTIONS.filter((s) => panels[s.id] !== undefined);
  const [active, setActive] = useState<SettingsTab>(sections[0]?.id ?? "profil");
  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-6">
      <nav aria-label="Rubriques des paramètres" className="shrink-0 md:w-64">
        {/* Téléphone : onglets de même largeur, tous visibles ; tablette et ordinateur : menu vertical. */}
        <ul
          className="grid gap-1 rounded-2xl border border-border bg-bg p-1 md:flex md:flex-col md:gap-1.5 md:border-0 md:bg-transparent md:p-0"
          style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
        >
          {sections.map((s) => {
            const selected = s.id === current?.id;
            const Icon = s.icon;
            return (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm transition md:justify-start md:gap-3 md:px-3 md:text-left ${
                    selected
                      ? s.danger
                        ? "bg-danger-soft text-danger"
                        : "bg-bg-muted font-medium text-fg md:bg-bg md:shadow-sm md:ring-1 md:ring-border"
                      : s.danger
                        ? "text-danger/80 hover:bg-danger-soft hover:text-danger"
                        : "text-fg-muted hover:bg-bg-muted hover:text-fg"
                  }`}
                >
                  <span
                    className={`hidden size-6 shrink-0 place-items-center rounded-lg min-[390px]:grid md:size-8 ${
                      selected && !s.danger ? "bg-accent-soft text-accent" : ""
                    }`}
                  >
                    <Icon width={17} height={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate md:hidden">{s.short}</span>
                    <span className="hidden whitespace-nowrap md:block">{s.label}</span>
                    <span className="hidden text-xs font-normal text-fg-muted md:block">{s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {current ? (
        <section
          key={current.id}
          aria-labelledby={`rubrique-${current.id}`}
          className="flex min-h-0 flex-1 animate-[correct-fade_.18s_ease-out] flex-col overflow-hidden rounded-2xl border border-border bg-bg"
        >
          <header className="shrink-0 border-b border-border px-5 py-4 md:px-6">
            <h2 id={`rubrique-${current.id}`} className={`font-semibold ${current.danger ? "text-danger" : ""}`}>
              {current.label}
            </h2>
            <p className="text-sm text-fg-muted">{current.hint}</p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">
            {panels[current.id]}
          </div>
        </section>
      ) : null}
    </div>
  );
}
