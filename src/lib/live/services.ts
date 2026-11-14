import "server-only";
import { normalize } from "./intent";

/**
 * Services publics de Mayotte (mairies, CSSM, préfecture, gendarmeries,
 * France services…), lus dans l'annuaire officiel de service-public.gouv.fr :
 * API gratuite, sans clé ni compte. Environ 200 adresses, chargées d'un coup
 * et gardées 24 h ; Tamilya ne reçoit que celles qui touchent à la question.
 */

const API = "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records";
const FIELDS = "nom,adresse,telephone,adresse_courriel,plage_ouverture,url_service_public,code_insee_commune";
const PAGE = 100;
const MAX_PAGES = 4;
const CACHE_MS = 24 * 3600_000;

/** Code INSEE → commune de Mayotte. */
export const MAYOTTE_COMMUNES: Record<string, string> = {
  "97601": "Acoua",
  "97602": "Bandraboua",
  "97603": "Bandrélé",
  "97604": "Bouéni",
  "97605": "Chiconi",
  "97606": "Chirongui",
  "97607": "Dembéni",
  "97608": "Dzaoudzi",
  "97609": "Kani-Kéli",
  "97610": "Koungou",
  "97611": "Mamoudzou",
  "97612": "Mtsamboro",
  "97613": "M'Tsangamouji",
  "97614": "Ouangani",
  "97615": "Pamandzi",
  "97616": "Sada",
  "97617": "Tsingoni",
};

