/**
 * Essai du cerveau local : Tamilya répond aux messages écrits avec un modèle gratuit sur ce PC (Ollama).
 * Vraie consigne de Tamilya, vrai cerveau (Supabase). Mesure le temps et montre les réponses.
 *
 *   NODE_ENV=development node --conditions=react-server --env-file=.env.local --import tsx scripts/essai-cerveau-local.ts gemma3:4b [court]
 *
 * « court » : consigne réduite (identité + shimaoré utile au message), pour voir le gain de vitesse.
 */
import { glossFor, knowledgeFor, lexiconFor, loadTamilyaBrain, wordsFor } from "../src/server/services/ai/brain";
import { loadPersonalityInstructions } from "../src/server/services/ai/personality-store";
import { createOpenAICompatibleProvider } from "../src/server/services/ai/providers/openai-compatible";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import fs from "node:fs";

const MESSAGES = [
  "Bonjour Tamilya, comment tu vas ?",
  "Comment on dit « j'ai faim » en shimaoré ?",
  "Je dois aller à Petite-Terre demain matin, tu me conseilles quoi ?",
  "Mon fils ne veut pas faire ses devoirs, je fais comment ?",
  "Wawe ni mwana wa ha ?",
];

void (async () => {
  const model = process.argv[2] ?? "gemma3:4b";
  const short = process.argv[3] === "court";
  const provider = createOpenAICompatibleProvider({
    provider: "openai-compatible",
    apiKey: "ollama",
    model,
    baseUrl: "http://127.0.0.1:11434/v1",
    maxOutputTokens: 400,
    timeoutMs: 600_000,
    effort: "low",
  } as never);
  const brain = await loadTamilyaBrain();
  const personalityInstructions = await loadPersonalityInstructions(DEFAULT_PERSONALITY);
  const rows = [];

  for (const message of MESSAGES) {
    const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
      personalityInstructions: personalityInstructions ?? undefined,
      identity: brain.identity,
      rules: brain.rules,
      lexicon: lexiconFor(brain, message),
      grammar: short ? [] : brain.grammar,
      words: wordsFor(brain, message),
      gloss: glossFor(brain, message),
      knowledge: short ? [] : knowledgeFor(brain, message),
    });
    const start = Date.now();
    let first = 0;
    let text = "";
    try {
      for await (const chunk of provider.stream({ system, messages: [{ role: "user", content: message }], maxOutputTokens: 400, signal: AbortSignal.timeout(600_000), persona: true } as never)) {
        if (chunk.type === "text") {
          if (!first) first = Date.now() - start;
          text += chunk.text;
        }
      }
    } catch (error) {
      text = `ERREUR ${String(error).slice(0, 200)}`;
    }
    const total = Date.now() - start;
    const row = { message, consigneCaracteres: system.length, premierMotS: +(first / 1000).toFixed(1), totalS: +(total / 1000).toFixed(1), reponse: text.trim() };
    rows.push(row);
    console.log(`\n=== ${message}\nconsigne ${system.length} car. | premier mot ${row.premierMotS} s | fini ${row.totalS} s\n${row.reponse}`);
  }
  fs.writeFileSync(`essai-cerveau-${model.replace(/[^a-z0-9]/gi, "-")}${short ? "-court" : ""}.json`, JSON.stringify(rows, null, 1));
})();
