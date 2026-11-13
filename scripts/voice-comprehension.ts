/**
 * Mesure si Tamilya fait ce qu'on lui demande à l'oral, sans questions avant :
 * mêmes consignes que le vocal en direct, réponses du modèle écrit de la chaîne
 * (Gemini par le relais du site ; le modèle vocal, lui, n'est joignable qu'en direct).
 *
 *   NODE_ENV=development node --conditions=react-server --env-file=.env.local --import tsx scripts/voice-comprehension.ts [essais]
 */
import { knowledgeFor, lexiconFor, loadTamilyaBrain, wordsFor } from "@/lib/ai/brain";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { createRelayProvider, relayUrl } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { listeningRules } from "@/lib/voice-live/listening";
import { LIVE_PRIORITY, LIVE_RULES } from "@/lib/voice-live/rules";

/** say : ce qu'elle doit produire tout de suite. before : la conversation déjà tenue. */
const CASES: { name: string; say: string; before?: string[] }[] = [
  { name: "chanson jazz", say: "chante-moi une musique mahoraise type jazz" },
  { name: "chanson mal entendue", say: "chante moi une music maoraise tipe jaze" },
  { name: "chanson courte", say: "chante" },
  { name: "rap", say: "fais-moi un rap sur la barge" },
  { name: "blague", say: "raconte-moi une blague" },
  { name: "histoire", say: "raconte une petite histoire de Mayotte" },
  { name: "encore", say: "encore une autre", before: ["chante-moi un truc", "Dans le lagon bleu, la barge s'en va, ewa ewa, Mayotte est là !"] },
];

const firstSpoken = (text: string) => text.split(/(?<=[.!?…])\s/)[0] ?? "";

void (async () => {
  const tries = Number(process.argv[2]) || 3;
  // Gemini seulement, par le relais du site en ligne (Google refuse les appels directs depuis Mayotte).
  const url = relayUrl();
  const secret = keysSecret();
  if (!url || !secret) throw new Error("Il faut AI_RELAY_URL, AI_KEYS_SECRET et NODE_ENV=development.");
  const provider = createRelayProvider(url, secret);
  const brain = await loadTamilyaBrain();
  const system = [
    buildSystemPrompt(DEFAULT_PERSONALITY, {
      personalityInstructions: await loadPersonalityInstructions(DEFAULT_PERSONALITY).catch(() => undefined),
      identity: brain.identity,
      rules: brain.rules,
      lexicon: lexiconFor(brain, DEFAULT_PERSONALITY, ""),
      grammar: brain.grammar,
      words: wordsFor(brain, "", false),
      knowledge: knowledgeFor(brain, ""),
      teacher: false,
      voice: true,
    }),
    LIVE_RULES,
    listeningRules([]),
    LIVE_PRIORITY,
  ].join("\n\n");
  console.log(`Gemini par le relais ; consignes : ${system.length} caractères\n`);

  let asked = 0;
  let greeted = 0;
  let total = 0;
  for (const item of CASES) {
    for (let i = 0; i < tries; i++) {
      const history = (item.before ?? []).map((content, n) => ({ role: n % 2 ? ("assistant" as const) : ("user" as const), content }));
      let text = "";
      try {
        for await (const chunk of provider.stream({
          system,
          messages: [...history, { role: "user", content: item.say }],
          maxOutputTokens: 800,
          signal: AbortSignal.timeout(60_000),
          persona: true,
          fast: true,
          model: process.env.BENCH_MODEL || "gemini-3.8-flash",
        })) {
          if (chunk.type === "text") text += chunk.text;
        }
      } catch (error) {
        console.log(`${item.name} #${i + 1} ERREUR ${error instanceof Error ? error.message.slice(0, 120) : error}`);
        continue;
      }
      const clean = text.trim().replace(/\s+/g, " ");
      const words = clean.split(" ").length;
      // Elle a posé une question au lieu de faire : réponse courte qui se termine sur « ? », ou début en question.
      const question = (words < 45 && /\?\s*\S*$/.test(clean)) || firstSpoken(clean).endsWith("?");
      total += 1;
      if (question) asked += 1;
      if (/^(Tamilya\s*:\s*)?(Kwezi|Salut|Bonjour|Jéjé|Moi c'est)/i.test(clean)) greeted += 1;
      console.log(`${item.name} #${i + 1} ${question ? "QUESTION" : "fait"} ${words} mots : ${clean.slice(0, 170)}`);
    }
  }
  console.log(`\nQuestions au lieu de faire : ${asked} sur ${total} ; saluts inutiles : ${greeted} sur ${total}`);
})();
