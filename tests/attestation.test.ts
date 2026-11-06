import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { attestationBlock, attestationOwnBlock, detectAttestation, ownRole, readOwnInfo, wantsOwnInfo } from "@/lib/attestation/intent";
import { applyPrefill, splitAddressLine, splitDisplayName } from "@/lib/attestation/prefill";
import { checkFields, dateFr, EMPTY_FIELDS, todayMayotte, type AttestationFields } from "@/lib/attestation/fields";
import { attestationFileName, buildAttestationPdf, pdfText, splitAddress } from "@/lib/attestation/pdf";
import { SIGNATURE_HELP, signaturesBlock } from "@/lib/attestation/intent";
import { liveToolBlock } from "@/lib/voice-live/tools";
import { pdfBase64 } from "@/lib/attestation/pdf-base64";
import { removeSignatureBackground, type Pixels } from "@/lib/attestation/signature";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";

const FILLED: AttestationFields = {
  hebergeantNom: "Madi",
  hebergeantPrenom: "Fatima",
  hebergeantNaissanceDate: "1980-03-12",
  hebergeantNaissanceLieu: "Mamoudzou",
  adresse: "12 rue du Commerce",
  codePostal: "97600",
  ville: "Mamoudzou",
  civilite: "M.",
  hebergeNom: "Ali",
  hebergePrenom: "Said",
  hebergeNaissanceDate: "2005-07-01",
  hebergeNaissanceLieu: "Sada",
  depuis: "2026-01-15",
  faitA: "Mamoudzou",
  faitLe: "2026-11-05",
};

function sheet(width: number, height: number, paper: (x: number, y: number) => number, ink?: (x: number, y: number) => boolean): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = ink?.(x, y) ? 20 : paper(x, y);
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

describe("Attestation : demande reconnue", () => {
  it("ouvre le formulaire, même avec les fautes courantes", () => {
    assert.equal(detectAttestation("Je veux faire une attestation d'hébergement"), true);
    assert.equal(detectAttestation("fais moi une attestation dhebergement"), true);
    assert.equal(detectAttestation("attestation herbergement stp"), true);
    assert.equal(detectAttestation("il me faut une lettre d’hébergement pour mon neveu"), true);
  });

  it("n'ouvre rien pour une question ou un autre sujet", () => {
    assert.equal(detectAttestation("c'est quoi une attestation d'hébergement ?"), false);
    assert.equal(detectAttestation("est-ce que l'attestation d'hébergement est obligatoire ?"), false);
    assert.equal(detectAttestation("je cherche un hébergement à Mamoudzou"), false);
    assert.equal(detectAttestation("attestation de travail"), false);
  });

  it("donne le bloc à Tamilya, jamais à la voix ni sur un autre site", () => {
    const base = { attestationOffer: true, attestation: true };
    assert.ok(buildSystemPrompt(DEFAULT_PERSONALITY, base).includes("POUR CE MESSAGE : la personne veut faire une attestation"));
    assert.ok(!buildSystemPrompt(DEFAULT_PERSONALITY, { ...base, voice: true }).includes("attestation-hebergement"));
    assert.ok(attestationBlock.includes("```attestation-hebergement"));
  });
});

describe("Attestation : champs", () => {
  it("accepte un formulaire complet", () => {
    assert.deepEqual(checkFields(FILLED, "2026-11-05"), {});
  });

  it("exige chaque champ et refuse les dates fausses", () => {
    const errors = checkFields(EMPTY_FIELDS, "2026-11-05");
    assert.equal(Object.keys(errors).length, Object.keys(EMPTY_FIELDS).length);
    const wrong = checkFields({ ...FILLED, codePostal: "976", depuis: "2027-01-01", hebergeNaissanceDate: "2026-02-31", faitLe: "2026-12-01" }, "2026-11-05");
    assert.equal(wrong.codePostal, "5 chiffres");
    assert.equal(wrong.depuis, "Date dans le futur");
    assert.equal(wrong.hebergeNaissanceDate, "Date incorrecte");
    assert.equal(wrong.faitLe, "Date dans le futur");
  });

  it("refuse un hébergement avant la naissance", () => {
    assert.equal(checkFields({ ...FILLED, depuis: "2001-01-01" }, "2026-11-05").depuis, "Avant sa naissance");
  });

  it("écrit les dates comme le modèle, à l'heure de Mayotte", () => {
    assert.equal(dateFr("2026-11-05"), "05 / 11 / 2026");
    assert.equal(todayMayotte(new Date("2026-11-05T22:00:00Z")), "2026-11-06");
  });
});

