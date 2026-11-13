"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type ComponentType, type MouseEvent, type ReactNode, type SVGProps } from "react";
import { IconFolder, IconLock, IconMapPin, IconShield, IconSparkle, IconStar, IconSun, IconUser, IconWallet } from "@/components/ui/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignOutButton } from "./SignOutButton";

export type SettingsTab = "profil" | "adresse" | "sos" | "securite" | "tamilya" | "apparence" | "avis";

type Section = { id: SettingsTab; label: string; hint: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

const GROUPS: { title: string; sections: Section[] }[] = [
  {
    title: "Mon compte",
    sections: [
      { id: "profil", label: "Profil", hint: "Ton nom, ton téléphone et ton adresse e-mail.", icon: IconUser },
      { id: "adresse", label: "Adresses", hint: "Tu choisis l'une d'elles à chaque commande. Tamilya sait aussi ce qui est près de chez toi.", icon: IconMapPin },
      { id: "sos", label: "SOS", hint: "Les proches prévenus si tu écris « SOS » à Tamilya Connect.", icon: IconShield },
      { id: "securite", label: "Sécurité", hint: "Ton mot de passe, ta session et la suppression du compte.", icon: IconLock },
    ],
  },
  {
    title: "Préférences",
    sections: [
      { id: "tamilya", label: "Tamilya", hint: "Ce qu'elle retient de toi et comment tu lui parles.", icon: IconSparkle },
      { id: "apparence", label: "Apparence", hint: "Le thème du site sur cet appareil.", icon: IconSun },
      { id: "avis", label: "Mon avis", hint: "Ta note sur Tamilya, affichée sur la page d'accueil.", icon: IconStar },
    ],
  },
];

const SECTIONS = GROUPS.flatMap((group) => group.sections);

/** Ancienne adresse encore possible dans un lien : ?rubrique=suppression ouvre la Sécurité. */
function tabFrom(value: string | null): SettingsTab | null {
  if (value === "suppression") return "securite";
  return SECTIONS.find((section) => section.id === value)?.id ?? null;
}

const LIST = "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg md:space-y-0.5 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent";
const ITEM = "flex min-h-13 items-center gap-3 px-4 text-sm transition md:min-h-9 md:rounded-lg md:px-2.5";
const IDLE = "md:text-fg-muted md:hover:bg-bg-muted/60 md:hover:text-fg";
const GROUP_TITLE = "mb-1.5 px-1 text-xs font-medium text-fg-muted md:px-2.5";

const Chevron = () => (
  <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-fg-muted/60 md:hidden">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

/**
 * Paramètres. Ordinateur et tablette : menu à gauche, rubrique à droite, seule la
 * rubrique défile. Téléphone : la liste des rubriques, puis une rubrique à la fois
 * avec retour à la liste. La rubrique ouverte est dans l'adresse (?rubrique=…) :
 * le bouton retour du téléphone et les liens directs fonctionnent.
 */
export function SettingsView({
  name,
  email,
  isAdmin,
  balance,
  panels,
  toComplete = [],
}: {
  name: string;
  email: string | null;
  isAdmin: boolean;
  /** Null : pas de portefeuille pour ce compte (réservé aux admins pour l'instant). */
  balance: string | null;
  panels: Record<SettingsTab, ReactNode>;
  /** Rubriques où il manque quelque chose (adresse, téléphone). */
  toComplete?: SettingsTab[];
}) {
  const active = tabFrom(useSearchParams().get("rubrique"));
  // « Mes documents » seulement s'il est ouvert à cette personne (/admin/fonctionnalites).
  const documents = useAuth().user?.features?.includes("documents") ?? false;
  const current = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const fromList = useRef(false);
  const shown = useRef(active);

  // Rubrique changée à la main : on remonte en haut et le lecteur d'écran annonce son titre.
  useEffect(() => {
    if (shown.current === active) return;
    shown.current = active;
    window.scrollTo({ top: 0 });
    panel.current?.scrollTo({ top: 0 });
    if (active) heading.current?.focus({ preventScroll: true });
  }, [active]);

  const open = (event: MouseEvent, tab: SettingsTab) => {
    // Ctrl + clic, clic milieu : le navigateur ouvre un nouvel onglet.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    fromList.current = active === null;
    window.history.pushState(null, "", `?rubrique=${tab}`);
  };

  const backToList = (event: MouseEvent) => {
    event.preventDefault();
    // Arrivée directe sur la rubrique (lien d'une commande) : il n'y a pas de liste à rejouer.
    if (fromList.current) window.history.back();
    else window.history.replaceState(null, "", window.location.pathname);
  };

  return (
    <div className="flex flex-1 flex-col md:-mb-8 md:min-h-0 md:flex-row md:gap-10">
      <aside className={`shrink-0 flex-col gap-5 md:flex md:w-56 md:gap-6 md:overflow-y-auto md:[scrollbar-width:none] ${active ? "hidden" : "flex"}`}>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg p-4 md:rounded-none md:border-0 md:bg-transparent md:px-2.5 md:py-0">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-semibold text-accent uppercase md:size-10">
            {name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{name}</span>
              {isAdmin ? <span className="shrink-0 rounded-full bg-bg-muted px-2 py-px text-[11px] font-medium text-fg-muted">Admin</span> : null}
            </p>
            {email ? <p className="truncate text-xs text-fg-muted">{email}</p> : null}
          </div>
        </div>

        <nav aria-label="Rubriques des paramètres" className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className={GROUP_TITLE}>{group.title}</p>
              <ul className={LIST}>
                {group.sections.map((section) => {
                  const selected = section.id === current.id;
                  const Icon = section.icon;
                  return (
                    <li key={section.id}>
                      <a
                        href={`?rubrique=${section.id}`}
                        onClick={(event) => open(event, section.id)}
                        aria-current={selected ? "page" : undefined}
                        className={`${ITEM} ${selected ? "md:bg-bg-muted md:font-medium" : IDLE}`}
                      >
                        <Icon width={18} height={18} className="shrink-0 text-fg-muted" />
                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                        {toComplete.includes(section.id) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                            <span className="md:sr-only">À compléter</span>
                            <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
                          </span>
                        ) : null}
                        <Chevron />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div>
            <p className={GROUP_TITLE}>Raccourcis</p>
            <ul className={LIST}>
              {balance !== null ? (
              <li>
                <a href="/portefeuille" className={`${ITEM} ${IDLE}`}>
                  <IconWallet width={18} height={18} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate">Portefeuille</span>
                  <span className="text-sm text-fg-muted tabular-nums md:text-xs">{balance}</span>
                  <Chevron />
                </a>
              </li>
              ) : null}
              {documents ? (
                <li>
                  <a href="/documents" className={`${ITEM} ${IDLE}`}>
                    <IconFolder width={18} height={18} className="shrink-0 text-fg-muted" />
                    <span className="min-w-0 flex-1 truncate">Mes documents</span>
                    <Chevron />
                  </a>
                </li>
              ) : null}
            </ul>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-bg md:hidden">
            <SignOutButton row />
          </div>
        </nav>
      </aside>

      <section
        ref={panel}
        aria-labelledby="rubrique-titre"
        className={`min-w-0 flex-1 md:block md:min-h-0 md:overflow-y-auto md:overscroll-contain md:[scrollbar-width:none] ${active ? "block" : "hidden"}`}
      >
        {/* Espace en bas : le rond d'aide ne cache pas la dernière ligne. */}
        <div key={current.id} className="max-w-2xl animate-[correct-fade_.18s_ease-out] pb-24 md:pb-20">
          <a href="?" onClick={backToList} className="-ml-1.5 mb-3 inline-flex items-center gap-1 rounded-lg py-1.5 pr-2 text-sm font-medium text-fg-muted hover:text-fg md:hidden">
            <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6" />
            </svg>
            Paramètres
          </a>
          <header className="mb-6">
            <h2 id="rubrique-titre" ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
              {current.label}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{current.hint}</p>
          </header>
          <div className="space-y-8">{panels[current.id]}</div>
        </div>
      </section>
    </div>
  );
}
