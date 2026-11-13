import "server-only";
import { after } from "next/server";
import { escapeHtml } from "@/lib/email/layout";
import { EMAIL_FROM_ADDRESS, emailConfigured, sendEmail } from "@/lib/email/send";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { IDENTITY_LABELS, type IdentityViolation } from "./identity";

/**
 * Engagement des développeurs (table developer_accounts) : l'accès (API,
 * widget) s'ouvre dès que le développeur s'engage à garder l'identité de
 * Tamilya ; il est suspendu s'il tente quand même de la changer.
 */

export const TERMS_VERSION = "2026-11-13";

export type DeveloperStatus = "approved" | "suspended";

export type DeveloperAccount = {
  userId: string;
  status: DeveloperStatus;
  acceptedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
};

const COLUMNS = "user_id, status, terms_accepted_at, reviewed_at, review_note";

type Row = {
  user_id: string;
  status: DeveloperStatus;
  terms_accepted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

const toAccount = (row: Row): DeveloperAccount => ({
  userId: row.user_id,
  status: row.status,
  acceptedAt: row.terms_accepted_at,
  reviewedAt: row.reviewed_at,
  reviewNote: row.review_note,
});

/** Engagement de l'utilisateur ; null s'il ne l'a pas pris ; "error" si la table est illisible (migration absente). */
export async function getDeveloperAccount(userId: string): Promise<DeveloperAccount | null | "error"> {
  const admin = getSupabaseAdminClient();
  if (!admin) return "error";
  const { data, error } = await admin.from("developer_accounts").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("[developpeurs] Engagements illisibles (migrations 20261216 et 20261217 appliquées ?)", error);
    return "error";
  }
  return data ? toAccount(data as Row) : null;
}

/** Statut seul, pour les routes API et widget : seul « approved » ouvre l'accès. */
export async function getDeveloperStatus(userId: string): Promise<DeveloperStatus | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("developer_accounts").select("status").eq("user_id", userId).maybeSingle();
  if (error) console.error("[developpeurs] Statut illisible", error);
  return (data?.status as DeveloperStatus | undefined) ?? null;
}

/**
 * Engagement pris : accès ouvert aussitôt. Ne crée qu'une ligne : un compte
 * suspendu ne se rouvre pas en s'engageant de nouveau (seul BTM le rétablit).
 */
export async function acceptDeveloperTerms(userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin
    .from("developer_accounts")
    .upsert({ user_id: userId, status: "approved", terms_version: TERMS_VERSION }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) console.error("[developpeurs] Engagement non enregistré", error);
  return !error;
}

/** Tous les développeurs, suspendus d'abord (page /admin/developpeurs). */
export async function listDeveloperAccounts(): Promise<DeveloperAccount[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("developer_accounts").select(COLUMNS).order("terms_accepted_at", { ascending: false }).limit(200);
  if (error) {
    console.error("[developpeurs] Engagements illisibles", error);
    return null;
  }
  return (data as Row[]).map(toAccount).sort((a, b) => Number(b.status === "suspended") - Number(a.status === "suspended"));
}

export async function reviewDeveloperAccount(userId: string, status: DeveloperStatus, reviewerId: string, note: string | null): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin
    .from("developer_accounts")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId, review_note: note })
    .eq("user_id", userId);
  if (error) console.error("[developpeurs] Décision non enregistrée", error);
  return !error;
}

/** Tentative de renommage de Tamilya : accès suspendu tout de suite, BTM prévenu. */
export function suspendForIdentity(userId: string, violation: IdentityViolation, where: string) {
  const note = `Suspendu automatiquement : tentative de ${IDENTITY_LABELS[violation]} (${where}). Contactez BTM pour rétablir l'accès.`;
  const task = async () => {
    const admin = getSupabaseAdminClient();
    const { error } =
      (await admin
        ?.from("developer_accounts")
        .update({ status: "suspended", reviewed_at: new Date().toISOString(), reviewed_by: null, review_note: note })
        .eq("user_id", userId)
        .eq("status", "approved")) ?? {};
    if (error) console.error("[developpeurs] Suspension non enregistrée", error);
    console.warn(`[developpeurs] Compte ${userId} suspendu : ${violation} (${where})`);
    notifyBtm(`Développeur suspendu : ${IDENTITY_LABELS[violation]}`, `Le compte ${userId} a été suspendu automatiquement (${where}). Voir /admin/developpeurs.`);
  };
  after(task);
}

/** Petit avis à l'équipe BTM (nouvelle demande, suspension). Jamais bloquant. */
export function notifyBtm(subject: string, text: string) {
  sendNotice(EMAIL_FROM_ADDRESS, `[Développeurs] ${subject}`, text);
}

/** Réponse de BTM au développeur (validation, refus, suspension). Jamais bloquant. */
export function notifyDeveloper(email: string, subject: string, text: string) {
  sendNotice(email, subject, text);
}

function sendNotice(to: string, subject: string, text: string) {
  if (!emailConfigured()) return;
  const html = text
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const task = async () => {
    try {
      await sendEmail(to, { subject, text, html });
    } catch (error) {
      console.error("[developpeurs] Avis non envoyé", error);
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
