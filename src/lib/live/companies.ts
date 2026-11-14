import "server-only";
import { normalize } from "./intent";
import { MAYOTTE_COMMUNES, placesIn } from "./services";

/**
 * Entreprises de Mayotte, en activité ou fermées, lues dans l'annuaire officiel
 * de l'État (recherche-entreprises.api.gouv.fr : registre Sirene de l'INSEE et
 * registre national des entreprises). Gratuit, sans clé ni compte, mis à jour
 * chaque jour. Seulement les entreprises déclarées ; ni téléphone ni horaires.
 * Rien n'est chargé d'avance : une recherche par question, gardée 1 h.
 */

const API = "https://recherche-entreprises.api.gouv.fr/search";
const SHEET = "https://annuaire-entreprises.data.gouv.fr/entreprise/";
const MAYOTTE = "976";
const CACHE_MS = 3600_000;
const CACHE_MAX = 200;
const FETCH_TIMEOUT_MS = 4_000;
/** Recherche par nom : peu de fiches, complètes. Liste par métier ou commune : un peu plus. */
const NAMED = 5;
const LISTED = 8;
/** Au-delà, ce n'est plus un nom d'entreprise mais une phrase. */
const MAX_NAME_WORDS = 5;

export type CompanyAsk = {
  /** Nom cherché (ou numéro SIREN/SIRET), vide pour une liste. */
  name: string;
  /** Codes INSEE des communes citées. */
  communes: string[];
  /** Métier cité (null : aucun). */
  trade: Trade | null;
  /** Seulement les entreprises fermées. */
  closed: boolean;
  /** Le message ne dit pas « entreprise » : on ne garde que les fiches dont le nom contient tous les mots. */
  strict: boolean;
};

type Trade = { label: string; codes: string[] };

/** Métiers courants (message normalisé) → codes d'activité de l'INSEE, tous vérifiés dans l'annuaire. */
const TRADES: { asked: RegExp; trade: Trade }[] = [
  { asked: /\bplomb\w*/, trade: { label: "plomberie", codes: ["43.22A"] } },
  { asked: /\belectric\w*/, trade: { label: "électricité", codes: ["43.21A"] } },
  { asked: /\b(macon\w*|gros[- ]oeuvre)\b/, trade: { label: "maçonnerie", codes: ["43.99C", "41.20A"] } },
  { asked: /\b(btp|batiment|construction|constructeurs?)\b/, trade: { label: "construction", codes: ["41.20A", "43.99C"] } },
  { asked: /\bterrassement\w*/, trade: { label: "terrassement", codes: ["43.12A"] } },
  { asked: /\bpeint\w*/, trade: { label: "peinture", codes: ["43.34Z"] } },
  { asked: /\bmenuis\w*/, trade: { label: "menuiserie", codes: ["43.32A"] } },
  { asked: /\bplatr\w*/, trade: { label: "plâtrerie", codes: ["43.31Z"] } },
  { asked: /\b(materiaux|quincaill\w*)\b/, trade: { label: "matériaux et quincaillerie", codes: ["46.73A", "47.52A"] } },
  { asked: /\b(snacks?|fast[- ]?foods?|restauration rapide|brochettis?)\b/, trade: { label: "restauration rapide", codes: ["56.10C"] } },
  { asked: /\brestau\w*/, trade: { label: "restauration", codes: ["56.10A", "56.10C"] } },
  { asked: /\b(epicer\w*|alimentation generale|supermarches?|superettes?|doukas?)\b/, trade: { label: "alimentation", codes: ["47.11B", "47.11D"] } },
  { asked: /\bboulang\w*/, trade: { label: "boulangerie", codes: ["10.71C"] } },
  { asked: /\btaxis?\b/, trade: { label: "taxi", codes: ["49.32Z"] } },
  { asked: /\b(garages?|garagistes?|mecanicien\w*|mecanique auto\w*)\b/, trade: { label: "garage automobile", codes: ["45.20A"] } },
  { asked: /\blocation de (voitures?|vehicules?)\b/, trade: { label: "location de voitures", codes: ["77.11A"] } },
  { asked: /\bstations?[- ]services?\b/, trade: { label: "station-service", codes: ["47.30Z"] } },
  { asked: /\bcoiff\w*/, trade: { label: "coiffure", codes: ["96.02A"] } },
  { asked: /\bcoutur\w*/, trade: { label: "couture", codes: ["14.13Z"] } },
  { asked: /\b(vetements?|habillement|pret[- ]a[- ]porter)\b/, trade: { label: "vêtements", codes: ["47.71Z"] } },
  { asked: /\bfleuristes?\b/, trade: { label: "fleuriste", codes: ["47.76Z"] } },
  { asked: /\bpharmac\w*/, trade: { label: "pharmacie", codes: ["47.73Z"] } },
  { asked: /\b(medecins?|docteurs?|cabinets? medica\w*)\b/, trade: { label: "médecin généraliste", codes: ["86.21Z"] } },
  { asked: /\bauto[- ]?ecoles?\b/, trade: { label: "auto-école", codes: ["85.53Z"] } },
  { asked: /\bhotel\w*/, trade: { label: "hôtel", codes: ["55.10Z"] } },
  { asked: /\b(pecheurs?|peche)\b/, trade: { label: "pêche", codes: ["03.11Z"] } },
  { asked: /\b(agricult\w*|maraich\w*)\b/, trade: { label: "agriculture", codes: ["01.13Z"] } },
  { asked: /\b(informati\w*|developpeurs?|logiciels?)\b/, trade: { label: "informatique", codes: ["62.01Z", "95.11Z"] } },
  { asked: /\bnettoyage\b/, trade: { label: "nettoyage", codes: ["81.21Z"] } },
  { asked: /\b(gardiennage|securite privee|agents? de securite)\b/, trade: { label: "sécurité", codes: ["80.10Z"] } },
  { asked: /\b(comptab\w*|experts?[- ]comptables?)\b/, trade: { label: "comptabilité", codes: ["69.20Z"] } },
  { asked: /\barchitect\w*/, trade: { label: "architecture", codes: ["71.11Z"] } },
  { asked: /\btransport(eurs?)? de marchandises\b/, trade: { label: "transport de marchandises", codes: ["49.41B"] } },
];

