import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { RenderedEmail } from "./templates";

/**
 * Envoi depuis contact@btm.yt, par le serveur SMTP d'OVH (hébergeur de la
 * messagerie btm.yt : c'est lui que le SPF du domaine autorise).
 *
 *   SMTP_PASSWORD  mot de passe de la boîte contact@btm.yt (obligatoire)
 *   SMTP_USER      par défaut contact@btm.yt
 *   SMTP_HOST      par défaut ssl0.ovh.net (port 465, TLS)
 */
export const EMAIL_FROM_ADDRESS = "contact@btm.yt";
const FROM = `BTM AI <${EMAIL_FROM_ADDRESS}>`;

export const emailConfigured = () => Boolean(process.env.SMTP_PASSWORD);

let transporter: Transporter | null = null;

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "ssl0.ovh.net",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER || EMAIL_FROM_ADDRESS, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

export async function sendEmail(to: string, email: RenderedEmail) {
  if (!emailConfigured()) throw new Error("Envoi d'e-mails non configuré (SMTP_PASSWORD manquant)");
  await getTransporter().sendMail({
    from: FROM,
    replyTo: EMAIL_FROM_ADDRESS,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
