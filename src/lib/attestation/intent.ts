/**
 * La personne veut-elle faire une attestation d'hébergement ? Lu par le serveur
 * sur son message : une simple question (« c'est quoi ? ») n'ouvre pas le formulaire.
 */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ");

// « attestation d'hébergement », « attestation dhebergement », « attestation herbergement »…
const DOCUMENT = /\b(?:attestation|certificat|lettre|papier|document|fiche)\b[^.?!]{0,30}?h?e?r?bergement/;
const QUESTION = /\b(?:c est quoi|qu est ce|que veut dire|ca sert|a quoi sert|expliqu\w*|obligatoire|valable|combien de temps)\b/;

export function detectAttestation(message: string): boolean {
  const text = normalize(message);
  return DOCUMENT.test(text) && !QUESTION.test(text);
}

/** Bloc ```attestation-hebergement``` : remplacé dans le chat par le formulaire. */
export const ATTESTATION_BLOCK = "attestation-hebergement";

export const attestationBlock = `\n\n\`\`\`${ATTESTATION_BLOCK}\nformulaire\n\`\`\``;

/** Formulaire rempli : Tamilya écrit d'elle-même dans la conversation comment faire les signatures. */
export const SIGNATURE_HELP_EVENT = "tamilya:attestation-signatures";

export const SIGNATURE_HELP = [
  "Le formulaire est rempli, il reste les signatures :",
  "",
  "1. Chaque personne signe elle-même sur une **feuille blanche**, au stylo noir ou bleu foncé.",
  "2. Prenez **deux photos séparées**, une pour chaque signature, de près et bien éclairées.",
  "3. Ajoutez chaque photo à côté du bon nom.",
  "",
  "Je retire le fond de la feuille toute seule.",
].join("\n");

/** Après l'explication : le même formulaire revient sous le message, à l'étape des photos. */
export const SIGNATURES_STEP = "signatures";
export const signaturesBlock = `\`\`\`${ATTESTATION_BLOCK}\n${SIGNATURES_STEP}\n\`\`\``;
