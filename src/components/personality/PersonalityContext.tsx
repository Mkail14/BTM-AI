"use client";

import { createContext, use, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DEFAULT_PERSONALITY, type PersonalityId } from "@/lib/ai/personalities";
import { PERSONALITY_LOOKS } from "@/lib/ai/personality-looks";

type PersonalityContextValue = {
  /** Personnalité affichée : choix en cours d'enregistrement, sinon celle du compte. */
  current: PersonalityId;
  /** Choix optimiste (avant la confirmation du serveur), null pour revenir au compte. */
  setChosen: (id: PersonalityId | null) => void;
};

const PersonalityContext = createContext<PersonalityContextValue | null>(null);

export function useCurrentPersonality() {
  const value = use(PersonalityContext);
  if (!value) throw new Error("useCurrentPersonality doit être utilisé dans <PersonalityProvider>.");
  return value;
}

export function PersonalityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [chosen, setChosen] = useState<{ userId: string | null; id: PersonalityId } | null>(null);
  const userId = user?.id ?? null;

  // Un choix optimiste ne survit pas à un changement de compte.
  const current = (chosen?.userId === userId ? chosen.id : null) ?? user?.personality ?? DEFAULT_PERSONALITY;

  const value = useMemo(
    () => ({
      current,
      setChosen: (id: PersonalityId | null) => setChosen(id ? { userId, id } : null),
    }),
    [current, userId],
  );
  return <PersonalityContext value={value}>{children}</PersonalityContext>;
}

/** Variable CSS --persona (couleur de la personnalité) pour la zone de conversation. */
export function personaStyle(id: PersonalityId): CSSProperties {
  return { "--persona": PERSONALITY_LOOKS[id].color } as CSSProperties;
}
