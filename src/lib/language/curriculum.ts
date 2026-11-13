/**
 * Programme de shimaoré de Tamilya : les mots français essentiels, rangés en thèmes
 * puis en groupes. Seul le français est écrit ici ; la traduction vient
 * toujours d'un locuteur (dictionnaire awa_words ou expressions awa_lexicon).
 * Une cible peut avoir des synonymes séparés par « | » : le premier s'affiche.
 */
export type Group = { label: string; words: string[] };

export type Theme = {
  id: string;
  label: string;
  /** Teinte de la bulle et de ses liens (oklch). */
  hue: number;
  /** Noms de catégorie du dictionnaire qui comptent pour ce thème. */
  categories: string[];
  groups: Group[];
};

export const THEMES: Theme[] = [
  {
    id: "salutations",
    label: "Salutations",
    hue: 25,
    categories: ["salutation", "politesse"],
    groups: [
      { label: "Se saluer", words: ["bonjour", "salut", "bonsoir", "bonne nuit", "bienvenue", "bonne journée", "bonne soirée"] },
      { label: "Se quitter", words: ["au revoir", "à demain", "à bientôt", "à plus tard", "bon voyage", "prends soin de toi"] },
      {
        label: "Politesse",
        words: ["merci", "merci beaucoup", "s'il te plaît|s'il vous plaît", "pardon|excuse-moi", "de rien", "félicitations", "désolé"],
      },
      { label: "Répondre", words: ["comment ça va|ça va|comment vas-tu", "ça va bien", "oui", "non", "d'accord", "peut-être", "bien sûr"] },
    ],
  },
  {
    id: "famille",
    label: "Famille",
    hue: 350,
    categories: ["famille", "personnes"],
    groups: [
      { label: "Parents", words: ["mère|maman", "père|papa", "grand-mère", "grand-père", "oncle", "tante", "parents"] },
      { label: "Enfants", words: ["enfant", "fils", "fille", "bébé", "cousin", "neveu", "petit-enfant"] },
      { label: "Couple", words: ["mari", "femme|épouse", "fiancé", "mariage", "belle-mère", "beau-père"] },
      { label: "Proches", words: ["frère", "sœur", "grand frère", "grande sœur", "famille", "ami|amie", "voisin", "homme", "personne", "jeune", "vieux|ancien"] },
    ],
  },
  {
    id: "nombres",
    label: "Nombres",
    hue: 250,
    categories: ["nombre", "chiffre"],
    groups: [
      { label: "1 à 5", words: ["un", "deux", "trois", "quatre", "cinq"] },
      { label: "6 à 10", words: ["six", "sept", "huit", "neuf", "dix"] },
      { label: "11 à 20", words: ["onze", "douze", "treize", "quatorze", "quinze", "seize", "vingt"] },
      { label: "Grands nombres", words: ["trente", "quarante", "cinquante", "cent", "mille", "million"] },
      { label: "Quantités", words: ["beaucoup", "peu", "premier", "dernier", "moitié", "tout", "rien", "encore"] },
    ],
  },
  {
    id: "verbes",
    label: "Verbes courants",
    hue: 300,
    categories: ["verbe", "verbes", "action"],
    groups: [
      { label: "Essentiels", words: ["être", "avoir", "aller", "venir", "faire", "dire", "partir", "revenir"] },
      { label: "Communiquer", words: ["parler", "voir", "regarder", "entendre", "écouter", "savoir", "comprendre", "demander", "répondre", "appeler"] },
      { label: "Envies", words: ["vouloir", "pouvoir", "aimer", "aider", "attendre", "chercher", "trouver"] },
      { label: "Échanger", words: ["donner", "prendre", "acheter", "vendre", "travailler", "payer", "envoyer"] },
      { label: "Bouger", words: ["marcher", "courir", "entrer", "sortir", "s'asseoir", "se lever", "monter", "descendre"] },
      { label: "Quotidien", words: ["cuisiner", "laver", "nettoyer", "ouvrir", "fermer", "lire", "écrire", "jouer", "rire", "pleurer"] },
      { label: "Penser", words: ["penser", "croire", "oublier", "se souvenir", "connaître", "apprendre", "commencer", "finir"] },
    ],
  },
  {
    id: "phrases",
    label: "Phrases utiles",
    hue: 175,
    categories: ["phrase", "expression", "conversation"],
    groups: [
      {
        label: "Se présenter",
        words: ["je m'appelle", "comment tu t'appelles", "quel âge as-tu", "d'où viens-tu", "j'habite à", "enchanté", "je suis de Mayotte"],
      },
      {
        label: "Comprendre",
        words: ["je ne comprends pas", "répète", "parle lentement", "je ne sais pas", "c'est quoi", "comment on dit", "tu parles français"],
      },
      {
        label: "Au quotidien",
        words: ["j'ai faim", "j'ai soif", "je suis fatigué", "je suis malade", "j'arrive", "attends-moi", "viens ici", "on y va", "dépêche-toi", "doucement"],
      },
      {
        label: "Du cœur",
        words: ["je t'aime", "tu me manques", "bon appétit", "bonne chance", "si Dieu le veut", "que Dieu te bénisse", "courage"],
      },
    ],
  },
  {
    id: "questions",
    label: "Questions & liens",
    hue: 220,
    categories: ["question", "grammaire", "pronom", "mot outil"],
    groups: [
      { label: "Questions", words: ["qui", "quoi", "où", "quand", "comment", "pourquoi", "combien", "lequel"] },
      { label: "Pronoms", words: ["je|moi", "tu|toi", "il|elle", "nous", "vous", "ils|elles", "mon|ma", "ton|ta"] },
      { label: "Liens", words: ["et", "mais", "avec", "sans", "pour", "parce que", "aussi", "alors", "si"] },
    ],
  },
  {
    id: "temps",
    label: "Temps",
    hue: 200,
    categories: ["temps", "jour", "date"],
    groups: [
      { label: "Moments", words: ["matin", "midi", "après-midi", "soir", "nuit", "jour"] },
      { label: "Jours", words: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] },
      { label: "Quand", words: ["aujourd'hui", "demain", "hier", "maintenant", "bientôt", "toujours", "jamais", "tôt", "tard", "avant", "après"] },
      { label: "Durées", words: ["minute", "heure", "semaine", "mois", "année|an", "longtemps"] },
      { label: "Saisons", words: ["saison des pluies", "saison sèche", "ramadan", "vacances"] },
    ],
  },
  {
    id: "nourriture",
    label: "Nourriture",
    hue: 85,
    categories: ["nourriture", "cuisine", "repas", "aliment"],
    groups: [
      { label: "Boire & manger", words: ["eau", "manger", "boire", "repas", "petit-déjeuner", "faim", "soif", "thé", "café", "lait", "jus"] },
      { label: "Plats", words: ["riz", "poisson", "viande", "poulet", "œuf", "pain", "brède|brèdes", "sauce", "gâteau"] },
      { label: "Fruits", words: ["banane", "noix de coco", "mangue", "ananas", "papaye", "citron", "fruit à pain", "jacque"] },
      { label: "Légumes & épices", words: ["manioc", "tomate", "oignon", "piment", "sel", "sucre", "huile", "ail", "légume"] },
    ],
  },
  {
    id: "corps",
    label: "Corps & santé",
    hue: 5,
    categories: ["corps", "santé", "sante"],
    groups: [
      { label: "Visage", words: ["tête", "œil|yeux", "nez", "bouche", "oreille", "dent", "cheveux", "visage"] },
      { label: "Corps", words: ["main", "doigt", "pied", "bras", "jambe", "ventre", "dos", "cœur", "cou", "peau"] },
      { label: "Santé", words: ["malade", "douleur|mal", "fièvre", "toux", "blessure", "sang", "dormir", "santé", "guérir"] },
      { label: "Se soigner", words: ["médecin|docteur", "hôpital", "dispensaire", "médicament", "pharmacie", "infirmier"] },
    ],
  },
  {
    id: "maison",
    label: "Maison",
    hue: 40,
    categories: ["maison", "objet", "objets", "vêtement"],
    groups: [
      { label: "La maison", words: ["maison", "porte", "fenêtre", "toit", "chambre", "cuisine", "toilettes", "cour", "lumière"] },
      { label: "Meubles", words: ["lit", "chaise", "table", "natte", "armoire", "matelas"] },
      { label: "Objets", words: ["clé", "téléphone", "sac", "voiture", "seau", "balai", "savon", "télévision"] },
      { label: "Cuisine", words: ["marmite", "assiette", "cuillère", "couteau", "verre", "feu"] },
      { label: "Vêtements", words: ["vêtement", "chaussure", "pantalon", "chemise", "robe", "pagne", "chapeau", "voile"] },
    ],
  },
  {
    id: "nature",
    label: "Nature & animaux",
    hue: 145,
    categories: ["nature", "animal", "animaux", "météo"],
    groups: [
      { label: "Paysages", words: ["mer", "plage", "île", "montagne", "rivière", "forêt", "terre", "arbre", "fleur", "pierre"] },
      { label: "Météo", words: ["soleil", "lune", "étoile", "pluie", "vent", "nuage", "chaud", "froid", "orage"] },
      { label: "Animaux", words: ["chien", "chat", "chèvre", "vache|zébu", "poule", "maki", "roussette", "oiseau", "moustique", "fourmi"] },
      { label: "Lagon & pêche", words: ["lagon", "pêcher", "pêcheur", "pirogue", "bateau", "filet", "vague", "sable", "tortue", "requin"] },
    ],
  },
  {
    id: "lieux",
    label: "Lieux & ville",
    hue: 280,
    categories: ["lieu", "lieux", "ville", "transport"],
    groups: [
      { label: "Endroits", words: ["village", "ville", "quartier", "marché", "mairie", "préfecture", "boutique|magasin", "banque", "poste"] },
      { label: "Transports", words: ["route", "barge", "bus", "taxi", "port", "aéroport", "avion", "moto"] },
      { label: "Directions", words: ["ici", "là-bas", "loin", "près", "gauche", "droite", "devant", "derrière", "en haut", "en bas", "dedans", "dehors"] },
    ],
  },
  {
    id: "argent",
    label: "Argent & achats",
    hue: 110,
    categories: ["argent", "achat", "commerce"],
    groups: [
      { label: "Acheter", words: ["prix", "cher", "pas cher", "combien ça coûte", "rendre la monnaie", "réduction"] },
      { label: "L'argent", words: ["argent", "euro", "monnaie", "billet", "pièce", "dette", "économiser"] },
    ],
  },
  {
    id: "travail",
    label: "Travail & école",
    hue: 230,
    categories: ["travail", "école", "ecole", "métier"],
    groups: [
      { label: "Travail", words: ["travail|boulot", "emploi", "patron", "collègue", "salaire", "bureau", "chômage", "métier"] },
      { label: "École", words: ["école", "élève", "professeur|maître", "classe", "livre", "cahier", "stylo", "examen", "leçon", "devoirs"] },
      { label: "Démarches", words: ["papiers", "carte d'identité", "titre de séjour", "rendez-vous", "dossier", "signature"] },
    ],
  },
  {
    id: "couleurs",
    label: "Couleurs",
    hue: 330,
    categories: ["couleur"],
    groups: [
      { label: "Vives", words: ["rouge", "jaune", "orange", "rose", "violet"] },
      { label: "Douces", words: ["bleu", "vert", "blanc", "noir", "marron", "gris"] },
    ],
  },
  {
    id: "fetes",
    label: "Foi & fêtes",
    hue: 50,
    categories: ["religion", "fête", "fete", "culture"],
    groups: [
      { label: "Foi", words: ["Dieu", "prière", "prier", "mosquée", "Coran", "jeûner", "école coranique"] },
      { label: "Fêtes", words: ["fête", "grand mariage", "anniversaire", "cadeau", "danse", "chanter", "musique", "invité"] },
    ],
  },
  {
    id: "emotions",
    label: "Émotions",
    hue: 60,
    categories: ["émotion", "emotion", "sentiment", "adjectif"],
    groups: [
      { label: "Ressentir", words: ["content|heureux", "triste", "fatigué", "peur", "en colère|fâché", "amour", "joie", "honte", "surpris"] },
      { label: "Décrire", words: ["beau|belle", "bon", "mauvais", "grand", "petit", "gentil", "méchant", "fort", "faible", "propre", "sale"] },
      { label: "Comparer", words: ["nouveau", "facile", "difficile", "rapide", "lent", "vrai", "faux", "plus", "moins"] },
    ],
  },
];

