import "server-only";
import { jobsTownFor, type JobContract, type JobOffer } from "@/lib/emploi/intent";

/**
 * Offres France Travail de Mayotte lues sur la page publique de recherche
 * (candidat.francetravail.fr), en attendant l'accès à l'API « Offres d'emploi v2 »
 * (retirée de l'accès libre, accès sur demande, novembre 2026).
 *
 * Règles choisies avec l'utilisateur (2026-11-25) :
 * - robots.txt autorise /offres/recherche (seules les recherches par mots-clés sont refusées) ;
 * - seulement Mayotte, titre et quelques champs, et le lien vers l'offre sur France Travail ;
 * - lu au plus toutes les 4 heures (cache dans jobs.ts), pages lues l'une après l'autre ;
 * - si la page change et qu'on n'y trouve plus les offres, une erreur FranceTravailSiteError
 *   est levée : le tableau de bord admin l'affiche (getFranceTravailSiteHealth).
 */
export const FT_SOURCE = "France Travail";
export const FT_SEARCH_PAGE = "https://candidat.francetravail.fr/offres/recherche?lieux=976D&offresPartenaires=true&tri=1";
const PAGE = 150;
/** Au-delà, on s'arrête (l'île en compte environ 500). */
const MAX_OFFERS = 1500;
const TIMEOUT_MS = 10_000;
const PAUSE_MS = 1_000;
const DAY_MS = 86_400_000;
/** Mayotte : UTC+3, sans heure d'été. */
const MAYOTTE_OFFSET_MS = 3 * 3_600_000;

export class FranceTravailSiteError extends Error {}

const text = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** « 976 - MAMOUDZOU » → « Mamoudzou » ; « 976 - Mayotte » (sans commune) → null. */
export function placeOf(libelle?: string | null): string | null {
  const name = libelle?.replace(/^\s*976\s*-?\s*/, "").trim();
  if (!name || /^mayotte$/i.test(name)) return null;
  return jobsTownFor(name) || name.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

function kindOf(contract: string | null): JobContract {
  if (contract === "CDI" || contract === "CDD") return contract;
  if (contract && /^int[ée]rim/i.test(contract)) return "MIS";
  return "AUTRE";
}

/** « Publié aujourd'hui / hier / il y a 3 jours » → début de ce jour-là à Mayotte (heure ISO) ; autre chose → null. */
export function publishedOn(label: string, now = Date.now()): string | null {
  const days = /aujourd/i.test(label) ? 0 : /\bhier\b/i.test(label) ? 1 : Number(label.match(/il y a (\d+) jours?/i)?.[1] ?? NaN);
  if (!Number.isFinite(days)) return null;
  const mayotteDay = Math.floor((now + MAYOTTE_OFFSET_MS) / DAY_MS) - days;
  return new Date(mayotteDay * DAY_MS - MAYOTTE_OFFSET_MS).toISOString();
}

/** Total annoncé en haut de la page (« 482 offres ») ; null : introuvable (la page a changé). */
const totalOf = (html: string) => {
  const m = html.match(/<h1 class="title">\s*([\d\s  ]+)\s*offres?/);
  return m ? Number(m[1].replace(/\D/g, "")) : null;
};

/** Offres d'une page de résultats, et le total annoncé (sans réseau, testée). */
export function parseFranceTravailPage(html: string, now = Date.now()): { offers: JobOffer[]; total: number | null } {
  const offers = [...html.matchAll(/<li data-id-offre="([^"]+)"[\s\S]*?<\/li>/g)].flatMap(([item, id]) => {
    const title = text(item.match(/class="media-heading-title">([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (!title) return [];
    const subtext = item.match(/<p[^>]*class="subtext">([\s\S]*?)<\/p>/)?.[1] ?? "";
    const company = text(subtext.split(/<span>/)[0]).replace(/\s*-\s*$/, "") || null;
    const contractBlock = item.match(/<p class="contrat">([^<]*)<span class="type-contrat">([^<]*)<\/span>/);
    const contract = contractBlock ? text(contractBlock[1]) || null : null;
    const hours = contractBlock ? text(contractBlock[2]) : "";
    return [
      {
        id: `ft-${id}`,
        title,
        company,
        place: placeOf(text(subtext.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? "")),
        contract,
        kind: kindOf(contract),
        hours: hours && !/non renseign/i.test(hours) ? hours : null,
        salary: null,
        job: null,
        date: publishedOn(text(item.match(/<p class="date">([\s\S]*?)<\/p>/)?.[1] ?? ""), now),
        deadline: null,
        source: FT_SOURCE,
        link: `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(id)}`,
      },
    ];
  });
  return { offers, total: totalOf(html) };
}

/** Offres du rang `from` au rang `to` (une tranche qui dépasse la dernière offre fait répondre le site en erreur). */
async function readPage(from: number, to: number): Promise<string> {
  const response = await fetch(`${FT_SEARCH_PAGE}&range=${from}-${to}`, {
    headers: { Accept: "text/html", "Accept-Language": "fr-FR,fr;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; TamilyaBot/1.0)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new FranceTravailSiteError(`La page des offres France Travail ne répond pas (HTTP ${response.status}).`);
  return response.text();
}

/** Toutes les offres France Travail en cours à Mayotte (une erreur est levée si la page ne répond pas ou a changé). */
export async function fetchFranceTravailSiteOffers(): Promise<{ offers: JobOffer[]; total: number }> {
  const first = parseFranceTravailPage(await readPage(0, PAGE - 1));
  if (first.total === null) throw new FranceTravailSiteError("Le nombre d'offres n'est plus écrit au même endroit sur la page France Travail : la page a changé.");
  if (first.total > 0 && first.offers.length === 0)
    throw new FranceTravailSiteError(`La page France Travail annonce ${first.total} offres, mais on n'en lit aucune : la page a changé.`);
  const offers = [...first.offers];
  const last = Math.min(first.total, MAX_OFFERS);
  for (let from = PAGE; from < last; from += PAGE) {
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    offers.push(...parseFranceTravailPage(await readPage(from, Math.min(from + PAGE, last) - 1)).offers);
  }
  // Une offre peut glisser d'une page à l'autre pendant la lecture : on garde chaque offre une fois.
  const seen = new Set<string>();
  const unique = offers.filter((o) => !seen.has(o.id) && seen.add(o.id));
  return { offers: unique, total: Math.max(first.total, unique.length) };
}
