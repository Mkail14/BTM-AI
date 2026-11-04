/** Commandes programmées : heures de livraison proposées (heure de Mayotte, UTC+3). */

const SLOT_MS = 30 * 60_000;
/** Jusqu'à quand on peut programmer. */
export const SCHEDULE_MAX_AHEAD_MS = 48 * 3600_000;
/** Heures de livraison possibles (heure de Mayotte) : de 11 h à 22 h. */
const FIRST_HOUR = 11;
const LAST_HOUR = 22;
const MAYOTTE_OFFSET_H = 3;

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", timeZone: "Indian/Mayotte" });
const dayKey = new Intl.DateTimeFormat("fr-CA", { timeZone: "Indian/Mayotte" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/** Heure de Mayotte (0–23,5) d'un instant. */
function localHour(ms: number) {
  const d = new Date(ms);
  return ((d.getUTCHours() + MAYOTTE_OFFSET_H) % 24) + d.getUTCMinutes() / 60;
}

/** Vrai si l'heure demandée est une heure de livraison possible. */
export function isSchedulable(ms: number, now: number, minLeadMinutes: number) {
  const h = localHour(ms);
  return ms >= now + minLeadMinutes * 60_000 && ms <= now + SCHEDULE_MAX_AHEAD_MS && h >= FIRST_HOUR && h <= LAST_HOUR;
}

/** Créneaux de 30 min proposés, à partir du temps de préparation et de trajet. */
export function deliverySlots(now: number, minLeadMinutes: number): number[] {
  const slots: number[] = [];
  let t = Math.ceil((now + minLeadMinutes * 60_000) / SLOT_MS) * SLOT_MS;
  for (; t <= now + SCHEDULE_MAX_AHEAD_MS; t += SLOT_MS) if (isSchedulable(t, now, minLeadMinutes)) slots.push(t);
  return slots;
}

/** « Aujourd'hui », « Demain » ou « jeudi 6 ». */
export function dayLabel(ms: number, now = Date.now()) {
  const key = dayKey.format(ms);
  if (key === dayKey.format(now)) return "Aujourd'hui";
  if (key === dayKey.format(now + 86_400_000)) return "Demain";
  const label = dayFmt.format(ms);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const slotTime = (ms: number) => timeFmt.format(ms);
export const slotDay = (ms: number) => dayKey.format(ms);
