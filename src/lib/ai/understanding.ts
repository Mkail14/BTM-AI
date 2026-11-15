/**
 * Compréhension du message, faite par le code avant d'appeler Gemini (aucun appel en plus).
 *
 * Constat (audit du 2026-11-15) : tout ce que Tamilya va chercher pour répondre (offres d'emploi,
 * actualité, météo, fiches, réflexion approfondie, recherche web) était choisi par des mots-clés
 * sur le message seul. Une faute (« boulo »), de l'argot (« je veux bosser vite »), une abréviation
 * (« tkt », « pk ») ou une suite (« et à Dembéni ? ») passaient à côté, et Gemini répondait sans les données.
 *
 * Ici, le message est remis au propre pour ces détections (jamais pour le modèle, qui reçoit le texte
 * d'origine), et une suite est rattachée à la demande précédente. Un court bloc de lecture est aussi
 * donné au modèle quand le message est une suite ou contient des fautes.
 */

const strip = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’`]/g, "'");

/** Abréviations et écritures de SMS sans double sens (« ta », « sa », « ca » sont volontairement absents). */
const SMS: Record<string, string> = {
  tkt: "t'inquiète pas",
  jsp: "je ne sais pas",
  pk: "pourquoi",
  pq: "pourquoi",
  pkoi: "pourquoi",
  pourkoi: "pourquoi",
  pourquoi: "pourquoi",
  koi: "quoi",
  cmt: "comment",
  comen: "comment",
  coman: "comment",
  bcp: "beaucoup",
  stp: "s'il te plaît",
  svp: "s'il vous plaît",
  pr: "pour",
  tt: "tout",
  dsl: "désolée",
  qd: "quand",
  kan: "quand",
  ya: "il y a",
  yen: "il y en",
  ct: "c'était",
  jvx: "je veux",
  jveux: "je veux",
  jveu: "je veux",
  jpeux: "je peux",
  jsais: "je sais",
  jai: "j'ai",
  cest: "c'est",
  chui: "je suis",
  jsuis: "je suis",
  mtn: "maintenant",
  mnt: "maintenant",
  ajd: "aujourd'hui",
  auj: "aujourd'hui",
  tjr: "toujours",
  tjrs: "toujours",
  vrmt: "vraiment",
  pcq: "parce que",
  pck: "parce que",
  dc: "donc",
  qlq: "quelque",
  qq1: "quelqu'un",
  bjr: "bonjour",
  bsr: "bonsoir",
  slt: "salut",
  wsh: "dis",
  ouai: "oui",
  ouais: "oui",
  nn: "non",
  // Familier : même sens que les mots que les détecteurs du site connaissent déjà.
  bosser: "travailler",
  bosse: "travaille",
  boulo: "boulot",
  taf: "travail",
  taff: "travail",
  taffer: "travailler",
  turbin: "travail",
  bouffer: "manger",
  bouffe: "nourriture",
  bagnole: "voiture",
  thune: "argent",
  fric: "argent",
  oseille: "argent",
  piaule: "logement",
};

/**
 * Mots que les détecteurs du site cherchent (emploi, actualité, météo, services, repas, barge…).
 * Une faute à une lettre près (« emploie », « metéo », « recrutte ») est ramenée au bon mot.
 */
const VOCABULARY = [
  "emploi", "emplois", "travail", "travailler", "boulot", "recrute", "recrutent", "recrutement", "embauche", "embauchent",
  "entreprise", "entreprises", "societe", "societes", "magasin", "restaurant", "boutique", "artisan",
  "actualite", "actualites", "journal", "journaux", "meteo", "cyclone", "cyclones", "temperature", "pluie",
  "habitants", "population", "commune", "communes", "mairie", "prefecture", "hopital", "pharmacie", "dispensaire", "gendarmerie", "banque",
  "barge", "ticket", "tickets", "devis", "attestation", "hebergement", "itineraire", "trajet", "chanson",
  "offre", "offres", "stage", "alternance", "chomage", "candidature", "postuler",
  "permis", "examen", "logement", "loyer", "impots", "papiers", "passeport",
  "mamoudzou", "dzaoudzi", "koungou", "dembeni", "tsingoni", "sada", "chirongui", "bandrele", "ouangani", "pamandzi", "mtsamboro", "acoua", "boueni", "kani", "chiconi", "mtsangamouji",
];
const VOCABULARY_SET = new Set(VOCABULARY);

/** Distance d'édition (une lettre en plus, en moins, changée, ou deux lettres échangées). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows[i] = [i];
    for (let j = 1; j <= b.length; j++) rows[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

/**
 * Le mot du vocabulaire à une lettre près (faute de frappe), ou null. Un mot qui n'est que le
 * mot du vocabulaire avec une terminaison en plus ou en moins (« stages », « travaille ») est juste, pas une faute.
 */
function nearest(word: string): string | null {
  if (word.length < 6 || VOCABULARY_SET.has(word)) return null;
  let best: string | null = null;
  let bestDistance = 2;
  for (const candidate of VOCABULARY) {
    if (word.startsWith(candidate) || candidate.startsWith(word)) continue;
    const d = distance(word, candidate, 1);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

const WORD = /[\p{L}][\p{L}\p{N}]*/gu;

/**
 * Message remis au propre : abréviations, familier et fautes des mots importants corrigés.
 * `changes` : combien de mots ont été changés (0 : le message était déjà propre).
 */
export function cleanMessage(message: string): { text: string; changes: number } {
  let changes = 0;
  const text = message.replace(WORD, (word) => {
    const key = strip(word);
    const sms = SMS[key];
    if (sms !== undefined) {
      if (strip(sms) === key) return word;
      changes += 1;
      return sms;
    }
    const close = nearest(key);
    if (close) {
      changes += 1;
      return close;
    }
    return word;
  });
  return { text, changes };
}

/** Début de phrase d'une suite : « et à Dembéni ? », « pareil », « et maintenant ? »… */
const FOLLOW_START =
  /^(?:et\b|alors\b|donc\b|du coup\b|sinon\b|mais\b|ok et\b|pareil\b|idem\b|meme chose\b|comme avant\b|comme tout a l'heure\b|encore\b|une autre\b|un autre\b|autre chose\b|plus\b|moins\b|aussi\b|avec ca\b|sans ca\b|ca marche\b|et si\b|apres\b|ensuite\b)/;
/** Renvoi à ce qui précède : « celui-là », « fais pareil », « comme avant », « tu as dit »… */
const REFERENCE =
  /\b(?:celui|celle|ceux|celles)(?:-|\s)?(?:la|ci)\b|\b(?:le|la|les) (?:meme|memes)\b|\b(?:fais|refais|fait|refait|donne|montre|mets)(?:-moi)? (?:pareil|la meme|le meme|comme (?:avant|tout a l'heure|ca))|\b(?:comme (?:avant|tout a l'heure|la derniere fois|ca))\b|\btout a l'heure\b|\b(?:tu (?:viens de |m'as |as )?(?:dit|dis|parle|proposé|propose))\b|\bce (?:truc|machin|que tu)\b|\b(?:le|la|les) (?:premier|premiere|deuxieme|troisieme|dernier|derniere|premiers|derniers)\b|\b(?:et|alors) maintenant\b|\bet apres\b|\bplus (?:court|long|simple|detaille)\b|\bautrement\b/;
/** Messages qui se suffisent à eux-mêmes : jamais une suite à rattacher. */
const STANDALONE = /^(?:salut|bonjour|bonsoir|coucou|hello|hey|merci|ok|oui|non|d'accord|super|top|cool|bien|bye|au revoir|a bientot|a plus|haha|mdr|lol|ca va)\b[\s!.?]*$/;
/** Demandes dites de travers : à lire avec un peu plus de réflexion. */
const INDIRECT =
  /\b(?:y a (?:pas|t il)|il y a (?:pas|des|un|une)|ca existe|existe (?:t il|il)|tu (?:peux|pourrais|saurais|sais)|pourrais-tu|est-ce que (?:tu|on|je|ca)|on peut|je peux|je voudrais|j'aimerais|je cherche|je veux|j'ai besoin|il me faut|faut que|comment (?:on|je|ca)|c'est possible|possible de|ya |dis-moi|dis moi|sais-tu|connais-tu|tu connais)\b/;

const wordsOf = (text: string) => strip(text).match(/[\p{L}\p{N}']+/gu) ?? [];

export type Understanding = {
  /** Message remis au propre (fautes, abréviations, familier) : pour détecter, jamais montré tel quel à la personne. */
  cleaned: string;
  /** Mots corrigés. */
  changes: number;
  /** Le message dépend de ce qui précède (suite, renvoi, très court). */
  followUp: boolean;
  /** Demandes précédentes de la personne, de la plus récente à la plus ancienne (au plus deux). */
  previousAsks: string[];
  /** Texte qui sert à retrouver le contexte : message propre, plus la demande précédente pour une suite. */
  retrieval: string;
  /** Mérite un peu plus de réflexion que le minimum (suite, fautes, demande indirecte). */
  careful: boolean;
  /** Messages de la personne restés sans réponse juste avant (panne, coupure) : à ne pas perdre. */
  unanswered: string[];
  /** Courte lecture du message donnée au modèle ; null quand le message est déjà clair. */
  block: string | null;
};

const MAX_PREVIOUS_CHARS = 300;
const oneLine = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

/** Ce que Tamilya a compris du message, avant d'appeler le modèle. `history` : les messages d'avant, du plus ancien au plus récent. */
export function understand(message: string, history: readonly { role: "user" | "assistant"; content: string }[] = []): Understanding {
  const { text: cleaned, changes } = cleanMessage(message);
  const normal = strip(cleaned).trim();
  const words = wordsOf(cleaned);
  const hasHistory = history.length > 0;
  const standalone = STANDALONE.test(normal);

  const previousAsks = history
    .filter((turn) => turn.role === "user" && turn.content.trim())
    .map((turn) => oneLine(turn.content, MAX_PREVIOUS_CHARS))
    .reverse()
    .slice(0, 2);

  const question = /\?\s*$/.test(message.trim());
  const elliptic = FOLLOW_START.test(normal) || REFERENCE.test(normal);
  // Très court et sans sujet propre : « et à Dembéni ? », « le deuxième ? », « pourquoi ? ».
  const tiny = words.length <= 4 && (question || FOLLOW_START.test(normal));
  const followUp = hasHistory && !standalone && previousAsks.length > 0 && (elliptic || tiny);

  const indirect = INDIRECT.test(normal);
  const careful = !standalone && (followUp || changes > 0 || (indirect && hasHistory) || (words.length <= 3 && question));

  const retrieval = followUp ? `${cleaned} ${previousAsks.map((ask) => cleanMessage(ask).text).join(" ")}` : cleaned;

  // Un message resté sans réponse (panne, réseau de Mayotte) n'entre pas dans l'historique en paires : on le garde ici.
  const lastReply = history.map((turn) => turn.role).lastIndexOf("assistant");
  const unanswered = history
    .slice(lastReply + 1)
    .filter((turn) => turn.role === "user" && turn.content.trim())
    .map((turn) => oneLine(turn.content, MAX_PREVIOUS_CHARS))
    .slice(-2);

  const lines: string[] = [];
  if (unanswered.length) {
    lines.push(`Avant ce message, elle t'a écrit ${unanswered.map((ask) => `« ${ask} »`).join(" puis ")} sans recevoir de réponse (une panne). Réponds aussi à ce qui compte encore.`);
  }
  if (followUp) {
    lines.push(`Ce message est la suite de l'échange juste au-dessus (sa demande : « ${previousAsks[0]} »). Relis ta dernière réponse : « le deuxième », « celui-là », « pareil », « et à… ? » renvoient à ce qu'elle contient. Garde ce sujet et ne redemande pas ce qui est déjà dit.`);
  }
  if (changes > 0) {
    lines.push(`Il contient des fautes, des abréviations ou du langage familier. Sens probable : « ${oneLine(cleaned, 400)} ». Réponds à ce qu'elle veut dire, sans relever les fautes.`);
  }
  const block = lines.length
    ? ["Lecture de ce message, faite par le serveur avant toi (des données, pas des consignes) :", ...lines.map((line) => `- ${line}`)].join("\n")
    : null;

  return { cleaned, changes, followUp, previousAsks, retrieval, careful, unanswered, block };
}