/** Minuscules sans accents ni ponctuation, pour comparer « Sœur » et « soeur ». */
export function normalizeFrench(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `id` : ligne du dictionnaire (awa_words), pour modifier la traduction ; absent pour une expression. */
export type KnownEntry = { id?: string; french: string; shimaore: string; category?: string | null };

/**
 * Bulle de la carte : un thème, un groupe ou un mot. L'arbre peut avoir
 * autant de niveaux qu'on veut ; un mot n'a pas d'enfants.
 */
export type MapNode = {
  id: string;
  label: string;
  hue: number;
  /** Mots du programme appris / à apprendre sous cette bulle (les mots en plus ne comptent pas). */
  learned: number;
  total: number;
  children?: MapNode[];
  /** Branche proposée par Tamilya (bouton « + ») : son emoji. */
  emoji?: string;
  /** Seulement pour un mot : sa traduction (null = à apprendre) et la catégorie où l'enregistrer. */
  word?: {
    french: string;
    shimaore: string | null;
    category: string;
    bonus?: boolean;
    source?: KnownEntry;
    /** Conflit : le mot a plusieurs traductions dans le dictionnaire (au moins deux). */
    translations?: string[];
  };
};

function branch(id: string, label: string, hue: number, children: MapNode[]): MapNode {
  return {
    id,
    label,
    hue,
    children,
    learned: children.reduce((sum, c) => sum + c.learned, 0),
    total: children.reduce((sum, c) => sum + c.total, 0),
  };
}

/** Part apprise d'une bulle ; un groupe de mots en plus (tous appris) est plein. */
export function nodeRatio(node: MapNode): number {
  if (node.word) return node.word.shimaore ? 1 : 0;
  if (node.total) return node.learned / node.total;
  return node.children?.length ? 1 : 0;
}

/** Catégorie enregistrée dans le dictionnaire pour un groupe : « Thème › Groupe » (40 caractères au plus). */
export const groupCategory = (theme: Theme, group: Group) => `${theme.label} › ${group.label}`;

/** Toutes les catégories où Tamilya peut ranger un mot. */
export const ALL_GROUP_CATEGORIES = THEMES.flatMap((theme) => theme.groups.map((group) => groupCategory(theme, group)));

const THEME_BY_LABEL = new Map(THEMES.map((theme) => [normalizeFrench(theme.label), theme]));

/**
 * Où ranger un mot d'après sa catégorie : « Nourriture › Plats », « Nourriture »
 * ou une ancienne catégorie libre (« animaux »). null : à ranger.
 */
export function placeCategory(category: string | null | undefined): { theme: Theme; group: number } | null {
  if (!category?.trim()) return null;
  const [themePart, groupPart] = category.split("›").map(normalizeFrench);
  const theme =
    THEME_BY_LABEL.get(themePart) ??
    THEMES.find((t) => t.categories.some((c) => themePart.includes(normalizeFrench(c))));
  if (!theme) return null;
  return { theme, group: groupPart ? theme.groups.findIndex((g) => normalizeFrench(g.label) === groupPart) : -1 };
}

const MAX_PER_BUBBLE = 14;

/** Trop de mots pour une seule couronne : on les répartit en sous-bulles par ordre alphabétique. */
function paginate(id: string, hue: number, nodes: MapNode[]): MapNode[] {
  if (nodes.length <= MAX_PER_BUBBLE) return nodes;
  const sorted = [...nodes].sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const size = Math.ceil(sorted.length / Math.min(MAX_PER_BUBBLE, Math.ceil(sorted.length / 10)));
  const chunks: MapNode[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const part = sorted.slice(i, i + size);
    const first = part[0].label.charAt(0).toUpperCase();
    const last = part[part.length - 1].label.charAt(0).toUpperCase();
    chunks.push(branch(`${id}-${i}`, first === last ? first : `${first} – ${last}`, hue, paginate(`${id}-${i}`, hue, part)));
  }
  return chunks;
}

/**
 * Entrées d'un même mot français (ses traductions). Un conflit (deux
 * traductions) donne une seule bulle, qui les montre toutes.
 */
type SameWord = ReadonlyMap<string, KnownEntry[]>;

function translationsOf(sameWord: SameWord, entry: KnownEntry | undefined): string[] | undefined {
  if (!entry) return undefined;
  const seen = new Map<string, string>();
  for (const e of sameWord.get(normalizeFrench(entry.french)) ?? []) {
    const key = normalizeFrench(e.shimaore);
    if (key && !seen.has(key)) seen.set(key, e.shimaore.trim());
  }
  return seen.size > 1 ? [...seen.values()] : undefined;
}

const bonusNode = (id: string, hue: number, entry: KnownEntry, category: string, sameWord: SameWord): MapNode => ({
  id,
  label: entry.french,
  hue,
  learned: 0,
  total: 0,
  word: { french: entry.french, shimaore: entry.shimaore, category, bonus: true, source: entry, translations: translationsOf(sameWord, entry) },
});

/**
 * Arbre de la carte : Tamilya → thèmes → groupes → mots. Une cible est apprise si
 * un mot du dictionnaire (ou une expression) a ce sens en français, synonymes
 * compris : « Bonjour ! » compte pour « bonjour ». Tout autre mot appris est
 * rangé selon sa catégorie (dans son groupe, ou « En plus » de son thème) ;
 * sans catégorie connue, il attend dans « À ranger », et les expressions
 * libres dans « Phrases utiles › Apprises en parlant ».
 */
/** Branche ajoutée par le « + » de la carte (table awa_branches) : ses mots attendent leur traduction. */
export type BranchDef = { id: string; label: string; emoji: string; hue: number; reason: string; words: string[] };

export function buildLexiconTree(entries: readonly KnownEntry[], branches: readonly BranchDef[] = []): MapNode {
  const byFrench = new Map<string, KnownEntry>();
  const keysOf = (french: string) => french.split(/[,/;]| ou /).map(normalizeFrench).filter(Boolean);
  const sameWord = new Map<string, KnownEntry[]>();
  for (const entry of entries) {
    for (const key of keysOf(entry.french)) if (!byFrench.has(key)) byFrench.set(key, entry);
    const key = normalizeFrench(entry.french);
    sameWord.set(key, [...(sameWord.get(key) ?? []), entry]);
  }

  // Cibles du programme reconnues ; les entrées utilisées ne sont pas rangées une
  // deuxième fois, ni les autres traductions du même mot (une seule bulle par mot).
  const used = new Set<KnownEntry>();
  const markUsed = (entry: KnownEntry) => {
    for (const e of sameWord.get(normalizeFrench(entry.french)) ?? [entry]) used.add(e);
  };
  const targets = THEMES.map((theme) =>
    theme.groups.map((group) =>
      group.words.map((target) => {
        const options = target.split("|");
        const hit = options.map(normalizeFrench).find((key) => byFrench.has(key));
        const source = hit ? byFrench.get(hit) : undefined;
        if (source) markUsed(source);
        return { french: options[0], source };
      }),
    ),
  );

  // Mots des branches de Tamilya, reconnus de la même façon.
  const branchTargets = branches.map((b) =>
    b.words.map((french) => {
      const key = normalizeFrench(french);
      const source = byFrench.get(key);
      if (source && !used.has(source)) markUsed(source);
      return { french, source };
    }),
  );
  const branchByCategory = new Map(branches.map((b, i) => [normalizeFrench(b.label), i]));
  const branchExtra = branches.map(() => [] as KnownEntry[]);

  // Les autres mots appris, rangés par thème et par groupe (-1 : « En plus »).
  const extra = new Map<string, KnownEntry[]>();
  const toSort: KnownEntry[] = [];
  const spoken: KnownEntry[] = [];
  for (const entry of entries) {
    if (used.has(entry) || !entry.shimaore) continue;
    markUsed(entry);
    const inBranch = branchByCategory.get(normalizeFrench(entry.category ?? ""));
    if (inBranch !== undefined) {
      branchExtra[inBranch].push(entry);
      continue;
    }
    const place = placeCategory(entry.category);
    if (place) {
      const key = `${place.theme.id}:${place.group}`;
      extra.set(key, [...(extra.get(key) ?? []), entry]);
    } else if (entry.id) toSort.push(entry);
    else spoken.push(entry);
  }

  const themes = THEMES.map((theme, t) => {
    const groups = theme.groups.map((group, g) => {
      const id = `${theme.id}-${g}`;
      const words = targets[t][g].map(
        ({ french, source }, w): MapNode => ({
          id: `${id}-${w}`,
          label: french,
          hue: theme.hue,
          learned: source ? 1 : 0,
          total: 1,
          word: { french, shimaore: source?.shimaore ?? null, category: groupCategory(theme, group), source, translations: translationsOf(sameWord, source) },
        }),
      );
      const more = (extra.get(`${theme.id}:${g}`) ?? []).map((entry, i) => bonusNode(`${id}-plus-${i}`, theme.hue, entry, groupCategory(theme, group), sameWord));
      return branch(id, group.label, theme.hue, paginate(id, theme.hue, [...words, ...more]));
    });
    const loose = (extra.get(`${theme.id}:-1`) ?? []).map((entry, i) => bonusNode(`${theme.id}-plus-${i}`, theme.hue, entry, theme.label, sameWord));
    if (theme.id === "phrases" && spoken.length) {
      loose.push(...spoken.map((entry, i) => bonusNode(`phrases-parle-${i}`, theme.hue, entry, theme.label, sameWord)));
    }
    if (loose.length) groups.push(branch(`${theme.id}-plus`, theme.id === "phrases" ? "Apprises en parlant" : "En plus", theme.hue, paginate(`${theme.id}-plus`, theme.hue, loose)));
    return branch(theme.id, theme.label, theme.hue, groups);
  });

  branches.forEach((b, i) => {
    const id = `branche-${b.id}`;
    const words = branchTargets[i].map(
      ({ french, source }, w): MapNode => ({
        id: `${id}-${w}`,
        label: french,
        hue: b.hue,
        learned: source ? 1 : 0,
        total: 1,
        word: { french, shimaore: source?.shimaore ?? null, category: b.label, source, translations: translationsOf(sameWord, source) },
      }),
    );
    const more = branchExtra[i].map((entry, k) => bonusNode(`${id}-plus-${k}`, b.hue, entry, b.label, sameWord));
    themes.push({ ...branch(id, b.label, b.hue, paginate(id, b.hue, [...words, ...more])), emoji: b.emoji });
  });

  if (toSort.length) {
    const nodes = toSort.map((entry, i) => bonusNode(`ranger-${i}`, 260, entry, "", sameWord));
    themes.push(branch("ranger", "À ranger", 260, paginate("ranger", 260, nodes)));
  }
  return branch("awa", "Tamilya", 320, themes);
}
