import { z } from "zod";
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/auth/disposable-email";

/**
 * Informations du candidat demandées avant de réserver une place à l'examen
 * du code, vérifiées à la saisie (fenêtre de réservation) et de nouveau par le
 * serveur. On ne peut pas prouver qu'elles sont vraies : on refuse ce qui ne
 * peut pas l'être (âge, téléphone, NEPH, e-mail mal formés).
 */

/** Épreuves proposées par La Poste (listeTypeExamen de l'API). */
export const EXAM_TYPES = {
  B: "Code auto (voiture)",
  A: "Code moto",
  OC: "Permis bateau côtier",
  OEI: "Permis bateau eaux intérieures",
} as const;
export type ExamType = keyof typeof EXAM_TYPES;
export const EXAM_TYPE_IDS = Object.keys(EXAM_TYPES) as [ExamType, ...ExamType[]];

/** Les 17 communes de Mayotte, proposées dans le champ « Ville de résidence ». */
export const MAYOTTE_COMMUNES = [
  "Acoua",
  "Bandraboua",
  "Bandrélé",
  "Bouéni",
  "Chiconi",
  "Chirongui",
  "Dembéni",
  "Dzaoudzi",
  "Kani-Kéli",
  "Koungou",
  "Mamoudzou",
  "Mtsamboro",
  "M'Tsangamouji",
  "Ouangani",
  "Pamandzi",
  "Sada",
  "Tsingoni",
] as const;

/** Âge minimal pour passer le code (15 ans, conduite accompagnée). */
export const MIN_AGE = 15;

/** Numéros bidons tapés pour passer le formulaire (« 06 12 34 56 78 », « 06 00 00 00 00 »). */
const FAKE_PHONE_ENDINGS = new Set(["12345678", "23456789", "87654321", "98765432"]);

/**
 * « +262 639 12 34 56 », « 0639.12.34.56 » → « 0639123456 » ; null si ce n'est
 * pas un numéro français joignable. Refusés : les 08 (numéros spéciaux ou
 * surtaxés), les indicatifs étrangers (+269 est celui des Comores, pas de
 * Mayotte : là-bas, 0269 est un fixe mahorais, +262 269 en international) et
 * les numéros visiblement inventés.
 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s.()/-]/g, "").replace(/^(\+|00)(262|33)/, "0");
  if (!/^0[1-79]\d{8}$/.test(digits)) return null;
  const ending = digits.slice(2);
  if (/^(\d)\1{7}$/.test(ending) || FAKE_PHONE_ENDINGS.has(ending)) return null;
  return digits;
}

/** « 0639123456 » → « 06 •• •• •• 56 » : affiché aux administrateurs et dans les récapitulatifs. */
export function maskPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 2)} •• •• •• ${phone.slice(8)}` : "••";
}

/** NEPH : 12 chiffres, espaces permis à la saisie. */
export const normalizeNeph = (value: string) => value.replace(/\s/g, "");

function age(birthDate: string, now = new Date()) {
  const [y, m, d] = birthDate.split("-").map(Number);
  let years = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) years--;
  return years;
}

const NAME = /^[\p{L}][\p{L}' -]*$/u;
const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Indique ton ${label}.`)
    .max(60, `${label[0].toUpperCase()}${label.slice(1)} trop long.`)
    .regex(NAME, `Ton ${label} ne doit contenir que des lettres.`);

export const candidateFields = {
  civility: z.enum(["Mme", "M."], { error: "Choisis Madame ou Monsieur." }),
  lastName: name("nom"),
  firstName: name("prénom"),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indique ta date de naissance.")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Date invalide.")
    .refine((v) => age(v) >= MIN_AGE, `Il faut avoir au moins ${MIN_AGE} ans pour passer le code.`)
    .refine((v) => age(v) <= 100, "Vérifie l'année de naissance."),
  city: z.string().trim().min(2, "Indique ta ville de résidence.").max(60, "Nom de ville trop long."),
  phone: z
    .string()
    .refine((v) => normalizePhone(v) !== null, "Numéro invalide : 10 chiffres, par exemple 0639 12 34 56.")
    .transform((v) => normalizePhone(v)!),
  email: z
    .email("Adresse e-mail invalide.")
    .trim()
    .max(200)
    .refine((v) => !isDisposableEmail(v), DISPOSABLE_EMAIL_MESSAGE),
};

export type CandidateField = keyof typeof candidateFields;
export const CANDIDATE_FIELDS = Object.keys(candidateFields) as CandidateField[];

export const nephField = z
  .string()
  .transform(normalizeNeph)
  .refine((v) => /^\d{12}$/.test(v), "Le NEPH compte 12 chiffres.");

/** Demande complète envoyée au serveur. */
export const requestSchema = z.object({
  ...candidateFields,
  centerId: z.string().max(20),
  startsAt: z.string().max(40),
  examType: z.enum(EXAM_TYPE_IDS),
  neph: nephField,
  snu: z.boolean(),
});
export type CodeExamRequest = z.input<typeof requestSchema>;

/** Message d'erreur d'un champ, ou null s'il est valide. */
export function fieldError(field: CandidateField | "neph", value: string): string | null {
  const schema = field === "neph" ? nephField : candidateFields[field];
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Valeur invalide.");
}
