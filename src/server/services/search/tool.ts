import "server-only";
import { searchBlock, searchWeb } from "@/server/services/search/web";

/**
 * Outil « chercher_sur_internet », le même pour toutes les API (Gemini sans recherche
 * Google, NVIDIA et autres API compatibles OpenAI) : Tamilya décide de chercher,
 * le serveur cherche lui-même (web.ts) et lui rend les résultats.
 */
export const SEARCH_TOOL_NAME = "chercher_sur_internet";

export const SEARCH_TOOL_DESCRIPTION =
  "Cherche sur internet (dans Wikipédia) et renvoie les résultats avec le texte des meilleurs articles. " +
  "À utiliser quand tu n'as pas l'information ou qu'elle a pu changer (fait récent, personne, chiffre, date, horaire, prix, loi, actualité). " +
  "Pas pour une simple conversation ni pour ce que tu sais déjà.";

export const SEARCH_TOOL_PARAMETERS = {
  type: "object",
  properties: { requete: { type: "string", description: "La recherche en quelques mots, comme dans un moteur de recherche, en français de préférence." } },
  required: ["requete"],
};

/** Ajouté aux consignes quand l'outil est proposé. */
export const SEARCH_TOOL_RULE =
  `Important : pour chercher sur internet, tu as l'outil ${SEARCH_TOOL_NAME}. Dès que tu ne connais pas la réponse, ou qu'elle a pu changer ` +
  "(personne en poste, résultat, prix, horaire, date, actualité, loi), cherche d'abord avec cet outil au lieu de dire que tu ne sais pas " +
  "ou que tu n'as pas accès à internet. Pour une conversation ou ce que tu sais déjà, réponds directement.";

/** Au plus deux tours de recherche, puis Tamilya répond avec ce qu'elle a. */
export const MAX_SEARCH_ROUNDS = 2;
const MAX_CALLS_PER_ROUND = 2;

/** Requête demandée par un appel de l'outil (vide si ce n'est pas notre outil). */
export function searchQuery(name: string, args: unknown): string {
  if (name !== SEARCH_TOOL_NAME || !args || typeof args !== "object") return "";
  return String((args as { requete?: unknown }).requete ?? "").trim().slice(0, 200);
}

/**
 * Lance les recherches d'un tour (deux au plus) : le texte à rendre à chaque appel,
 * et les pages à citer sous la réponse.
 */
export async function runSearches(queries: string[], signal: AbortSignal, who: string) {
  const started = Date.now();
  const found = await Promise.all(
    queries.map((query, i) => (query && i < MAX_CALLS_PER_ROUND ? searchWeb(query, signal).catch(() => null) : Promise.resolve(null))),
  );
  console.info(
    `[recherche] ${who} : ${queries.filter(Boolean).map((q) => `« ${q} »`).join(", ")} → ${found.map((f) => f?.results.length ?? 0).join("+")} résultat(s), ${Date.now() - started} ms`,
  );
  const sources: { url: string; title: string }[] = [];
  for (const result of found) for (const page of result?.pages.length ? result.pages : (result?.results.slice(0, 3) ?? [])) sources.push({ url: page.url, title: page.title });
  const answers = found.map((result) =>
    result ? searchBlock(result) : "Recherche impossible pour l'instant. Réponds avec ce que tu sais, en le disant.",
  );
  return { answers, sources };
}

/** Requêtes annoncées à l'écran (« Je cherche sur internet… »). */
export const shownQueries = (queries: string[]) => queries.slice(0, MAX_CALLS_PER_ROUND).filter(Boolean);
