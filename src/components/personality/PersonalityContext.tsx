"use client";

import { createContext, use, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_PERSONALITY, type PersonalityId } from "@/lib/ai/personalities";
import { PERSONALITY_LOOKS } from "@/lib/ai/personality-looks";

/** Plus de choix de personnalité : Tamilya a la même pour tout le monde (couleurs, avatar). */
type PersonalityContextValue = { current: PersonalityId };
const VALUE: PersonalityContextValue = { current: DEFAULT_PERSONALITY };

const PersonalityContext = createContext<PersonalityContextValue | null>(null);

export function useCurrentPersonality() {
  const value = use(PersonalityContext);
  if (!value) throw new Error("useCurrentPersonality doit être utilisé dans <PersonalityProvider>.");
  return value;
}

export function PersonalityProvider({ children }: { children: ReactNode }) {
  return <PersonalityContext value={VALUE}>{children}</PersonalityContext>;
}

/** Variable CSS --persona (couleur de la personnalité) pour la zone de conversation. */
export function personaStyle(id: PersonalityId): CSSProperties {
  return { "--persona": PERSONALITY_LOOKS[id].color } as CSSProperties;
}
