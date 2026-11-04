"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { createDeveloperKey, MAX_ACTIVE_KEYS, revokeDeveloperKey } from "@/lib/developers/keys";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";

export type CreateKeyActionResult = { ok: true; key: string } | { ok: false; message: string };

const labelSchema = z.string().trim().min(1, "Donnez un nom au code.").max(40, "Nom : 40 caractères au plus.");

export async function createDeveloperKeyAction(label: unknown): Promise<CreateKeyActionResult> {
  const { user } = await getAuthContext();
  if (!user) return { ok: false, message: "Connectez-vous pour créer un code." };
  const parsed = labelSchema.safeParse(label);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nom invalide." };
  // Créer puis supprimer des codes en boucle contournerait la limite de codes actifs (MAX_ACTIVE_KEYS).
  try {
    const limit = await consumeRateLimits([{ key: `dev-key-create:${user.id}`, rules: RATE_LIMIT_POLICIES.developerKeyCreate }]);
    if (!limit.allowed) return { ok: false, message: "Trop de codes créés aujourd'hui : réessayez demain." };
  } catch (error) {
    console.error("[developpeurs] Limite de création indisponible", error);
    return { ok: false, message: "La création a échoué. Réessayez plus tard." };
  }
  const result = await createDeveloperKey(user.id, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "limit"
          ? `${MAX_ACTIVE_KEYS} codes au plus : supprimez-en un d'abord.`
          : "La création a échoué. Réessayez plus tard.",
    };
  }
  revalidatePath("/developpeurs");
  return { ok: true, key: result.key };
}

export async function revokeDeveloperKeyAction(id: unknown): Promise<{ ok: boolean }> {
  const { user } = await getAuthContext();
  const parsed = z.uuid().safeParse(id);
  if (!user || !parsed.success) return { ok: false };
  const ok = await revokeDeveloperKey(user.id, parsed.data);
  if (ok) revalidatePath("/developpeurs");
  return { ok };
}
