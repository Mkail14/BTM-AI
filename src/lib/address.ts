import { z } from "zod";
import { MAYOTTE_COMMUNES } from "@/lib/code-exam/candidate";

/**
 * Adresse d'un compte : demandée à l'inscription, puis reconfirmée à chaque
 * livraison (elle peut être fausse ou avoir changé). La position GPS est
 * facultative : elle aide le livreur quand l'adresse écrite ne suffit pas.
 */

export type GeoPoint = { lat: number; lng: number; accuracy: number };
export type Address = { commune: string; line: string; geo: GeoPoint | null };

/** Rectangle qui contient Grande-Terre et Petite-Terre (et un peu de lagon). */
const MAYOTTE_BOUNDS = { south: -13.05, north: -12.6, west: 44.95, east: 45.35 };

export function isInMayotte(lat: number, lng: number): boolean {
  return lat >= MAYOTTE_BOUNDS.south && lat <= MAYOTTE_BOUNDS.north && lng >= MAYOTTE_BOUNDS.west && lng <= MAYOTTE_BOUNDS.east;
}

/** Au-delà, la position ne désigne plus une maison (wifi ou antenne seule). */
export const MAX_GPS_ACCURACY_M = 500;

export const geoSchema = z
  .object({
    lat: z.number().finite(),
    lng: z.number().finite(),
    accuracy: z.number().finite().nonnegative(),
  })
  .refine((g) => isInMayotte(g.lat, g.lng), "Ta position n'est pas à Mayotte : écris ton adresse.")
  .refine((g) => g.accuracy <= MAX_GPS_ACCURACY_M, "Position trop imprécise : sors un peu ou écris ton adresse.")
  // Six décimales (≈ 10 cm) suffisent : inutile de garder plus.
  .transform((g) => ({
    lat: Math.round(g.lat * 1e6) / 1e6,
    lng: Math.round(g.lng * 1e6) / 1e6,
    accuracy: Math.round(g.accuracy),
  }));

export const addressSchema = z.object({
  commune: z.enum(MAYOTTE_COMMUNES, { error: "Choisis ta commune." }),
  line: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(5, "Indique ton adresse : rue, quartier, repère (près de la mosquée…).")
        .max(200, "Adresse trop longue (200 caractères maximum)."),
    ),
  geo: geoSchema.nullable(),
});

/** Erreurs de la commune et de l'adresse écrite, pour les afficher sous chaque champ. */
export function addressFieldErrors(draft: { commune: string; line: string }): { commune: string | null; line: string | null } {
  const result = addressSchema.safeParse({ commune: draft.commune, line: draft.line, geo: null });
  const errors = { commune: null as string | null, line: null as string | null };
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if ((field === "commune" || field === "line") && !errors[field]) errors[field] = issue.message;
    }
  }
  return errors;
}

/** Lien de carte pour le livreur (OpenStreetMap, sans compte ni clé). */
export function mapLink(geo: GeoPoint): string {
  return `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=18/${geo.lat}/${geo.lng}`;
}

/** Message d'erreur de la position GPS du navigateur, en clair. */
export function geolocationErrorMessage(code: number): string {
  if (code === 1) return "Tu as refusé la localisation. Autorise-la dans ton navigateur, ou écris ton adresse.";
  if (code === 3) return "La localisation a pris trop de temps. Réessaie, ou écris ton adresse.";
  return "Position introuvable pour le moment. Écris ton adresse.";
}
