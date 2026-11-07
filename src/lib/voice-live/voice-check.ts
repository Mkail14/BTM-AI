/**
 * Décision « est-ce bien la voix du titulaire ? », partagée par le téléphone
 * (qui prépare l'échantillon) et le serveur (qui décide, voir /api/wallet/pin).
 *
 * Seuils mesurés le 2026-11-07 sur de vraies voix d'hommes (jeu public sr-data,
 * modèle allégé) : voix inscrite (3 phrases) contre la moyenne de phrases d'au
 * moins 1 s. Avec 3 s au total : même personne 0,55 à 0,77, autre 0,36 au plus.
 * À 2 s : même 0,29 à 0,73, autre 0,38 au plus. Un micro de téléphone dans le
 * bruit fera baisser ces chiffres : seuils à revoir après les essais réels.
 */

import { normalize, similarity } from "./speaker";

/** Taille d'une empreinte (WeSpeaker ResNet34). */
export const PRINT_SIZE = 256;
/** En dessous, pas assez de voix pour décider : Tamilya demande une phrase. */
export const MIN_SECONDS = 2.5;
/** Au-dessus : c'est la personne. */
export const ACCEPT = 0.45;
/** En dessous : ce n'est pas la personne. Entre les deux : pas sûre, une phrase de plus. */
export const REJECT = 0.3;
/** Une phrase d'au moins 1,5 s nettement étrangère suffit à refuser (quelqu'un d'autre a parlé). */
export const PART_SECONDS = 1.5;
export const PART_REJECT = 0.2;

/** Ce que le téléphone envoie : une empreinte par phrase entendue (jamais le son). */
export type VoiceSample = { parts: { print: number[]; seconds: number }[] };

export type VoiceVerdict =
  | { ok: true; score: number }
  | { ok: false; reason: "short" | "unsure" | "mismatch"; score?: number };

export function isValidPrint(print: unknown): print is number[] {
  return Array.isArray(print) && print.length === PRINT_SIZE && print.every((v) => typeof v === "number" && Number.isFinite(v));
}

/** Moyenne pondérée par la durée : une longue phrase compte plus qu'un « oui ». */
export function combine(parts: VoiceSample["parts"]): number[] {
  const sum = new Array<number>(PRINT_SIZE).fill(0);
  for (const part of parts) {
    const unit = normalize(part.print);
    for (let i = 0; i < PRINT_SIZE; i++) sum[i] += unit[i] * Math.max(part.seconds, 0);
  }
  return normalize(sum);
}

export function judgeVoice(enrolled: number[], sample: VoiceSample): VoiceVerdict {
  const parts = sample.parts.filter((p) => isValidPrint(p.print) && p.seconds > 0);
  const seconds = parts.reduce((sum, p) => sum + p.seconds, 0);
  // Une phrase assez longue, clairement d'une autre voix : refus, même si le reste ressemble.
  for (const part of parts) {
    if (part.seconds >= PART_SECONDS && similarity(enrolled, part.print) < PART_REJECT) return { ok: false, reason: "mismatch", score: similarity(enrolled, part.print) };
  }
  if (seconds < MIN_SECONDS) return { ok: false, reason: "short" };
  const score = similarity(enrolled, combine(parts));
  if (score >= ACCEPT) return { ok: true, score };
  return { ok: false, reason: score < REJECT ? "mismatch" : "unsure", score };
}
