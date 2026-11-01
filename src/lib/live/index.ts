import "server-only";
import { getMayotteJobs } from "./jobs";
import { liveIntent } from "./intent";
import { getMayotteNews } from "./news";

const MAX_WAIT_MS = 3_500;
const NEWS_IN_PROMPT = 8;
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

async function newsBlock(): Promise<string | null> {
  const items = await getMayotteNews();
  if (!items.length) return null;
  return [
    "Derniers articles des journaux de Mayotte :",
    ...items.slice(0, NEWS_IN_PROMPT).map((n) => `- ${when(n.date)}, ${n.source} : ${n.title}. ${n.summary} (${n.link})`),
  ].join("\n");
}

/**
 * Informations en direct pour le message : offres d'emploi et/ou actualité,
 * seulement si la question en parle. Ne retarde jamais la réponse de plus de
 * quelques secondes : une source trop lente est simplement ignorée.
 */
export async function liveContextFor(message: string): Promise<string | null> {
  const intent = liveIntent(message);
  const tasks = [intent.jobs ? jobsBlock() : null, intent.news ? newsBlock() : null].filter(
    (task): task is Promise<string | null> => task !== null,
  );
  if (!tasks.length) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), MAX_WAIT_MS));
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
