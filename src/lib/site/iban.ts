/** IBAN et BIC : nettoyage, contrôle (clé IBAN modulo 97) et affichage par blocs de 4. */

export const normalizeIban = (value: string) => value.replace(/[\s-]+/g, "").toUpperCase();

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Les 4 premiers caractères passent à la fin, les lettres deviennent des nombres (A = 10…).
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

export const formatIban = (value: string) => normalizeIban(value).replace(/(.{4})(?=.)/g, "$1 ");

export const normalizeBic = (value: string) => value.replace(/\s+/g, "").toUpperCase();

export const isValidBic = (value: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(normalizeBic(value));

/**
 * Banques françaises reconnues par leur code (5 chiffres après « FR76 »).
 * BIC seulement quand la banque n'en a qu'un pour toute la France.
 */
const FRENCH_BANKS: Record<string, { name: string; bic?: string }> = {
  "30004": { name: "BNP Paribas", bic: "BNPAFRPPXXX" },
  "30003": { name: "Société Générale", bic: "SOGEFRPPXXX" },
  "30002": { name: "LCL", bic: "CRLYFRPPXXX" },
  "10107": { name: "BRED", bic: "BREDFRPPXXX" },
  "20041": { name: "La Banque Postale" },
  "30066": { name: "CIC", bic: "CMCIFRPPXXX" },
  "40618": { name: "BoursoBank", bic: "BOUSFRPPXXX" },
  "16958": { name: "Qonto", bic: "QNTOFRP1XXX" },
  "28233": { name: "Revolut", bic: "REVOFRP2XXX" },
  "30056": { name: "HSBC", bic: "CCFRFRPPXXX" },
  "16798": { name: "Nickel", bic: "TRZOFR21XXX" },
};

/** Banque devinée d'après un IBAN français, sinon null. */
export function bankFromIban(value: string): { name: string; bic?: string } | null {
  const iban = normalizeIban(value);
  return iban.startsWith("FR") ? (FRENCH_BANKS[iban.slice(4, 9)] ?? null) : null;
}

/** Nom de la banque d'après les 4 premières lettres du BIC (banques de France, de Mayotte et de La Réunion). */
const BIC_BANKS: Record<string, string> = {
  AGRI: "Crédit Agricole",
  BFCO: "BFC Océan Indien",
  REUN: "Banque de La Réunion",
  BRED: "BRED",
  PSST: "La Banque Postale",
  CEPA: "Caisse d'Épargne CEPAC",
  CCBP: "Banque Populaire",
  BNPA: "BNP Paribas",
  SOGE: "Société Générale",
  CRLY: "LCL",
  CMCI: "Crédit Mutuel – CIC",
  BOUS: "BoursoBank",
  QNTO: "Qonto",
  REVO: "Revolut",
  NTSB: "N26",
  HSBC: "HSBC",
};

export const bankFromBic = (bic: string) => BIC_BANKS[normalizeBic(bic).slice(0, 4)];

/** Pays possibles d'un BIC : France et outre-mer (Mayotte a souvent un BIC « RE » ou « YT »). */
const FRENCH_ZONE = new Set(["FR", "RE", "YT", "GP", "MQ", "GF", "PF", "NC", "PM", "BL", "MF", "MC"]);

/** Mots d'en-tête d'un RIB : jamais une valeur. */
const HEADER_WORDS = /\b(guichet|compte|cl[ée]|iban|bic|swift|code|rib|identit[ée])\b/i;

export type ParsedRib = { holder?: string; bankName?: string; iban?: string; bic?: string };

/**
 * Valeurs possibles après une étiquette (« BIC : … », « Titulaire du compte … ») :
 * la suite de la ligne, puis la ligne suivante (RIB où la valeur est sous l'étiquette).
 */
function after(text: string, labels: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const label = new RegExp(`^(?:${labels})(?![a-zà-ÿ])`, "i");
  const values: string[] = [];
  lines.forEach((line, i) => {
    if (!label.test(line)) return;
    const rest = line.includes(":")
      ? line.slice(line.indexOf(":") + 1)
      : line.replace(label, "").replace(/^\s*(?:du compte|\([^)]*\))/i, "");
    if (rest.trim()) values.push(rest.trim());
    const next = lines.slice(i + 1).find(Boolean);
    if (next) values.push(next);
  });
  return values;
}

/** Première valeur d'étiquette qui ressemble à un nom (pas un en-tête, pas des chiffres). */
const nameAfter = (text: string, labels: string) =>
  after(text, labels).find((value) => !/^\d/.test(value) && !HEADER_WORDS.test(value) && !value.includes(":"))?.slice(0, 120);

/**
 * Lit un RIB collé (texte copié d'un PDF, d'un e-mail ou d'une appli bancaire) :
 * IBAN, BIC, titulaire et banque. Un champ introuvable reste vide ; la banque et
 * le BIC peuvent être déduits de l'IBAN ou du BIC.
 */
export function parseRib(text: string): ParsedRib {
  const result: ParsedRib = {};

  // IBAN : deux lettres, deux chiffres, puis des blocs séparés par des espaces.
  for (const match of text.toUpperCase().matchAll(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}/g)) {
    // Un IBAN collé à la suite d'autres blocs : on raccourcit jusqu'à trouver une clé valide.
    let candidate = normalizeIban(match[0]);
    while (candidate.length >= 15 && !isValidIban(candidate)) candidate = candidate.slice(0, -1);
    if (isValidIban(candidate)) {
      result.iban = candidate;
      break;
    }
  }

  // BIC : d'abord après son étiquette, sinon n'importe quel mot au format BIC d'un pays plausible.
  const labelled = after(text, "BIC|SWIFT|Code BIC|Code SWIFT")
    .map((value) => value.split(/\s+/)[0])
    .find((word) => isValidBic(word));
  if (labelled) result.bic = normalizeBic(labelled);
  else {
    const countries = new Set([...FRENCH_ZONE, result.iban?.slice(0, 2)]);
    result.bic = text
      .toUpperCase()
      .match(/\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g)
      ?.find((word) => countries.has(word.slice(4, 6)) && !HEADER_WORDS.test(word));
  }
  if (!result.bic) delete result.bic;

  const holder = nameAfter(text, "Titulaire|Nom du titulaire|Bénéficiaire|Account holder|Intitulé du compte");
  if (holder) result.holder = holder;
  const bankName = nameAfter(text, "Domiciliation|Banque|Établissement|Etablissement|Bank|Agence");
  if (bankName) result.bankName = bankName;

  // Banque et BIC déduits : d'abord le BIC trouvé, puis le code banque de l'IBAN.
  const known = result.iban ? bankFromIban(result.iban) : null;
  result.bankName ??= (result.bic && bankFromBic(result.bic)) || known?.name;
  result.bic ??= known?.bic;
  if (!result.bankName) delete result.bankName;
  if (!result.bic) delete result.bic;
  return result;
}
