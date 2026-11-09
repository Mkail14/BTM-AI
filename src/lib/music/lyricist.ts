import "server-only";
import { geminiHeaders, geminiRoot, listKeyModels, thinkingSettings } from "@/lib/ai/providers/gemini";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";
import { parseSongSpec, type SongSpec } from "./intent";
import { frenchShare, scoreLyrics, type LyricScore } from "./lyric-score";
import { SONGWRITING } from "./songwriting";

/**
 * Le parolier : avant que Lyria chante, Flash réécrit les paroles de Tamilya deux fois, en même
 * temps, puis le code garde la meilleure des trois (src/lib/music/lyric-score.ts), sans appel de plus.
 *
 * Demande de l'utilisateur (2026-11-09) : les paroles « sentent l'IA », mais il veut « un truc
 * rapide et efficace » (pas Gemini Pro, trop lent). Paroles dans une autre langue que le français
 * (shimaoré…) : jamais réécrites, Flash pourrait inventer des mots.
 */

const FLASH = /^gemini-[\d.]+-flash$/;
/** Au-delà, on chante la version de Tamilya : Lyria prend déjà 20 à 50 s. */
export const LYRICIST_TIMEOUT_MS = 7_000;

/** Deux angles différents, pour avoir de vraies alternatives. */
export const LYRICIST_ANGLES = [
  "Priorité : des images concrètes et précises, des rimes riches (deux syllabes ou plus), aucun mot vague.",
  "Priorité : du punch et du rythme, des vers de même longueur faciles à chanter, une chute qui surprend.",
];

export function lyricistPrompt(spec: SongSpec, angle: string): string {
  return `Tu es un parolier professionnel. Réécris ces paroles de chanson pour qu'elles sonnent comme écrites par un humain de talent, pas par une IA.

Style de la chanson : ${spec.style || "libre"}

Paroles à réécrire :
${spec.lyrics}

${SONGWRITING}

${angle}
- Garde le sujet, la langue, le ton et le genre demandés, et les mêmes balises ([Couplet], [Refrain]…) dans le même ordre.
- Même longueur à peu près : 24 vers au plus, 1 100 caractères au plus. Un refrain répété reste identique.
- Réponds seulement avec les paroles, sans titre, sans style, sans commentaire.`;
}

type Reply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

async function rewrite(spec: SongSpec, angle: string, model: string, key: { apiKey: string; baseUrl: string | undefined }, signal: AbortSignal): Promise<SongSpec | null> {
  try {
    const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: geminiHeaders(key.apiKey),
      body: JSON.stringify({
        contents: [{ parts: [{ text: lyricistPrompt(spec, angle) }] }],
        generationConfig: { temperature: 1, maxOutputTokens: 2_048, thinkingConfig: thinkingSettings(model)[0] },
      }),
      signal,
    });
    if (!response.ok) {
      console.error("[chanson] Parolier", model, response.status);
      return null;
    }
    const json = (await response.json()) as Reply;
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .replace(/^```\w*\n?|```$/g, "")
      .replace(/^\s*style\s*:.*$/im, "")
      .trim();
    // Le style de Tamilya est gardé : les nouveaux essais en cas de refus de Google en dépendent.
    const parsed = parseSongSpec(`style: ${spec.style}\n${text}`);
    return parsed ? { style: spec.style, lyrics: parsed.lyrics } : null;
  } catch (error) {
    if (!signal.aborted) console.error("[chanson] Parolier", model, error);
    return null;
  }
}

export type LyricChoice = { spec: SongSpec; pick: number; scores: LyricScore[]; ms: number };

/** La meilleure version : celle de Tamilya (0) ou une réécriture (1, 2). Jamais d'erreur. */
export async function bestLyrics(spec: SongSpec, parent: AbortSignal): Promise<LyricChoice> {
  const started = Date.now();
  const keep = (): LyricChoice => ({ spec, pick: 0, scores: [scoreLyrics(spec.lyrics)], ms: Date.now() - started });
  if (frenchShare(spec.lyrics) < 0.2) return keep();
  try {
    const signal = AbortSignal.any([parent, AbortSignal.timeout(LYRICIST_TIMEOUT_MS)]);
    const key = await geminiKey();
    const available = await listKeyModels(key, signal);
    const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
    const model = available.filter((id) => FLASH.test(id)).sort((a, b) => version(b) - version(a))[0] ?? "gemini-2.5-flash";
    const drafts = await Promise.all(LYRICIST_ANGLES.map((angle) => rewrite(spec, angle, model, key, signal)));
    const versions = [spec, ...drafts.filter((d): d is SongSpec => d !== null)];
    const scores = versions.map((v) => scoreLyrics(v.lyrics));
    const pick = pickBest(scores);
    return { spec: versions[pick], pick, scores, ms: Date.now() - started };
  } catch (error) {
    console.error("[chanson] Parolier indisponible", error);
    return keep();
  }
}

/** Indice de la meilleure note ; à égalité, la version de Tamilya. */
export function pickBest(scores: LyricScore[]): number {
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i].score > scores[best].score) best = i;
  return best;
}
