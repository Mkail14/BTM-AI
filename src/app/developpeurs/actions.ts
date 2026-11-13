"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { acceptDeveloperTerms, getDeveloperStatus, suspendForIdentity } from "@/lib/developers/accounts";
import { findIdentityViolation, IDENTITY_LABELS } from "@/lib/developers/identity";
import { createDeveloperKey, MAX_ACTIVE_KEYS, revokeDeveloperKey } from "@/lib/developers/keys";
import {
  createDeveloperWidget,
  MAX_WIDGET_ORIGINS,
  MAX_WIDGETS,
  normalizeOrigin,
  revokeDeveloperWidget,
  updateWidgetMission,
} from "@/lib/developers/widgets";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";

export type ActionMessage = { ok: true } | { ok: false; message: string };
export type CreateKeyActionResult = { ok: true; key: string } | { ok: false; message: string };

const NOT_APPROVED = "Prenez d'abord l'engagement de garder l'identité de Tamilya (plus haut sur la page).";
const SUSPENDED = "Accès suspendu : Tamilya doit garder son nom, son shimaoré et sa personnalité. Contactez BTM (contact@btm.yt).";

const labelSchema = z.string().trim().min(1, "Donnez-lui un nom.").max(40, "Nom : 40 caractères au plus.");
const missionSchema = z.string().trim().max(2000, "Mission : 2 000 caractères au plus.");

/** Utilisateur connecté, engagé et non suspendu ; sinon le message à afficher. */
async function approvedUser(): Promise<{ id: string } | { message: string }> {
  const { user } = await getAuthContext();
  if (!user) return { message: "Connectez-vous d'abord." };
  const status = await getDeveloperStatus(user.id);
  if (status === "suspended") return { message: SUSPENDED };
  if (status !== "approved") return { message: NOT_APPROVED };
  return { id: user.id };
}

/** Mission vide → null ; tentative de renommage → accès suspendu. */
function checkMission(userId: string, mission: string): { ok: true; mission: string | null } | { ok: false; message: string } {
  const violation = findIdentityViolation(mission);
  if (violation) {
    suspendForIdentity(userId, violation, "mission d'un widget");
    return { ok: false, message: `Refusé : il est interdit de ${IDENTITY_LABELS[violation]}. ${SUSPENDED}` };
  }
  return { ok: true, mission: mission || null };
}

// --- Engagement ---

/** Le développeur s'engage à garder l'identité de Tamilya : accès ouvert aussitôt, sans validation. */
export async function acceptTermsAction(accepted: unknown): Promise<ActionMessage> {
  const { user } = await getAuthContext();
  if (!user) return { ok: false, message: "Connectez-vous d'abord." };
  if (accepted !== true) return { ok: false, message: "Cochez l'engagement pour continuer." };
  if (!(await acceptDeveloperTerms(user.id))) return { ok: false, message: "L'enregistrement a échoué. Réessayez plus tard." };
  revalidatePath("/developpeurs");
  return { ok: true };
}

// --- Codes d'accès (API) ---

export async function createDeveloperKeyAction(label: unknown): Promise<CreateKeyActionResult> {
  const user = await approvedUser();
  if ("message" in user) return { ok: false, message: user.message };
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

// --- Widgets ---

/** Domaines saisis un par ligne (ou séparés par des virgules ou des espaces). */
export async function createDeveloperWidgetAction(label: unknown, domains: unknown, mission: unknown): Promise<ActionMessage> {
  const user = await approvedUser();
  if ("message" in user) return { ok: false, message: user.message };
  const parsed = labelSchema.safeParse(label);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Nom invalide." };
  const parsedMission = missionSchema.safeParse(mission ?? "");
  if (!parsedMission.success) return { ok: false, message: parsedMission.error.issues[0]?.message ?? "Mission invalide." };
  const entries = typeof domains === "string" ? domains.split(/[\s,;]+/).filter(Boolean) : [];
  if (entries.length === 0) return { ok: false, message: "Indiquez au moins une adresse de site (ex. mon-site.yt)." };
  const origins: string[] = [];
  for (const entry of entries) {
    const origin = normalizeOrigin(entry);
    if (!origin) return { ok: false, message: `Adresse non valable : « ${entry.slice(0, 60)} ». Exemple : mon-site.yt` };
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (origins.length > MAX_WIDGET_ORIGINS) return { ok: false, message: `${MAX_WIDGET_ORIGINS} adresses au plus par widget.` };
  const checked = checkMission(user.id, parsedMission.data);
  if (!checked.ok) {
    revalidatePath("/developpeurs");
    return checked;
  }
  try {
    const limit = await consumeRateLimits([{ key: `dev-widget-create:${user.id}`, rules: RATE_LIMIT_POLICIES.developerKeyCreate }]);
    if (!limit.allowed) return { ok: false, message: "Trop de widgets créés aujourd'hui : réessayez demain." };
  } catch (error) {
    console.error("[developpeurs] Limite de création indisponible", error);
    return { ok: false, message: "La création a échoué. Réessayez plus tard." };
  }
  const result = await createDeveloperWidget(user.id, parsed.data, origins, checked.mission);
  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "limit" ? `${MAX_WIDGETS} widgets au plus : supprimez-en un d'abord.` : "La création a échoué. Réessayez plus tard.",
    };
  }
  revalidatePath("/developpeurs");
  return { ok: true };
}

export async function updateWidgetMissionAction(id: unknown, mission: unknown): Promise<ActionMessage> {
  const user = await approvedUser();
  if ("message" in user) return { ok: false, message: user.message };
  const parsedId = z.uuid().safeParse(id);
  const parsedMission = missionSchema.safeParse(mission ?? "");
  if (!parsedId.success) return { ok: false, message: "Widget inconnu." };
  if (!parsedMission.success) return { ok: false, message: parsedMission.error.issues[0]?.message ?? "Mission invalide." };
  const checked = checkMission(user.id, parsedMission.data);
  if (!checked.ok) {
    revalidatePath("/developpeurs");
    return checked;
  }
  if (!(await updateWidgetMission(user.id, parsedId.data, checked.mission))) return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  revalidatePath("/developpeurs");
  return { ok: true };
}

export async function revokeDeveloperWidgetAction(id: unknown): Promise<{ ok: boolean }> {
  const { user } = await getAuthContext();
  const parsed = z.uuid().safeParse(id);
  if (!user || !parsed.success) return { ok: false };
  const ok = await revokeDeveloperWidget(user.id, parsed.data);
  if (ok) revalidatePath("/developpeurs");
  return { ok };
}
