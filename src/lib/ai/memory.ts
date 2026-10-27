export type MemoryFact = { kind: string; content: string };

/** Coupe une valeur à la fin de la proposition (« Mamoudzou et je… » → « Mamoudzou »). */
function clause(value: string, maxChars: number): string {
  const cut = value.split(/[,.;!?\n]|\s+(?:et|mais|depuis|avec|car|donc|parce)\s/i)[0] ?? "";
  return cut.trim().slice(0, maxChars).trim();
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr") + value.slice(1);
}

/**
 * Repère, sans appel au modèle, les informations durables qu'une personne
 * donne sur elle-même (prénom, lieu, travail, âge). Tolère les fautes
 * courantes (« je m'appel Mario », « j habite a Koungou »).
 */
export function extractMemories(message: string): MemoryFact[] {
  const facts: MemoryFact[] = [];
  const text = message.replace(/[’`]/g, "'");

  const name =
    text.match(/\bje\s*m['\s]?\s*app?ell?e?s?\s+([\p{L}][\p{L}'-]{1,29})/iu) ??
    text.match(/\bmon\s+pr[ée]nom\s+(?:c'est|est)\s+([\p{L}][\p{L}'-]{1,29})/iu);
  if (name) facts.push({ kind: "prenom", content: `Prénom : ${capitalize(name[1])}` });

  const place = text.match(/\bj['\s]?\s*(?:habite|vis|reside|réside)\s+(?:à|a|au|aux|en|sur|dans)?\s*([\p{L}][^\n]{1,80})/iu);
  if (place) {
    const value = clause(place[1], 60);
    if (value.length >= 2) facts.push({ kind: "lieu", content: `Habite à : ${capitalize(value)}` });
  }

  const job = text.match(/\bje\s+(?:travaille|bosse)\s+((?:comme|chez|à|a|au|dans|en)\s+[^\n]{2,90})/iu);
  if (job) {
    const value = clause(job[1], 80);
    if (value.length >= 4) facts.push({ kind: "travail", content: `Travail : ${value}` });
  }

  const age = text.match(/\bj['\s]?\s*ai\s+(\d{1,3})\s*ans\b/iu);
  if (age && Number(age[1]) >= 5 && Number(age[1]) <= 120) {
    facts.push({ kind: "age", content: `Âge : ${age[1]} ans` });
  }

  return facts;
}
