/**
 * Identité de Tamilya fixée par GROUPE BTM : ni modifiable depuis l'administration,
 * ni remplaçable par le caractère enregistré dans la base.
 */
export const AWA_NAME = "Tamilya";

/** Date de naissance : 9 juillet 2026 (jour de sa mise en service). C'est son anniversaire. */
export const AWA_BIRTH = { year: 2026, month: 7, day: 9 } as const;
export const AWA_BIRTH_LABEL = "9 juillet 2026";

/** Âge réel de Tamilya à une date donnée (heure de Mayotte), ex. « 3 mois », « 1 an et 2 mois ». */
export function awaAge(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mayotte", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, part) => (part.type === "literal" ? acc : { ...acc, [part.type]: Number(part.value) }), {});
  let months = (parts.year - AWA_BIRTH.year) * 12 + (parts.month - AWA_BIRTH.month);
  if (parts.day < AWA_BIRTH.day) months--;
  if (months < 1) return "moins d'un mois";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} an${years > 1 ? "s" : ""}` : "";
  const m = rest ? `${rest} mois` : "";
  return [y, m].filter(Boolean).join(" et ");
}
