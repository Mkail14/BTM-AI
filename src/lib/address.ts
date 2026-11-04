import { z } from "zod";
import { isInMayotte, MAX_GPS_ACCURACY_M, MAYOTTE_COMMUNES, type GeoPoint } from "@/lib/address-fields";

/**
 * Adresse d'un compte : demandée à l'inscription, puis reconfirmée à chaque
 * livraison (elle peut être fausse ou avoir changé). La position GPS est
 * facultative : elle aide le livreur quand l'adresse écrite ne suffit pas.
 */

// Constantes et vérifications simples, sans zod (lib/address-fields.ts, utilisable dans le navigateur).
export { geolocationErrorMessage, isInMayotte, MAX_GPS_ACCURACY_M, type GeoPoint } from "@/lib/address-fields";
export type Address = { commune: string; line: string; geo: GeoPoint | null };

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

/**
 * Carnet d'adresses : en plus de la maison (adresse du compte), le travail,
 * les amis, la famille… Proposées à chaque livraison.
 */
export const SAVED_ADDRESS_KINDS = [
  { id: "travail", label: "Travail", emoji: "💼" },
  { id: "ami", label: "Ami", emoji: "🤝" },
  { id: "famille", label: "Famille", emoji: "👨‍👩‍👧" },
  { id: "autre", label: "Autre", emoji: "📌" },
] as const;
export type SavedAddressKind = (typeof SAVED_ADDRESS_KINDS)[number]["id"];
export const MAX_SAVED_ADDRESSES = 10;

export const savedAddressSchema = addressSchema.extend({
  kind: z.enum(["travail", "ami", "famille", "autre"], { error: "Choisis le type d'adresse." }),
  label: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Donne un nom à cette adresse (Bureau, Chez Fatima…).").max(40, "Nom trop long (40 caractères maximum).")),
});

export type SavedAddress = Address & { id: string; kind: SavedAddressKind; label: string };

export const kindOf = (kind: string) => SAVED_ADDRESS_KINDS.find((k) => k.id === kind) ?? SAVED_ADDRESS_KINDS[3];