describe("Attestation : fond de la signature", () => {
  const stroke = (x: number, y: number) => Math.abs(y - 100 - Math.round(30 * Math.sin(x / 25))) < 2 && x > 40 && x < 360;

  it("rend la feuille transparente et garde le trait", () => {
    const result = removeSignatureBackground(sheet(400, 200, () => 235, stroke));
    assert.ok(result.ok);
    const { data, width, height } = result.image;
    assert.ok(width < 400 && height < 200, "recadrée");
    assert.equal(data[3], 0, "le coin est transparent");
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque++;
    assert.ok(opaque > 500, "le trait reste plein");
  });

  it("garde le trait et ignore l'ombre sur une feuille mal éclairée", () => {
    const result = removeSignatureBackground(sheet(400, 200, (x) => 245 - x / 5, stroke));
    assert.ok(result.ok);
    assert.ok(result.image.width > 300 && result.image.height < 90, "l'ombre n'est pas prise pour de l'encre");
  });

  it("signale une feuille vide ou un fond qui n'est pas blanc", () => {
    assert.deepEqual(removeSignatureBackground(sheet(200, 200, () => 240)), { ok: false, problem: "empty" });
    const mixed = removeSignatureBackground(sheet(400, 400, () => 240, (x, y) => (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0));
    assert.deepEqual(mixed, { ok: false, problem: "not_white_sheet" });
  });
});

describe("Attestation : à la voix", () => {
  it("s'ouvre avec le bouton du vocal", () => {
    assert.match(liveToolBlock("attestation_hebergement", {}, { food: false, barge: false }) ?? "", /attestation-hebergement/);
  });

  it("explique les signatures : feuille blanche et deux photos séparées", () => {
    assert.match(SIGNATURE_HELP, /feuille blanche/);
    assert.match(SIGNATURE_HELP, /deux photos séparées/);
  });

  it("remet le formulaire sous l'explication, à l'étape des photos", () => {
    assert.equal(signaturesBlock, "```attestation-hebergement\nsignatures\n```");
  });

  it("crée un PDF sans signature, à signer à la main", async () => {
    const bytes = await buildAttestationPdf(FILLED);
    assert.ok(bytes.length > 500);
  });
});

describe("Attestation : PDF", () => {
  async function png() {
    // PNG transparent de 1 × 1 : suffit à vérifier que l'image est posée.
    return Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  }

  it("produit une page A4 avec les noms hors alphabet latin sans planter", async () => {
    const image = await png();
    const bytes = await buildAttestationPdf({ ...FILLED, hebergeNom: "Dvořák 😀", adresse: "x ".repeat(79) }, { hebergeant: image, heberge: image });
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(Math.round(doc.getPage(0).getHeight()), 842);
  });

  it("coupe l'adresse entre deux mots sans rien perdre", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const address = "Résidence des Palmiers bâtiment B appartement 12 rue du Commerce quartier Cavani";
    const [one, two] = splitAddress(font, address, 200);
    assert.ok(two.length > 0);
    assert.equal(`${one} ${two}`, address);
  });

  it("encode un gros fichier pour l'application sans erreur", () => {
    const bytes = new Uint8Array(300_000).map((_, i) => i % 251);
    assert.deepEqual(Buffer.from(pdfBase64(bytes), "base64"), Buffer.from(bytes));
  });

  it("nettoie le texte et le nom du fichier", () => {
    assert.equal(pdfText("  Dvořák\n  😀 "), "Dvorák");
    assert.equal(pdfText("Mélanie N’Guyen"), "Mélanie N’Guyen");
    assert.equal(attestationFileName({ ...FILLED, hebergeNom: "Ben Saïd" }), "attestation-hebergement-ben-said.pdf");
  });
});

