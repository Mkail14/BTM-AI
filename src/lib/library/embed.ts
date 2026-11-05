import "server-only";
import { geminiHeaders, geminiRoot } from "@/lib/ai/providers/gemini";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";

/**
 * Empreintes de sens (vecteurs de 768 nombres) par Gemini, avec la clé déjà
 * utilisée. Depuis le poste local, Google refuse Mayotte : ça ne marche qu'en ligne.
 */

const model = () => process.env.AI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
const DIMENSIONS = 768;
const BATCH = 50;

type Task = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(texts: string[], task: Task, signal: AbortSignal): Promise<number[][]> {
  const key = await geminiKey();
  const name = `models/${model()}`;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const response = await fetch(`${geminiRoot(key.baseUrl)}/${name}:batchEmbedContents`, {
      method: "POST",
      headers: geminiHeaders(key.apiKey),
      body: JSON.stringify({
        requests: texts.slice(i, i + BATCH).map((text) => ({
          model: name,
          content: { parts: [{ text }] },
          taskType: task,
          outputDimensionality: DIMENSIONS,
        })),
      }),
      signal,
    });
    if (!response.ok) throw new Error(`Empreintes refusées (${response.status}) ${(await response.text().catch(() => "")).slice(0, 200)}`);
    const json = (await response.json()) as { embeddings?: { values?: number[] }[] };
    for (const item of json.embeddings ?? []) vectors.push(item.values ?? []);
  }
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== DIMENSIONS)) throw new Error("Empreintes incomplètes.");
  return vectors;
}
