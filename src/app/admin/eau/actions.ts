"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { refreshWaterPlanning } from "@/server/services/water/smae";
import { readWaterAlerts, saveWaterAlerts } from "@/server/services/water/store";

const fail = (error: unknown): ActionResult => ({ ok: false, message: error instanceof Error ? error.message : "Erreur inconnue." });

/** Relit tout de suite le planning annoncé sur le site de la SMAE (même s'il n'a pas changé) et le met en service. */
export async function readSmaeAction(): Promise<ActionResult> {
  if (!(await requireAdminAction())) return NOT_ADMIN;
  try {
    const { planning } = await refreshWaterPlanning({ force: true });
    revalidatePath("/admin/eau");
    return { ok: true, message: planning ? `Planning du ${planning.from} au ${planning.to} lu et mis sur la carte.` : "Rien à lire." };
  } catch (error) {
    console.error("[eau] Lecture SMAE", error);
    return fail(error);
  }
}

const alertSchema = z.strictObject({
  places: z.string().trim().min(2, "Écris au moins un lieu.").max(600),
  // Heure de Mayotte saisie dans le formulaire : « 2026-11-21T10:00 ».
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Indique jusqu'à quand."),
  note: z.string().trim().max(160),
});

/** Coupure annoncée par la SMAE hors planning : ces lieux passent en rouge jusqu'à l'heure dite. */
export async function addAlertAction(input: unknown): Promise<ActionResult> {
  if (!(await requireAdminAction())) return NOT_ADMIN;
  const parsed = alertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const until = new Date(`${parsed.data.until}:00+03:00`);
  if (!(until.getTime() > Date.now())) return { ok: false, message: "La fin de la coupure doit être dans le futur." };
  const places = parsed.data.places.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  try {
    const alerts = await readWaterAlerts();
    alerts.push({ id: crypto.randomUUID(), places, from: new Date().toISOString(), until: until.toISOString(), note: parsed.data.note });
    await saveWaterAlerts(alerts);
    revalidatePath("/admin/eau");
    return { ok: true, message: `Coupure ajoutée pour ${places.length} lieu${places.length > 1 ? "x" : ""}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function removeAlertAction(id: string): Promise<ActionResult> {
  if (!(await requireAdminAction())) return NOT_ADMIN;
  try {
    await saveWaterAlerts((await readWaterAlerts()).filter((a) => a.id !== id));
    revalidatePath("/admin/eau");
    return { ok: true, message: "Coupure retirée." };
  } catch (error) {
    return fail(error);
  }
}
