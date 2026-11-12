/**
 * Cyclones demandés (« il y a un cyclone ? », « montre-moi les cyclones ») :
 * lu par le serveur sur le message. Le bloc ```carte-cyclones``` ouvre la
 * carte des cyclones de l'océan Indien dans la conversation.
 */

/** Bloc remplacé dans la conversation par la carte des cyclones (CycloneCard). */
export const CYCLONE_BLOCK = "carte-cyclones";

/** Zone voulue : l'océan Indien autour de Mayotte (par défaut), ou le monde entier (sur demande). */
export type CycloneZone = "ocean-indien" | "monde";

/** Contenu du bloc : la zone montrée par la carte. */
export const cycloneBlock = (zone: CycloneZone = "ocean-indien") => `\n\n\`\`\`${CYCLONE_BLOCK}\n${zone}\n\`\`\``;

/** Zone lue dans le bloc : « monde », sinon l'océan Indien. */
export const cycloneZoneOf = (spec: string): CycloneZone => (spec.trim() === "monde" ? "monde" : "ocean-indien");

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")} `;

const CYCLONE = /\b(?:cyclones?|cycloniques?|tempetes? tropicales?|depressions? tropicales?|perturbations? tropicales?|ouragans?|typhons?|kimbunga|tufani)\b/;

/** La personne parle des cyclones (en cours, en formation, qui arrivent). */
export const detectCyclone = (message: string) => CYCLONE.test(normalize(message));

/** « Les autres cyclones », « dans le monde », « ailleurs », « au Japon »… : pas seulement notre océan. */
const WORLD =
  /\b(?:autres?|monde|mondial|ailleurs|partout|planete|reste|pacifique|atlantique|japon|chine|philippines|inde|australie|amerique|etats unis|usa|caraibes?|antilles|typhons?|ouragans?)\b/;

/** Zone voulue par le message : le monde si la personne parle d'ailleurs, sinon notre océan. */
export const cycloneZoneFor = (message: string): CycloneZone => (WORLD.test(normalize(message)) ? "monde" : "ocean-indien");

/* -------------------------------------------------------------------------- */
/* Données envoyées à la carte                                                */
/* -------------------------------------------------------------------------- */

export type CyclonePoint = { lat: number; lng: number; /** Heure ISO (UTC). */ at: string; forecast: boolean };

export type Cyclone = {
  id: string;
  /** « Agueda », ou « Système n°2 » tant qu'il n'a pas de nom. */
  name: string;
  /** Pas encore de nom : il est en train de se former. */
  forming: boolean;
  /** « Dépression tropicale », « Tempête tropicale », « Cyclone tropical ». */
  status: string;
  /** Vent le plus fort, en km/h. */
  windKmh: number | null;
  /** Dans notre océan (sud-ouest de l'océan Indien) : seul cas où la distance à Mayotte et l'estimation ont un sens. */
  local: boolean;
  /** « Pacifique nord-ouest », « Atlantique nord »… */
  region: string;
  /** Position à la dernière mesure (longitudes du trajet et du cône suivies sans saut au changement de date : elles peuvent dépasser ±180). */
  now: { lat: number; lng: number; at: string };
  /** Trajet : déjà fait puis prévu, dans l'ordre. */
  track: CyclonePoint[];
  /** Zone où il peut passer (cône d'incertitude), en [lng, lat]. */
  cone: [number, number][][] | null; // un contour par morceau (deux si GDACS la coupe au changement de date)
  /** Distance de Mayotte maintenant, en km. */
  distanceKm: number;
  /** Plus proche de Mayotte selon la prévision. */
  closest: { km: number; at: string } | null;
  /** Mayotte est dans la zone où il peut passer (cône d'incertitude) ; null : pas de zone donnée. */
  mayotteInCone: boolean | null;
  /** Fiche détaillée sur GDACS. */
  link: string;
  /** Estimation BTM du passage près de Mayotte (moteur des anciens cyclones). null : pas assez de données. */
  estimate: CycloneEstimate | null;
  /**
   * Plus suivi (fini depuis moins de 7 jours, dans notre océan) : trop faible,
   * il s'est sûrement dissipé. `now` est alors sa dernière position connue, et
   * il n'y a plus de prévision. Montré pour que personne ne croie à un bug.
   */
  ended: boolean;
};

/**
 * Estimation BTM (src/lib/cyclone/engine.ts) : la prévision officielle avec
 * ses erreurs habituelles, croisée avec ce qu'ont fait les anciens cyclones
 * qui lui ressemblaient. Un deuxième avis chiffré, pas une alerte.
 */
export type CycloneEstimate = {
  /** Chances (en %) qu'il passe à moins de 100, 200 et 300 km de Mayotte dans les 5 jours. */
  within100: number;
  within200: number;
  within300: number;
  /** Heure ISO la plus probable du passage au plus près, s'il vient à moins de 300 km. */
  when: string | null;
  /** Distance au plus près la plus probable (médiane), en km. */
  typicalKm: number;
  /** Sur quoi repose le chiffre : prévision officielle et anciens cyclones, ou anciens cyclones seuls. */
  basis: "officielle+archives" | "officielle" | "archives";
  /** Nombre d'anciens cyclones semblables retenus. */
  analogs: number;
  /** Les plus ressemblants, pour expliquer (« comme Kenneth en 2019 »). */
  examples: { name: string; year: number; closestKm: number }[];
  /** Trajets des anciens cyclones semblables, ramenés à sa position (pour la carte), en [lng, lat]. */
  spread: [number, number][][];
};

export type CyclonesResponse = { cyclones: Cyclone[]; updatedAt: string } | { error: string };

/** Mayotte (Mamoudzou), point de mesure des distances. */
export const MAYOTTE = { lat: -12.78, lng: 45.23 };
