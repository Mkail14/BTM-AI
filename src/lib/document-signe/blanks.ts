/**
 * Cases à remplir et place de la signature, lues dans le texte d'un document
 * (PDF ou Word), ligne par ligne. Sans dépendance : sert au navigateur, au
 * serveur et aux tests.
 *
 * Une case, c'est un libellé suivi de pointillés ou de traits (« Nom : ........ »),
 * ou un libellé qui finit la ligne par deux-points (« Nom : »), la ligne étant
 * alors souvent dessinée à côté.
 */

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Pointillés ou traits de soulignement : au moins 4, espacés ou non (« .... », « _ _ _ _ », « …… »). */
const RUN = /(?:[._…](?:\s?)){4,}/g;
const MAX_LABEL = 48;

export type BlankSpot = {
  /** Libellé tel qu'écrit (« Né(e) le »). */
  label: string;
  /** Début et fin des pointillés dans la ligne ; sans pointillés, tous deux à la fin de la ligne. */
  start: number;
  end: number;
};

const cleanLabel = (text: string) =>
  text
    .replace(/[\s:]+$/g, "")
    .replace(/^[\s:,;]+/g, "")
    .slice(-MAX_LABEL)
    .trim();

const isSignatureLabel = (label: string) => /\bsignature|\bsigne\b|\bvisa\b/.test(normalize(label));

/** Les cases d'une ligne, de gauche à droite. Les cases de signature n'en font pas partie. */
export function blanksInLine(line: string): BlankSpot[] {
  const spots: BlankSpot[] = [];
  let from = 0;
  for (const match of line.matchAll(RUN)) {
    const start = match.index;
    const end = start + match[0].trimEnd().length;
    const label = cleanLabel(line.slice(from, start));
    from = start + match[0].length;
    if (isSignatureLabel(label)) continue;
    spots.push({ label, start, end });
  }
  if (spots.length || from > 0) return spots;
  // « Nom : » en fin de ligne, sans pointillés : la case est juste après.
  const open = /^(.{2,48}?)\s*:\s*$/.exec(line);
  if (open && !isSignatureLabel(open[1]) && /[a-z]/i.test(open[1])) {
    return [{ label: cleanLabel(open[1]), start: line.length, end: line.length }];
  }
  return [];
}

export type Blank = {
  /** Numéro de ligne, puis position dans la ligne. */
  line: number;
  spot: BlankSpot;
  /** Libellé affiché : une ligne sans libellé reprend celui d'au-dessus (« Adresse (suite) »). */
  label: string;
  /** La ligne entière, pour aider à comprendre de qui il s'agit. */
  context: string;
};

/** Toutes les cases du document, dans l'ordre. */
export function findBlanks(lines: readonly string[]): Blank[] {
  const blanks: Blank[] = [];
  lines.forEach((text, line) => {
    for (const spot of blanksInLine(text)) {
      const previous = blanks.at(-1);
      const label = spot.label || (previous ? `${previous.label.replace(/ \(suite\)$/, "")} (suite)` : "Case libre");
      blanks.push({ line, spot, label, context: text.replace(RUN, " … ").replace(/\s+/g, " ").trim() });
    }
  });
  return blanks;
}

/**
 * Ligne où signer : la dernière qui parle de signature (souvent « Signature : » en bas),
 * en préférant une ligne courte à une phrase du texte. -1 s'il n'y en a pas.
 */
export function findSignatureLine(lines: readonly string[]): number {
  let best = -1;
  lines.forEach((text, index) => {
    const t = normalize(text);
    if (!/\bsignature|lu et approuve|\bsigne\b/.test(t) || /signature electronique/.test(t)) return;
    if (t.length <= 70 || best < 0) best = index;
  });
  return best;
}

/** Ce que le compte connaît de la personne. */
export type PersonInfo = {
  civility?: string;
  firstName?: string;
  lastName?: string;
  /** AAAA-MM-JJ. */
  birthDate?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
};

/** AAAA-MM-JJ → JJ/MM/AAAA ; le reste ne change pas. */
export const frenchDate = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
};

/** Réponse de l'IA : un tableau JSON de chaînes, même entouré de texte ou de ```json. */
export function parseFillValues(output: string, count: number): string[] | null {
  const match = /\[[\s\S]*\]/.exec(output);
  if (!match) return null;
  try {
    const values: unknown = JSON.parse(match[0]);
    if (!Array.isArray(values)) return null;
    return Array.from({ length: count }, (_, i) => (typeof values[i] === "string" ? values[i].trim().slice(0, 200) : ""));
  } catch {
    return null;
  }
}

/**
 * Valeur évidente d'une case d'après son libellé (« Prénom », « Fait à », « Le »).
 * Vide quand on ne sait pas : mieux vaut une case vide qu'une erreur sur un papier officiel.
 */
export function guessValue(label: string, info: PersonInfo, today: string): string {
  const t = normalize(label).replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
  const full = [info.lastName, info.firstName].filter(Boolean).join(" ");
  if (/\bsuite\b/.test(t)) return "";
  if (/\bnom\b.*\bprenom|\bprenom\b.*\bnom\b|^nom complet$|^identite$/.test(t)) return full;
  if (/prenom/.test(t)) return info.firstName ?? "";
  if (/^(?:mon |votre )?nom(?: de famille| d usage| de naissance)?$/.test(t)) return info.lastName ?? "";
  if (/^civilite$/.test(t)) return info.civility ?? "";
  if (/^nee?(?: le)?$|^ne le|date de naissance/.test(t)) return info.birthDate ? frenchDate(info.birthDate) : "";
  if (/code postal|^cp$/.test(t)) return info.postalCode ?? "";
  if (/adresse|demeurant|domicil/.test(t) && !/mail|electronique/.test(t)) {
    return [info.address, [info.postalCode, info.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  if (/^(?:ville|commune)(?: de residence)?$|^fait a$|^a$/.test(t)) return info.city ?? "";
  if (/^(?:le|date|fait le|date du jour|en date du)$/.test(t)) return frenchDate(today);
  if (/telephone|^tel\b|portable|mobile/.test(t)) return info.phone ?? "";
  if (/e ?-?mail|courriel|adresse electronique/.test(t)) return info.email ?? "";
  return "";
}
