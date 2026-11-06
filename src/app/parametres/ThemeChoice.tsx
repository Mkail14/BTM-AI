"use client";

import { useSyncExternalStore } from "react";
import { readThemeChoice, saveThemeChoice, subscribeThemeChoice, type ThemeChoice as Choice } from "@/components/ui/Theme";
import { RadioRow, SettingsGroup } from "./ui";

const CHOICES: { id: Choice; title: string; detail: string }[] = [
  { id: "system", title: "Comme mon appareil", detail: "Clair ou sombre, selon le réglage de ton téléphone ou de ton ordinateur." },
  { id: "light", title: "Clair", detail: "Toujours sur fond clair." },
  { id: "dark", title: "Sombre", detail: "Toujours sur fond sombre, plus doux pour les yeux le soir." },
];

export function ThemeChoice() {
  const current = useSyncExternalStore(subscribeThemeChoice, readThemeChoice, () => null);
  return (
    <SettingsGroup>
      {CHOICES.map((choice) => (
        <RadioRow key={choice.id} name="theme" checked={current === choice.id} onSelect={() => saveThemeChoice(choice.id)} title={choice.title} detail={choice.detail} />
      ))}
    </SettingsGroup>
  );
}
