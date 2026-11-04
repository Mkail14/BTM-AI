import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { describeDevice, describePlace, siteOrigin } from "./device";
import { emailConfigured, sendEmail } from "./send";
import { accountChangeEmail, accountDeletedEmail, type AccountChange, type EmailContext } from "./templates";

/** Appareil, lieu et adresse du site de la requête en cours. */
async function requestContext(): Promise<EmailContext> {
  const h = await headers();
  const host = h.get("host");
  const origin = siteOrigin(host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}` : "https://btm.yt");
  return { origin, device: describeDevice(h.get("user-agent")), place: describePlace(h), at: new Date() };
}

/** Envoie après la réponse : un e-mail lent ou en panne ne bloque jamais l'enregistrement. */
function sendLater(to: string, build: (ctx: EmailContext) => { subject: string; html: string; text: string }, ctx: EmailContext) {
  const task = async () => {
    try {
      await sendEmail(to, build(ctx));
    } catch (error) {
      console.error("[email] Avis de changement non envoyé", error);
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Prévient le titulaire du compte d'un ajout, d'une modification ou d'une suppression. */
export async function notifyAccountChange(email: string | null | undefined, change: AccountChange) {
  if (!email || !emailConfigured()) return;
  const ctx = await requestContext();
  sendLater(email, (c) => accountChangeEmail(email, change, c), ctx);
}

/** Dernier e-mail, après la suppression du compte. */
export async function notifyAccountDeleted(email: string | null | undefined) {
  if (!email || !emailConfigured()) return;
  const ctx = await requestContext();
  sendLater(email, (c) => accountDeletedEmail(email, c), ctx);
}
