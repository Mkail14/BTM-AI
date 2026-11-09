import { geminiHeaders, geminiRoot } from "@/lib/ai/providers/gemini";
import { usableSounds, type CatalogSound } from "./catalog";

/**
 * Le conteur : pour une histoire demandée, Gemini Pro l'écrit d'abord, seule, sans s'occuper
 * de la scène. Puis Tamilya (Flash, /api/lecture) la découpe en répliques et place voix et sons.
 * Pro écrit mieux que Flash ; s'il n'est pas dispo (quota, lenteur), on revient à Flash seul.
 */

/** Pro stable (ni preview, ni image), du plus récent au plus ancien. */
const PRO = /^gemini-[\d.]+-pro$/;
/** Au-delà, on laisse tomber le conteur : Flash inventera l'histoire comme avant. */
export const WRITER_TIMEOUT_MS = 15_000;

export function pickWriterModels(available: string[]): string[] {
  const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
  return available.filter((id) => PRO.test(id)).sort((a, b) => version(b) - version(a)).slice(0, 2);
}

/** Pro réfléchit toujours : le moins possible, pour tenir dans les 15 s. */
const thinkingFor = (model: string) =>
  Number(model.match(/^gemini-(\d+)/)?.[1] ?? 0) >= 3 ? { thinkingLevel: "low" } : { thinkingBudget: 128 };

export function writerPrompt(request: string, catalog: CatalogSound[]): string {
  const sounds = usableSounds(catalog)
    .filter((s) => s.kind !== "musique")
    .map((s) => s.name)
    .join(", ");
  return `Tu es un grand conteur. Écris une histoire originale qui sera lue à voix haute, écoutée les yeux fermés au casque.

Demande de la personne : « ${request} »

- 250 à 450 mots. Un début qui accroche dès la première phrase, un moment fort, une vraie fin.
- Jamais une histoire existante ni ses personnages.
- Suis la demande (sujet, genre, âge, lieu, langue). Le lieu et l'époque sont libres ; Mayotte seulement si la demande en parle. En français, sauf si elle demande une autre langue (en shimaoré, seulement avec des mots que tu connais vraiment).
- Sans genre demandé, choisis celui qui va au sujet. La peur seulement si on la demande ou si le sujet l'appelle.
- Chaque genre a son ton : drôle (malentendus, chute qui fait rire, rythme vif), aventure (un but, des obstacles, de l'élan), conte (le merveilleux, une morale douce), pour dormir (lent, rassurant, la fin s'apaise), émotion (ce que ressentent les personnages), mystère (des indices, la réponse à la fin), peur (la tension qui monte, la surprise).
- Écris pour l'oreille : deux à quatre personnages qui se parlent beaucoup (des répliques courtes et vivantes, chacun sa façon de parler), qui bougent, et des bruits qu'on entend (idées : ${sounds || "pas, porte, vent, rire"}). Montre, ne résume pas : des détails qu'on voit, qu'on entend, qu'on sent.
- Phrases simples, faciles à dire à voix haute. Pas de titre, pas de mise en forme, pas de commentaire : seulement le texte de l'histoire, avec les paroles entre guillemets « ».`;
}

type Reply = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };

/** L'histoire écrite par Pro, ou null s'il n'a pas pu (on retombe alors sur Flash seul). */
export async function writeStory(
  request: string,
  catalog: CatalogSound[],
  key: { apiKey: string; baseUrl: string | undefined },
  available: string[],
  parent: AbortSignal,
): Promise<string | null> {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(WRITER_TIMEOUT_MS)]);
  for (const model of pickWriterModels(available)) {
    try {
      const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: geminiHeaders(key.apiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ text: writerPrompt(request, catalog) }] }],
          generationConfig: { temperature: 1, maxOutputTokens: 8_192, thinkingConfig: thinkingFor(model) },
        }),
        signal,
      });
      if (!response.ok) {
        console.error("[lecture] Conteur", model, response.status, (await response.text().catch(() => "")).slice(0, 300));
        continue;
      }
      const json = (await response.json()) as Reply;
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (text.length >= 200) return text;
    } catch (error) {
      if (parent.aborted) return null;
      console.error("[lecture] Conteur", model, error);
      if (signal.aborted) return null;
    }
  }
  return null;
}
