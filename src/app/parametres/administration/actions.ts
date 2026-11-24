"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NOT_PRINCIPAL, requirePrincipalAdminAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { grantSecondaryAdmin, revokeSecondaryAdmin } from "@/server/services/admin/delegation";
import { lock, unlock, unlockedUntil } from "@/server/services/admin/unlock";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/server/middlewares/rate-limit";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { addPartner, removePartner, validatePartner } from "@/server/services/site/partners";
import { saveSiteFlags, saveSiteStatus } from "@/server/services/site/settings";
import { SITE_STATUSES, type SiteStatus } from "@/lib/site/status";
import { forgetDemoWallet } from "@/server/services/wallet/demo";
import { saveAnnouncement } from "@/server/services/site/announcement";
import { ANNOUNCEMENT_LIMITS, isSafeAnnouncementLink } from "@/lib/site/announcement-rules";

/** Rubrique Administration de Mon compte (/parametres?rubrique=administration). */
const ADMIN_TAB = "/parametres";

const FAILED: ActionResult = { ok: false, message: "L'enregistrement a échoué (migration site_settings appliquée ?)." };

/** Toute modification exige le mot de passe redemandé il y a moins de 10 minutes (vérifié ici, pas seulement à l'écran). */
const LOCKED: ActionResult = { ok: false, message: "Modifications verrouillées : confirme ton mot de passe (bouton stylo)." };

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
  return { ok: true, message: "Modifications verrouillées." };
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

const announcementSchema = z
  .strictObject({
    enabled: z.boolean(),
    text: z.string().trim().max(ANNOUNCEMENT_LIMITS.text, `Texte : ${ANNOUNCEMENT_LIMITS.text} caractères au plus.`),
    linkLabel: z.string().trim().max(ANNOUNCEMENT_LIMITS.linkLabel, `Texte du lien : ${ANNOUNCEMENT_LIMITS.linkLabel} caractères au plus.`),
    linkUrl: z
      .string()
      .trim()
      .max(ANNOUNCEMENT_LIMITS.linkUrl, `Adresse : ${ANNOUNCEMENT_LIMITS.linkUrl} caractères au plus.`)
      .refine(isSafeAnnouncementLink, "Adresse : une page du site (/partenaires) ou une adresse qui commence par https://."),
  })
  .refine((a) => !a.enabled || a.text !== "", "Écris le texte du bandeau avant de l'allumer.");

/** Bandeau d'accueil : rangé dans l'État de la plateforme, donc réservé à l'administrateur principal. */
export async function saveAnnouncementAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!(await saveAnnouncement(parsed.data, auth.user.id))) {
    return { ok: false, message: "L'enregistrement a échoué (migration 20261121000000_bandeau_accueil.sql appliquée ?)." };
  }
  revalidatePath("/");
  revalidatePath(ADMIN_TAB);
  return {
    ok: true,
    message: parsed.data.enabled
      ? "Bandeau en ligne : les visiteurs le voient sur l'accueil, partout en moins de 30 secondes."
      : "Bandeau éteint : il n'apparaît plus sur l'accueil.",
  };
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
  revalidatePath(ADMIN_TAB);
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
  revalidatePath(ADMIN_TAB);
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
  if (result.ok) revalidatePath(ADMIN_TAB);
  return result;
}

export async function revokeAdminAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  if (!(await unlockedUntil(auth.user.id))) return LOCKED;
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Compte invalide." };
  const result = await revokeSecondaryAdmin(parsed.data.userId);
  if (result.ok) revalidatePath(ADMIN_TAB);
  return result;
}
