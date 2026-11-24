"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, requireAdminRoleAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { closeAdminGate, openAdminGate } from "@/server/services/admin/gate";
import { requestCodeReset } from "@/server/services/admin/code-reset";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/server/middlewares/rate-limit";

/**
 * Verrou de l'espace admin (src/server/services/admin/gate.ts). Le code est vérifié par
 * Supabase Auth (MFA TOTP) : le secret de l'application d'authentification
 * n'est jamais gardé par le site.
 */

const codeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Le code fait 6 chiffres."),
  // Première fois : l'appareil que l'on vient d'ajouter, pas encore confirmé.
  factorId: z.string().uuid().optional(),
});

export type EnrollResult = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; message: string };

/** Première fois : ajoute l'application d'authentification (QR code à scanner). */
export async function startEnrollAction(): Promise<EnrollResult> {
  const auth = await requireAdminRoleAction();
  if (!auth) return { ok: false, message: NOT_ADMIN.message };
  const { supabase } = auth;

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: "Vérification impossible pour le moment." };
  const totp = factors.all.filter((f) => f.factor_type === "totp");
  // Déjà un appareil : on ne peut pas en ajouter un autre sans son code (sinon, une session volée suffirait).
  if (totp.some((f) => f.status === "verified")) return { ok: false, message: "Une application est déjà liée : tape son code." };
  // Ajouts commencés puis abandonnés (QR jamais confirmé).
  await Promise.all(totp.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "BTM-AI", friendlyName: `Admin ${Date.now()}` });
  if (error || data.type !== "totp") {
    return { ok: false, message: "Ajout impossible : vérifie que la double authentification (TOTP) est activée dans Supabase." };
  }
  const qr = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 220 });
  return { ok: true, factorId: data.id, qr, secret: data.totp.secret };
}

/** Code juste : l'espace admin s'ouvre, jusqu'à 15 minutes sans utilisation. */
export async function verifyCodeAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminRoleAction();
  if (!auth) return NOT_ADMIN;
  const { supabase, user } = auth;
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Code invalide." };

  const limit = await consumeRateLimits([{ key: `admin-gate:${user.id}`, rules: RATE_LIMIT_POLICIES.adminGate }]);
  if (!limit.allowed) return { ok: false, message: "Trop d'essais : réessaie dans 15 minutes." };

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: "Vérification impossible pour le moment." };
  const totp = factors.all.filter((f) => f.factor_type === "totp");
  const factor = totp.find((f) => f.status === "verified") ?? totp.find((f) => f.id === parsed.data.factorId);
  if (!factor) return { ok: false, message: "Aucune application liée : recharge la page pour en ajouter une." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
  if (error) return { ok: false, message: "Code faux ou expiré : tape le code affiché maintenant." };

  if (!(await openAdminGate(user.id))) return { ok: false, message: "Ouverture impossible (clé secrète manquante)." };
  return { ok: true, message: "Code juste." };
}

/**
 * « Code oublié » : plus d'application, plus d'accès. La demande part à
 * l'administrateur principal (pastille), qui réinitialisera le compte.
 */
export async function requestCodeResetAction(): Promise<ActionResult> {
  const auth = await requireAdminRoleAction();
  if (!auth) return NOT_ADMIN;
  const limit = await consumeRateLimits([{ key: `admin-code-reset:${auth.user.id}`, rules: RATE_LIMIT_POLICIES.adminGate }]);
  if (!limit.allowed) return { ok: false, message: "Trop d'essais : réessaie dans 15 minutes." };
  return requestCodeReset(auth.user.id);
}

/**
 * Changer d'application (Mon compte, Sécurité), étape 1 : le code de
 * l'application actuelle prouve que c'est bien toi, puis un nouveau QR code
 * est préparé. L'ancienne reste valable tant que la nouvelle n'est pas confirmée.
 * Pas besoin d'avoir ouvert l'admin avant : ce code juste l'ouvre, comme
 * verifyCodeAction, pour que l'étape 2 passe.
 */
export async function startChangeAction(input: unknown): Promise<EnrollResult> {
  const auth = await requireAdminRoleAction();
  if (!auth) return { ok: false, message: NOT_ADMIN.message };
  const { supabase, user } = auth;
  const parsed = z.object({ code: codeSchema.shape.code }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Code invalide." };

  const limit = await consumeRateLimits([{ key: `admin-gate:${user.id}`, rules: RATE_LIMIT_POLICIES.adminGate }]);
  if (!limit.allowed) return { ok: false, message: "Trop d'essais : réessaie dans 15 minutes." };

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: "Vérification impossible pour le moment." };
  const totp = factors.all.filter((f) => f.factor_type === "totp");
  const current = totp.find((f) => f.status === "verified");
  if (!current) return { ok: false, message: "Aucune application liée : ouvre l'espace admin pour en lier une." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: current.id, code: parsed.data.code });
  if (error) return { ok: false, message: "Code faux ou expiré : tape le code affiché maintenant." };
  if (!(await openAdminGate(user.id))) return { ok: false, message: "Ouverture impossible (clé secrète manquante)." };

  // Changements commencés puis abandonnés (QR jamais confirmé).
  await Promise.all(totp.filter((f) => f.status !== "verified").map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
  const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "BTM-AI", friendlyName: `Admin ${Date.now()}` });
  if (enrollError || data.type !== "totp") return { ok: false, message: "Nouveau QR code impossible : réessaie." };
  const qr = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 220 });
  return { ok: true, factorId: data.id, qr, secret: data.totp.secret };
}

/** Étape 2 : le premier code de la nouvelle application la confirme, et l'ancienne est retirée. */
export async function confirmChangeAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: "Espace admin verrouillé : retape ton code d'abord." };
  const { supabase, user } = auth;
  const parsed = z.object({ code: codeSchema.shape.code, factorId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Code invalide." };

  const limit = await consumeRateLimits([{ key: `admin-gate:${user.id}`, rules: RATE_LIMIT_POLICIES.adminGate }]);
  if (!limit.allowed) return { ok: false, message: "Trop d'essais : réessaie dans 15 minutes." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { ok: false, message: "Code faux ou expiré : tape le code affiché par la nouvelle application." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const old = (factors?.all ?? []).filter((f) => f.factor_type === "totp" && f.id !== parsed.data.factorId);
  await Promise.all(old.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
  return { ok: true, message: "Nouvelle application liée : l'ancienne ne marche plus." };
}

/** Changement abandonné : le QR code préparé est retiré, l'ancienne application reste. */
export async function cancelChangeAction(input: unknown): Promise<{ ok: boolean }> {
  const auth = await requireAdminAction();
  const parsed = z.object({ factorId: z.string().uuid() }).safeParse(input);
  if (!auth || !parsed.success) return { ok: false };
  const { data: factors } = await auth.supabase.auth.mfa.listFactors();
  const pending = (factors?.all ?? []).find((f) => f.id === parsed.data.factorId && f.status !== "verified");
  if (pending) await auth.supabase.auth.mfa.unenroll({ factorId: pending.id });
  return { ok: true };
}

/** Utilisation pendant que la page reste ouverte (souris, clavier) : le verrou reste ouvert. */
export async function keepAdminOpenAction(): Promise<{ ok: boolean }> {
  return { ok: (await requireAdminAction()) !== null };
}

/** 15 minutes sans utilisation, ou bouton « Verrouiller » : il faudra retaper le code. */
export async function lockAdminAction(): Promise<{ ok: true }> {
  await closeAdminGate();
  return { ok: true };
}
