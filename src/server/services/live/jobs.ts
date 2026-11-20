import "server-only";
import { unstable_cache } from "next/cache";
import type { JobContract, JobOffer } from "@/lib/emploi/intent";
import { forgetFranceTravailToken, franceTravailKeys, franceTravailToken } from "@/server/services/live/france-travail";

/**
 * Offres d'emploi de Mayotte (département 976) via l'API « Offres d'emploi v2 »
 * de France Travail. Clés gratuites sur francetravail.io, à mettre dans
 * FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET.
 *
 * Toutes les offres en cours sont lues (150 par page, l'API s'arrête à 3 150),
 * les plus récentes d'abord : la liste de la conversation (bloc ```offres-emploi```)
 * les montre toutes, le prompt n'en reçoit que quelques-unes.
 */
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
const MAYOTTE = "976";

const CACHE_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
/** Taille d'une page, et dernière position que l'API accepte. */
const PAGE = 150;
const API_MAX_INDEX = 3149;
/** Pages demandées en même temps (l'API limite le nombre d'appels par seconde). */
const PARALLEL = 3;

export type { JobOffer };

export type JobsResult = { configured: false } | { configured: true; offers: JobOffer[]; total: number; updatedAt: string; error?: string };

let cache: { at: number; offers: JobOffer[]; total: number; updatedAt: string } | null = null;

/**
 * Offres lisibles seulement si l'application a reçu l'API « Offres d'emploi v2 » : France Travail
 * l'a retirée de l'accès libre (accès sur demande, novembre 2026). Tant qu'elle n'est pas accordée,
 * FRANCE_TRAVAIL_OFFRES reste absent et rien n'est demandé (les mêmes clés servent aux événements emploi).
 */
export const jobsConfigured = () => franceTravailKeys() !== null && process.env.FRANCE_TRAVAIL_OFFRES?.trim() === "on";

type RawOffer = {
  id: string;
  intitule?: string;
  dateCreation?: string;
  typeContrat?: string;
  typeContratLibelle?: string;
  dureeTravailLibelleConverti?: string;
  romeLibelle?: string;
  appellationlibelle?: string;
  salaire?: { libelle?: string };
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
};

/** « 976 - MAMOUDZOU » → « Mamoudzou » ; « 976 - Mayotte » (sans commune) → null. */
function placeOf(libelle?: string): string | null {
  const name = libelle?.replace(/^\s*976\s*-?\s*/, "").trim();
  if (!name || /^mayotte$/i.test(name)) return null;
  return name.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

const kindOf = (code?: string): JobContract => (code === "CDI" || code === "CDD" || code === "MIS" ? code : "AUTRE");

function toOffer(raw: RawOffer): JobOffer {
  return {
    id: raw.id,
    title: raw.intitule?.trim() || "Offre sans titre",
    company: raw.entreprise?.nom?.trim() || null,
    place: placeOf(raw.lieuTravail?.libelle),
    contract: raw.typeContratLibelle?.trim() || raw.typeContrat || null,
    kind: kindOf(raw.typeContrat),
    hours: raw.dureeTravailLibelleConverti?.trim() || null,
    salary: raw.salaire?.libelle?.trim() || null,
    job: raw.appellationlibelle?.trim() || raw.romeLibelle?.trim() || null,
    date: raw.dateCreation ?? null,
    link: `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(raw.id)}`,
  };
}

/** Une page d'offres (du rang `from` à `to`) et le total annoncé par l'API (« offres 0-149/523 »). */
async function page(access: string, from: number, to: number): Promise<{ offers: RawOffer[]; total: number }> {
  const url = `${SEARCH_URL}?${new URLSearchParams({ departement: MAYOTTE, sort: "1", range: `${from}-${to}` })}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${access}`, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401) forgetFranceTravailToken(SCOPE);
  // 204 : aucune offre ; 206 : réponse partielle normale (pagination).
  if (response.status === 204) return { offers: [], total: 0 };
  if (!response.ok) throw new Error(`recherche refusée (HTTP ${response.status})`);
  const data = (await response.json()) as { resultats?: RawOffer[] };
  const offers = data.resultats ?? [];
  const total = Number(response.headers.get("content-range")?.match(/\/(\d+)/)?.[1] ?? offers.length);
  return { offers, total };
}

/** Toutes les offres en cours à Mayotte, les plus récentes d'abord (une erreur est levée : rien n'est gardé). */
async function searchOffers(): Promise<{ offers: JobOffer[]; total: number; updatedAt: string }> {
  if (!jobsConfigured()) return { offers: [], total: 0, updatedAt: new Date().toISOString() };
  const access = await franceTravailToken(SCOPE);
  const first = await page(access, 0, PAGE - 1);
  const raws = [...first.offers];
  const last = Math.min(first.total, API_MAX_INDEX + 1) - 1;
  const starts: number[] = [];
  for (let from = PAGE; from <= last; from += PAGE) starts.push(from);
  for (let i = 0; i < starts.length; i += PARALLEL) {
    const pages = await Promise.all(starts.slice(i, i + PARALLEL).map((from) => page(access, from, Math.min(from + PAGE - 1, last))));
    for (const p of pages) raws.push(...p.offers);
  }
  // Une offre peut glisser d'une page à l'autre pendant la lecture : on garde chaque offre une fois.
  const seen = new Set<string>();
  const offers = raws.filter((r) => r.id && !seen.has(r.id) && seen.add(r.id)).map(toOffer);
  return { offers, total: Math.max(first.total, offers.length), updatedAt: new Date().toISOString() };
}

/**
 * Offres gardées 30 min dans le cache de données de Next, partagé entre les
 * instances du serveur. Le jeton d'accès change souvent : c'est le résultat
 * qui est gardé, pas la réponse HTTP (dont la clé contiendrait le jeton).
 */
const cachedOffers = unstable_cache(searchOffers, ["france-travail-offres-976-toutes"], { revalidate: CACHE_MS / 1000 });

/** Toutes les offres en cours à Mayotte, les plus récentes d'abord (cache 30 min). */
export async function getMayotteJobs(): Promise<JobsResult> {
  if (!jobsConfigured()) return { configured: false };
  if (cache && Date.now() - cache.at < CACHE_MS) return { configured: true, ...cache };
  try {
    const result = await cachedOffers();
    cache = { at: Date.now(), ...result };
    return { configured: true, ...result };
  } catch (error) {
    console.error("[emploi] France Travail indisponible", error);
    return {
      configured: true,
      offers: cache?.offers ?? [],
      total: cache?.total ?? 0,
      updatedAt: cache?.updatedAt ?? new Date().toISOString(),
      error: error instanceof Error ? error.message : "erreur",
    };
  }
}
