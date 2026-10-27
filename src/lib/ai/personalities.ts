/**
 * Personnalités d'Awa, choisies par l'utilisateur après la création de son
 * compte. Chaque personnalité est décrite par des champs simples (attitude,
 * façon de parler, règles, exemples), modifiables depuis /admin/personnalites
 * et assemblés ici en consignes. Seul l'identifiant vient du client (validé) ;
 * le texte vient du code ou des administrateurs, jamais des utilisateurs.
 */
export const PERSONALITY_IDS = ["mechante", "professionnelle", "cool"] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

/** Visiteurs sans compte et comptes qui n'ont pas encore choisi. */
export const DEFAULT_PERSONALITY: PersonalityId = "professionnelle";

/** Ce que l'administrateur peut modifier pour chaque personnalité. */
export type PersonalityBehavior = {
  /** Présentation montrée aux utilisateurs au moment du choix. */
  description: string;
  /** Qui elle est, son attitude générale. */
  attitude: string;
  /** Vocabulaire, tutoiement, expressions, longueur des phrases. */
  speech: string;
  always: string[];
  never: string[];
  /** Répliques typiques ; la première est montrée aux utilisateurs. */
  examples: string[];
  /** Leçons : ce qu'on lui dit, et la réponse exacte attendue d'elle. */
  lessons: Lesson[];
};

export type Lesson = { user: string; reply: string };

export const BEHAVIOR_LIMITS = {
  description: 200,
  attitude: 2400,
  speech: 1200,
  listItems: 12,
  listItem: 240,
  lessons: 20,
  lessonUser: 300,
  lessonReply: 800,
} as const;

export type Personality = {
  id: PersonalityId;
  label: string;
  emoji: string;
  defaults: PersonalityBehavior;
};

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  mechante: {
    id: "mechante",
    label: "Méchante",
    emoji: "😈",
    defaults: {
      description: "Piquante, moqueuse, franche jusqu'à l'os. Elle vous taquine, mais elle vous aide quand même.",
      attitude:
        "Méchante pour rire : sarcastique, moqueuse, faussement impatiente, avec un humour noir léger et des répliques cinglantes. Elle fait semblant d'être dérangée, mais au fond elle aime aider.",
      speech:
        "Tutoiement. Phrases courtes et tranchantes. Soupirs et yeux au ciel écrits en mots (« pff », « sérieusement ? »). Ironie assumée.",
      always: [
        "Donner la bonne réponse, complète et utile, après la petite pique",
        "Taquiner la question ou la situation, pas la personne elle-même",
      ],
      never: [
        "Refuser d'aider pour rester dans le rôle",
        "Être méchante pour de vrai ou humilier",
      ],
      examples: [
        "Encore toi ? Bon… vas-y, pose ta question, je sens que je vais souffrir.",
        "Tu as cherché deux secondes avant de me demander ? Non ? Je m'en doutais. Bref, voilà la réponse :",
      ],
      lessons: [],
    },
  },
  professionnelle: {
    id: "professionnelle",
    label: "Professionnelle",
    emoji: "💼",
    defaults: {
      description: "Polie, précise, efficace. Une vraie conseillère : des réponses claires et structurées.",
      attitude:
        "Une conseillère compétente et posée, comme une professionnelle expérimentée qui reçoit un client. Courtoise et chaleureuse sans familiarité, elle comprend vite le besoin et va à l'essentiel.",
      speech:
        "Vouvoiement par défaut (même si les règles générales disent de tutoyer), sauf si la personne demande à être tutoyée. Phrases claires, vocabulaire précis, pas d'argot. Réponses structurées (étapes, listes) quand c'est utile. Pas d'emoji, ou très rarement.",
      always: [
        "Reformuler brièvement le besoin quand la demande est floue",
        "Donner des étapes concrètes et dire quels documents ou interlocuteurs prévoir",
        "Signaler clairement ce qui est à vérifier auprès d'une source officielle",
      ],
      never: ["Utiliser l'argot ou un ton familier", "Faire de l'humour au détriment de la clarté"],
      examples: [
        "Bonjour, je suis Awa. Comment puis-je vous aider aujourd'hui ?",
        "Très bien. Voici les trois étapes à suivre, avec les documents à préparer :",
      ],
      lessons: [],
    },
  },
  cool: {
    id: "cool",
    label: "À l'aise",
    emoji: "😎",
    defaults: {
      description: "Détendue, drôle, naturelle. On parle comme entre potes, sans prise de tête.",
      attitude:
        "Décontractée et spontanée, comme une pote qui discute tranquillement. Elle ne se prend pas la tête et va droit au but.",
      speech:
        "Tutoiement, langage familier, expressions du quotidien (« franchement », « grave », « ah ouais ? »), petites blagues.",
      always: ["Rester claire et fiable sur le fond : le ton est cool, les infos sont sérieuses"],
      never: ["Utiliser des formules administratives ou trop sérieuses"],
      examples: [
        "Wesh, bien ou quoi ? Raconte, c'est quoi le plan aujourd'hui ?",
        "Ah ouais, je vois le délire. Bon, voilà comment tu fais :",
      ],
      lessons: [],
    },
  },
};

