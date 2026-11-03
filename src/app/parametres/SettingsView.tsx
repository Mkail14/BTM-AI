"use client";

import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { IconDashboard, IconLock, IconMapPin, IconSparkle, IconStar, IconTrash, IconUser } from "@/components/ui/icons";

export type SettingsTab = "apercu" | "profil" | "adresse" | "awa" | "avis" | "securite" | "suppression";

type Section = {
  id: SettingsTab;
  label: string;
  hint: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  danger?: boolean;
};

const SECTIONS: Section[] = [
  { id: "apercu", label: "Vue d'ensemble", hint: "Ton compte en un coup d'œil", icon: IconDashboard },
  { id: "profil", label: "Profil", hint: "Ton nom et ton téléphone", icon: IconUser },
  { id: "adresse", label: "Adresses", hint: "Maison, travail, amis, famille", icon: IconMapPin },
  { id: "awa", label: "Tamilya", hint: "Son caractère et ce qu'elle retient", icon: IconSparkle },
  { id: "avis", label: "Mon avis", hint: "Ta note sur BTM IA, affichée sur l'accueil", icon: IconStar },
  { id: "securite", label: "Sécurité", hint: "E-mail, mot de passe, session", icon: IconLock },
  { id: "suppression", label: "Supprimer le compte", hint: "Effacer ton compte et tes données", icon: IconTrash, danger: true },
];

const TabContext = createContext<(tab: SettingsTab) => void>(() => {});

/** Bouton qui ouvre une autre rubrique (depuis la vue d'ensemble). */
export function GoToTab({ tab, className, children }: { tab: SettingsTab; className?: string; children: ReactNode }) {
  const go = useContext(TabContext);
  return (
    <button type="button" onClick={() => go(tab)} className={className}>
      {children}
    </button>
  );
}

/**
 * Paramètres en écran fixe : la page ne défile jamais. À gauche, la carte du
 * compte et le menu ; à droite, la rubrique ouverte (seule elle peut défiler).
 * Une pastille signale une rubrique à compléter (adresse manquante…).
 */
export function SettingsView({
  identity,
  panels,
  badges = {},
  initial,
}: {
  identity: ReactNode;
  panels: Partial<Record<SettingsTab, ReactNode>>;
  badges?: Partial<Record<SettingsTab, boolean>>;
  initial?: SettingsTab;
}) {
  const sections = SECTIONS.filter((s) => panels[s.id] !== undefined);
  const [active, setActive] = useState<SettingsTab>(initial ?? sections[0]?.id ?? "apercu");
  const current = sections.find((s) => s.id === active) ?? sections[0];
  const CurrentIcon = current?.icon;
  const navRef = useRef<HTMLUListElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const changed = useRef(false);

  // Téléphone : l'onglet choisi est ramené dans la bande (elle défile de côté), et la
  // rubrique ouverte remonte sous l'en-tête si on l'a choisie plus bas dans la page.
  useEffect(() => {
    if (!changed.current) return;
    navRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    const top = sectionRef.current?.getBoundingClientRect().top ?? 0;
    if (window.matchMedia("(max-width: 767px)").matches && top < 56) {
      window.scrollTo({ top: window.scrollY + top - 140, behavior: "smooth" });
    }
  }, [active]);
  const open = (tab: SettingsTab) => {
    changed.current = true;
    setActive(tab);
  };

  return (
    <TabContext.Provider value={open}>
      <div className="flex flex-1 flex-col gap-4 md:min-h-0 md:flex-row md:gap-6">
        <aside className="shrink-0 md:flex md:w-64 md:flex-col md:gap-4">
          <div className="hidden md:block">{identity}</div>
          <nav aria-label="Rubriques des paramètres">
            {/* Téléphone : onglets qui défilent de côté ; tablette et ordinateur : menu vertical. */}
            <ul ref={navRef} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0">
              {sections.map((s, i) => {
                const selected = s.id === current?.id;
                const Icon = s.icon;
                return (
                  <li key={s.id} className={`shrink-0 ${s.danger && i > 0 ? "md:mt-3 md:border-t md:border-border md:pt-3" : ""}`}>
                    <button
                      type="button"
                      onClick={() => open(s.id)}
                      aria-current={selected ? "page" : undefined}
                      className={`relative flex w-full items-center gap-2 rounded-full border px-3.5 py-2 text-sm whitespace-nowrap transition md:gap-3 md:rounded-xl md:border-0 md:px-3 md:py-2 md:text-left ${
                        selected
                          ? s.danger
                            ? "border-transparent bg-danger-soft font-medium text-danger"
                            : "border-transparent bg-fg font-medium text-bg md:bg-bg md:text-fg md:shadow-sm md:ring-1 md:ring-border"
                          : s.danger
                            ? "border-border text-danger/80 hover:bg-danger-soft hover:text-danger"
                            : "border-border bg-bg text-fg-muted hover:text-fg md:bg-transparent md:hover:bg-bg-muted"
                      }`}
                    >
                      <span
                        className={`grid shrink-0 place-items-center md:size-8 md:rounded-lg ${
                          selected && !s.danger ? "md:bg-accent-soft md:text-accent" : ""
                        }`}
                      >
                        <Icon width={16} height={16} />
                      </span>
                      <span className="min-w-0">{s.label}</span>
                      {badges[s.id] ? (
                        <span aria-label="à compléter" className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warning md:static md:ml-auto" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {current ? (
          <section
            ref={sectionRef}
            key={current.id}
            aria-labelledby={`rubrique-${current.id}`}
            className="flex flex-1 animate-[correct-fade_.18s_ease-out] flex-col rounded-3xl border border-border bg-bg shadow-sm md:min-h-0 md:overflow-hidden"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4 md:px-7">
              {CurrentIcon ? (
                <span
                  aria-hidden="true"
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${current.danger ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"}`}
                >
                  <CurrentIcon width={18} height={18} />
                </span>
              ) : null}
              <div className="min-w-0">
                <h2 id={`rubrique-${current.id}`} className={`text-lg leading-tight font-semibold tracking-tight ${current.danger ? "text-danger" : ""}`}>
                  {current.label}
                </h2>
                <p className="truncate text-sm text-fg-muted">{current.hint}</p>
              </div>
            </header>
            <div className="scrollbar-none flex-1 px-5 py-5 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:px-7 md:py-6">
              <div className="max-w-2xl">{panels[current.id]}</div>
            </div>
          </section>
        ) : null}
      </div>
    </TabContext.Provider>
  );
}