/** Communes et villages cités dans le message (texte déjà normalisé) → codes INSEE. */
const PLACES: [RegExp, string[]][] = [
  [/\bacoua\b/, ["97601"]],
  [/\bbandraboua\b/, ["97602"]],
  [/\bbandrele\b/, ["97603"]],
  [/\b(boueni|m'?zouazia)\b/, ["97604"]],
  [/\bchiconi\b/, ["97605"]],
  [/\bchirongui\b/, ["97606"]],
  [/\bdembeni\b/, ["97607"]],
  [/\b(dzaoudzi|labattoir)\b/, ["97608"]],
  [/\bkani[- ]?keli\b/, ["97609"]],
  [/\b(koungou|majicavo|longoni|trevani)\b/, ["97610"]],
  [/\b(mamoudzou|kaweni|kawene|passamainty|cavani|mtsapere|m'tsapere|tsoundzou|vahibe)\b/, ["97611"]],
  [/\bm'?tsamboro\b/, ["97612"]],
  [/\bm'?tsangamouji\b/, ["97613"]],
  [/\bouangani\b/, ["97614"]],
  [/\bpamandzi\b/, ["97615"]],
  [/\bsada\b/, ["97616"]],
  [/\b(tsingoni|combani)\b/, ["97617"]],
  [/\bpetite[- ]terre\b/, ["97608", "97615"]],
];

/** Lieux de Mayotte cités dans un texte déjà normalisé, avec leurs codes INSEE. */
export const placesIn = (text: string) => PLACES.filter(([re]) => re.test(text));

/**
 * Ce que la personne cherche (message normalisé) → services de l'annuaire qui y
 * répondent (nom normalisé).
 */
const CATEGORIES: { asked: RegExp; name: RegExp }[] = [
  { asked: /\b(mairies?|maire|etat civil|acte de naissance|mariage)\b/, name: /^mairie\b/ },
  { asked: /\b(cssm|caf|secu|securite sociale|caisse de securite|carte vitale|allocations?|retraite|assurance maladie)\b/, name: /\bcssm\b|securite sociale/ },
  { asked: /\b(prefecture|titre de sejour|carte de sejour|naturalisation|sous-prefecture)\b/, name: /^prefecture\b/ },
  { asked: /\b(gendarm\w*)\b/, name: /gendarmerie/ },
  { asked: /\b(police|commissariat|plainte)\b/, name: /police|commissariat|gendarmerie/ },
  { asked: /\b(france services?|espaces? numeriques?|aide aux demarches|demarches? en ligne|demarches? administratives?|service public|administrations?)\b/, name: /^france services\b|espace numerique/ },
  { asked: /\b(impots?|taxe fonciere|taxes?|fiscal\w*|finances publiques)\b/, name: /impots|finances publiques|gestion comptable/ },
  { asked: /\b(france travail|pole emploi|chomage)\b/, name: /france travail/ },
  { asked: /\b(tribunal|justice|juge|prud'?hom\w*|acces au droit|juridique|point[- ]justice)\b/, name: /tribunal|justice|prud'hommes|acces au droit/ },
  { asked: /\b(mission locale|info jeunes?|jeunesse)\b/, name: /mission locale|info jeunes|jeunesse/ },
  { asked: /\b(ccas|action sociale|aide sociale|centre social)\b/, name: /ccas|action sociale|centre social/ },
  { asked: /\b(pompiers?|sdis|incendie)\b/, name: /\bsdis\b|incendie/ },
  { asked: /\bdouanes?\b/, name: /douane/ },
  { asked: /\b(rectorat|academie|inscription scolaire)\b/, name: /rectorat|academie de mayotte/ },
  { asked: /\b(ars|agence regionale de sante)\b/, name: /\(ars\)/ },
  { asked: /\bconseil departemental\b/, name: /^conseil departemental - mayotte/ },
  { asked: /\b(anah|france renov|renovation)\b/, name: /anah|renov/ },
];

export type PublicService = {
  name: string;
  /** Code INSEE de la commune (null : inconnu). */
  commune: string | null;
  address: string | null;
  phones: string[];
  email: string | null;
  hours: string | null;
  link: string | null;
  /** Position sur la carte (null : l'annuaire ne la donne pas). */
  point: { lat: number; lng: number } | null;
};

type Raw = {
  nom?: string | null;
  adresse?: unknown;
  telephone?: unknown;
  adresse_courriel?: string | null;
  plage_ouverture?: unknown;
  url_service_public?: string | null;
  code_insee_commune?: string | null;
};

/** Les listes de l'annuaire arrivent en texte JSON. */
function list<T>(value: unknown): T[] {
  try {
    const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** « 07:30:00 » → « 7 h 30 », « 16:00:00 » → « 16 h ». */
function hour(value: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  return m[2] === "00" ? `${h} h` : `${h} h ${m[2]}`;
}

type Opening = {
  nom_jour_debut?: string;
  nom_jour_fin?: string;
  valeur_heure_debut_1?: string;
  valeur_heure_fin_1?: string;
  valeur_heure_debut_2?: string;
  valeur_heure_fin_2?: string;
  commentaire?: string;
};

function hoursOf(value: unknown): string | null {
  const parts = list<Opening>(value)
    .map((o) => {
      const from = o.nom_jour_debut?.toLowerCase();
      if (!from) return null;
      const to = o.nom_jour_fin?.toLowerCase();
      const days = to && to !== from ? `du ${from} au ${to}` : `le ${from}`;
      const slots = [
        [hour(o.valeur_heure_debut_1), hour(o.valeur_heure_fin_1)],
        [hour(o.valeur_heure_debut_2), hour(o.valeur_heure_fin_2)],
      ]
        .filter(([a, b]) => a && b)
        .map(([a, b]) => `${a}-${b}`);
      if (!slots.length) return null;
      return `${days} ${slots.join(" et ")}${o.commentaire ? ` (${o.commentaire.trim()})` : ""}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

type RawAddress = {
  type_adresse?: string;
  numero_voie?: string;
  complement1?: string;
  code_postal?: string;
  nom_commune?: string;
  latitude?: string;
  longitude?: string;
};

const mainAddress = (value: unknown) => {
  const all = list<RawAddress>(value);
  return all.find((x) => x.type_adresse === "Adresse") ?? all[0];
};

function pointOf(value: unknown): { lat: number; lng: number } | null {
  const a = mainAddress(value);
  const lat = Number(a?.latitude);
  const lng = Number(a?.longitude);
  // Mayotte seulement (une position vide ou fausse ne place rien sur la carte).
  return a?.latitude && a?.longitude && lat < -12.5 && lat > -13.1 && lng > 44.9 && lng < 45.4 ? { lat, lng } : null;
}

function addressOf(value: unknown): string | null {
  const a = mainAddress(value);
  if (!a) return null;
  const street = [a.complement1, a.numero_voie].map((s) => s?.trim()).filter(Boolean).join(", ");
  const town = [a.code_postal, a.nom_commune].filter(Boolean).join(" ");
  return [street, town].filter(Boolean).join(", ") || null;
}

/** Une fiche de l'annuaire, en clair. */
export function toService(raw: Raw): PublicService | null {
  const name = raw.nom?.trim();
  if (!name) return null;
  return {
    name,
    commune: raw.code_insee_commune ?? null,
    address: addressOf(raw.adresse),
    phones: list<{ valeur?: string }>(raw.telephone)
      .map((t) => t.valeur?.trim())
      .filter((t): t is string => Boolean(t)),
    email: raw.adresse_courriel?.trim() || null,
    hours: hoursOf(raw.plage_ouverture),
    link: raw.url_service_public?.trim() || null,
    point: pointOf(raw.adresse),
  };
}

/** Vrai si le message demande un service public (sans rien charger). */
export function servicesAsked(message: string) {
  const text = normalize(message);
  return CATEGORIES.some((c) => c.asked.test(text));
}

/**
 * Services qui répondent au message : ceux du type demandé, dans la commune
 * citée en premier (sinon partout à Mayotte). `more` : il en reste d'autres.
 */
export function matchServices(services: readonly PublicService[], message: string, max = 5): { found: PublicService[]; more: boolean } {
  const text = normalize(message);
  const categories = CATEGORIES.filter((c) => c.asked.test(text));
  if (!categories.length) return { found: [], more: false };
  const communes = new Set(PLACES.filter(([re]) => re.test(text)).flatMap(([, codes]) => codes));
  const wanted = services.filter((s) => categories.some((c) => c.name.test(normalize(s.name))));
  const local = communes.size ? wanted.filter((s) => s.commune && communes.has(s.commune)) : [];
  // Rien dans cette commune (la préfecture n'est qu'à Mamoudzou…) : ceux de toute l'île.
  const pool = local.length ? local : wanted;
  return { found: pool.slice(0, max), more: pool.length > max };
}

let cache: { at: number; services: PublicService[] } | null = null;

/** Tous les services publics de Mayotte (gardés 24 h ; l'ancienne liste si l'annuaire ne répond pas). */
export async function getMayotteServices(): Promise<PublicService[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.services;
  try {
    const services: PublicService[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${API}?where=${encodeURIComponent('startswith(code_insee_commune,"976")')}&select=${FIELDS}&limit=${PAGE}&offset=${page * PAGE}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
      if (!response.ok) throw new Error(`annuaire ${response.status}`);
      const data = (await response.json()) as { results?: Raw[] };
      const rows = data.results ?? [];
      services.push(...rows.map(toService).filter((s): s is PublicService => s !== null));
      if (rows.length < PAGE) break;
    }
    if (services.length) cache = { at: Date.now(), services };
    return services.length ? services : (cache?.services ?? []);
  } catch (error) {
    console.error("[direct] Annuaire des services publics indisponible", error);
    return cache?.services ?? [];
  }
}

const line = (s: PublicService) =>
  [
    `- ${s.name}`,
    s.address ? ` : ${s.address}` : "",
    s.phones.length ? ` ; tél. ${s.phones.join(" ou ")}` : "",
    s.email ? ` ; ${s.email}` : "",
    s.hours ? ` ; ouvert ${s.hours}` : "",
    s.link ? ` ; fiche : ${s.link}` : "",
  ].join("");

/** Bloc pour Tamilya : les services publics qui répondent au message, ou null. */
export async function servicesBlock(message: string): Promise<string | null> {
  if (!servicesAsked(message)) return null;
  const { found, more } = matchServices(await getMayotteServices(), message);
  if (!found.length) return null;
  return [
    "Services publics de Mayotte (annuaire officiel service-public.gouv.fr) :",
    ...found.map(line),
    more ? "Il y en a d'autres ailleurs à Mayotte : si la commune compte, demande-la." : null,
  ]
    .filter(Boolean)
    .join("\n");
}
