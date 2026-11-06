import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { dateFr, type AttestationFields } from "./fields";

/** Reprend le modèle d'attestation à titre gratuit, avec une signature pour chacune des deux personnes. */

const PAGE = { width: 595.28, height: 841.89 };
const LEFT = 44;
const RIGHT = PAGE.width - 44;
const BLACK = rgb(0, 0, 0);
const DOTS = rgb(0.45, 0.45, 0.45);
const SIZE = 10;
const MIN_SIZE = 7;
const SIGNATURE = { width: 235, height: 110 };
const SECOND_COLUMN = PAGE.width / 2 + 16;

/** Les polices du PDF ne connaissent que l'alphabet latin courant : le reste perd son accent, ou disparaît. */
export function pdfText(text: string) {
  return text
    .replace(/[^\s\x20-\x7E -ÿŒœ’]/gu, (c) => c.normalize("NFD").replace(/[^\x20-\x7E]/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

type Fonts = { regular: PDFFont; bold: PDFFont };

/** « Libellé : valeur » sur une ligne pointillée, comme sur le modèle. */
function field(page: PDFPage, fonts: Fonts, y: number, label: string, value: string, x = LEFT, end = RIGHT) {
  const prefix = label ? `${label} : ` : "";
  page.drawText(prefix, { x, y, size: SIZE, font: fonts.regular, color: BLACK });
  const start = x + fonts.regular.widthOfTextAtSize(prefix, SIZE);
  const text = pdfText(value);
  const room = end - start - 3;
  let size = SIZE;
  while (size > MIN_SIZE && fonts.regular.widthOfTextAtSize(text, size) > room) size -= 0.5;
  page.drawLine({ start: { x: start, y: y - 2 }, end: { x: end, y: y - 2 }, thickness: 0.7, color: DOTS, dashArray: [1, 2] });
  page.drawText(text, { x: start + 3, y, size, font: fonts.regular, color: BLACK });
}

/** Coupe l'adresse sur les deux lignes du modèle, entre deux mots. */
export function splitAddress(font: PDFFont, address: string, width: number): [string, string] {
  const words = pdfText(address).split(" ");
  let first = "";
  while (words.length && font.widthOfTextAtSize(`${first} ${words[0]}`.trim(), SIZE) <= width) {
    first = `${first} ${words.shift()}`.trim();
  }
  return [first, words.join(" ")];
}

function checkbox(page: PDFPage, x: number, y: number, checked: boolean) {
  page.drawRectangle({ x, y: y - 2, width: 11, height: 11, borderColor: BLACK, borderWidth: 0.8 });
  if (!checked) return;
  page.drawLine({ start: { x: x + 2, y }, end: { x: x + 9, y: y + 7 }, thickness: 1.2, color: BLACK });
  page.drawLine({ start: { x: x + 2, y: y + 7 }, end: { x: x + 9, y }, thickness: 1.2, color: BLACK });
}

async function signature(pdf: PDFDocument, page: PDFPage, png: Uint8Array, x: number, top: number) {
  const image = await pdf.embedPng(png);
  const scale = Math.min(SIGNATURE.width / image.width, SIGNATURE.height / image.height, 1);
  const height = image.height * scale;
  page.drawImage(image, { x, y: top - height, width: image.width * scale, height });
}

export type AttestationSignatures = { hebergeant: Uint8Array; heberge: Uint8Array };

export async function buildAttestationPdf(f: AttestationFields, signatures: AttestationSignatures) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Attestation d’hébergement à titre gratuit");
  pdf.setLanguage("fr-FR");
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };

  const title = "A T T E S T A T I O N   D ’ H É B E R G E M E N T";
  const titleWidth = fonts.bold.widthOfTextAtSize(title, 18);
  page.drawText(title, { x: (PAGE.width - titleWidth) / 2, y: 748, size: 18, font: fonts.bold, color: rgb(0, 0.17, 0.45) });

  page.drawText("Je soussigné(e) :", { x: LEFT, y: 693, size: SIZE, font: fonts.bold, color: BLACK });
  field(page, fonts, 676, "Nom", f.hebergeantNom);
  field(page, fonts, 658, "Prénom", f.hebergeantPrenom);
  field(page, fonts, 641, "Né(e) le", dateFr(f.hebergeantNaissanceDate), LEFT, 200);
  field(page, fonts, 641, "à", f.hebergeantNaissanceLieu, 208);

  const addressStart = LEFT + fonts.regular.widthOfTextAtSize("Demeurant : ", SIZE) + 3;
  const [line1, line2] = splitAddress(fonts.regular, f.adresse, RIGHT - addressStart - 3);
  field(page, fonts, 623, "Demeurant", line1);
  field(page, fonts, 606, "", line2);
  field(page, fonts, 589, "Code postal", f.codePostal, LEFT, 180);
  field(page, fonts, 589, "Ville", f.ville, 188);

  page.drawText("Déclare sur l’honneur héberger à titre gratuit à mon domicile ci-dessus mentionné :", {
    x: LEFT,
    y: 535,
    size: SIZE,
    font: fonts.bold,
    color: BLACK,
  });

  checkbox(page, 52, 507, f.civilite === "M.");
  page.drawText("M.", { x: 69, y: 507, size: SIZE, font: fonts.regular, color: BLACK });
  checkbox(page, 107, 507, f.civilite === "Mme");
  page.drawText("Mme", { x: 124, y: 507, size: SIZE, font: fonts.regular, color: BLACK });

  field(page, fonts, 469, "Nom", f.hebergeNom);
  field(page, fonts, 452, "Prénom", f.hebergePrenom);
  field(page, fonts, 434, "Né(e) le", dateFr(f.hebergeNaissanceDate), LEFT, 200);
  field(page, fonts, 434, "à", f.hebergeNaissanceLieu, 208);
  field(page, fonts, 405, "Et ce, depuis", dateFr(f.depuis));

  field(page, fonts, 351, "Fait à", f.faitA, LEFT, 370);
  field(page, fonts, 351, "le", dateFr(f.faitLe), 378);

  page.drawText("Signature de l’hébergeant :", { x: LEFT, y: 297, size: SIZE, font: fonts.bold, color: BLACK });
  page.drawText("Signature de l’hébergé(e) :", { x: SECOND_COLUMN, y: 297, size: SIZE, font: fonts.bold, color: BLACK });
  await signature(pdf, page, signatures.hebergeant, LEFT, 285);
  await signature(pdf, page, signatures.heberge, SECOND_COLUMN, 285);

  return pdf.save();
}

export const attestationFileName = (f: AttestationFields) => {
  const name = pdfText(f.hebergeNom)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `attestation-hebergement${name ? `-${name}` : ""}.pdf`;
};
