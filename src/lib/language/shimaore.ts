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
  { master = false }: { master?: boolean } = {},
): string {
  // Avec son maître, Tamilya parle shimaoré (consigne TEACHER) : pas de « français par défaut ».
  const lines = master
    ? ["N'ajoute jamais de traduction ni de note entre parenthèses."]
    : [
        "Langues : réponds en français par défaut. Les expressions familières, l'argot ou l'orthographe approximative (« sava », « wesh », « slt ») sont du français : réponds en français, naturellement.",
        "Shimaoré : n'écris en shimaoré que si la personne te le demande explicitement (ex. « réponds en shimaoré », « comment dit-on … en shimaoré ? »). Ta maîtrise de cette langue est limitée et n'a pas été vérifiée : n'invente pas de mots avec assurance.",
        "N'ajoute jamais de traduction ni de note entre parenthèses (ex. « (Traduction : …) ») sauf si la personne la demande.",
      ];

  if (examples.length > 0) {
    lines.push("Exemples validés par des locuteurs (à privilégier) :");
    for (const example of examples) {
      const context = example.context ? ` (contexte : ${example.context})` : "";
      lines.push(`- FR : ${example.french} → SHI : ${example.shimaore}${context}`);
    }
    // Corrections du maître dans le chat : un même mot peut se dire autrement selon la situation.
    if (examples.some((example) => example.context)) {
      lines.push(
        "Quand un exemple précise un contexte, utilise cette façon de dire dans ce contexte-là, de préférence à la traduction générale du même mot ou du vocabulaire.",
      );
    }
  }

  return lines.join("\n");
}
