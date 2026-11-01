"use client";

import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { IconLock, IconSparkle, IconTrash, IconUser } from "@/components/ui/icons";

export type SettingsTab = "profil" | "personnalite" | "securite" | "suppression";

type Section = {
  id: SettingsTab;
  label: string;
  hint: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  danger?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "profil",
    label: "Profil",
    hint: "Votre nom dans BTM AI",
    icon: IconUser,
  },
  {
    id: "personnalite",
    label: "Personnalité d'Awa",
    hint: "Son caractère avec vous",
    icon: IconSparkle,
  },
  {
    id: "securite",
    label: "Connexion et sécurité",
    hint: "E-mail, mot de passe, session",
    icon: IconLock,
  },
  {
    id: "suppression",
    label: "Supprimer le compte",
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
        <ul className="flex gap-1.5 [scrollbar-width:none] overflow-x-auto md:flex-col md:overflow-visible">
          {sections.map((s) => {
            const selected = s.id === current?.id;
            const Icon = s.icon;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    selected
                      ? s.danger
                        ? "bg-danger-soft text-danger"
                        : "bg-bg font-medium text-fg shadow-sm ring-1 ring-border"
                      : s.danger
                        ? "text-danger/80 hover:bg-danger-soft hover:text-danger"
                        : "text-fg-muted hover:bg-bg-muted hover:text-fg"
                  }`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      selected && !s.danger ? "bg-accent-soft text-accent" : ""
                    }`}
                  >
                    <Icon width={17} height={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap">{s.label}</span>
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
