/**
 * La personne veut-elle que Tamilya signe ou remplisse un document (PDF ou Word) ?
 * Lu par le serveur sur son message : une simple question (« c'est quoi une
 * signature électronique ? ») n'ouvre rien.
 */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ");

const PAPER = String.raw`(?:pdf|word|docx?|document|doc|fichier|formulaire|contrat|dossier|lettre|papier|fiche|courrier|devis|bon de commande|cerfa|feuille)`;
const THIS = String.raw`(?:ce|cet|cette|mon|ma|mes|le|la|les|un|une|des|du|ces)`;

// « signe ce pdf », « mets ma signature sur le document », « colle ma signature », « tu peux signer mon contrat »
const SIGN = new RegExp(
  String.raw`\b(?:sign(?:e|er|es|ez)\b[^.?!]{0,25}?\b${THIS}\s+(?:\w+\s+)?${PAPER}|(?:mets?|mettre|colle[rz]?|ajoute[rz]?|pose[rz]?|appose[rz]?|insere[rz]?)\b[^.?!]{0,15}?\bma signature|ma signature\b[^.?!]{0,25}?\b(?:sur|dans|a)\s+${THIS}\s+(?:\w+\s+)?${PAPER})`,
);
// « remplis ce formulaire », « complète mon document word », « tu peux remplir le pdf »
const FILL = new RegExp(
  String.raw`\b(?:rempli[rst]?|remplissez|complete[rsz]?|completer)\b[^.?!]{0,25}?\b${THIS}\s+(?:\w+\s+)?${PAPER}`,
);
const QUESTION = /\b(?:c est quoi|qu est ce|que veut dire|a quoi sert|ca sert|expliqu\w*|valable|legal\w*|est ce que .{0,20}(?:vaut|valeur))\b/;

export type DocumentTask = { sign: boolean; fill: boolean };

export function detectDocumentTask(message: string): DocumentTask | null {
  const text = normalize(message);
  if (QUESTION.test(text)) return null;
  // L'attestation d'hébergement a son propre formulaire.
  if (/h?e?r?bergement/.test(text)) return null;
  const sign = SIGN.test(text);
  const fill = FILL.test(text);
  return sign || fill ? { sign, fill } : null;
}

/** Bloc ```document-a-signer``` : remplacé dans le chat par la carte (SignDocument). */
export const DOCUMENT_BLOCK = "document-a-signer";

/** Contenu du bloc : ce qui est demandé (« signer », « remplir », « remplir signer »). */
export const documentBlock = (task: DocumentTask) =>
  `\n\n\`\`\`${DOCUMENT_BLOCK}\n${[task.fill ? "remplir" : "", task.sign ? "signer" : ""].filter(Boolean).join(" ")}\n\`\`\``;

export function readDocumentTask(spec: string): DocumentTask {
  const text = normalize(spec);
  const sign = /signer/.test(text);
  const fill = /remplir/.test(text);
  // Bloc écrit à la main par Tamilya sans précision : les deux sont proposés.
  return sign || fill ? { sign, fill } : { sign: true, fill: true };
}
