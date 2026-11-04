/**
 * Mise en page commune des e-mails de BTM AI.
 *
 * Contraintes des messageries (Gmail, Outlook, Apple Mail) : tableaux pour la
 * structure, styles en ligne, pas de police web ni de CSS externe. Les couleurs
 * sont celles du site : crème du logo, encre, framboise. Mode clair imposé : les
 * messageries qui inversent les couleurs abîment les logos détourés.
 */

export const EMAIL_COLORS = {
  cream: "#F5EAD9",
  creamDeep: "#EBDCC4",
  ink: "#16191B",
  text: "#3A3F43",
  muted: "#7A7F84",
  accent: "#C8295F",
  accentSoft: "#FCEAF1",
  line: "#EFE6D8",
  card: "#FFFFFF",
  warnBg: "#FFF6E5",
  warnLine: "#F3D9A4",
} as const;

const C = EMAIL_COLORS;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type EmailDetail = { label: string; value: string };

export type EmailContent = {
  /** Texte d'aperçu affiché par la messagerie à côté de l'objet. */
  preheader: string;
  /** Petite mention au-dessus du titre (« Sécurité du compte »…). */
  eyebrow: string;
  title: string;
  /** Paragraphes, en texte brut (échappés ici). */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Tableau récapitulatif (appareil, lieu, date…). */
  details?: EmailDetail[];
  /** Encadré « ce n'était pas vous ? ». */
  alert?: { title: string; text: string; link?: { label: string; url: string } };
  /** Paragraphes après le bouton (validité du lien…). */
  after?: string[];
  /** Pourquoi la personne reçoit ce message. */
  reason: string;
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Met en valeur « l'adresse » ou un mot, écrit **ainsi** dans les textes. */
function inline(text: string) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${C.ink};font-weight:600;">$1</strong>`);
}

const paragraph = (text: string, extra = "") =>
  `<p style="margin:0 0 16px;font:400 16px/1.65 ${FONT};color:${C.text};${extra}">${inline(text)}</p>`;

function button(label: string, url: string) {
  const href = escapeHtml(url);
  // Bouton « à l'épreuve des balles » : une cellule colorée, lisible même sans styles.
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 28px;">
  <tr>
    <td align="center" bgcolor="${C.accent}" style="border-radius:999px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:15px 30px;font:600 16px/1 ${FONT};color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(label)}&nbsp;&nbsp;&rarr;</a>
    </td>
  </tr>
</table>`;
}

function details(rows: EmailDetail[]) {
  const cells = rows
    .map(
      (row, i) => `
  <tr>
    <td style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ""}font:500 13px/1.4 ${FONT};color:${C.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>
    <td style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ""}font:600 14px/1.4 ${FONT};color:${C.ink};">${escapeHtml(row.value)}</td>
  </tr>`,
    )
    .join("");
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 24px;border:1px solid ${C.line};border-radius:14px;border-collapse:separate;background:#FCFAF6;">${cells}
</table>`;
}

