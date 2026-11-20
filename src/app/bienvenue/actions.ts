"use server";

import { revalidatePath } from "next/cache";
import { profileSchema } from "@/lib/chat/validation";
import { WELCOME_LANGUAGES, type WelcomeLanguage } from "@/lib/welcome";
import { getAuthContext } from "@/server/middlewares/session";
import { updateProfile } from "@/server/models/profiles.model";
import { isMemoryOn, saveMemories } from "@/server/services/ai/memory-store";

export type WelcomeResult = { ok: true } | { ok: false; error: string };

const expired: WelcomeResult = { ok: false, error: "Ta session a expiré. Reconnecte-toi." };

/** Étape « prénom » : le nom affiché du compte (même règle que dans les Paramètres). */
export async function saveWelcomeName(input: unknown): Promise<WelcomeResult> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return expired;
  const parsed = profileSchema.safeParse({ displayName: typeof input === "string" ? input : "" });
  if (!parsed.success || !parsed.data.displayName) return { ok: false, error: "Écris ton prénom (60 caractères maximum)." };
  try {
    await updateProfile(supabase, user.id, parsed.data.displayName);
  } catch (error) {
    console.error("[bienvenue] Prénom non enregistré", error);
    return { ok: false, error: "L'enregistrement a échoué. Réessaie." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Étape « langue » : gardée comme un souvenir de Tamilya (elle lit ses souvenirs avant de répondre).
 * Mémoire coupée par la personne : rien n'est écrit, on respecte son choix.
 */
export async function saveWelcomeLanguage(input: unknown): Promise<WelcomeResult> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return expired;
  if (typeof input !== "string" || !(input in WELCOME_LANGUAGES)) return { ok: false, error: "Choisis une langue." };
  if (!(await isMemoryOn(supabase))) return { ok: true };
  try {
    await saveMemories(supabase, user.id, [{ kind: "langue", content: WELCOME_LANGUAGES[input as WelcomeLanguage].memory }]);
  } catch (error) {
    console.error("[bienvenue] Langue non enregistrée", error);
    return { ok: false, error: "L'enregistrement a échoué. Réessaie." };
  }
  return { ok: true };
}
