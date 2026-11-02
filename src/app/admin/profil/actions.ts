"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NOT_PRINCIPAL, requirePrincipalAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { grantSecondaryAdmin, revokeSecondaryAdmin } from "@/lib/admin/delegation";
import { lock, unlock, unlockedUntil } from "@/lib/admin/unlock";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { isValidBic, isValidIban, normalizeBic, normalizeIban } from "@/lib/site/iban";
import { saveBankDetails, saveSiteFlags } from "@/lib/site/settings";

const FAILED: ActionResult = { ok: false, message: "L'enregistrement a échoué (migration site_settings appliquée ?)." };

/** Toute modification exige le mot de passe redemandé il y a moins de 10 minutes (vérifié ici, pas seulement à l'écran). */
const LOCKED: ActionResult = { ok: false, message: "Modifications verrouillées : confirme ton mot de passe (stylo ✏️)." };

/**
 * Redemande le mot de passe, comme Google avant un réglage sensible. Vérifié
 * par Supabase avec une session jetable, fermée aussitôt : la session du
 * navigateur n'est pas touchée.
 */
export async function unlockAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!auth.user.email || !isSupabaseConfigured) return { ok: false, message: "Vérification impossible pour ce compte." };
  const parsed = z.object({ password: z.string().min(1, "Tape ton mot de passe.").max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };

  const limit = await consumeRateLimits([{ key: `profile-unlock:${auth.user.id}`, rules: RATE_LIMIT_POLICIES.profileUnlock }]);
  if (!limit.allowed) return { ok: false, message: "Trop d'essais : réessaie dans 15 minutes." };

  const check = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await check.auth.signInWithPassword({ email: auth.user.email, password: parsed.data.password });
  if (error || data.user?.id !== auth.user.id) return { ok: false, message: "Mot de passe incorrect." };
  await check.auth.signOut({ scope: "local" }).catch(() => {});

  if (!(await unlock(auth.user.id))) return { ok: false, message: "Déverrouillage indisponible (clé secrète manquante)." };
  return { ok: true, message: "Identité confirmée : tu peux modifier pendant 10 minutes." };
}

export async function lockAction(): Promise<ActionResult> {
  await lock();
  return { ok: true, message: "Profil verrouillé." };
}

const bankSchema = z.object({
  holder: z.string().trim().min(2, "Indique le titulaire du compte.").max(120),
  bankName: z.string().trim().max(120),
  iban: z.string().trim().refine(isValidIban, "IBAN invalide : vérifie les chiffres (la clé ne correspond pas)."),
  bic: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidBic(v), "BIC invalide : 8 ou 11 caractères, par exemple BNPAFRPPXXX."),
});

export async function saveBankAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = bankSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { holder, bankName, iban, bic } = parsed.data;
  const saved = await saveBankDetails({ holder, bankName, iban: normalizeIban(iban), bic: normalizeBic(bic) }, auth.user.id);
  if (!saved) return FAILED;
  revalidatePath("/admin/profil");
  return { ok: true, message: "RIB enregistré." };
}

const flagsSchema = z.object({
  maintenance: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(300).optional(),
  demoMode: z.boolean().optional(),
});

export async function saveFlagsAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = flagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!(await saveSiteFlags(parsed.data, auth.user.id))) return FAILED;
  revalidatePath("/", "layout");
  const { maintenance, demoMode } = parsed.data;
  const message =
    maintenance !== undefined
      ? maintenance
        ? "Site en maintenance : les visiteurs voient la page d'attente (toi, tu gardes l'accès)."
        : "Site rouvert à tout le monde."
      : demoMode !== undefined
        ? demoMode
          ? "Mode démo allumé : commande de repas et solde fictif visibles des administrateurs."
          : "Mode démo éteint : le site est redevenu normal."
        : "Message enregistré.";
  return { ok: true, message };
}

export async function grantAdminAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = z.object({ email: z.string().trim().email("E-mail invalide.") }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "E-mail invalide." };
  const result = await grantSecondaryAdmin(parsed.data.email);
  if (result.ok) revalidatePath("/admin/profil");
  return result;
}

export async function revokeAdminAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Compte invalide." };
  const result = await revokeSecondaryAdmin(parsed.data.userId);
  if (result.ok) revalidatePath("/admin/profil");
  return result;
}
