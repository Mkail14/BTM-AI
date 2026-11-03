import { z } from "zod";
import { MAYOTTE_COMMUNES } from "@/lib/code-exam/candidate";

/** Règles d'un avis, partagées entre le formulaire et le serveur (seul juge). */
export const REVIEW_COMMENT_MAX = 300;

/** Avis tel qu'il s'affiche sur la page d'accueil. */
export type PublicReview = {
  id: string;
  name: string;
  commune: string | null;
  rating: number;
  comment: string | null;
  /** Date ISO de publication. */
  date: string;
  edited: boolean;
};

/** L'avis du compte connecté, pour pré-remplir le formulaire. */
export type MyReview = { rating: number; comment: string; commune: string | null };

// Pas de lien dans un avis : c'est la porte d'entrée de la publicité et du spam.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|yt|net|org|io|be|re)\b)/i;

export const reviewSchema = z.strictObject({
  rating: z.number().int().min(1, "Choisis une note.").max(5),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, `${REVIEW_COMMENT_MAX} caractères maximum.`)
    .refine((v) => !LINK.test(v), "Pas de lien dans un avis."),
  commune: z.enum(MAYOTTE_COMMUNES).nullable(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

/** « Fatima Mohamed Ali » → « Fatima A. » ; jamais l'e-mail. */
export function publicName(displayName: string | null | undefined): string {
  const words = (displayName ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return "Membre de BTM IA";
  const first = words[0].slice(0, 30);
  const last = words.length > 1 ? ` ${words.at(-1)!.charAt(0).toLocaleUpperCase("fr")}.` : "";
  return `${first.charAt(0).toLocaleUpperCase("fr")}${first.slice(1)}${last}`;
}
