import "server-only";
import { after } from "next/server";
import { escapeHtml } from "@/lib/email/layout";
import { EMAIL_FROM_ADDRESS, emailConfigured, sendEmail } from "@/lib/email/send";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { IDENTITY_LABELS, type IdentityViolation } from "./identity";

/**
 * Fiche et engagement des développeurs (table developer_accounts) : le
 * développeur dit ce qu'il va faire de Tamilya et s'engage à garder son
 * identité ; l'accès (API, widget) s'ouvre aussitôt, sans validation. Il est
 * suspendu s'il tente quand même de la changer.
 */

export const TERMS_VERSION = "2026-11-13";

export type DeveloperStatus = "approved" | "suspended";

/** Ce que le développeur dit de son projet (colonnes de la migration 20261216, facultatives depuis 20261217). */
export type DeveloperProfile = {
  fullName: string;
  organization: string;
  website: string;
  usage: string;
};

export type DeveloperAccount = {
  userId: string;
  status: DeveloperStatus;
  /** null : engagé avant l'arrivée de la fiche, à compléter. */
  profile: DeveloperProfile | null;
  acceptedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
};

const COLUMNS = "user_id, status, full_name, organization, website, usage, terms_accepted_at, reviewed_at, review_note";

type Row = {
  user_id: string;
  status: DeveloperStatus;
  full_name: string | null;
  organization: string | null;
  website: string | null;
  usage: string | null;
  terms_accepted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

const toAccount = (row: Row): DeveloperAccount => ({
  userId: row.user_id,
  status: row.status,
  profile:
    row.full_name && row.usage
      ? { fullName: row.full_name, organization: row.organization ?? "", website: row.website ?? "", usage: row.usage }
      : null,
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
 * Fiche remplie et engagement pris : accès ouvert aussitôt. Un compte qui
 * existe déjà ne voit que sa fiche mise à jour : un compte suspendu ne se rouvre
 * pas en s'engageant de nouveau (seul BTM le rétablit).
 */
export async function acceptDeveloperTerms(userId: string, profile: DeveloperProfile): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const fields = { full_name: profile.fullName, organization: profile.organization, website: profile.website, usage: profile.usage };
  const { data: existing, error: readError } = await admin.from("developer_accounts").select("user_id").eq("user_id", userId).maybeSingle();
  if (readError) {
    console.error("[developpeurs] Engagement illisible", readError);
    return false;
  }
  const { error } = existing
    ? await admin.from("developer_accounts").update({ ...fields, terms_version: TERMS_VERSION }).eq("user_id", userId)
    : await admin.from("developer_accounts").insert({ user_id: userId, status: "approved", terms_version: TERMS_VERSION, ...fields });
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

/** Adresse e-mail du compte, pour lui écrire. */
export async function developerEmail(userId: string): Promise<string | null> {
  const { data } = (await getSupabaseAdminClient()?.auth.admin.getUserById(userId)) ?? {};
  return data?.user?.email ?? null;
}

export const SUSPENSION_SUBJECT = "Votre accès à Tamilya est suspendu";

/**
 * Tentative de renommage de Tamilya : accès suspendu tout de suite ; le
 * développeur et BTM sont prévenus par e-mail. Une nouvelle tentative d'un
 * compte déjà suspendu ne renvoie pas d'e-mail.
 */
export function suspendForIdentity(userId: string, violation: IdentityViolation, where: string) {
  const note = `Suspendu automatiquement : tentative de ${IDENTITY_LABELS[violation]} (${where}). Contactez BTM pour rétablir l'accès.`;
  const task = async () => {
    const admin = getSupabaseAdminClient();
    const { data, error } =
      (await admin
        ?.from("developer_accounts")
        .update({ status: "suspended", reviewed_at: new Date().toISOString(), reviewed_by: null, review_note: note })
        .eq("user_id", userId)
        .eq("status", "approved")
        .select("user_id")) ?? {};
    if (error) console.error("[developpeurs] Suspension non enregistrée", error);
    if (!data?.length) return;
    console.warn(`[developpeurs] Compte ${userId} suspendu : ${violation} (${where})`);
    const email = await developerEmail(userId);
    notifyBtm(`Développeur suspendu : ${IDENTITY_LABELS[violation]}`, `Le compte ${email ?? userId} a été suspendu automatiquement (${where}). Voir /admin/developpeurs.`);
    if (email) {
      notifyDeveloper(
        email,
        SUSPENSION_SUBJECT,
        `Votre accès à Tamilya est suspendu : il y a eu une tentative de ${IDENTITY_LABELS[violation]} (${where}). Vos widgets et codes ne répondent plus.\n\nTamilya garde toujours son nom, son shimaoré et sa personnalité : c'est l'engagement que vous avez pris. Pour rétablir l'accès, répondez à cet e-mail.`,
      );
    }
  };
  after(task);
}

/** Petit avis à l'équipe BTM (suspension). Jamais bloquant. */
export function notifyBtm(subject: string, text: string) {
  sendLater(EMAIL_FROM_ADDRESS, `[Développeurs] ${subject}`, text);
}

/** Avis au développeur, envoyé après la réponse. Jamais bloquant. */
export function notifyDeveloper(email: string, subject: string, text: string) {
  sendLater(email, subject, text);
}

/** E-mail au développeur, attendu : l'admin sait s'il est vraiment parti. Réponse à contact@btm.yt. */
export async function emailDeveloper(email: string, subject: string, text: string): Promise<"sent" | "not_configured" | "failed"> {
  if (!emailConfigured()) return "not_configured";
  try {
    await sendEmail(email, { subject, text, html: toHtml(text) });
    return "sent";
  } catch (error) {
    console.error("[developpeurs] E-mail au développeur non envoyé", error);
    return "failed";
  }
}

const toHtml = (text: string) =>
  text
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

function sendLater(to: string, subject: string, text: string) {
  if (!emailConfigured()) return;
  const task = async () => {
    try {
      await sendEmail(to, { subject, text, html: toHtml(text) });
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
