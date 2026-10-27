export type KnowledgeEntry = { title: string; content: string; keywords: string[] };

/** Minuscules sans accents, pour comparer « Mamoudzou » et « mamoudzou ». */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function words(text: string): Set<string> {
  return new Set(normalize(text).match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

/**
 * Choisit les fiches à donner au modèle : d'abord celles dont un mot-clé ou un
 * mot du titre apparaît dans le message, puis les autres, jusqu'au budget.
 */
export function selectKnowledge(entries: readonly KnowledgeEntry[], message: string, maxChars: number): KnowledgeEntry[] {
  const messageWords = words(message);
  const normalizedMessage = normalize(message);

  const scored = entries.map((entry, index) => {
    let score = 0;
    for (const keyword of entry.keywords) {
      const k = normalize(keyword).trim();
      if (k && normalizedMessage.includes(k)) score += 3;
    }
    for (const w of words(entry.title)) if (messageWords.has(w)) score += 1;
    return { entry, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const kept: KnowledgeEntry[] = [];
  let total = 0;
  for (const { entry } of scored) {
    const size = entry.title.length + entry.content.length;
    if (total + size > maxChars) continue;
    total += size;
    kept.push(entry);
  }
  return kept;
}
