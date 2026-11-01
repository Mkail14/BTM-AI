/**
 * Compare les réponses d'Awa selon l'API : mêmes questions, mêmes consignes
 * que le vrai chat, puis une note de ressemblance avec l'API de référence
 * (Gemini), donnée par Gemini lui-même.
 *
 *   node --conditions=react-server --env-file=.env.local --import tsx scripts/compare-apis.ts [--maitre] [--rapport fichier.md]
 *
 * --maitre : consignes du mode maître (administrateur : Awa parle shimaoré).
 * Les API viennent de la chaîne réelle (variables du serveur + /admin/circuit).
 */
import { writeFileSync } from "node:fs";
import { createProvider } from "@/lib/ai";
import { knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import type { AIConfig } from "@/lib/ai/config";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { loadAIChain } from "@/lib/ai/registry";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { AIProvider } from "@/lib/ai/types";

const QUESTIONS = [
  "Salut ! Tu vas bien ?",
  "Tu t'appelles comment et tu as quel âge ?",
  "Comment je fais pour refaire ma carte d'identité à Mayotte ?",
  "T'es ChatGPT en vrai ?",
  "Raconte-moi une blague",
  "Je suis triste aujourd'hui, mon chef m'a crié dessus devant tout le monde.",
  "Explique-moi en 3 lignes ce qu'est l'inflation.",
  "Comment on dit bonjour en shimaoré ?",
];

const args = process.argv.slice(2);
const master = args.includes("--maitre");
const reportPath = args[args.indexOf("--rapport") + 1] && args.includes("--rapport") ? args[args.indexOf("--rapport") + 1] : null;

type Answer = { text: string; ms: number; finish: string; error?: string };

async function ask(provider: AIProvider, system: string, question: string): Promise<Answer> {
  const start = Date.now();
  let text = "";
  let finish = "?";
  try {
    for await (const chunk of provider.stream({
      system,
      messages: [{ role: "user", content: question }],
      maxOutputTokens: 1500,
      signal: AbortSignal.timeout(90_000),
      persona: true,
    })) {
      if (chunk.type === "text") text += chunk.text;
      if (chunk.type === "finish") finish = chunk.reason;
    }
    return { text: text.trim(), ms: Date.now() - start, finish };
  } catch (error) {
    return { text: text.trim(), ms: Date.now() - start, finish: "erreur", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Indices mesurables du style (pour voir d'où vient l'écart, pas seulement une note). */
function traits(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    mots: words,
    emojis: (text.match(/\p{Extended_Pictographic}/gu) ?? []).length,
    markdown: /^#{1,6} |^\s*[-*] |\*\*/m.test(text),
    vouvoie: /\bvous\b|\bvotre\b|\bvos\b/i.test(text),
    tutoie: /\btu\b|\bton\b|\bta\b|\btes\b|\btoi\b|\bte\b/i.test(text),
    formule: /en tant qu'(assistant|ia)|n'hésite[sz]? pas|excellente question|je suis (un|une) (modèle|assistant virtuel)/i.test(text),
    autreModele: /chatgpt|openai|nemotron|nvidia|llama|gemini|google|claude|anthropic|mistral|qwen|deepseek/i.test(
      text.replace(/(pas|ni|jamais) (chatgpt|gemini|claude)/gi, ""),
    ),
    masculin: /\bje suis (content|prêt|désolé|ravi|heureux)\b/i.test(text),
  };
}

const JUDGE = `Tu compares deux réponses d'une même assistante, Awa (IA de GROUPE BTM à Mayotte), à la même question.
A est la référence. Évalue à quel point B ressemble à A : ton et personnalité, longueur, structure (listes, titres), niveau de langue (tutoiement), langue utilisée (français/shimaoré), respect des consignes (féminin, ne pas citer de modèle d'IA, pas de formules de service client) et justesse.
Réponds en JSON strict, sans rien autour : {"note": <0 à 10>, "ecart": "<la principale différence, en une phrase>"}`;

async function judge(provider: AIProvider, question: string, a: string, b: string): Promise<{ note: number | null; ecart: string }> {
  let out = "";
  try {
    for await (const chunk of provider.stream({
      system: JUDGE,
      messages: [{ role: "user", content: `Question : ${question}\n\n--- A ---\n${a}\n\n--- B ---\n${b}` }],
      maxOutputTokens: 400,
      signal: AbortSignal.timeout(60_000),
    })) {
      if (chunk.type === "text") out += chunk.text;
    }
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { note?: number; ecart?: string };
    return { note: typeof json.note === "number" ? json.note : null, ecart: json.ecart ?? "" };
  } catch {
    return { note: null, ecart: `(arbitrage illisible) ${out.slice(0, 120)}` };
  }
}

const short = (text: string, max = 260) => (text.length > max ? `${text.slice(0, max)}…` : text).replace(/\n+/g, " ⏎ ");

void (async () => {
  const chain = await loadAIChain();
  const usable = chain.filter((s): s is typeof s & { result: { ok: true; config: AIConfig } } => s.result.ok);
  // --reference <modèle> : le modèle Gemini passe par la clé OpenRouter (Google refuse
  // les appels directs depuis Mayotte, donc depuis un poste local).
  const viaOpenRouter = args.includes("--reference") ? args[args.indexOf("--reference") + 1] : null;
  const openRouter = usable.find((s) => /openrouter\.ai/.test(s.result.config.baseUrl ?? ""));
  const reference =
    viaOpenRouter && openRouter
      ? { ...openRouter, id: "reference", label: `${viaOpenRouter} via OpenRouter`, result: { ok: true as const, config: { ...openRouter.result.config, model: viaOpenRouter } } }
      : usable.find((s) => /gemini/i.test(s.result.config.model));
  const others = usable.filter((s) => s !== reference && !/gemini/i.test(s.result.config.model));
  if (!reference || others.length === 0) {
    console.error("Il faut une API Gemini (référence) et au moins une autre API dans la chaîne.");
    process.exit(1);
  }

  const brain = await loadAwaBrain();
  const personalityInstructions = await loadPersonalityInstructions(DEFAULT_PERSONALITY);
  const systemFor = (question: string) =>
    buildSystemPrompt(undefined, {
      personalityInstructions,
      identity: brain.identity,
      rules: brain.rules,
      lexicon: lexiconFor(brain, DEFAULT_PERSONALITY),
      words: wordsFor(brain, question, master),
      knowledge: knowledgeFor(brain, question),
      teacher: master,
      reportUnknownWords: true,
    });

  const refProvider = createProvider(reference.result.config);
  const lines: string[] = [
    `# Comparaison des API d'Awa${master ? " (mode maître)" : ""}`,
    "",
    `Référence : **${reference.label}** (\`${reference.result.config.model}\`)`,
    "",
  ];

  for (const other of others) {
    const provider = createProvider(other.result.config);
    console.log(`\n=== ${other.label} (${other.result.config.model}) contre ${reference.label} ===`);
    lines.push(`## ${other.label} (\`${other.result.config.model}\`)`, "");
    const notes: number[] = [];

    for (const question of QUESTIONS) {
      const system = systemFor(question);
      const [a, b] = await Promise.all([ask(refProvider, system, question), ask(provider, system, question)]);
      const verdict = a.error || b.error ? { note: null, ecart: a.error ?? b.error ?? "" } : await judge(refProvider, question, a.text, b.text);
      if (verdict.note !== null) notes.push(verdict.note);
      const ta = traits(a.text);
      const tb = traits(b.text);
      const diff = (Object.keys(ta) as (keyof typeof ta)[])
        .filter((k) => k !== "mots" && ta[k] !== tb[k])
        .map((k) => `${k} ${ta[k]}→${tb[k]}`);

      console.log(`\n? ${question}`);
      console.log(`  A ${a.ms} ms, ${ta.mots} mots : ${short(a.error ? `ERREUR ${a.error}` : a.text)}`);
      console.log(`  B ${b.ms} ms, ${tb.mots} mots : ${short(b.error ? `ERREUR ${b.error}` : b.text)}`);
      console.log(`  → ${verdict.note ?? "?"}/10  ${verdict.ecart}${diff.length ? `  [${diff.join(", ")}]` : ""}`);

      lines.push(
        `### ${question}`,
        "",
        `**Note : ${verdict.note ?? "?"}/10** · ${verdict.ecart}${diff.length ? ` · écarts mesurés : ${diff.join(", ")}` : ""}`,
        "",
        `| | ${reference.label} | ${other.label} |`,
        "|---|---|---|",
        `| Réponse | ${short(a.error ? `ERREUR ${a.error}` : a.text, 600).replace(/\|/g, "\\|")} | ${short(b.error ? `ERREUR ${b.error}` : b.text, 600).replace(/\|/g, "\\|")} |`,
        `| Mots | ${ta.mots} | ${tb.mots} |`,
        `| Durée | ${a.ms} ms | ${b.ms} ms |`,
        "",
      );
    }

    const mean = notes.length ? notes.reduce((x, y) => x + y, 0) / notes.length : NaN;
    console.log(`\nRessemblance moyenne : ${Number.isNaN(mean) ? "?" : mean.toFixed(1)}/10 sur ${notes.length} questions`);
    lines.splice(4, 0, `**${other.label} : ressemblance moyenne ${Number.isNaN(mean) ? "?" : mean.toFixed(1)}/10** (${notes.length} questions)`, "");
  }

  if (reportPath) {
    writeFileSync(reportPath, lines.join("\n"), "utf8");
    console.log(`\nRapport : ${reportPath}`);
  }
})();
