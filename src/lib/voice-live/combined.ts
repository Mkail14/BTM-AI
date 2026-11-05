/**
 * Tableau combiné : plusieurs services dans un seul tableau, créé par Tamilya
 * sur demande (« un tacos et deux tickets de barge »). Le bloc
 * ```tableau-combine``` contient la liste des parties en JSON ; chaque partie
 * est le contenu du bloc habituel du service (le même qu'à l'écrit).
 */

export const COMBINED_BLOCK = "tableau-combine";
export const COMBINED_KINDS = ["commande-repas", "ticket-barge", "creneaux-code", "devis-btm"] as const;
export type CombinedKind = (typeof COMBINED_KINDS)[number];
export type CombinedPart = { kind: CombinedKind; spec: string };

const MAX_PARTS = 4;

/** Lecture prudente : le bloc vient d'un message, il peut être abîmé ou modifié. */
export function parseCombined(text: string): CombinedPart[] {
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .flatMap((part) => {
        const { kind, spec } = (part ?? {}) as { kind?: unknown; spec?: unknown };
        return COMBINED_KINDS.includes(kind as CombinedKind) && typeof spec === "string" ? [{ kind: kind as CombinedKind, spec: spec.slice(0, 400) }] : [];
      })
      .slice(0, MAX_PARTS);
  } catch {
    return [];
  }
}

/** Le contenu d'un bloc ```service ...``` déjà construit (null s'il n'en contient pas). */
export function blockContent(block: string): CombinedPart | null {
  const found = block.match(/```([\w-]+)\n([\s\S]*?)\n?```/);
  if (!found || !COMBINED_KINDS.includes(found[1] as CombinedKind)) return null;
  return { kind: found[1] as CombinedKind, spec: found[2].trim() };
}

export const combinedBlock = (parts: CombinedPart[]) => `\`\`\`${COMBINED_BLOCK}\n${JSON.stringify(parts.slice(0, MAX_PARTS))}\n\`\`\``;
