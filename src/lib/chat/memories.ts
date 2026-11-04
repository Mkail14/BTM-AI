import { isMemoryAllowed, type MemoryFact } from "@/lib/ai/memory";

/** Souvenirs donnés au modèle, au plus (comme getMemories). */
const MAX_MEMORIES = 40;

/**
 * Mémoire pour la réponse, sans attendre l'enregistrement : les faits repérés
 * dans ce message passent en premier et remplacent ceux de même sorte (une
 * valeur par sorte, comme l'enregistrement en base), puis viennent les souvenirs
 * déjà lus. Même résultat que « enregistrer puis relire », un aller-retour en moins.
 */
export function mergeMemories(fresh: readonly MemoryFact[], stored: readonly MemoryFact[]): MemoryFact[] {
  const kept = fresh.filter((fact) => isMemoryAllowed(fact.content));
  const kinds = new Set(fresh.map((fact) => fact.kind));
  return [...kept, ...stored.filter((fact) => !kinds.has(fact.kind))].slice(0, MAX_MEMORIES);
}
