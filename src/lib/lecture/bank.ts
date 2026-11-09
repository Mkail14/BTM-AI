/**
 * Banque de sons de la lecture en 3D : de vrais enregistrements libres (Wikimedia Commons), choisis à
 * l'oreille, compressés en Opus (~10 à 60 Ko, 155 Ko pour l'appel à la prière) dans public/sons/<id>.webm. Le téléphone ne télécharge
 * que les sons de l'histoire en cours ; les sons qui ont une version fabriquée (sounds.ts) la gardent
 * en secours si le fichier n'arrive pas à temps. Auteurs et licences : public/sons/CREDITS.md.
 */

type Height = "haut" | "milieu" | "bas";

/** Décor : une boucle qui dure toute la page. width : largeur en degrés (360 = tout autour). */
type Bed = { name: string; width: number; height?: Height };
/** Bruit court, joué une fois. */
type Shot = { name: string; height?: Height };

export const BEDS = {
  vent: { name: "vent", width: 160 },
  pluie: { name: "grosse pluie", width: 360, height: "haut" },
  "pluie-fine": { name: "pluie fine", width: 360, height: "haut" },
  "pluie-tole": { name: "pluie sur un toit en tôle", width: 300, height: "haut" },
  vagues: { name: "vagues du lagon", width: 120 },
  riviere: { name: "rivière", width: 60 },
  feu: { name: "feu de bois", width: 25 },
  nuit: { name: "nuit, grillons", width: 270 },
  oiseaux: { name: "oiseaux", width: 100, height: "haut" },
  foret: { name: "forêt tropicale", width: 300 },
  marche: { name: "marché", width: 220 },
  rue: { name: "route, circulation", width: 160 },
  chantier: { name: "chantier", width: 120 },
  foule: { name: "foule qui parle", width: 220 },
  enfants: { name: "enfants qui jouent", width: 160 },
  khoutba: { name: "prêche du vendredi à la mosquée", width: 90 },
  madrassa: { name: "madrassa, enfants qui récitent", width: 90 },
  roussettes: { name: "roussettes le soir dans les arbres", width: 200, height: "haut" },
  port: { name: "port, barge", width: 180 },
  cuisine: { name: "friture en cuisine", width: 40 },
  horloge: { name: "horloge qui fait tic-tac", width: 30 },
  fete: { name: "fête, tambours qui jouent", width: 200 },
  grenouilles: { name: "nuit au bord de l'eau, grenouilles et grillons", width: 270 },
  restaurant: { name: "café, restaurant plein de monde", width: 220 },
  espace: { name: "intérieur d'un vaisseau spatial", width: 360 },
  "sous-eau": { name: "sous l'eau", width: 360 },
} as const satisfies Record<string, Bed>;

export const SHOTS = {
  adhan: { name: "appel à la prière (adhan), au loin", height: "haut" },
  takbir: { name: "foule qui dit « Allahou akbar »" },
  tonnerre: { name: "tonnerre", height: "haut" },
  pas: { name: "pas", height: "bas" },
  coeur: { name: "cœur qui bat" },
  rafale: { name: "rafale de vent" },
  frappe: { name: "on frappe à la porte" },
  eclaboussure: { name: "quelque chose tombe dans l'eau", height: "bas" },
  galop: { name: "galop", height: "bas" },
  "porte-grince": { name: "porte qui grince" },
  toux: { name: "toux" },
  bebe: { name: "bébé qui pleure" },
  eternuement: { name: "éternuement" },
  soupir: { name: "soupir" },
  applaudissements: { name: "applaudissements" },
  sifflet: { name: "sifflement" },
  coq: { name: "coq" },
  poule: { name: "poules" },
  chevre: { name: "chèvre", height: "bas" },
  zebu: { name: "zébu" },
  chien: { name: "chien qui aboie", height: "bas" },
  chat: { name: "chat", height: "bas" },
  moto: { name: "scooter qui passe" },
  voiture: { name: "voiture qui passe" },
  camion: { name: "camion" },
  klaxon: { name: "klaxon" },
  bateau: { name: "moteur de bateau" },
  telephone: { name: "téléphone qui sonne" },
  course: { name: "quelqu'un qui court", height: "bas" },
  feuilles: { name: "pas dans les feuilles et la terre", height: "bas" },
  rire: { name: "femme qui rit" },
  "rires-enfants": { name: "enfants qui rient" },
  "porte-claque": { name: "porte qui claque" },
  verre: { name: "verre qui se casse" },
  eau: { name: "eau qu'on verse" },
  hibou: { name: "hibou", height: "haut" },
  avion: { name: "avion qui passe", height: "haut" },
  reveil: { name: "réveil qui sonne" },
  ronflement: { name: "ronflement" },
  baillement: { name: "bâillement" },
  bisou: { name: "bisou" },
  cri: { name: "cri de peur" },
  branche: { name: "branche qui casse" },
  sonnette: { name: "sonnette de vélo" },
  cles: { name: "trousseau de clés" },
  magie: { name: "étincelle magique" },
  chute: { name: "quelqu'un qui tombe par terre", height: "bas" },
  moustique: { name: "moustique près de l'oreille" },
  sirene: { name: "sirène de police" },
  "feux-artifice": { name: "feux d'artifice", height: "haut" },
  train: { name: "train qui passe" },
  maki: { name: "maki (lémurien) qui crie", height: "haut" },
} as const satisfies Record<string, Shot>;

