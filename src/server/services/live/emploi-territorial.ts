import "server-only";
import { jobsTownFor, type JobOffer } from "@/lib/emploi/intent";

/**
 * Offres de la fonction publique territoriale à Mayotte (mairies, Département,
 * intercommunalités…), lues dans le flux RSS public d'Emploi Territorial, filtré
 * sur le département 976. Aucune clé : c'est le flux proposé à tous sur le site.
 */
export const TERRITORIAL_SOURCE = "Emploi Territorial";
export const TERRITORIAL_RSS = "https://www.emploi-territorial.fr/rss?search-dept=976";
const FETCH_TIMEOUT_MS = 10_000;

const text = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const tag = (item: string, name: string) => item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";

/** Valeur d'une ligne de la description (« <div class="employeur"><strong>Employeur : </strong> … </div> »). */
const field = (description: string, name: string) => {
  const value = description.match(new RegExp(`<div class="${name}">([\\s\\S]*?)</div>`))?.[1];
  return value ? text(value.replace(/<strong>[\s\S]*?<\/strong>/, "")) || null : null;
};

const SMALL = new Set(["de", "du", "des", "la", "le", "les", "et", "a", "au", "aux", "en", "sur"]);

/** « COMMUNE DE CHIRONGUI » → « Commune de Chirongui » (les noms déjà écrits en minuscules restent tels quels). */
export function tidyName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/[\p{L}\p{N}]+/gu, (word, at: number) => (at > 0 && SMALL.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .replace(/\b([dl])'(\p{L})/giu, (_, d: string, l: string) => `${d.toLowerCase()}'${l.toUpperCase()}`);
}

/** « 14/12/2026 » → « 2026-12-14 » ; autre chose → null. */
const isoDay = (value: string | null) => {
  const m = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** « Emploi permanent - vacance d'emploi » → « Emploi permanent » ; « Remplacement temporaire… » → « Remplacement ». */
function contractOf(type: string | null): string | null {
  if (!type) return null;
  if (/^emploi permanent/i.test(type)) return "Emploi permanent";
  if (/^remplacement/i.test(type)) return "Remplacement";
  if (/temporaire|saisonnier|occasionnel/i.test(type)) return "Emploi temporaire";
  return type;
}

/** Offres du flux, dans l'ordre du flux ; une offre sans titre ni lien est laissée de côté. */
export function parseTerritorialRss(xml: string): JobOffer[] {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].flatMap(([item]) => {
    const title = text(tag(item, "title"));
    const link = text(tag(item, "link")).replace(/\?mtm_campaign=rss$/, "");
    if (!title || !/^https:\/\/www\.emploi-territorial\.fr\//.test(link)) return [];
    const description = tag(item, "description").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
    const place = field(description, "lieutravail");
    const employer = field(description, "employeur");
    const pub = Date.parse(text(tag(item, "pubDate")));
    const id = text(tag(item, "guid")).match(/O\d+/i)?.[0] ?? link;
    return [
      {
        id: `et-${id}`,
        title,
        company: employer ? tidyName(employer) : null,
        place: place ? jobsTownFor(place) || place : null,
        contract: contractOf(field(description, "typeemploi")),
        kind: "PUBLIC" as const,
        hours: field(description, "tempstravail"),
        salary: field(description, "salaire"),
        job: field(description, "metier"),
        date: Number.isNaN(pub) ? null : new Date(pub).toISOString(),
        deadline: isoDay(field(description, "datecand")),
        source: TERRITORIAL_SOURCE,
        link,
      },
    ];
  });
}

/** Les offres en cours à Mayotte sur Emploi Territorial (une erreur est levée si le flux ne répond pas). */
export async function fetchTerritorialOffers(): Promise<JobOffer[]> {
  const response = await fetch(TERRITORIAL_RSS, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 (compatible; TamilyaBot/1.0)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Emploi Territorial ne répond pas (HTTP ${response.status})`);
  const offers = parseTerritorialRss(await response.text());
  // Une offre dont la date limite est passée n'a plus rien à faire dans la liste.
  const today = new Date().toISOString().slice(0, 10);
  return offers.filter((o) => !o.deadline || o.deadline >= today);
}
