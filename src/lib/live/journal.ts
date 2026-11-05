import "server-only";
import { getMayotteNews, type NewsItem } from "./news";
import { getMayotteWeather } from "./weather";

/**
 * Matière du journal parlé de Tamilya : la météo du jour et les articles du
 * jour des journaux de Mayotte, avec leur contenu (texte complet quand le
 * journal le publie), pour qu'elle puisse raconter chaque sujet en détail.
 */

const MAX_ARTICLES = 8;
const DETAIL_CHARS = 900;

const dayInMayotte = new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" });
const timeInMayotte = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/** Articles du jour (heure de Mayotte) ; à défaut, ceux des 2 derniers jours. Un même sujet n'est pris qu'une fois. */
export function pickJournalArticles(items: readonly NewsItem[], now = new Date()): NewsItem[] {
  const today = dayInMayotte.format(now);
  const recent = (days: number) =>
    items.filter((item) => item.date && now.getTime() - new Date(item.date).getTime() < days * 86_400_000);
  const ofToday = items.filter((item) => item.date && dayInMayotte.format(new Date(item.date)) === today);
  const chosen = ofToday.length >= 3 ? ofToday : recent(2);
  const seen = new Set<string>();
  return chosen
    .filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, " ").split(" ").slice(0, 5).join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ARTICLES);
}

export async function buildJournal(): Promise<string | null> {
  const [items, weather] = await Promise.all([getMayotteNews().catch(() => []), getMayotteWeather().catch(() => null)]);
  const articles = pickJournalArticles(items);
  if (!articles.length && !weather) return null;
  const lines = articles.map((item, i) => {
    const when = item.date ? timeInMayotte.format(new Date(item.date)) : "";
    const detail = (item.body && item.body.length > item.summary.length ? item.body : item.summary).slice(0, DETAIL_CHARS);
    return `${i + 1}. ${item.title} (${item.source}${when ? `, ${when}` : ""})\n${detail}`;
  });
  return [weather, articles.length ? `Articles du jour des journaux de Mayotte :\n${lines.join("\n\n")}` : null].filter(Boolean).join("\n\n");
}
