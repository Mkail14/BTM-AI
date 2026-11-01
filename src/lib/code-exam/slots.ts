/**
 * Créneaux de l'examen du code de la route dans les centres La Poste de Mayotte.
 *
 * ESSAI : les horaires sont fictifs, calculés ici. Pour brancher les vrais
 * créneaux, il suffit de remplacer listSlots() : l'API, le tableau du chat et
 * les réservations ne dépendent que de son résultat.
 */

export const CODE_EXAM_DEMO = true;

export type CodeExamCenter = { id: string; name: string };

export const CODE_EXAM_CENTERS: readonly CodeExamCenter[] = [
  { id: "mamoudzou", name: "Mamoudzou" },
  { id: "dzaoudzi", name: "Dzaoudzi (Petite-Terre)" },
  { id: "sada", name: "Sada" },
  { id: "dembeni", name: "Dembéni" },
];

/** Créneau proposé ; `startsAt` en ISO avec le fuseau de Mayotte (« 2026-11-03T09:00:00+03:00 »). */
export type CodeExamSlot = { centerId: string; startsAt: string; full: boolean };

const DAYS_AHEAD = 14;
const WEEKDAY_TIMES = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00"];
const SATURDAY_TIMES = ["08:00", "09:00", "10:00"];

/** Petit hachage stable : mêmes créneaux à chaque appel pour un même jour. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Date du jour à Mayotte (UTC+3, sans heure d'été), décalée de `offset` jours. */
function mayotteDay(now: Date, offset: number) {
  const d = new Date(now.getTime() + 3 * 3_600_000 + offset * 86_400_000);
  return { iso: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

/** Créneaux des 14 prochains jours (à partir de demain), du lundi au samedi matin. */
export function listSlots(now = new Date()): CodeExamSlot[] {
  const slots: CodeExamSlot[] = [];
  for (let offset = 1; offset <= DAYS_AHEAD; offset++) {
    const { iso, weekday } = mayotteDay(now, offset);
    if (weekday === 0) continue;
    const times = weekday === 6 ? SATURDAY_TIMES : WEEKDAY_TIMES;
    for (const [index, center] of CODE_EXAM_CENTERS.entries()) {
      for (const time of times) {
        const startsAt = `${iso}T${time}:00+03:00`;
        const h = hash(`${center.id}|${startsAt}`);
        // Les petits centres ouvrent moins de séances.
        if (index > 0 && h % (index + 2) === 0) continue;
        slots.push({ centerId: center.id, startsAt, full: h % 5 === 0 });
      }
    }
  }
  return slots;
}

/** Même instant, quelle que soit l'écriture (« Z » ou « +03:00 »). */
export const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

export function findSlot(centerId: string, startsAt: string, now = new Date()): CodeExamSlot | null {
  return listSlots(now).find((s) => s.centerId === centerId && sameInstant(s.startsAt, startsAt)) ?? null;
}

export const centerName = (id: string) => CODE_EXAM_CENTERS.find((c) => c.id === id)?.name ?? id;
