import "server-only";
import { unstable_cache } from "next/cache";

/**
 * Offres d'emploi de Mayotte (département 976) via l'API « Offres d'emploi v2 »
 * de France Travail. Clés gratuites sur francetravail.io, à mettre dans
 * FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET.
 */
const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
const MAYOTTE = "976";

const CACHE_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;

export type JobOffer = {
  title: string;
  company: string | null;
  place: string | null;
  contract: string | null;
  date: string | null;
  link: string;
};

export type JobsResult = { configured: false } | { configured: true; offers: JobOffer[]; error?: string };

let token: { value: string; expiresAt: number } | null = null;
let cache: { at: number; offers: JobOffer[] } | null = null;

function credentials() {
  const id = process.env.FRANCE_TRAVAIL_CLIENT_ID?.trim();
  const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export const jobsConfigured = () => credentials() !== null;

async function getToken(id: string, secret: string): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: SCOPE }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`jeton refusé (HTTP ${response.status})`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("jeton absent");
  // Marge d'une minute avant l'expiration annoncée.
  token = { value: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 1500) - 60) * 1000 };
  return token.value;
}

type RawOffer = {
  id: string;
  intitule?: string;
  dateCreation?: string;
  typeContratLibelle?: string;
  typeContrat?: string;
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
};

function toOffer(raw: RawOffer): JobOffer {
  return {
    title: raw.intitule?.trim() || "Offre sans titre",
    company: raw.entreprise?.nom?.trim() || null,
    place: raw.lieuTravail?.libelle?.replace(/^976\s*-\s*/, "").trim() || null,
    contract: raw.typeContratLibelle?.trim() || raw.typeContrat || null,
    date: raw.dateCreation ?? null,
    link: raw.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${raw.id}`,
  };
}

/** Recherche des 30 offres les plus récentes à Mayotte (une erreur est levée : rien n'est gardé). */
async function searchOffers(): Promise<JobOffer[]> {
  const keys = credentials();
  if (!keys) return [];
  const access = await getToken(keys.id, keys.secret);
  const url = `${SEARCH_URL}?${new URLSearchParams({ departement: MAYOTTE, sort: "1", range: "0-29" })}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${access}`, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401) token = null;
  // 204 : aucune offre ; 206 : réponse partielle normale (pagination).
  if (!response.ok) throw new Error(`recherche refusée (HTTP ${response.status})`);
  const data = response.status === 204 ? {} : ((await response.json()) as { resultats?: RawOffer[] });
  return (data.resultats ?? []).map(toOffer);
}

/**
 * Offres gardées 30 min dans le cache de données de Next, partagé entre les
 * instances du serveur. Le jeton d'accès change souvent : c'est le résultat
 * qui est gardé, pas la réponse HTTP (dont la clé contiendrait le jeton).
 */
const cachedOffers = unstable_cache(searchOffers, ["france-travail-offres-976"], { revalidate: CACHE_MS / 1000 });

/** Les 30 offres les plus récentes à Mayotte (cache 30 min). */
export async function getMayotteJobs(): Promise<JobsResult> {
  const keys = credentials();
  if (!keys) return { configured: false };
  if (cache && Date.now() - cache.at < CACHE_MS) return { configured: true, offers: cache.offers };
  try {
    const offers = await cachedOffers();
    cache = { at: Date.now(), offers };
    return { configured: true, offers };
  } catch (error) {
    console.error("[emploi] France Travail indisponible", error);
    return { configured: true, offers: cache?.offers ?? [], error: error instanceof Error ? error.message : "erreur" };
  }
}
