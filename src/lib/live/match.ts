import { normalize } from "./intent";
import type { NewsItem } from "./news";

/** Mots trop courants pour relier un message à un article. */
const COMMON = new Set(
  "mayotte mahorais mahoraise mahoraises avec dans pour mais plus tout tous toute toutes comme comment pourquoi quand quel quelle quels quelles quoi cette cela celui celle sont etait etre avoir fait faire peut veux voudrais savoir parle parler dire dis moi nous vous elle elles ils leur leurs aussi encore tres bien merci bonjour salut tamilya chose choses depuis apres avant entre sous chez alors donc ainsi votre notre".split(" "),
);

const keywords = (text: string) => new Set((normalize(text).match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((w) => !COMMON.has(w)));

/**
 * Articles qui parlent de ce que dit le message (« la grève des taxis »,
 * « l'eau à Mamoudzou »…) : un mot du message dans le titre compte double,
 * dans le résumé simple. Il en faut au moins 2 pour garder l'article.
 */
export function matchNews(items: readonly NewsItem[], message: string, max: number): NewsItem[] {
  const words = keywords(message);
  if (!words.size) return [];
  return items
    .map((item, index) => {
      const title = keywords(item.title);
      const summary = keywords(item.summary);
      let score = 0;
      for (const w of words) score += title.has(w) ? 2 : summary.has(w) ? 1 : 0;
      return { item, score, index };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .map((s) => s.item);
}
