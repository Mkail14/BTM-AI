"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { saveFeatureSwitch } from "@/lib/site/features";
import { FEATURES, FEATURE_IDS, type FeatureId } from "@/lib/site/features-rules";

const schema = z.strictObject({ feature: z.enum(FEATURE_IDS as [FeatureId, ...FeatureId[]]), enabled: z.boolean() });

export async function setFeatureAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Fonctionnalité inconnue." };
  const { feature, enabled } = parsed.data;
  if (!(await saveFeatureSwitch(feature, enabled, auth.user.id))) {
    return { ok: false, message: "L'enregistrement a échoué (migration 20261210000000_fonctionnalites.sql appliquée ?)." };
  }
  // Toutes les pages lisent les fonctionnalités de la personne (layout) : relues au prochain affichage.
  revalidatePath("/", "layout");
  const label = FEATURES.find((f) => f.id === feature)?.label ?? feature;
  return { ok: true, message: `${label} : ${enabled ? "allumé pour tout le monde" : "réservé aux administrateurs"}, partout en moins de 30 secondes.` };
}
