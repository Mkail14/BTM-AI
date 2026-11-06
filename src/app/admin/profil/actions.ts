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
import { addPartner, removePartner, validatePartner } from "@/lib/site/partners";
import { saveBankDetails, saveSiteFlags, saveSiteStatus } from "@/lib/site/settings";
import { SITE_STATUSES, type SiteStatus } from "@/lib/site/status";
import { forgetDemoWallet } from "@/lib/wallet/demo";

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

const MESSAGE_MAX = 300;

const statusSchema = z.strictObject({
  status: z.enum(SITE_STATUSES),
  maintenanceMessage: z.string().trim().max(MESSAGE_MAX, `Message : ${MESSAGE_MAX} caractères au plus.`).optional(),
});

const STATUS_SAVED: Record<SiteStatus, string> = {
  online: "Site en ligne : tout le monde y a de nouveau accès.",
  maintenance: "Site en maintenance : les visiteurs voient la page d'attente, partout en moins de 30 secondes. Toi, tu gardes l'accès.",
  waiting_partner: "Site en attente : il s'ouvrira dès que tu valideras un partenaire. Toi, tu gardes l'accès.",
};

/** État de la plateforme : un seul état enregistré, inscrit au journal avec l'auteur et l'heure. */
export async function setPlatformStatusAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { status, maintenanceMessage } = parsed.data;
  const saved = await saveSiteStatus(status, maintenanceMessage, { id: auth.user.id, email: auth.user.email ?? null });
  if (saved === "partner_already_validated") return { ok: false, message: "Un partenaire est déjà validé : retire-le d'abord pour remettre le site en attente." };
  if (saved === "failed") return { ok: false, message: "Changement non enregistré (migration 20261202000000_etats_du_site.sql appliquée ?)." };
  revalidatePath("/", "layout");
  return { ok: true, message: STATUS_SAVED[status] };
}

const partnerSchema = z.strictObject({
  name: z.string().trim().min(2, "Indique le nom du partenaire.").max(120, "Nom : 120 caractères au plus."),
  activity: z.string().trim().max(120, "Activité : 120 caractères au plus."),
});

export async function addPartnerAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!(await addPartner(parsed.data.name, parsed.data.activity))) {
    return { ok: false, message: "Partenaire non ajouté (migration 20261202000000_etats_du_site.sql appliquée ?)." };
  }
  revalidatePath("/admin/profil");
  return { ok: true, message: "Partenaire ajouté : il reste à le valider." };
}

const partnerIdSchema = z.strictObject({ id: z.string().uuid() });

/** Validation : si le site attendait un partenaire, il s'ouvre aussitôt. */
export async function validatePartnerAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = partnerIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Partenaire invalide." };
  const result = await validatePartner(parsed.data.id, { id: auth.user.id, email: auth.user.email ?? null });
  if (result === "failed") return { ok: false, message: "Validation non enregistrée, réessaie." };
  if (result === "unchanged") return { ok: false, message: "Ce partenaire est déjà validé ou n'existe plus." };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: result === "opened" ? "Partenaire validé : le site est ouvert, partout en moins de 30 secondes." : "Partenaire validé : l'état du site ne change pas.",
  };
}

/** Le site ne change pas d'état, même si c'était le dernier partenaire validé. */
export async function removePartnerAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = partnerIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Partenaire invalide." };
  if (!(await removePartner(parsed.data.id))) return { ok: false, message: "Partenaire non retiré, réessaie." };
  revalidatePath("/admin/profil");
  return { ok: true, message: "Partenaire retiré." };
}

const flagsSchema = z.strictObject({
  maintenanceMessage: z.string().trim().max(MESSAGE_MAX, `Message : ${MESSAGE_MAX} caractères au plus.`).optional(),
  demoMode: z.boolean().optional(),
});

/** Message aux visiteurs (sans changer l'état) et mode démo. */
export async function saveFlagsAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = flagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!(await saveSiteFlags(parsed.data, auth.user.id))) return FAILED;
  revalidatePath("/", "layout");
  const { demoMode } = parsed.data;
  // Chaque démonstration repart de 150 € (les autres navigateurs oublient le leur à leur prochaine page, démo éteinte).
  if (demoMode !== undefined) await forgetDemoWallet();
  const message =
    demoMode !== undefined
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
