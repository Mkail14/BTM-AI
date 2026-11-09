/**
 * Essai réel du parolier (Flash par le relais du site en ligne, Gemini refusant Mayotte) :
 * temps des deux réécritures en parallèle, notes des trois versions, version gardée.
 * Lancer : node --env-file=.env.local --conditions=react-server --import tsx scripts/lyricist-bench.ts
 */
import { createRelayProvider } from "../src/lib/ai/relay";
import { keysSecret } from "../src/lib/ai/secret-box";
import { parseSongSpec } from "../src/lib/music/intent";
import { scoreLyrics } from "../src/lib/music/lyric-score";
import { LYRICIST_ANGLES, lyricistPrompt, pickBest } from "../src/lib/music/lyricist";

const url = process.env.AI_RELAY_URL?.trim().replace(/\/+$/, "");
const secret = keysSecret();
if (!url || !secret) throw new Error("AI_RELAY_URL et AI_KEYS_SECRET sont nécessaires (.env.local).");
const provider = createRelayProvider(url, secret);

const SONGS = [
  {
    style: "zouk doux, guitare et basse ronde, 95 BPM",
    lyrics: `[Couplet]\nSous le soleil de Mayotte je pense à toi\nMon cœur bat fort quand tu es là\nEnsemble on va briller pour toujours\nMain dans la main avec notre amour\n[Refrain]\nToi et moi sous les étoiles\nNos rêves vont s'envoler\nToi et moi sous les étoiles\nRien ne pourra nous séparer`,
  },
  {
    style: "rap sombre introspectif, piano et basse lourde, 85 BPM",
    lyrics: `[Couplet]\nLa nuit tombe sur la ville je marche seul\nJe pense à ma vie et à mes erreurs\nLe monde est dur mais je reste fort\nJe me bats chaque jour contre le sort\n[Refrain]\nJe suis plus fort que tout\nJamais je n'abandonnerai\nMême si la route est longue\nUn jour je réussirai`,
  },
];

async function write(prompt: string): Promise<string> {
  let text = "";
  for await (const chunk of provider.stream({ system: "Tu es un parolier.", messages: [{ role: "user", content: prompt }], maxOutputTokens: 2_048, signal: AbortSignal.timeout(30_000) })) {
    if (chunk.type === "text") text += chunk.text;
  }
  return text.replace(/^```\w*\n?|```$/g, "").replace(/^\s*style\s*:.*$/im, "").trim();
}

async function main() {
  for (const spec of SONGS) {
    const started = Date.now();
    const drafts = await Promise.all(LYRICIST_ANGLES.map((angle) => write(lyricistPrompt(spec, angle)).catch(() => "")));
    const ms = Date.now() - started;
    const versions = [spec.lyrics, ...drafts.filter((d) => parseSongSpec(d))];
    const scores = versions.map(scoreLyrics);
    const pick = pickBest(scores);
    console.log(`\n=== ${spec.style}\n${ms} ms pour les réécritures ; notes ${scores.map((s) => `${s.score} (clichés ${s.cliches}, rime ${s.rhyme})`).join(" / ")} ; gardée : ${pick}`);
    versions.forEach((v, i) => console.log(`--- version ${i}${i === pick ? " (gardée)" : ""}\n${v}`));
  }
}
void main();
