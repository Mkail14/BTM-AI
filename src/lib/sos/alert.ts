import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/email/device";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { sosAlertEmail, type SosSituation } from "@/lib/email/templates";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { listSosContacts } from "./contacts";

export type SosResult = { ok: boolean; text: string };

const CALL = "Si tu es en danger, appelle le 112.";

/**
 * SOS arrivé par Tamilya Connect : écrit à chaque proche de la personne.
 * Ne promet rien de plus que ce qui a vraiment été envoyé.
 */
export async function sendSosAlert(
  admin: SupabaseClient,
  user: { id: string; email: string | null },
  situation: SosSituation,
): Promise<SosResult> {
  const limit = await consumeRateLimits([{ key: `sos:${user.id}`, rules: RATE_LIMIT_POLICIES.sosAlert }]).catch(() => ({ allowed: false as const }));
  if (!limit.allowed) return { ok: false, text: `Tes proches ont déjà été prévenus il y a peu. ${CALL}` };

  const contacts = await listSosContacts(admin, user.id).catch(() => []);
  if (!contacts.length) {
    return { ok: false, text: `Aucun proche enregistré : ajoute-les dans Paramètres, rubrique SOS, quand tu auras internet. ${CALL}` };
  }
  if (!emailConfigured()) {
    console.error("[sos] Envoi impossible : SMTP_PASSWORD manquant");
    return { ok: false, text: `L'alerte n'a pas pu partir. ${CALL}` };
  }

  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const name = (typeof profile?.display_name === "string" && profile.display_name.trim()) || user.email?.split("@")[0] || "Un proche";
  const email = sosAlertEmail(name, user.email, situation, siteOrigin("https://btm.yt"));
  const results = await Promise.allSettled(contacts.map((to) => sendEmail(to, email)));
  const sent = results.filter((r) => r.status === "fulfilled").length;
  for (const r of results) if (r.status === "rejected") console.error("[sos] Mail non envoyé", r.reason instanceof Error ? r.reason.message : "erreur");
  await admin.from("sos_alerts").insert({ user_id: user.id, sent_to: sent }).then(
    () => {},
    () => {},
  );

  if (!sent) return { ok: false, text: `L'alerte n'a pas pu partir. ${CALL}` };
  const who = sent === 1 ? "1 proche a été prévenu" : `${sent} proches ont été prévenus`;
  return { ok: true, text: `${who} par e-mail, avec ta position et ta batterie. ${CALL}` };
}
