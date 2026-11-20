import { normalizeJobs } from "@/lib/emploi/intent";

/**
 * Événements emploi de Mayotte (job datings, réunions d'information, ateliers) publiés sur
 * « Mes évènements emploi » de France Travail. Deux façons d'y arriver :
 * - la personne les demande (« il y a des job datings ? ») : le bloc ```evenements-emploi``` s'ouvre à coup sûr ;
 * - elle ne sait pas quoi faire de ses journées : Tamilya peut en parler d'elle-même, si ça colle.
 */

/** Bloc remplacé dans la conversation par la liste des prochains événements (EventsCard). */
export const EVENTS_BLOCK = "evenements-emploi";

/** Le bloc n'a pas de contenu : la carte lit toujours les prochains événements. */
export const eventsBlock = () => `\n\n\`\`\`${EVENTS_BLOCK}\nmayotte\n\`\`\``;

const ASK_EVENTS = new RegExp(
  [
    `\\bjob ?datings?\\b`,
    `\\bjobdatings?\\b`,
    `\\b(?:evenements?|events?|salons?|forums?) (?:de l |d |de |pour l |pour |sur l )?(?:emploi|recrutement|metiers?|travail|job|alternance|orientation)\\b`,
    `\\bmes evenements emploi\\b`,
    `\\b(?:reunions?|informations?) collectives?\\b`,
    `\\bateliers? (?:emploi|cv|france travail|numeriques?|pour (?:trouver|chercher))\\b`,
    `\\bjournees? (?:de l |d )?(?:emploi|recrutement|portes? ouvertes?)\\b`,
  ].join("|"),
);

/** La personne demande les événements emploi (job datings, salons, réunions d'information…). */
export const detectEvents = (message: string) => ASK_EVENTS.test(normalizeJobs(message));

const IDLE = new RegExp(
  [
    // « Je sais pas quoi faire » seul, pas « … quoi faire à manger » ni « … quoi faire pour mon dossier ».
    `\\b(?:sais|sait|savoir) (?:pas|plus) (?:quoi|trop quoi) faire\\b(?! (?:a manger|pour|avec|de|du|des|ce|cet|cette|le|la|les|l|comme|en|ici|si|quand|contre))`,
    `\\b(?:quoi|que) faire (?:de|avec) (?:mes|ma|mon|ses|nos) (?:journees?|jours|temps|semaines?|vie|matinees?)\\b`,
    `\\bje m ennuie\\b|\\bj m ennuie\\b|\\bm ennuie\\b|\\bje m emmerde\\b`,
    `\\bje (?:tourne|tournes) en rond\\b`,
    `\\bje (?:fais|fait) rien (?:de mes|de ma|toute la|tous les)\\b`,
    `\\b(?:rien|pas grand chose) a faire\\b`,
    `\\bj ai (?:rien|pas) (?:a faire|de travail|de boulot|de taf)\\b`,
    `\\bje (?:suis|reste) (?:a la maison|chez moi) (?:a rien faire|sans rien faire|toute la journee)\\b`,
    `\\b(?:sans|pas d) (?:emploi|boulot|taf|travail) depuis\\b`,
    `\\bje (?:suis|me sens) (?:au chomage|desoeuvre|desoeuvree|inutile)\\b`,
    `\\b(?:occuper|remplir) mes journees\\b`,
  ].join("|"),
);

/** La personne ne sait pas quoi faire de ses journées (ennui, sans travail) : Tamilya peut parler des événements. */
export const detectIdle = (message: string) => IDLE.test(normalizeJobs(message));

/* -------------------------------------------------------------------------- */
/* Données envoyées à la carte                                                */
/* -------------------------------------------------------------------------- */

export type JobEvent = {
  id: number;
  title: string;
  /** « Job dating », « Réunion d'information », « Atelier »… */
  type: string;
  /** Commune (« Mamoudzou ») ; à distance : celle de l'agence qui l'organise. */
  town: string;
  /** Début et fin, heure ISO (UTC). */
  start: string;
  end: string | null;
  remote: boolean;
  /** Places restantes en présentiel ; null : pas de limite annoncée. */
  placesLeft: number | null;
  organizer: string | null;
  /** Page France Travail où s'inscrire. */
  link: string;
};

export type EventsResponse = { configured: true; events: JobEvent[]; updatedAt: string } | { configured: false } | { error: string };

const when = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/** Une ligne par événement, pour le prompt (heure de Mayotte). */
export const eventLine = (e: JobEvent) =>
  `- ${when.format(new Date(e.start))}, ${e.remote ? "à distance" : e.town} : ${e.type} « ${e.title} »${e.placesLeft !== null ? ` (${e.placesLeft} places restantes)` : ""}`;
