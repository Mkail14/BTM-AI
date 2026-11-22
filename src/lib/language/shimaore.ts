import type { ValidatedExample } from "./types";

/**
 * Exemples shimaoré ↔ français validés. Volontairement vide : aucun exemple
 * n'a encore été vérifié par un locuteur de référence. N'ajoutez ici que des
 * contenus relus et validés.
 *
 * Évolutions prévues : chargement depuis une table dédiée, glossaire,
 * retours de correction des utilisateurs soumis à validation.
 */
export const VALIDATED_SHIMAORE_EXAMPLES: readonly ValidatedExample[] = [];

/** Consignes linguistiques injectées dans le message système. */
export function buildLanguageGuidance(
  examples: readonly ValidatedExample[] = VALIDATED_SHIMAORE_EXAMPLES,
  { master = false, teaches = false }: { master?: boolean; /** Administrateur : ce qu'il enseigne va au dictionnaire. */ teaches?: boolean } = {},
): string {
  // Avec son maître, Tamilya parle shimaoré (consigne TEACHER) : pas de « français par défaut ».
  const lines = master
    ? ["N'ajoute jamais de traduction ni de note entre parenthèses."]
    : [
        "Langues : réponds en français par défaut. Les expressions familières, l'argot ou l'orthographe approximative (« sava », « wesh », « slt ») sont du français : réponds en français, naturellement.",
        "Shimaoré : n'écris en shimaoré que si la personne te le demande explicitement (ex. « réponds en shimaoré », « comment dit-on … en shimaoré ? »). Ta maîtrise de cette langue est limitée et n'a pas été vérifiée : n'invente pas de mots avec assurance.",
        "« Comment on dit … » : donne seulement ce que le vocabulaire et les exemples validés permettent. S'il te manque des mots, dis franchement que tu ne sais pas encore le dire et demande-lui s'il le sait : n'assemble pas une phrase avec des mots devinés, ne donne pas une phrase d'un autre sens (« je te déteste » pour « je n'aime pas les hommes »), et ne découpe une phrase mot à mot que si chaque mot est dans le vocabulaire.",
        "Quand la personne te donne la bonne phrase en shimaoré, c'est la traduction de SA demande d'avant, avec le même sens : redis-la avec ce sens, sans la réinterpréter ni la découper. Ensuite, dans la conversation, c'est sa phrase que tu donnes, plus jamais ta version d'avant.",
        // Seuls les administrateurs font entrer un mot au dictionnaire (learnWordsFromMessage).
        // Avec les autres, la consigne NOT_LEARNED (system-prompt.ts) le leur dit, en fin de prompt.
        ...(teaches ? ["Elle t'apprend le shimaoré : dis en quelques mots que tu retiens sa phrase."] : []),
        "N'ajoute jamais de traduction ni de note entre parenthèses (ex. « (Traduction : …) ») sauf si la personne la demande.",
      ];

  if (examples.length > 0) {
    // Le modèle recopiait une ligne entière, étiquette comprise (« … (contexte : .) », 2026-11-22) :
    // c'est un dictionnaire, pas des réponses ; un contexte vide de sens (« . », « - ») n'est pas montré.
    lines.push(
      "Phrases validées par des locuteurs (à privilégier quand elles servent ta réponse ; c'est un dictionnaire, pas des réponses toutes faites : ne récite jamais une phrase qui ne répond pas à ce qu'on te dit) :",
    );
    for (const example of examples) {
      const context = usefulContext(example.context);
      lines.push(`- « ${example.french} » se dit « ${example.shimaore} »${context ? `, dans la situation « ${context} »` : ""}`);
    }
    // Corrections du maître dans le chat : un même mot peut se dire autrement selon la situation.
    if (examples.some((example) => usefulContext(example.context))) {
      lines.push(
        "Quand une phrase précise une situation, utilise cette façon de dire dans cette situation-là, de préférence à la traduction générale du même mot ou du vocabulaire.",
      );
    }
  }

  return lines.join("\n");
}

/** Situation d'une correction, seulement si elle veut dire quelque chose (au moins deux lettres). */
function usefulContext(context?: string | null): string | null {
  const text = context?.trim();
  return text && (text.match(/\p{L}/gu)?.length ?? 0) >= 2 ? text : null;
}