/** Le message parle clairement d'une entreprise. */
const COMPANY = /\b(entreprises?|societes?|siret|siren|sarl|sasu?|eurl|auto-?entrepreneurs?|micro-?entreprises?|gerante?s?|pdg|dirigeants?|raison sociale|kbis|registre du commerce)\b/;
/** Mots de tous les jours (« je vais au magasin ») : on ne répond que si une entreprise porte vraiment ce nom. */
const SHOP = /\b(commerces?|commercants?|magasins?|boutiques?|artisans?)\b/;
/** Avec un métier seul (« un plombier à Sada »), il faut aussi une vraie recherche. */
const SEARCHING = /\b(quels?|quelles?|combien|liste|cherche\w*|trouver?|connais\w*|y a-t-il|il y a|besoin d'une?|ou est|adresse)\b/;
const CLOSED = /\b(fermee?s?|ferme|disparue?s?|radiee?s?|liquide\w*|faillite|ancien(ne)?s?|n'existent? plus|ont existe|a existe|cesse\w*)\b/;
const NUMBER = /\b(\d{14}|\d{9}|\d{3} ?\d{3} ?\d{3}(?: ?\d{5})?)\b/;

/** Tournures qui annoncent un nom sans dire « entreprise » : « tu connais X ? », « X existe encore ? ». */
const BEFORE_NAME = /\b(?:tu connais|connais-tu|vous connaissez|connaissez-vous|c'est quoi|parle[- ]moi de|qui dirige|qui a cree|qui est derriere|des infos? sur|renseigne[- ]moi sur)\s+(.+)/;
const AFTER_NAME = /^(.+?)\s+(?:existe(?:nt)? (?:encore|toujours|depuis)|a ferme|est ferme|a fait faillite|a ete cree|a ete fonde|date de quand)\b/;

/** Mots qui ne font pas partie d'un nom d'entreprise. */
const FILLER = new Set(
  `a à au aux avec ce ces cet cette c'est ca chez comment d dans de des du donne donne-moi dis dis-moi elle en encore est est-ce a-t-il et existe existent il ils j je l la le les leur lui ma mais me mes moi mon n ne nom nomme nommee appelle appelee on ou où par pas peux peux-tu pour qu que quel quelle quelles quels qui quoi s sa se ses si son sont sur ta te tes toi ton toujours tu un une veux voudrais vous y s'il plait stp svp merci bonjour salut kwezi
  mayotte mahorais mahoraise mahoraises ile île entreprise entreprises societe societes siret siren numero commerce commerces commercant commercants magasin magasins boutique boutiques artisan artisans gerant gerante gerants pdg dirigeant dirigeants patron directeur raison sociale kbis registre adresse date creation creee cree ouverte ouvertes ouvert active actives activite fermee fermees ferme fermes disparue disparues radiee radiees ancienne anciennes ancien anciens liste toutes tous tout combien cherche cherches trouver trouve connais connaissez infos info informations parle depuis quand situe situee trouve-moi`
    .split(/\s+/)
    .map(normalize),
);

/** Mots du message qui peuvent former un nom d'entreprise. */
function nameWords(text: string, trade: (typeof TRADES)[number] | undefined): string {
  let rest = text.replace(/[?!.,;:«»"()]/g, " ");
  // Le métier et les communes sont déjà des filtres : on ne les cherche pas dans le nom.
  if (trade) rest = rest.replace(new RegExp(trade.asked.source, "g"), " ");
  for (const [place] of placesIn(text)) rest = rest.replace(new RegExp(place.source, "g"), " ");
  return rest
    .split(/\s+/)
    .map((word) => word.replace(/^(?:[dlnjcs]|qu)'/, "").replace(/^-+|-+$/g, ""))
    .filter((word) => word && !FILLER.has(word))
    .join(" ");
}

/** Ce que le message demande sur les entreprises (null : il n'en parle pas). */
export function companyAsk(message: string): CompanyAsk | null {
  const text = normalize(message).replace(/[’`]/g, "'");
  const communes = [...new Set(placesIn(text).flatMap(([, codes]) => codes))];
  const closed = CLOSED.test(text);
  const number = text.match(NUMBER)?.[1].replace(/ /g, "");
  if (number) return { name: number, communes: [], trade: null, closed: false, strict: false };

  const matched = TRADES.find((t) => t.asked.test(text));
  const sure = COMPANY.test(text);
  if (sure || SHOP.test(text) || (matched && SEARCHING.test(text))) {
    // « Le magasin Somaco » : le nom suit le mot ; « je vais au magasin » n'en donne aucun.
    const words = nameWords(sure ? text : text.slice((text.match(SHOP)?.index ?? 0)), matched);
    const name = words.split(" ").length > MAX_NAME_WORDS ? "" : words;
    // Ni nom, ni métier, ni commune avec un mot de tous les jours : rien à chercher.
    if (!sure && !name && !matched && !communes.length) return null;
    return { name, communes, trade: matched?.trade ?? null, closed, strict: !sure };
  }

  const said = text.match(BEFORE_NAME)?.[1] ?? text.match(AFTER_NAME)?.[1];
  const name = said ? nameWords(said, undefined) : "";
  if (!name || name.split(" ").length > MAX_NAME_WORDS) return null;
  return { name, communes: [], trade: null, closed: false, strict: true };
}

export type Company = {
  siren: string;
  name: string;
  /** Sigle, enseignes et noms commerciaux. */
  aliases: string[];
  activity: string | null;
  /** Adresse à Mayotte (celle du siège s'il y est, sinon d'un établissement de l'île). */
  address: string | null;
  /** Commune du siège quand il n'est pas à Mayotte. */
  headOffice: string | null;
  created: string | null;
  closed: string | null;
  open: boolean;
  sites: number;
  openSites: number;
  leaders: string[];
};

type RawSite = {
  adresse?: string | null;
  departement?: string | null;
  commune?: string | null;
  libelle_commune?: string | null;
  liste_enseignes?: string[] | null;
  nom_commercial?: string | null;
};

type RawLeader = { nom?: string | null; prenoms?: string | null; denomination?: string | null; qualite?: string | null };

export type RawCompany = {
  siren?: string;
  nom_complet?: string | null;
  sigle?: string | null;
  activite_principale?: string | null;
  date_creation?: string | null;
  date_fermeture?: string | null;
  etat_administratif?: string | null;
  nombre_etablissements?: number | null;
  nombre_etablissements_ouverts?: number | null;
  siege?: RawSite | null;
  matching_etablissements?: RawSite[] | null;
  dirigeants?: RawLeader[] | null;
};

/** Grandes familles d'activité de l'INSEE (deux premiers chiffres du code). */
const ACTIVITIES: Record<string, string> = {
  "01": "agriculture et élevage", "02": "forêt", "03": "pêche et aquaculture", "08": "carrières", "10": "fabrication d'aliments", "11": "fabrication de boissons",
  "13": "textile", "14": "couture et habillement", "15": "cuir et chaussures", "16": "travail du bois", "17": "papier et carton", "18": "imprimerie", "20": "chimie",
  "22": "plastique et caoutchouc", "23": "béton, verre et matériaux", "24": "métallurgie", "25": "ouvrages en métal", "26": "électronique", "27": "équipements électriques",
  "28": "machines", "29": "industrie automobile", "30": "matériel de transport", "31": "fabrication de meubles", "32": "autres fabrications", "33": "réparation et installation de machines",
  "35": "électricité et gaz", "36": "eau", "37": "eaux usées", "38": "déchets", "39": "dépollution", "41": "construction de bâtiments", "42": "génie civil",
  "43": "travaux du bâtiment", "45": "commerce et réparation d'automobiles", "46": "commerce de gros", "47": "commerce de détail", "49": "transport par la route",
  "50": "transport par bateau", "51": "transport aérien", "52": "entreposage et services de transport", "53": "poste et courrier", "55": "hébergement", "56": "restauration",
  "58": "édition", "59": "films, vidéo et musique", "60": "radio et télévision", "61": "télécommunications", "62": "informatique", "63": "services d'information",
  "64": "banque et finance", "65": "assurance", "66": "services financiers", "68": "immobilier", "69": "droit et comptabilité", "70": "conseil et sièges sociaux",
  "71": "architecture et ingénierie", "72": "recherche", "73": "publicité", "74": "design, photo et autres métiers spécialisés", "75": "vétérinaire", "77": "location",
  "78": "intérim et recrutement", "79": "agences de voyage", "80": "sécurité", "81": "nettoyage et espaces verts", "82": "services administratifs", "84": "administration publique",
  "85": "enseignement et formation", "86": "santé", "87": "hébergement médico-social", "88": "action sociale", "90": "arts et spectacles", "91": "bibliothèques et musées",
  "92": "jeux d'argent", "93": "sport et loisirs", "94": "association", "95": "réparation d'ordinateurs et d'objets", "96": "coiffure, beauté et services aux personnes",
  "97": "emploi à domicile",
};

/** Activité en clair d'après le code de l'INSEE (« 43.22A » → plomberie). */
export function activityOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const exact = TRADES.find((t) => t.trade.codes[0] === code && t.trade.codes.length === 1)?.trade.label;
  const family = ACTIVITIES[code.slice(0, 2)];
  return exact && family ? `${exact} (${family})` : (exact ?? family ?? null);
}

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || null;

/** Une fiche de l'annuaire, en clair. */
export function toCompany(raw: RawCompany): Company | null {
  const name = clean(raw.nom_complet);
  if (!raw.siren || !name) return null;
  const sites = raw.matching_etablissements ?? [];
  const inMayotte = raw.siege?.departement === MAYOTTE;
  const local = inMayotte ? raw.siege : sites.find((s) => s.departement === MAYOTTE);
  const aliases = [raw.sigle, ...(raw.siege?.liste_enseignes ?? []), ...sites.flatMap((s) => [...(s.liste_enseignes ?? []), s.nom_commercial])]
    .map(clean)
    .filter((alias): alias is string => alias !== null && !normalize(name).includes(normalize(alias)));
  return {
    siren: raw.siren,
    name,
    aliases: [...new Set(aliases)].slice(0, 4),
    activity: activityOf(raw.activite_principale),
    address: clean(local?.adresse),
    headOffice: inMayotte ? null : clean(raw.siege?.libelle_commune),
    created: raw.date_creation ?? null,
    closed: raw.date_fermeture ?? null,
    open: raw.etat_administratif === "A",
    sites: raw.nombre_etablissements ?? 1,
    openSites: raw.nombre_etablissements_ouverts ?? 0,
    leaders: (raw.dirigeants ?? [])
      // Les commissaires aux comptes ne dirigent pas l'entreprise.
      .filter((d) => !/commissaire/i.test(d.qualite ?? ""))
      .map((d) => {
        const who = clean(d.denomination) ?? clean([d.prenoms?.split(/[ ,]/)[0], d.nom].filter(Boolean).join(" "));
        // Entreprise au nom de la personne : inutile de la redire.
        if (!who || normalize(who).split(" ").every((word) => normalize(name).includes(word))) return null;
        return `${who}${d.qualite ? ` (${d.qualite.toLowerCase()})` : ""}`;
      })
      .filter((leader): leader is string => leader !== null)
      .slice(0, 2),
  };
}

/** Vrai si le nom, le sigle ou une enseigne contient chaque mot cherché. */
export function namesMatch(company: Company, name: string) {
  const known = normalize([company.name, ...company.aliases].join(" "));
  return normalize(name).split(" ").every((word) => known.includes(word));
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const day = (iso: string) => (Number.isNaN(Date.parse(iso)) ? iso : dayFormat.format(new Date(iso)));

/** Une entreprise sur une ligne, pour Tamilya. */
export function companyLine(c: Company): string {
  return [
    `- ${c.name}`,
    c.aliases.length ? ` (aussi : ${c.aliases.join(", ")})` : "",
    c.activity ? ` : ${c.activity}` : "",
    c.address ? ` ; ${c.address}` : "",
    c.headOffice ? ` ; siège hors de Mayotte (${c.headOffice})` : "",
    c.created ? ` ; créée le ${day(c.created)}` : "",
    c.open ? " ; en activité" : ` ; fermée${c.closed ? ` le ${day(c.closed)}` : ""}`,
    c.sites > 1 ? ` ; ${c.sites} établissements, dont ${c.openSites} ouvert${c.openSites > 1 ? "s" : ""}` : "",
    c.leaders.length ? ` ; dirigée par ${c.leaders.join(" et ")}` : "",
    ` ; SIREN ${c.siren} ; fiche : ${SHEET}${c.siren}`,
  ].join("");
}

type Found = { companies: Company[]; total: number };
const cache = new Map<string, { at: number; found: Found }>();

async function search(params: Record<string, string>, perPage: number): Promise<Found> {
  const url = `${API}?${new URLSearchParams({ ...params, departement: MAYOTTE, per_page: String(perPage), minimal: "true", include: "siege,dirigeants,matching_etablissements", limite_matching_etablissements: "3" })}`;
  const kept = cache.get(url);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.found;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`annuaire des entreprises ${response.status}`);
  const data = (await response.json()) as { results?: RawCompany[]; total_results?: number };
  const companies = (data.results ?? []).map(toCompany).filter((c): c is Company => c !== null);
  const found = { companies, total: data.total_results ?? companies.length };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(url, { at: Date.now(), found });
  return found;
}

const SOURCE = "annuaire officiel des entreprises, annuaire-entreprises.data.gouv.fr";
const LIMITS = "L'annuaire ne donne ni téléphone ni horaires, et ne contient que les entreprises déclarées : ne les invente pas.";

/** Bloc pour Tamilya d'après une demande déjà comprise (null : rien à dire). */
export async function companiesBlockFor(ask: CompanyAsk): Promise<string | null> {
  if (!ask.name && !ask.trade && !ask.communes.length && !ask.closed) {
    return `Entreprises de Mayotte : tu peux chercher dans l'${SOURCE} (entreprises en activité ou fermées). Il te faut un nom, un métier ou une commune : demande-le.`;
  }
  const where = ask.communes.map((code) => MAYOTTE_COMMUNES[code]).filter(Boolean).join(", ");
  let found: Found;
  try {
    found = await search(
      {
        ...(ask.name && { q: ask.name }),
        ...(ask.trade && { activite_principale: ask.trade.codes.join(",") }),
        ...(ask.communes.length && { code_commune: ask.communes.join(",") }),
        ...(ask.closed && !ask.name && { etat_administratif: "C" }),
      },
      ask.name ? NAMED : LISTED,
    );
  } catch (error) {
    console.error("[direct] Annuaire des entreprises indisponible", error);
    return null;
  }
  const subject = [ask.name ? `« ${ask.name} »` : (ask.trade?.label ?? "les entreprises"), ask.closed && !ask.name ? "fermées" : null, where ? `à ${where}` : null].filter(Boolean).join(" ");
  const none = `Entreprises de Mayotte (${SOURCE}) : aucune fiche pour ${subject}. Si la personne cherchait bien cette entreprise, dis-le sans rien inventer ; une petite entreprise est souvent inscrite au nom de la personne qui la tient.`;

  // Recherche par nom (pas par numéro) : d'abord les fiches dont le nom contient tous les mots.
  if (ask.name && !/^\d+$/.test(ask.name)) {
    const exact = found.companies.filter((c) => namesMatch(c, ask.name));
    // « Tu connais X ? » sans entreprise de ce nom : ce n'était pas une question sur une entreprise.
    if (!exact.length && ask.strict) return null;
    // Rien du tout : un ou deux mots, c'était un nom (on le dit) ; plus, une phrase (« mon entreprise marche bien »).
    if (!exact.length && !found.companies.length) return ask.name.split(" ").length > 2 ? null : none;
    return [
      exact.length
        ? `Entreprises de Mayotte (${SOURCE}) pour ${subject} :`
        : `Entreprises de Mayotte (${SOURCE}) : aucune fiche exacte pour ${subject}. Noms approchants, à proposer seulement si c'est peut-être l'une d'elles :`,
      ...(exact.length ? exact : found.companies).map(companyLine),
      exact.length > 1 ? "Plusieurs portent ce nom : si tu ne sais pas laquelle, demande la commune ou le métier." : null,
      LIMITS,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (!found.companies.length) return none;
  // L'annuaire ne compte pas au-delà de 10 000.
  const count = found.total >= 10_000 ? "plus de 10 000 fiches" : `${found.total} fiche${found.total > 1 ? "s" : ""}`;
  const more = found.total > found.companies.length;
  return [
    `Entreprises de Mayotte (${SOURCE}) pour ${subject} : ${count}${more ? `, voici les ${found.companies.length} premières` : ""}.`,
    ...found.companies.map(companyLine),
    more ? "Il y en a d'autres : propose de préciser le nom, le métier ou la commune." : null,
    LIMITS,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Bloc pour Tamilya : les entreprises dont parle le message, ou null. */
export async function companiesBlock(message: string): Promise<string | null> {
  const ask = companyAsk(message);
  return ask ? companiesBlockFor(ask) : null;
}

/** Vocal : Tamilya donne elle-même le nom, le métier et la commune qu'elle a entendus. */
export function companyAskFromVoice(args: { name: string; trade: string; commune: string; closed: boolean }): CompanyAsk {
  const trade = TRADES.find((t) => t.asked.test(normalize(args.trade)))?.trade ?? null;
  const number = args.name.replace(/\s/g, "");
  return {
    name: /^\d{9}(\d{5})?$/.test(number) ? number : normalize(args.name).replace(/[?!.,;:«»"()]/g, " ").replace(/\s+/g, " ").trim(),
    communes: [...new Set(placesIn(normalize(args.commune)).flatMap(([, codes]) => codes))],
    trade,
    closed: args.closed,
    strict: false,
  };
}