function alertBox(alert: NonNullable<EmailContent["alert"]>) {
  const link = alert.link
    ? `<br><a href="${escapeHtml(alert.link.url)}" target="_blank" style="color:${C.accent};font-weight:600;text-decoration:underline;">${escapeHtml(alert.link.label)}</a>`
    : "";
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td style="padding:16px 18px;background:${C.warnBg};border:1px solid ${C.warnLine};border-radius:14px;font:400 14px/1.6 ${FONT};color:${C.text};">
      <strong style="color:${C.ink};">${escapeHtml(alert.title)}</strong><br>${inline(alert.text)}${link}
    </td>
  </tr>
</table>`;
}

/** Lien complet (https://…) ? Sans adresse du site connue (siteOrigin vide), les liens relatifs sont retirés. */
const isAbsolute = (url: string) => /^https?:[/][/]/i.test(url);

/** Bouton et lien de l'encadré gardés seulement s'ils mènent quelque part. */
function withAbsoluteLinks(content: EmailContent): EmailContent {
  return {
    ...content,
    button: content.button && isAbsolute(content.button.url) ? content.button : undefined,
    alert: content.alert && { ...content.alert, link: content.alert.link && isAbsolute(content.alert.link.url) ? content.alert.link : undefined },
  };
}

export function renderEmailHtml(fullContent: EmailContent, origin: string) {
  const content = withAbsoluteLinks(fullContent);
  const logo = `${origin}/brand/btm-ai-encre.png`;
  const header = isAbsolute(origin)
    ? `<a href="${escapeHtml(origin)}" target="_blank"><img src="${escapeHtml(logo)}" width="104" height="48" alt="BTM AI" style="display:block;border:0;width:104px;height:auto;"></a>`
    : `<strong style="font:700 22px/1 ${FONT};color:${C.ink};">BTM AI</strong>`;
  const fallback = content.button
    ? paragraph(`Le bouton ne s'ouvre pas ? Copiez cette adresse dans votre navigateur :`, `font-size:13px;color:${C.muted};margin-bottom:4px;`) +
      `<p style="margin:0 0 24px;font:400 12px/1.5 ${FONT};word-break:break-all;"><a href="${escapeHtml(content.button.url)}" style="color:${C.accent};">${escapeHtml(content.button.url)}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.cream};">${escapeHtml(content.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.cream}" style="background:${C.cream};">
  <tr>
    <td align="center" style="padding:36px 16px 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 8px 22px;">
            ${header}
          </td>
        </tr>
        <tr>
          <td bgcolor="${C.card}" style="background:${C.card};border-radius:24px;padding:0;box-shadow:0 1px 0 ${C.creamDeep};">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr><td style="height:6px;line-height:6px;font-size:0;background:${C.accent};border-radius:24px 24px 0 0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:36px 36px 12px;">
                  <p style="margin:0 0 10px;font:600 12px/1 ${FONT};letter-spacing:1.4px;text-transform:uppercase;color:${C.accent};">${escapeHtml(content.eyebrow)}</p>
                  <h1 style="margin:0 0 20px;font:700 27px/1.25 ${FONT};letter-spacing:-0.4px;color:${C.ink};">${escapeHtml(content.title)}</h1>
                  ${content.paragraphs.map((p) => paragraph(p)).join("")}
                  ${content.details ? details(content.details) : ""}
                  ${content.button ? button(content.button.label, content.button.url) : ""}
                  ${content.alert ? alertBox(content.alert) : ""}
                  ${(content.after ?? []).map((p) => paragraph(p, `font-size:14px;color:${C.muted};`)).join("")}
                  ${fallback}
                </td>
              </tr>
              <tr>
                <td style="padding:4px 36px 34px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
                    <td style="border-top:1px solid ${C.line};padding-top:22px;font:400 15px/1.6 ${FONT};color:${C.text};">
                      À très vite,<br>
                      <strong style="color:${C.ink};">L'équipe BTM AI</strong><br>
                      <span style="font-size:13px;color:${C.muted};">GROUPE BTM &middot; Mayotte</span>
                    </td>
                  </tr></table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 0;font:400 12px/1.6 ${FONT};color:${C.muted};text-align:center;">
            ${escapeHtml(content.reason)}<br>
            Une question ? Répondez simplement à cet e-mail ou écrivez à
            <a href="mailto:contact@btm.yt" style="color:${C.ink};text-decoration:underline;">contact@btm.yt</a>.<br>
            <span style="color:#A8A49C;">BTM AI &middot; GROUPE BTM &middot; Mayotte</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Version texte, pour les messageries sans HTML et les filtres anti-spam. */
export function renderEmailText(fullContent: EmailContent) {
  const content = withAbsoluteLinks(fullContent);
  const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");
  const lines = [
    strip(content.title),
    "",
    ...content.paragraphs.map(strip).flatMap((p) => [p, ""]),
    ...(content.details ?? []).map((d) => `${d.label} : ${d.value}`),
    ...(content.details ? [""] : []),
    ...(content.button ? [`${content.button.label} : ${content.button.url}`, ""] : []),
    ...(content.alert ? [`${content.alert.title} ${strip(content.alert.text)}`, ...(content.alert.link ? [content.alert.link.url] : []), ""] : []),
    ...(content.after ?? []).map(strip).flatMap((p) => [p, ""]),
    "À très vite,",
    "L'équipe BTM AI — GROUPE BTM, Mayotte",
    "",
    "—",
    content.reason,
    "Une question ? Répondez à cet e-mail ou écrivez à contact@btm.yt.",
  ];
  return lines.join("\n");
}
