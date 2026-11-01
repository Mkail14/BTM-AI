"use client";

import { useState, type ReactNode } from "react";

type Tab = { id: string; label: string; count?: number; highlight?: boolean; content: ReactNode };

/**
 * Outils du lexique dans un seul panneau à onglets : chaque onglet défile
 * à l'intérieur, la page reste sur un écran. Les onglets restent montés
 * (masqués) pour ne pas perdre une recherche ou une saisie en cours.
 */
export function LexiconTabs({ tabs }: { tabs: Tab[] }) {
  const [current, setCurrent] = useState(tabs[0]?.id);
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-bg">
      <div role="tablist" aria-label="Outils du lexique" className="flex shrink-0 gap-1 border-b border-border p-1.5">
        {tabs.map((tab) => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`onglet-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panneau-${tab.id}`}
              onClick={() => setCurrent(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-sm font-medium transition ${
                selected ? "bg-bg-muted text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    tab.highlight ? "bg-accent text-accent-fg" : "bg-bg-subtle text-fg-muted"
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panneau-${tab.id}`}
          aria-labelledby={`onglet-${tab.id}`}
          hidden={tab.id !== current}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {tab.content}
        </div>
      ))}
    </section>
  );
}
