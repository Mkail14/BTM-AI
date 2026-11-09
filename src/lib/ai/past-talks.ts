/**
 * Anciennes discussions : de quoi Tamilya se souvient d'une conversation à l'autre.
 * - talks : les dernières conversations (sujet, date, ce que la personne disait) ;
 * - openings : ses dernières façons de commencer une réponse, pour ne pas les redire
 *   (sans ça, chaque nouvelle conversation repartait sur le même « bonjour »).
 */
export type PastTalk = { title: string; updatedAt: string; said: string[] };
export type PastTalks = { talks: PastTalk[]; openings: string[] };

type ConversationRow = { id: string; title: string; updated_at: string };
type MessageRow = { conversation_id: string; role: string; content: string; created_at: string };

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** Bout de texte court, coupé sur un mot. */
export function excerpt(value: string, max: number): string {
  const line = oneLine(value);
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max / 2 ? cut.slice(0, space) : cut}…`;
}

/** Début d'une réponse : sa première phrase, sans les blocs techniques. */
export function openingOf(reply: string): string | null {
  const text = oneLine(reply.replace(/```[\s\S]*?```/g, " ").replace(/<<[^>]*>>/g, " "));
  if (!text) return null;
  const first = text.match(/^.+?[.!?…](\s|$)/)?.[0] ?? text;
  return excerpt(first, 70);
}

const SAID_PER_TALK = 2;
const MAX_OPENINGS = 8;

/**
 * Ajoute en tête les débuts des réponses de la conversation en cours (les plus récentes en dernier) :
 * ce sont celles qu'elle risque le plus de redire.
 */
export function withRecentReplies(past: PastTalks, recentReplies: readonly string[]): PastTalks {
  const openings: string[] = [];
  for (const reply of [...recentReplies].reverse()) {
    const opening = openingOf(reply);
    if (opening && !openings.includes(opening)) openings.push(opening);
  }
  for (const opening of past.openings) if (!openings.includes(opening)) openings.push(opening);
  return { talks: past.talks, openings: openings.slice(0, MAX_OPENINGS) };
}

/** Met en forme ce que la base a rendu. Les messages arrivent du plus récent au plus ancien. */
export function buildPastTalks(conversations: readonly ConversationRow[], messages: readonly MessageRow[]): PastTalks {
  const said = new Map<string, string[]>();
  const openings: string[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const list = said.get(message.conversation_id) ?? [];
      if (list.length < SAID_PER_TALK) said.set(message.conversation_id, [...list, excerpt(message.content, 140)]);
    } else if (message.role === "assistant") {
      const opening = openingOf(message.content);
      if (opening && !openings.includes(opening)) openings.push(opening);
    }
  }
  return {
    talks: conversations
      .map((c) => ({ title: excerpt(c.title, 80), updatedAt: c.updated_at, said: (said.get(c.id) ?? []).reverse() }))
      .filter((talk) => talk.said.length > 0),
    openings: openings.slice(0, MAX_OPENINGS),
  };
}
