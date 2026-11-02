import "server-only";
import { z } from "zod";

/**
 * Horaires de l'examen du code de la route dans les bureaux La Poste de
 * Mayotte, lus sur la recherche publique de lecode.laposte.fr.
 *
 * Le site appelle une API (api.laposte.fr/silex-vente) avec une clé publique
 * écrite dans sa page. Pour que le service tienne quand La Poste change cette
 * clé ou son adresse, elles sont relues sur la page publique, et relues de
 * nouveau dès que l'API refuse l'accès. Si la lecture échoue malgré tout,
 * l'administrateur est alerté (getCodeExamHealth, vérifiée aussi toutes les
 * 2 h par .github/workflows/surveillance-laposte.yml) et le tableau renvoie
 * vers le site de La Poste.
 */

export const LAPOSTE_SEARCH_URL = "https://www.lecode.laposte.fr/recherche-salle";

/**
 * Horaires relus au plus une fois par minute : les places changent vite, mais
 * le site de La Poste n'est pas sollicité à chaque affichage.
 */
const REFRESH_MS = 60_000;
const ACCESS_MS = 6 * 3_600_000;
const TIMEOUT_MS = 10_000;
const DAYS = 30;
/** Centre de recherche : Mamoudzou (l'API renvoie les bureaux les plus proches, toute l'île). */
const MAYOTTE = { localisation: "Mamoudzou", latitude: "-12.7806", longitude: "45.2279" };

/** `types` : épreuves proposées (« B » code auto, « A » moto, « OC », « OEI » bateau). */
export type CodeExamCenter = { id: string; name: string; city: string; types: string[] };
export type CodeExamSlot = { centerId: string; startsAt: string; places: number };
export type CodeExamData = { centers: CodeExamCenter[]; slots: CodeExamSlot[]; updatedAt: number };

