"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, requireAdminRoleAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { closeAdminGate, codeOffFromMetadata, idleFromMetadata, isIdleChoice, openAdminGate } from "@/server/services/admin/gate";
import { saveGateSettings } from "@/server/services/admin/gate-settings";
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
  const { supabase, user, meta } = auth;
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

  // Application liée de nouveau après l'avoir retirée : le code redevient obligatoire.
  if (codeOffFromMetadata(meta)) await saveGateSettings(user.id, { codeOff: false });
  if (!(await openAdminGate(user.id, idleFromMetadata(meta)))) return { ok: false, message: "Ouverture impossible (clé secrète manquante)." };
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
  const { supabase, user, meta } = auth;
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
  if (!(await openAdminGate(user.id, idleFromMetadata(meta)))) return { ok: false, message: "Ouverture impossible (clé secrète manquante)." };

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

/**
 * Retirer l'application (Mon compte, Sécurité) : son code juste d'abord, puis
 * plus aucun code demandé pour entrer dans l'admin. Il reste ouvert, sans délai.
 */
export async function removeCodeAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminRoleAction();
  if (!auth) return NOT_ADMIN;
  const { supabase, user } = auth;
  const parsed = z.object({ code: codeSchema.shape.code }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Code invalide." };

  const limit = await consumeRateLimits([{ key: `admin-gate:${user.id}`, rules: RATE_LIMIT_POLICIES.adminGate }]);
  if (!limit.allowed) return { ok: false, message: "Trop d'essais : réessaie dans 15 minutes." };

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: "Vérification impossible pour le moment." };
  const totp = factors.all.filter((f) => f.factor_type === "totp");
  const current = totp.find((f) => f.status === "verified");
  if (!current) return { ok: false, message: "Aucune application liée." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: current.id, code: parsed.data.code });
  if (error) return { ok: false, message: "Code faux ou expiré : tape le code affiché maintenant." };

  // Le drapeau d'abord : si le retrait échoue ensuite, l'application reste liée et rien ne change.
  if (!(await saveGateSettings(user.id, { codeOff: true }))) return { ok: false, message: "Retrait impossible pour le moment : réessaie." };
  const results = await Promise.all(totp.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));
  if (results.some((r) => r.error)) {
    await saveGateSettings(user.id, { codeOff: false });
    return { ok: false, message: "Retrait impossible pour le moment : réessaie." };
  }
  await openAdminGate(user.id, 0);
  return { ok: true, message: "Application retirée : plus de code pour entrer dans l'admin." };
}

/**
 * Page du verrou, code retiré : ouvre l'admin sans code. Revérifié ici (le
 * drapeau ET aucune application liée), la page seule ne suffit pas.
 */
export async function openWithoutCodeAction(): Promise<{ ok: boolean }> {
  const auth = await requireAdminRoleAction();
  if (!auth || !codeOffFromMetadata(auth.meta)) return { ok: false };
  const { data: factors, error } = await auth.supabase.auth.mfa.listFactors();
  if (error || factors.all.some((f) => f.factor_type === "totp" && f.status === "verified")) return { ok: false };
  return { ok: await openAdminGate(auth.user.id, 0) };
}

/**
 * Remettre un code : l'admin se referme, la page du verrou propose de lier une
 * application. Le rôle suffit : remettre le code ne fait que protéger plus.
 */
export async function restoreCodeAction(): Promise<ActionResult> {
  const auth = await requireAdminRoleAction();
  if (!auth) return NOT_ADMIN;
  if (!(await saveGateSettings(auth.user.id, { codeOff: false }))) return { ok: false, message: "Réglage non enregistré : réessaie." };
  await closeAdminGate();
  return { ok: true, message: "Lie ton application pour remettre le code." };
}

/** Délai avant que l'admin se reverrouille (0 = jamais). Appliqué tout de suite. */
export async function setIdleAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: "Entre d'abord ton code admin pour changer ce délai." };
  const minutes = (input as { minutes?: unknown } | null)?.minutes;
  if (!isIdleChoice(minutes)) return { ok: false, message: "Délai inconnu." };
  if (!(await saveGateSettings(auth.user.id, { idle: minutes }))) return { ok: false, message: "Réglage non enregistré : réessaie." };
  await openAdminGate(auth.user.id, minutes);
  return { ok: true, message: "Délai enregistré." };
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
