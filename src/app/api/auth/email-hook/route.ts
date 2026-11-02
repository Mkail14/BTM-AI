import { NextResponse, type NextRequest } from "next/server";
import { siteOrigin } from "@/lib/email/device";
import { verifyHookSignature, verifyLink, type HookPayload } from "@/lib/email/hook";
import { sendEmail } from "@/lib/email/send";
import { codeEmail, genericLinkEmail, passwordResetEmail, welcomeEmail, type RenderedEmail } from "@/lib/email/templates";
import { supabaseUrl } from "@/lib/supabase/config";

/**
 * « Send Email Hook » de Supabase : au lieu d'envoyer ses propres e-mails,
 * Supabase appelle cette adresse ; on les habille aux couleurs de BTM AI et on
 * les envoie depuis contact@btm.yt.
 *
 * Réglage : Supabase > Authentication > Hooks > Send Email > HTTPS,
 * URL https://<site>/api/auth/email-hook, secret dans SEND_EMAIL_HOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) return failure(500, "SEND_EMAIL_HOOK_SECRET n'est pas défini");

  const body = await request.text();
  const valid = verifyHookSignature(secret, body, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });
  if (!valid) return failure(401, "Signature invalide");

  let payload: HookPayload;
  try {
    payload = JSON.parse(body) as HookPayload;
  } catch {
    return failure(400, "Corps illisible");
  }

  const { user, email_data: data } = payload;
  const type = data.email_action_type;
  const redirectTo = data.redirect_to || data.site_url;
  const origin = siteOrigin(safeOrigin(redirectTo) ?? request.nextUrl.origin);
  const ctx = { origin };
  const link = (hash: string, linkType = type) => verifyLink(supabaseUrl, hash, linkType, redirectTo);

  const outgoing: { to: string; email: RenderedEmail }[] = [];
  switch (type) {
    case "signup":
      outgoing.push({ to: user.email, email: welcomeEmail(link(data.token_hash), ctx) });
      break;
    case "recovery":
      outgoing.push({ to: user.email, email: passwordResetEmail(link(data.token_hash), user.email, ctx) });
      break;
    case "magiclink":
    case "invite":
      outgoing.push({ to: user.email, email: genericLinkEmail(type, link(data.token_hash), ctx) });
      break;
    case "email_change":
      // Noms de champs inversés chez Supabase : token_hash_new va à l'adresse actuelle.
      if (data.token_hash_new) {
        outgoing.push({ to: user.email, email: genericLinkEmail("email_change", link(data.token_hash_new), ctx) });
      }
      if (user.new_email && data.token_hash) {
        outgoing.push({ to: user.new_email, email: genericLinkEmail("email_change", link(data.token_hash), ctx) });
      }
      break;
    case "email":
    case "reauthentication":
      outgoing.push({ to: user.email, email: codeEmail(data.token, ctx) });
      break;
    default:
      // Notifications de sécurité de Supabase (mot de passe changé…) : le site
      // envoie déjà les siennes, plus complètes ; on n'en double pas.
      return NextResponse.json({});
  }

  try {
    await Promise.all(outgoing.map(({ to, email }) => sendEmail(to, email)));
  } catch (error) {
    console.error(`[email-hook] Envoi « ${type} » impossible`, error);
    return failure(500, "Envoi de l'e-mail impossible");
  }
  return NextResponse.json({});
}

function safeOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Format d'erreur attendu par Supabase : il l'affiche dans ses journaux. */
function failure(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}