export class CodeExamSourceError extends Error {
  constructor(
    readonly step: "page" | "access" | "api" | "format",
    message: string,
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture des réponses (sans réseau, testée)                                 */
/* -------------------------------------------------------------------------- */

export type LaPosteAccess = { base: string; apiKey: string; partnerId: string };

/** Clé, identifiant partenaire et adresse de l'API, écrits dans la page publique de recherche. */
export function extractAccess(html: string): LaPosteAccess {
  const read = (name: string) => html.match(new RegExp(`${name}:"([^"]+)"`))?.[1]?.replaceAll("\\u002F", "/");
  const [baseApiVente, apiVente, apiKey, partnerId] = ["baseApiVente", "apiVente", "apiKey", "idPartenaire"].map(read);
  if (!baseApiVente || !apiVente || !apiKey || !partnerId) {
    throw new CodeExamSourceError("page", "La page de recherche de La Poste a changé : clé de l'API introuvable.");
  }
  return { base: `${baseApiVente}${apiVente}`, apiKey, partnerId };
}

const salleSchema = z.object({
  id: z.number(),
  nom: z.string(),
  adresse: z.object({ ville: z.string().nullish(), codePostal: z.string().nullish() }),
  listeTypeExamen: z.array(z.string()).nullish(),
});

const sessionSchema = z.object({
  dateDebut: z.string(),
  placesDisponibles: z.number(),
  statut: z.string(),
  isPrivatisee: z.boolean().nullish(),
});

const title = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());

/** « Bureau La Poste - MTSAPERE Mamoudzou » → « Mtsapere Mamoudzou ». */
export function centerName(raw: string) {
  return title(raw.replace(/^\s*bureau\s+la\s+poste\s*-\s*/i, ""));
}

/** Bureaux de Mayotte (codes postaux 976xx), dans l'ordre renvoyé par La Poste. */
export function parseCenters(json: unknown): CodeExamCenter[] {
  const parsed = z.array(salleSchema).safeParse(json);
  if (!parsed.success) throw new CodeExamSourceError("format", "Les bureaux renvoyés par La Poste ont changé de format.");
  return parsed.data
    .filter((s) => s.adresse.codePostal?.trim().startsWith("976"))
    .map((s) => ({
      id: String(s.id),
      name: centerName(s.nom),
      city: title(s.adresse.ville ?? ""),
      types: s.listeTypeExamen ?? [],
    }));
}

/** Sessions ouvertes à venir d'un bureau (complètes comprises : places à 0). */
export function parseSessions(json: unknown, centerId: string, now = Date.now()): CodeExamSlot[] {
  const parsed = z.array(sessionSchema).safeParse(json);
  if (!parsed.success) throw new CodeExamSourceError("format", "Les sessions renvoyées par La Poste ont changé de format.");
  return parsed.data
    .filter((s) => s.statut === "OUVERT" && !s.isPrivatisee && new Date(s.dateDebut).getTime() > now)
    .map((s) => ({ centerId, startsAt: s.dateDebut, places: Math.max(s.placesDisponibles, 0) }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/* -------------------------------------------------------------------------- */
/* Appels au site de La Poste                                                 */
/* -------------------------------------------------------------------------- */

const HEADERS = { "User-Agent": "BTM-AI/1.0 (+https://github.com/Mkail14/BTM-AI)", Accept: "application/json" };

let access: (LaPosteAccess & { at: number }) | null = null;

async function getAccess(force = false): Promise<LaPosteAccess> {
  if (!force && access && Date.now() - access.at < ACCESS_MS) return access;
  const response = await fetch(LAPOSTE_SEARCH_URL, {
    headers: { ...HEADERS, Accept: "text/html" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) throw new CodeExamSourceError("page", "Le site de La Poste ne répond pas.");
  access = { ...extractAccess(await response.text()), at: Date.now() };
  return access;
}

async function callApi(path: string): Promise<unknown> {
  for (const retry of [false, true]) {
    const { base, apiKey, partnerId } = await getAccess(retry);
    const response = await fetch(`${base}${path}`, {
      headers: { ...HEADERS, "X-Okapi-Key": apiKey, "Id-Partenaire": partnerId },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }).catch(() => null);
    if (!response) throw new CodeExamSourceError("api", "L'API de La Poste ne répond pas.");
    // Clé refusée : La Poste l'a peut-être changée, on la relit une fois sur la page.
    if ((response.status === 401 || response.status === 403) && !retry) continue;
    if (response.status === 401 || response.status === 403) {
      throw new CodeExamSourceError("access", "La Poste refuse l'accès à ses horaires, même avec la clé relue sur sa page.");
    }
    if (!response.ok) throw new CodeExamSourceError("api", `L'API de La Poste a répondu ${response.status}.`);
    return response.json();
  }
  throw new CodeExamSourceError("access", "Accès refusé par La Poste.");
}

const mayotteToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

async function fetchCodeExam(): Promise<CodeExamData> {
  const date = mayotteToday();
  const query = new URLSearchParams({ date, ...MAYOTTE, isAccessiblePMR: "false", isSessionsIndividuelles: "false" });
  const centers = parseCenters(await callApi(`/salles/a-proximite?${query}`));
  if (centers.length === 0) throw new CodeExamSourceError("format", "Aucun bureau de Mayotte dans la réponse de La Poste.");
  const sessions = await Promise.all(
    centers.map(async (c) => parseSessions(await callApi(`/sessions?idSalle=${c.id}&date=${date}&nbrJourLimite=${DAYS}`), c.id)),
  );
  return { centers, slots: sessions.flat(), updatedAt: Date.now() };
}

/* -------------------------------------------------------------------------- */
/* Cache et surveillance                                                      */
/* -------------------------------------------------------------------------- */

let last: CodeExamData | null = null;
let lastFailure: { message: string; at: number } | null = null;
let pending: Promise<CodeExamData | null> | null = null;

/**
 * Horaires à afficher : relus au plus une fois par minute ; `fresh` les relit
 * tout de suite (réservation, surveillance). Après un échec : null, jamais
 * d'anciennes places qui ne sont peut-être plus vraies.
 */
export async function loadCodeExam({ fresh = false } = {}): Promise<CodeExamData | null> {
  if (!fresh && last && Date.now() - last.updatedAt < REFRESH_MS) return last;
  pending ??= fetchCodeExam()
    .then((data) => {
      last = data;
      lastFailure = null;
      return data;
    })
    .catch((error: unknown) => {
      const message = error instanceof CodeExamSourceError ? error.message : "Lecture des horaires de La Poste impossible.";
      lastFailure = { message, at: Date.now() };
      console.error("[code-exam] Horaires de La Poste illisibles", error);
      last = null;
      return null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/**
 * La lecture des horaires fonctionne-t-elle ? Pour l'administration, et pour la
 * surveillance toutes les 2 h (`fresh` : relit le site de La Poste maintenant).
 */
export async function getCodeExamHealth({
  fresh = false,
  waitMs,
}: { fresh?: boolean; waitMs?: number } = {}): Promise<{ ok: true } | { ok: false; message: string }> {
  const loading = loadCodeExam({ fresh });
  if (waitMs === undefined) await loading;
  else {
    // Tableau de bord : La Poste peut mettre 10 s à répondre ; on n'attend pas.
    // Lecture pas encore finie : pas d'alerte cette fois, elle sera prête au prochain affichage.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finished = await Promise.race([
      loading.then(() => true),
      new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), waitMs))),
    ]);
    clearTimeout(timer);
    if (!finished) return { ok: true };
  }
  return lastFailure ? { ok: false, message: lastFailure.message } : { ok: true };
}
