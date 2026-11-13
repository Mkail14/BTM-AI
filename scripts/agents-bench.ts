/**
 * Banc d'essai de l'équipe d'agents, avec le vrai Gemini (par le relais du site en ligne,
 * Gemini refusant Mayotte). Pour chaque question : quelle équipe est choisie, temps de
 * chaque agent, puis réponse finale sans et avec les notes de l'équipe (temps comparés).
 *
 * Lancer : node --env-file=.env.local --conditions=react-server --import tsx scripts/agents-bench.ts
 * Demande AI_RELAY_URL et AI_KEYS_SECRET (comme le relais du chat en local).
 */
import { planTeam } from "../src/lib/ai/agents/plan";
import { runTeam, teamBlock, teamSummary } from "../src/lib/ai/agents/team";
import { mayotteClock } from "../src/lib/ai/clock";
import { createRelayProvider } from "../src/lib/ai/relay";
import { keysSecret } from "../src/lib/ai/secret-box";
import { loadTamilyaBrain } from "../src/lib/ai/brain";

const url = process.env.AI_RELAY_URL?.trim().replace(/\/+$/, "");
const secret = keysSecret();
if (!url || !secret) throw new Error("AI_RELAY_URL et AI_KEYS_SECRET sont nécessaires (.env.local).");
const provider = createRelayProvider(url, secret);

const QUESTIONS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "coucou Tamilya",
      "Je veux ouvrir un petit snack à Mamoudzou : quelles démarches, quel budget de départ, et combien coûte un local en ce moment ?",
      "Mon téléphone Android n'arrive plus à se connecter au wifi de ma box, pourquoi et comment résoudre le problème ?",
      "Comment on dit « je veux manger » en shimaoré ? Explique-moi pourquoi chaque mot.",
    ];

const SYSTEM = "Tu es Tamilya, l'assistante de Mayotte. Réponds en français, clairement, sans emoji.";
const QUIET = { voice: false, master: false, dedicatedFlow: false, challenged: false, signedIn: true };

async function answer(system: string, message: string, search: boolean) {
  const started = Date.now();
  let first = 0;
  let text = "";
  for await (const chunk of provider.stream({ system, messages: [{ role: "user", content: message }], maxOutputTokens: 12_000, signal: AbortSignal.timeout(120_000), deep: true, search })) {
    if (chunk.type === "text") {
      if (!first) first = Date.now() - started;
      text += chunk.text;
    }
  }
  return { first, total: Date.now() - started, text };
}

async function main() {
const brain = await loadTamilyaBrain();
const words = [...brain.lexicon, ...brain.words];
console.log(`Dictionnaire validé : ${words.length} entrées`);
for (const message of QUESTIONS) {
  const plan = planTeam(message, QUIET);
  console.log(`\n=== ${message}\nÉquipe : ${plan.specialists.join(", ") || "aucune"} (${plan.reason})${plan.verify ? " + vérificateur" : ""}`);
  if (plan.specialists.length === 0) continue;
  const result = await runTeam({ provider, message, history: [], plan, signal: AbortSignal.timeout(60_000), today: mayotteClock(), words });
  console.log(teamSummary(result));
  for (const note of result.notes) console.log(`--- ${note.id}${note.ok ? "" : " (non retenue)"}\n${note.text.slice(0, 600)}`);
  if (result.verification) console.log(`--- vérificateur\n${result.verification.text}`);
  const search = plan.specialists.includes("chercheur");
  const solo = await answer(SYSTEM, message, search);
  const block = teamBlock(result);
  const withTeam = await answer(block ? `${SYSTEM}\n\n${block}` : SYSTEM, message, search && !result.sources.length);
  console.log(`Réponse seule : premier mot ${solo.first} ms, fin ${solo.total} ms, ${solo.text.length} car.`);
  console.log(`Avec l'équipe : équipe ${result.ms} ms + premier mot ${withTeam.first} ms = ${result.ms + withTeam.first} ms, fin ${result.ms + withTeam.total} ms, ${withTeam.text.length} car.`);
  console.log(`--- réponse avec l'équipe (début)\n${withTeam.text.slice(0, 900)}`);
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