describe("Attestation : remplie avec le compte", () => {
  const known = { civility: "Mme", firstName: "Awa", lastName: "Madi", birthDate: "1990-02-03", address: "12 rue du Lagon", postalCode: "97600", city: "Mamoudzou" };

  it("remplit le côté choisi, et lui seul", () => {
    const heberge = applyPrefill(EMPTY_FIELDS, "heberge", known);
    assert.equal(heberge.hebergeNom, "Madi");
    assert.equal(heberge.hebergePrenom, "Awa");
    assert.equal(heberge.hebergeNaissanceDate, "1990-02-03");
    assert.equal(heberge.civilite, "Mme");
    assert.equal(heberge.hebergeantNom, "");
    const hebergeant = applyPrefill(EMPTY_FIELDS, "hebergeant", known);
    assert.equal(hebergeant.hebergeantNom, "Madi");
    assert.equal(hebergeant.hebergeNom, "");
    assert.equal(hebergeant.adresse, "12 rue du Lagon");
    assert.equal(hebergeant.faitA, "Mamoudzou");
  });

  it("ne remplace pas ce que la personne a écrit", () => {
    assert.equal(applyPrefill({ ...EMPTY_FIELDS, hebergeNom: "Said" }, "heberge", known).hebergeNom, "Said");
  });

  it("sépare le nom affiché et l'adresse sans rien inventer", () => {
    assert.deepEqual(splitDisplayName("Awa Madi Said"), { firstName: "Awa", lastName: "Madi Said" });
    assert.deepEqual(splitDisplayName("Awa"), { firstName: "Awa", lastName: undefined });
    assert.deepEqual(splitAddressLine("12 rue du Lagon, 97600 Mamoudzou"), { address: "12 rue du Lagon", postalCode: "97600" });
    assert.deepEqual(splitAddressLine("12 rue du Lagon"), { address: "12 rue du Lagon", postalCode: undefined });
  });
});

describe("Attestation : remplie seulement si on le demande", () => {
  it("reste vide sans demande", () => {
    assert.equal(readOwnInfo("formulaire", "Je veux faire une attestation d'hébergement"), null);
  });

  it("comprend tout de suite les façons de le dire", () => {
    for (const phrase of ["mets mes infos", "met mes informations", "fais-la à mon nom", "fais moi un attestation de prenom amon nom", "avec mon nom et mon adresse"]) {
      assert.equal(wantsOwnInfo(phrase), true, phrase);
    }
    assert.equal(wantsOwnInfo("mon nom c'est Ali Madi"), false);
    assert.equal(wantsOwnInfo("Je veux faire une attestation d'hébergement"), false);
  });

  it("ouvre l'attestation même sans le mot hébergement, sauf pour un autre papier", () => {
    assert.equal(detectAttestation("fais moi un attestation de prenom amon nom"), true);
    assert.equal(detectAttestation("fais-moi une attestation à mon nom"), true);
    assert.equal(detectAttestation("une attestation de travail à mon nom"), false);
    assert.equal(detectAttestation("attestation de travail"), false);
  });

  it("lit le rôle dans la phrase", () => {
    assert.equal(ownRole("je suis hébergé chez ma tante, mets mes infos"), "heberge");
    assert.equal(ownRole("j'héberge mon frère, à mon nom"), "hebergeant");
    assert.equal(ownRole("mets mes infos"), null);
    assert.deepEqual(readOwnInfo("formulaire", "je suis hébergée, mets mes infos"), { role: "heberge" });
  });

  it("au vocal, le bloc porte la demande", () => {
    assert.deepEqual(readOwnInfo("mes-infos:hebergeant", ""), { role: "hebergeant" });
    assert.deepEqual(readOwnInfo("mes-infos", ""), { role: null });
    assert.ok(attestationOwnBlock("heberge").includes("mes-infos:heberge"));
  });
});
