/** Mêmes bornes que les contraintes de la table awa_knowledge. */
export const KNOWLEDGE_LIMITS = { title: 120, content: 4000, keyword: 60, keywords: 30 } as const;

export type KnowledgeRow = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  isActive: boolean;
};
