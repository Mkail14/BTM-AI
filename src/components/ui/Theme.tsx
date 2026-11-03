"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "./icons";
import { THEME_STORAGE_KEY } from "./ThemeScript";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Thème affiché en ce moment (posé par ThemeScript). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Stockage bloqué (navigation privée) : le choix vaut pour cette page seulement.
  }
  const apply = (window as Window & { __btmTheme?: (t: Theme) => void }).__btmTheme;
  if (apply) apply(theme);
  else document.documentElement.dataset.theme = theme;
}

/**
 * Bouton soleil / lune : passe au thème opposé. Vide côté serveur (thème encore inconnu).
 * `withLabel` : icône suivie de « Mode sombre » / « Mode clair » (menu du téléphone).
 */
export function ThemeToggle({ className = "", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? "Passer en mode sombre" : "Passer en mode clair"}
      title={next === "dark" ? "Mode sombre" : "Mode clair"}
      className={className}
    >
      {theme === null ? null : theme === "dark" ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
      {withLabel && theme !== null ? <span>{next === "dark" ? "Mode sombre" : "Mode clair"}</span> : null}
    </button>
  );
}
