/**
 * Jour et moment voulus pour l'examen du code, lus dans le message de la
 * personne (« demain », « vendredi matin », « le 12 novembre »…), à l'heure
 * de Mayotte. Calculé par le serveur et non par le modèle : les modèles se
 * trompent souvent de date. Le tableau des créneaux s'ouvre sur ce jour.
 * Utilisable côté navigateur.
 */

export type Moment = "matin" | "apres-midi";
export type CodeExamWhen = { day: string | null; moment: Moment | null };

const TZ = "Indian/Mayotte";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim()} `;

/** « 2026-11-03 » du jour à Mayotte, décalé de `days` jours. */
function keyOf(now: Date, days: number) {
  const [y, m, d] = dayKey.format(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * « AAAA-MM-JJ » si ce jour existe dans ce mois, sinon null : « 31/02 » ou « le 31 »
 * en novembre ne glissent pas au mois suivant. Un mois 13 est janvier de l'année suivante.
 */
function validKey(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

export function parseCodeExamWhen(message: string, now = new Date()): CodeExamWhen {
  const t = normalize(message);
  const moment: Moment | null = / (?:matin|matinee|tot) /.test(t) ? "matin" : / (?:apres midi|aprem|apres-midi|soir|tard) /.test(t) ? "apres-midi" : null;

  let day: string | null = null;
  if (/ apres demain /.test(t)) day = keyOf(now, 2);
  else if (/ demain /.test(t)) day = keyOf(now, 1);
  else if (/ (?:aujourd hui|aujourdhui|ce jour) /.test(t)) day = keyOf(now, 0);
  else {
    // « le 12 », « 12 novembre », « 12/11 »
    const dated = t.match(/ (?:le )?(\d{1,2})(?:er)?(?: (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)|\/(\d{1,2}))? /);
    const weekday = WEEKDAYS.findIndex((w) => t.includes(` ${w} `));
    if (dated && (dated[2] || dated[3] || / le \d/.test(t))) {
      const today = keyOf(now, 0);
      const [y, m] = today.split("-").map(Number);
      const dayNumber = Number(dated[1]);
      const month = dated[2] ? MONTHS.indexOf(dated[2]) + 1 : dated[3] ? Number(dated[3]) : m;
      if (dayNumber >= 1 && dayNumber <= 31 && month >= 1 && month <= 12) {
        let key = validKey(y, month, dayNumber);
        // Date déjà passée : l'an prochain (avec un mois donné) ou le mois prochain.
        if (key && key < today) key = dated[2] || dated[3] ? validKey(y + 1, month, dayNumber) : validKey(y, month + 1, dayNumber);
        // Jour qui n'existe pas (31 novembre, 30 février) : aucun jour choisi plutôt qu'un mauvais.
        day = key;
      }
    } else if (weekday >= 0) {
      // « mardi », « mardi prochain » : le prochain mardi après aujourd'hui.
      const ahead = (weekday - weekdayOf(keyOf(now, 0)) + 7) % 7 || 7;
      day = keyOf(now, ahead);
    }
  }
  return { day, moment };
}

const longDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** « mardi 3 novembre » pour un jour « 2026-11-03 ». */
export const formatWhenDay = (day: string) => longDay.format(new Date(`${day}T12:00:00Z`));

/**
 * Ajoute le jour et le moment au bloc ```creneaux-code``` d'une réponse
 * (lignes « jour: … » et « moment: … » sous le nom du bureau).
 */
export function addWhenToBlock(text: string, when: CodeExamWhen): string {
  if (!when.day && !when.moment) return text;
  return text.replace(/```creneaux-code\n([\s\S]*?)```/, (_, inner: string) => {
    const office = inner.split("\n").find((line) => line.trim() && !/^(?:jour|moment)\s*:/i.test(line.trim()))?.trim() ?? "";
    const lines = [office, when.day ? `jour: ${when.day}` : null, when.moment ? `moment: ${when.moment}` : null].filter((l) => l !== null);
    return `\`\`\`creneaux-code\n${lines.join("\n")}\n\`\`\``;
  });
}

/** Contenu du bloc lu par le tableau : bureau, puis jour et moment s'ils y sont. */
export function readCodeExamBlock(content: string): { office: string; when: CodeExamWhen } {
  const lines = content.split("\n").map((l) => l.trim());
  const value = (name: string) => lines.find((l) => l.toLowerCase().startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? null;
  const day = value("jour");
  const moment = value("moment");
  return {
    office: lines.find((l) => l && !/^(?:jour|moment)\s*:/i.test(l)) ?? "",
    when: {
      day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
      moment: moment === "matin" || moment === "apres-midi" ? moment : null,
    },
  };
}
