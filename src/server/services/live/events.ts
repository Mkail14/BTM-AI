import "server-only";
import { unstable_cache } from "next/cache";
import type { JobEvent } from "@/lib/emploi/events";
import { forgetFranceTravailToken, franceTravailKeys, franceTravailToken } from "@/server/services/live/france-travail";

/**
 * Événements emploi à Mayotte (job datings, réunions d'information, ateliers) via l'API
 * « Mes évènements emploi v1 » de France Travail. Seul filtre qui marche (essayé le 2026-11-20) :
 * { departements: ["976"] } ; « departement » au singulier est ignoré. Les heures fiables sont
 * celles des sessions (UTC) : heureDebut est en heure locale de l'agence.
 */
const SEARCH_URL = "https://api.francetravail.io/partenaire/evenements/v1/mee/evenements";
const SCOPE = "api_evenementsv1 evenements";
const CACHE_S = 30 * 60;
const TIMEOUT_MS = 8_000;

type RawEvent = {
  id: number;
  titre?: string;
  type?: string;
  ville?: string;
  dateEvenement?: string;
  modalites?: string[];
  nombrePlaceTotalPresentiel?: number;
  nombreInscritPresentiel?: number;
  libelleOrganisateurPrincipal?: string;
  libelleEtablissement?: string;
  urlDetailEvenement?: string;
  sessions?: { dateHeureDebut?: string; dateHeureFin?: string }[];
};

export const eventsConfigured = () => franceTravailKeys() !== null;

function toEvent(raw: RawEvent): JobEvent | null {
  const session = raw.sessions?.find((s) => s.dateHeureDebut) ?? null;
  const start = session?.dateHeureDebut ?? raw.dateEvenement;
  if (!start || Number.isNaN(Date.parse(start))) return null;
  const remote = Boolean(raw.modalites?.length) && raw.modalites!.every((m) => /distance/i.test(m));
  const total = raw.nombrePlaceTotalPresentiel ?? 0;
  return {
    id: raw.id,
    title: (raw.titre ?? "Événement emploi").replace(/\s+/g, " ").trim(),
    type: raw.type?.trim() || "Événement",
    town: raw.ville?.trim() || "Mayotte",
    start,
    end: session?.dateHeureFin ?? null,
    remote,
    placesLeft: !remote && total > 0 ? Math.max(0, total - (raw.nombreInscritPresentiel ?? 0)) : null,
    organizer: raw.libelleOrganisateurPrincipal?.trim() || raw.libelleEtablissement?.trim() || null,
    link: raw.urlDetailEvenement || `https://mesevenementsemploi.francetravail.fr/mes-evenements-emploi/evenement/${raw.id}`,
  };
}

async function searchEvents(): Promise<JobEvent[]> {
  const access = await franceTravailToken(SCOPE);
  const response = await fetch(`${SEARCH_URL}?size=100`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ departements: ["976"] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401) forgetFranceTravailToken(SCOPE);
  if (!response.ok) throw new Error(`événements refusés (HTTP ${response.status})`);
  const data = (await response.json()) as { content?: RawEvent[] };
  return (data.content ?? [])
    .map(toEvent)
    .filter((e): e is JobEvent => e !== null)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Gardés 30 min dans le cache de données de Next (le résultat, pas la réponse : sa clé contiendrait le jeton). */
const cachedEvents = unstable_cache(searchEvents, ["france-travail-evenements-976"], { revalidate: CACHE_S });

let kept: JobEvent[] | null = null;

/** Prochains événements à Mayotte (pas encore finis), du plus proche au plus lointain. */
export async function getMayotteEvents(): Promise<{ configured: false } | { configured: true; events: JobEvent[]; error?: string }> {
  if (!eventsConfigured()) return { configured: false };
  const upcoming = (list: JobEvent[]) => list.filter((e) => Date.parse(e.end ?? e.start) > Date.now());
  try {
    kept = await cachedEvents();
    return { configured: true, events: upcoming(kept) };
  } catch (error) {
    console.error("[emploi] événements France Travail indisponibles", error);
    return { configured: true, events: upcoming(kept ?? []), error: error instanceof Error ? error.message : "erreur" };
  }
}
