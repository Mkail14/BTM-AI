/**
 * La personne demande-t-elle un devis BTM (matériaux pour un mur, une dalle…) ?
 * Lu par le serveur sur son message, comme sur btm.yt (useDevisAwa.js) : une
 * question sur un devis déjà fait (code de retrait, paiement…) n'ouvre rien.
 */
import { OUVRAGES, trouverOuvrage, validerValeurs, type OuvrageId } from "./ouvrages";

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")} `;

// Mots qui désignent un ouvrage (les identifiants sont fixes).
const MOTS: Record<OuvrageId, RegExp> = {
  mur: /\b(?:murs?|clotures?|parpaings?|muret)\b/,
  dalle: /\bdalles?\b/,
  fondation: /\b(?:fondations?|semelles?|tranchees?)\b/,
  terrasse: /\bterrasses?\b/,
  carrelage: /\b(?:carrelages?|carreaux?|faience)\b/,
};

export function ouvrageDans(message: string): OuvrageId | null {
  const text = normalize(message);
  return OUVRAGES.find((o) => MOTS[o.id].test(text))?.id ?? null;
}

const ALREADY = /\b(?:retrouv\w*|disparu|perdu|supprim\w*|modifi\w*|code|retrait|paiement|paye|enregistre|probleme|erreur|bug|marche pas|recu)\b/;
const DEVIS = /\b(?:devis|estimation|chiffrage)\b/;
const WANT = /\b(?:fai[st]|faire|veux|voudrais|voudrai|besoin|aimerais|prepare\w*|calcule\w*|chiffre\w*|donne|demande\w*|obtenir|avoir)\b/;
const PRICE = /\b(?:combien|prix|cout\w*|devis|chiffr\w*|estim\w*|quantite\w*)\b/;
// Sans ouvrage cité, un devis n'est pour BTM que s'il parle de BTM ou de bâtiment.
const BUILDING = /\b(?:btm|batiment|chantier|construction|construire|maconnerie|materiaux|beton|ciment|travaux)\b/;

/** Nouveau devis demandé : l'ouvrage s'il est cité (« devis pour une dalle »), sinon « choix ». */
export function detectBtmDevis(message: string): OuvrageId | "choix" | null {
  const text = normalize(message);
  if (ALREADY.test(text)) return null;
  const ouvrage = ouvrageDans(message);
  const devis = DEVIS.test(text) && WANT.test(text);
  if (ouvrage && (devis || PRICE.test(text))) return ouvrage;
  if (devis && BUILDING.test(text)) return "choix";
  return null;
}

/** Mesures données dans la phrase (« 8 m sur 6, 12 cm »), dans l'ordre des questions du formulaire. */
export function mesuresDans(type: OuvrageId, message: string): Record<string, number> {
  const ouvrage = trouverOuvrage(type);
  if (!ouvrage) return {};
  const lus = [...message.matchAll(/(\d+(?:[.,]\d+)?)\s*(m²|m2|cm|mm|m(?![a-zà-ÿ²\d]))?/gi)].map((m) => ({
    n: Number(m[1].replace(",", ".")),
    unite: (m[2] ?? "").toLowerCase().replace("m2", "m²"),
  }));
  const metres: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1 };
  const out: Record<string, number> = {};
  const champs = ouvrage.champs.filter((c) => c.type === "nombre" && !c.optionnel);
  for (const [i, champ] of champs.entries()) {
    const lu = lus[i];
    if (!lu || champ.type !== "nombre") break;
    let v = lu.unite && metres[lu.unite] && metres[champ.unite] ? (lu.n * metres[lu.unite]) / metres[champ.unite] : lu.n;
    // Épaisseur attendue en cm, donnée en mètres sans le dire (« 0,12 ») : 12 cm.
    if (!lu.unite && champ.unite === "cm" && v < champ.min && v * 100 <= champ.max) v *= 100;
    v = Math.round(v * 1000) / 1000;
    if (v < champ.min || v > champ.max) break;
    out[champ.nom] = v;
  }
  return out;
}

/** Bloc remplacé dans la conversation par le devis BTM (BtmDevis). */
export const BTM_DEVIS_BLOCK = "devis-btm";

/** Contenu du bloc : « dalle longueur=8 largeur=6 », ou « choix » sans ouvrage. */
export function btmDevisSpec(message: string): string {
  const found = detectBtmDevis(message);
  if (!found || found === "choix") return "choix";
  const mesures = Object.entries(mesuresDans(found, message)).map(([k, v]) => `${k}=${v}`);
  return [found, ...mesures].join(" ");
}

export const btmDevisBlockFor = (message: string) => `\n\n\`\`\`${BTM_DEVIS_BLOCK}\n${btmDevisSpec(message)}\n\`\`\``;

/** Lit le bloc écrit par Tamilya ou le serveur ; les valeurs hors limites sont ignorées. */
export function parseBtmDevisSpec(spec: string): { type: OuvrageId | null; valeurs: Record<string, string> } {
  const [first = "", ...rest] = spec.trim().toLowerCase().split(/\s+/);
  const ouvrage = trouverOuvrage(first);
  if (!ouvrage) return { type: null, valeurs: {} };
  const valeurs: Record<string, string> = {};
  for (const pair of rest) {
    const [k, v] = pair.split("=");
    const champ = ouvrage.champs.find((c) => c.nom === k);
    if (!champ || !v) continue;
    const { erreurs } = validerValeurs({ ...ouvrage, champs: [champ] }, { [k]: v });
    if (!erreurs[k]) valeurs[k] = v.replace(".", ",");
  }
  return { type: ouvrage.id, valeurs };
}