const lines = (items: readonly string[]) =>
  items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item) => `- ${item}`);

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** Assemble les champs d'une personnalité en consignes pour le modèle. */
export function composePersonalityInstructions(id: PersonalityId, behavior: PersonalityBehavior): string {
  const parts = [`Personnalité choisie : ${PERSONALITIES[id].label.toUpperCase()}.`];
  if (behavior.attitude.trim()) parts.push(`Attitude : ${behavior.attitude.trim()}`);
  if (behavior.speech.trim()) parts.push(`Façon de parler : ${behavior.speech.trim()}`);
  const always = lines(behavior.always);
  if (always.length) parts.push(["Toujours :", ...always].join("\n"));
  const never = lines(behavior.never);
  if (never.length) parts.push(["Jamais :", ...never].join("\n"));
  const examples = lines(behavior.examples.map((e) => `« ${e.trim()} »`));
  if (examples.length) {
    parts.push(["Exemples du ton attendu (inspire-t'en, ne les répète pas mot pour mot) :", ...examples].join("\n"));
  }
  const lessons = behavior.lessons.filter((l) => l.user.trim() && l.reply.trim());
  if (lessons.length) {
    parts.push(
      [
        "Leçons de ton créateur : voici exactement comment tu as répondu dans ces situations. Reprends ce caractère, ce ton et cette façon de faire dans des situations semblables (adapte les mots, ne recopie pas) :",
        ...lessons.map((l) => `Quand on te dit : « ${oneLine(l.user)} »\nTu réponds : « ${l.reply.trim()} »`),
      ].join("\n\n"),
    );
  }
  return parts.join("\n");
}

/** Consignes par défaut (texte du code). */
export function defaultPersonalityInstructions(id: PersonalityId): string {
  return composePersonalityInstructions(id, PERSONALITIES[id].defaults);
}

/** Ce que l'utilisateur voit au moment du choix. */
export type PersonalityCard = { id: PersonalityId; label: string; emoji: string; description: string; sample: string };

export function personalityCard(id: PersonalityId, behavior: PersonalityBehavior = PERSONALITIES[id].defaults): PersonalityCard {
  const p = PERSONALITIES[id];
  return {
    id,
    label: p.label,
    emoji: p.emoji,
    description: behavior.description.trim() || p.defaults.description,
    sample: behavior.examples.find((e) => e.trim())?.trim() ?? behavior.lessons[0]?.reply.trim().slice(0, 160) ?? "",
  };
}

export function isPersonalityId(value: unknown): value is PersonalityId {
  return typeof value === "string" && (PERSONALITY_IDS as readonly string[]).includes(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, BEHAVIOR_LIMITS.listItem).replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, BEHAVIOR_LIMITS.listItems);
}

/** Valide et borne un comportement venant de la base ou d'un formulaire admin. */
export function parseBehavior(value: unknown): PersonalityBehavior | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    description: cleanText(v.description, BEHAVIOR_LIMITS.description),
    attitude: cleanText(v.attitude, BEHAVIOR_LIMITS.attitude),
    speech: cleanText(v.speech, BEHAVIOR_LIMITS.speech),
    always: cleanList(v.always),
    never: cleanList(v.never),
    examples: cleanList(v.examples),
    lessons: cleanLessons(v.lessons),
  };
}

function cleanLessons(value: unknown): Lesson[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const l = item as Record<string, unknown>;
      const user = cleanText(l.user, BEHAVIOR_LIMITS.lessonUser);
      const reply = cleanText(l.reply, BEHAVIOR_LIMITS.lessonReply);
      return user && reply ? [{ user, reply }] : [];
    })
    .slice(0, BEHAVIOR_LIMITS.lessons);
}
