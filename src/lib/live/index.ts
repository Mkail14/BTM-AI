import "server-only";
import { getMayotteJobs } from "./jobs";
import { liveIntent } from "./intent";
import { matchNews } from "./match";
import { getMayotteNews, type NewsItem } from "./news";
import { communesBlock } from "./communes";
import { servicesAsked, servicesBlock } from "./services";
import { getMayotteWeather } from "./weather";
import { cyclonesText } from "@/lib/cyclone/gdacs";
import { cycloneZoneFor } from "@/lib/cyclone/intent";

const MAX_WAIT_MS = 3_500;
/** Question sur l'actu : on attend les journaux plus longtemps (ils sont lents). */
const NEWS_WAIT_MS = 8_500;
const NEWS_IN_PROMPT = 12;
const MATCHED_NEWS = 5;
const JOBS_IN_PROMPT = 12;

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Indian/Mayotte" });
const when = (iso: string | null) => (iso ? day.format(new Date(iso)) : "date inconnue");

async function jobsBlock(): Promise<string | null> {
  const result = await getMayotteJobs();
  if (!result.configured) return null;
  if (!result.offers.length) return "Offres d'emploi à Mayotte (France Travail) : aucune offre récupérée pour l'instant.";
  return [
    `Offres d'emploi à Mayotte, publiées sur France Travail (${result.offers.length} plus récentes, en voici ${Math.min(JOBS_IN_PROMPT, result.offers.length)}) :`,
    ...result.offers.slice(0, JOBS_IN_PROMPT).map(
      (o) => `- ${o.title}${o.company ? ` — ${o.company}` : ""}${o.place ? `, ${o.place}` : ""}${o.contract ? ` (${o.contract})` : ""}, le ${when(o.date)} : ${o.link}`,
    ),
    "Pour en voir plus : https://candidat.francetravail.fr/offres/recherche?lieux=976D",
  ].join("\n");
}

const newsLine = (n: NewsItem) => `- ${when(n.date)}, ${n.source} : ${n.title}. ${n.summary} (${n.link})`;

/**
 * Question sur l'actualité : les derniers articles, plus ceux qui parlent du sujet.
 * Autre message : seulement les articles qui touchent à ce qu'il dit (sinon rien).
 */
async function newsBlock(message: string, asked: boolean): Promise<string | null> {
  const items = await getMayotteNews();
  if (!items.length) return null;
  const matched = matchNews(items, message, MATCHED_NEWS);
  if (!asked && !matched.length) return null;
  const chosen = asked ? [...new Set([...matched, ...items.slice(0, NEWS_IN_PROMPT)])] : matched;
  return [
    asked ? "Derniers articles des journaux de Mayotte :" : "Articles récents des journaux de Mayotte sur ce sujet :",
    ...chosen.map(newsLine),
  ].join("\n");
}

/**
 * Informations en direct pour le message : offres d'emploi si la question en
 * parle ; actualité si elle en parle ou si un article touche à son sujet. Ne retarde jamais la réponse de plus de
 * quelques secondes : une source trop lente est simplement ignorée.
 */
export async function liveContextFor(message: string, { maxWaitMs }: { maxWaitMs?: number } = {}): Promise<string | null> {
  const intent = liveIntent(message);
  const tasks = [
    intent.jobs ? jobsBlock() : null,
    newsBlock(message, intent.news),
    intent.weather ? getMayotteWeather() : null,
    // « Les autres cyclones », « dans le monde » : aussi ceux des autres océans.
    intent.cyclones ? cyclonesText(cycloneZoneFor(message)) : null,
    intent.communes ? communesBlock() : null,
    servicesAsked(message) ? servicesBlock(message) : null,
  ].filter(
    (task): task is Promise<string | null> => task !== null,
  );
  if (!tasks.length) return null;
  // À l'oral, on ne fait pas attendre la voix : ce qui n'est pas encore lu est laissé de côté.
  const wait = Math.min(intent.news ? NEWS_WAIT_MS : MAX_WAIT_MS, maxWaitMs ?? Infinity);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), wait));
  const blocks = await Promise.all(
    tasks.map((task) =>
      Promise.race([task, timeout]).catch((error: unknown) => {
        console.error("[direct] Source indisponible", error);
        return null;
      }),
    ),
  );
  const text = blocks.filter(Boolean).join("\n\n");
  return text || null;
}