/**
 * Sons d'origine. Depuis le 2026-11-08, l'admin en ajoute et en débranche (/admin/sons, catalog.ts) :
 * un décor, un bruit ou une musique est donc un simple identifiant, vérifié contre le catalogue du moment.
 */
export type Ambience = string;
export type Effect = string;
export const AMBIENCES = Object.keys(BEDS) as [Ambience, ...Ambience[]];
export const EFFECTS = Object.keys(SHOTS) as [Effect, ...Effect[]];

/**
 * Sons qui ont un vrai enregistrement dans public/sons (choisis à l'oreille le 2026-11-08).
 * Retirés le 2026-11-08 : « village » (cloches d'église en boucle, faux pour Mayotte) et « tambour »
 * (c'était une cloche de vache), avec leurs fichiers : à remplacer par de vrais sons de Mayotte.
 */
export const RECORDED: ReadonlySet<string> = new Set<string>([
  "pluie", "pluie-tole", "vent", "vagues", "riviere", "nuit", "oiseaux", "foret", "marche", "rue", "chantier", "foule", "enfants", "khoutba", "madrassa", "roussettes", "port", "cuisine", "pluie-fine", "adhan", "takbir", "tonnerre", "coeur", "frappe", "galop", "porte-grince", "toux", "bebe", "eternuement", "soupir", "applaudissements", "sifflet", "coq", "poule", "chevre", "zebu", "chien", "chat", "moto", "voiture", "camion", "klaxon", "bateau", "telephone",
  // Ajoutés le 2026-11-09 (Freesound, CC0) : feu et pas avaient seulement une version fabriquée.
  "feu", "pas", "horloge", "fete", "grenouilles", "restaurant", "espace", "sous-eau", "course", "feuilles", "rire", "rires-enfants", "porte-claque", "verre", "eau", "hibou", "avion", "reveil", "ronflement", "baillement", "bisou", "cri", "branche", "sonnette", "cles", "magie", "chute", "moustique", "sirene", "feux-artifice", "train", "maki",
]);

export const soundUrl = (sound: string) => `/sons/${sound}.webm`;

/**
 * Musique de fond, comme au cinéma : une boucle de 40 s par ambiance (~105 Ko) (Kevin MacLeod, CC BY), dans
 * public/musique/<id>.webm. Elle joue au milieu de la tête, sous les voix, et peut changer en
 * cours d'histoire (le calme qui tourne à la peur). Crédits : public/musique/CREDITS.md.
 */
export const MOODS = {
  horreur: "horreur : graves inquiétants, la peur",
  suspense: "suspense : tension qui monte, on retient son souffle",
  mystere: "mystère, enquête, secret",
  film: "grand film américain : orchestre héroïque, émotion, moment épique",
  action: "action, poursuite, danger rapide",
  aventure: "aventure, voyage, découverte",
  vlog: "vlog : léger et joyeux, la vie de tous les jours",
  comedie: "comédie : malice, situation drôle",
  triste: "tristesse, perte, mélancolie",
  romantique: "amour, tendresse",
  calme: "calme, douceur, avant de dormir",
  magique: "conte, magie, merveilleux",
} as const satisfies Record<string, string>;

export type Mood = string;
export const MOOD_IDS = Object.keys(MOODS) as [Mood, ...Mood[]];
export const musicUrl = (mood: string) => `/musique/${mood}.webm`;

/**
 * Histoires légères : les bruits qui font peur n'y ont pas leur place, même si Gemini en met
 * (plainte du 2026-11-08 : une histoire drôle sonnait comme un film d'horreur).
 */
export const LIGHT_MOODS: ReadonlySet<string> = new Set<string>(["vlog", "comedie", "calme", "romantique", "magique"]);
/** Sons d'origine qui font peur (réglable ensuite pour chaque son dans /admin/sons). */
export const SCARY_SOUNDS: ReadonlySet<string> = new Set<string>(["coeur", "porte-grince", "tonnerre", "cri"]);
