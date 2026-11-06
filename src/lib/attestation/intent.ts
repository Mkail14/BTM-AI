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
// « mets mes infos », « à mon nom », « amon nom »… mais pas « mon nom c'est Ali », qui donne un autre nom.
const OWN_INFO_WORDS = /\b(?:mes (?:infos?|informations|coordonnees|donnees|renseignements)|a ?mon nom|mon (?:nom|prenom|identite|adresse)(?! (?:c est|est|s ecrit)))\b/;
const OTHER_PAPER = /\b(?:travail|employeur|salaire|assurance|scolarite|stage|formation|pole emploi|france travail)\b/;
const QUESTION = /\b(?:c est quoi|qu est ce|que veut dire|ca sert|a quoi sert|expliqu\w*|obligatoire|valable|combien de temps)\b/;

export function detectAttestation(message: string): boolean {
  const text = normalize(message);
  if (QUESTION.test(text)) return false;
  // « fais-moi une attestation à mon nom » : sans le mot hébergement, c'est bien celle-ci qu'on sait faire.
  return DOCUMENT.test(text) || (/\battestation\b/.test(text) && OWN_INFO_WORDS.test(text) && !OTHER_PAPER.test(text));
}

/** La personne demande d'y mettre ses propres informations. */
export const wantsOwnInfo = (message: string) => OWN_INFO_WORDS.test(normalize(message));

export type OwnRole = "hebergeant" | "heberge";

/** Rôle dit dans la phrase (« je suis hébergé », « j'héberge ma sœur »), sinon null. */
export function ownRole(message: string): OwnRole | null {
  const text = normalize(message);
  if (/\b(?:j heberge|je suis (?:l |le |la )?(?:hebergeur|hebergeant|hebergeuse|hebergeante)|c est moi qui heberge)\b/.test(text)) return "hebergeant";
  if (/\b(?:je suis (?:l |le |la )?(?:heberge|hebergee)|on m heberge|il m heberge|elle m heberge|ils m hebergent)\b/.test(text)) return "heberge";
  return null;
}

/** Bloc ```attestation-hebergement``` : remplacé dans le chat par le formulaire. */
export const ATTESTATION_BLOCK = "attestation-hebergement";

export const attestationBlock = `\n\n\`\`\`${ATTESTATION_BLOCK}\nformulaire\n\`\`\``;

/** Vocal : mode du bloc quand la personne a demandé ses infos (« mes-infos » ou « mes-infos:heberge »). */
const OWN_INFO_MODE = "mes-infos";

export const attestationOwnBlock = (role: OwnRole | null) =>
  `\`\`\`${ATTESTATION_BLOCK}\n${OWN_INFO_MODE}${role ? `:${role}` : ""}\n\`\`\``;

/**
 * Faut-il remplir avec le compte, et de quel côté ? Vient du bloc (vocal) ou du message
 * de la personne (écrit). Null : le formulaire reste vide, c'est le cas normal.
 */
export function readOwnInfo(mode: string, asked: string): { role: OwnRole | null } | null {
  if (mode.startsWith(OWN_INFO_MODE)) {
    const role = mode.slice(OWN_INFO_MODE.length + 1);
    return { role: role === "heberge" || role === "hebergeant" ? role : null };
  }
  return wantsOwnInfo(asked) ? { role: ownRole(asked) } : null;
}

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
