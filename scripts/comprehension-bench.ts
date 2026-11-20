/**
 * Compare la compréhension de Tamilya AVANT et APRÈS l'audit du 2026-11-15, sur des conversations réalistes.
 * Vrai Gemini, par le relais du site en ligne (Google refuse les appels directs depuis Mayotte).
 *
 *   NODE_ENV=development node --conditions=react-server --env-file=.env.local --import tsx scripts/comprehension-bench.ts [essais]
 *
 * AVANT : contexte cherché sur le message seul, sans consigne ni lecture de compréhension.
 * APRÈS : message remis au propre, suite rattachée à la demande précédente, consignes et lecture données au modèle.
 * Deux mesures par cas : le bon contexte est-il récupéré (détecteurs du site), et la réponse fait-elle ce qu'il faut (vérifs écrites).
 * Limite : le relais en ligne n'a pas encore le réglage « réflexion légère » tant que le site n'est pas mis à jour ;
 * cette part se mesure donc seulement après la mise en ligne.
 */
import { knowledgeFor, lexiconFor, loadTamilyaBrain, wordsFor, glossFor } from "../src/server/services/ai/brain";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "../src/server/services/ai/personality-store";
import { createRelayProvider, relayUrl } from "../src/server/services/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { understand } from "@/lib/ai/understanding";
import { buildModelHistory } from "@/lib/chat/history";
import { liveIntent } from "@/lib/live/intent";

type Turn = { role: "user" | "assistant"; content: string };
type Case = {
  name: string;
  history?: Turn[];
  say: string;
  /** Contexte que le site doit aller chercher (détecteurs live). */
  needs?: "jobs" | "weather" | "news";
  /** Vérification de la réponse : vrai si elle fait ce qu'il faut. */
  ok: (reply: string) => boolean;
  /** Ce qui est attendu, pour la lecture humaine. */
  expect: string;
};

const user = (content: string): Turn => ({ role: "user", content });
const bot = (content: string): Turn => ({ role: "assistant", content });
const startsWithQuestion = (reply: string) => /^[^.!]{0,160}\?/.test(reply.trim().split("\n")[0] ?? "");
const asksWhatWeKnow = /(quel(?:le)? (?:est )?(?:ton|votre|ta|ton) (?:budget|ville|commune|prénom)|où (?:habites|es)-tu|comment t'appelles)/i;

const JOBS_HISTORY = [user("Tu connais des offres d'emploi à Mayotte ?"), bot("Oui, il y a des offres sur France Travail : agent d'entretien à Mamoudzou, vendeur à Kawéni, chauffeur à Koungou.")];
const NAMES_HISTORY = [
  user("Donne-moi 3 idées de nom pour mon snack à Mamoudzou"),
  bot("Voici trois idées :\n1. Chez Zarra\n2. Le Lagon Gourmand\n3. Mayotte Burger"),
];

const CASES: Case[] = [
  { name: "travail 1", say: "Tu peux me trouver un travail ?", needs: "jobs", expect: "aide tout de suite (offres, pistes) au lieu d'interroger", ok: (r) => !startsWithQuestion(r) },
  { name: "travail 2", say: "Cherche-moi un boulot.", needs: "jobs", expect: "idem", ok: (r) => !startsWithQuestion(r) },
  { name: "travail 3", say: "Je veux bosser rapidement.", needs: "jobs", expect: "comprend que c'est une recherche de travail", ok: (r) => /(travail|emploi|offre|boulot|job|poste|intérim|interim|recrut|candidat|france travail)/i.test(r) },
  { name: "travail 4", say: "Y a pas des entreprises qui recrutent ?", needs: "jobs", expect: "répond sur le recrutement à Mayotte", ok: (r) => /(recrut|offre|emploi|france travail|entreprise)/i.test(r) && !startsWithQuestion(r) },
  { name: "SMS + fautes", say: "slt tkt jveu un taf stp je suis sur dembeni", needs: "jobs", expect: "comprend sans relever les fautes", ok: (r) => /(travail|emploi|offre|boulot|poste|recrut|france travail)/i.test(r) && !/faute|orthograph/i.test(r) },
  { name: "suite courte", history: JOBS_HISTORY, say: "et à Dembéni ?", needs: "jobs", expect: "garde le sujet emploi, pour Dembéni", ok: (r) => /(emploi|offre|travail|poste|france travail|recrut|dembéni|dembeni)/i.test(r) && !/qu'est-ce que tu veux dire|précise/i.test(r) },
  { name: "renvoi « le deuxième »", history: NAMES_HISTORY, say: "fais un slogan pour le deuxième", expect: "slogan pour Le Lagon Gourmand", ok: (r) => /lagon/i.test(r) && !startsWithQuestion(r) },
  {
    name: "« fais pareil »",
    history: [user("Écris une phrase de bienvenue pour mon snack Chez Zarra"), bot("Bienvenue chez Zarra, où chaque bouchée a le goût de Mayotte !")],
    say: "fais pareil pour mon salon de coiffure Belle Mine",
    expect: "une phrase du même genre pour Belle Mine, sans question",
    ok: (r) => /belle mine/i.test(r) && !startsWithQuestion(r),
  },
  {
    name: "ne redemande pas",
    history: [
      user("Je m'appelle Anli, j'habite à Chirongui et j'ai 2000 euros de budget pour ouvrir une petite boutique de vêtements"),
      bot("Super projet Anli ! Avec 2000 euros, on peut déjà démarrer petit. Tu veux qu'on regarde le stock et le local ?"),
    ],
    say: "ça suffit pour démarrer ?",
    expect: "répond avec les 2000 € et Chirongui déjà donnés",
    ok: (r) => !asksWhatWeKnow.test(r) && /(2\s?000|suffi|démarr|stock|local|petit)/i.test(r),
  },
  { name: "changement de sujet", history: JOBS_HISTORY, say: "il va faire quoi comme temps demain ?", needs: "weather", expect: "parle du temps, pas des offres", ok: (r) => !/offre|france travail/i.test(r) },
  { name: "vraiment ambigu", say: "c'est combien ?", expect: "pose UNE question (rien à deviner)", ok: (r) => r.includes("?") && r.split("?").length <= 3 },
  {
    name: "demande indirecte",
    history: [user("J'ai ma commande de ciment qui n'est jamais arrivée"), bot("Ah zut, c'est embêtant. Tu l'avais commandée où et quand ?")],
    say: "chez BTM y a quelqu'un qu'on peut appeler pour ça ?",
    expect: "répond sur le contact, garde le fil de la commande",
    ok: (r) => /(contact|appel|btm|téléphone|telephone|mail|écri|ecri)/i.test(r),
  },
];

const strip = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

void (async () => {
  const tries = Number(process.argv[2]) || 2;
  const url = relayUrl();
  const secret = keysSecret();
  if (!url || !secret) throw new Error("Il faut AI_RELAY_URL, AI_KEYS_SECRET et NODE_ENV=development.");
  const provider = createRelayProvider(url, secret);
  const brain = await loadTamilyaBrain();
  const personalityInstructions = await loadPersonalityInstructions(DEFAULT_PERSONALITY).catch(() => undefined);

  // Cas shimaoré : prend de vraies phrases validées du lexique (rien d'inventé).
  const pair = brain.lexicon.find((e) => e.french.length < 40 && e.shimaore.length < 40 && !e.french.includes("?"));
  if (pair) {
    CASES.push({
      name: "shimaoré (SMS)",
      say: `cmt on di "${pair.french}" en shimaoré stp`,
      expect: `donne « ${pair.shimaore} »`,
      ok: (r) => strip(r).includes(strip(pair.shimaore)),
    });
    CASES.push({
      name: "shimaoré compris",
      say: `${pair.shimaore}`,
      expect: `comprend « ${pair.french} »`,
      ok: (r) => strip(r).split(/\W+/).some((w) => w.length > 3 && strip(pair.french).includes(w)) || /ne (?:le )?connais pas|pas encore/i.test(r),
    });
  }

  const run = async (mode: "avant" | "apres", item: Case) => {
    const history = item.history ?? [];
    const u = mode === "apres" ? understand(item.say, history) : null;
    const retrieval = u?.retrieval ?? item.say;
    const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
      personalityInstructions,
      identity: brain.identity,
      rules: brain.rules,
      lexicon: lexiconFor(brain, item.say),
      grammar: brain.grammar,
      words: wordsFor(brain, item.say, false),
      gloss: glossFor(brain, item.say),
      knowledge: knowledgeFor(brain, retrieval),
      reportUnknownWords: true,
      understanding: u?.block,
    });
    // AVANT : le prompt n'avait pas la section « Comprendre ».
    const finalSystem = mode === "avant" ? system.split("\n\n").filter((part) => !part.startsWith("Comprendre : c'est à toi")).join("\n\n") : system;
    const messages = [...buildModelHistory(history, 48_000), { role: "user" as const, content: item.say }];
    const intentKey = item.needs;
    const fetched = intentKey ? liveIntent(retrieval)[intentKey === "weather" ? "weather" : intentKey] : null;
    let text = "";
    for await (const chunk of provider.stream({
      system: finalSystem,
      messages,
      maxOutputTokens: 700,
      signal: AbortSignal.timeout(60_000),
      persona: true,
      careful: Boolean(u?.careful),
    })) {
      if (chunk.type === "text") text += chunk.text;
    }
    return { reply: text.trim().replace(/\s+/g, " "), fetched, careful: Boolean(u?.careful), block: u?.block ?? null };
  };

  const score = { avant: { ok: 0, ctx: 0, ctxTotal: 0, total: 0 }, apres: { ok: 0, ctx: 0, ctxTotal: 0, total: 0 } };
  for (const item of CASES) {
    console.log(`\n=== ${item.name} — « ${item.say} » (attendu : ${item.expect})`);
    for (const mode of ["avant", "apres"] as const) {
      for (let i = 0; i < tries; i++) {
        try {
          const result = await run(mode, item);
          const good = item.ok(result.reply);
          score[mode].total += 1;
          if (good) score[mode].ok += 1;
          if (item.needs) {
            score[mode].ctxTotal += 1;
            if (result.fetched) score[mode].ctx += 1;
          }
          console.log(`  ${mode.padEnd(5)} #${i + 1} ${good ? "OK " : "RATÉ"}${item.needs ? ` contexte ${result.fetched ? "récupéré" : "MANQUANT"}` : ""}${result.careful ? " [lecture soignée]" : ""} : ${result.reply.slice(0, 190)}`);
        } catch (error) {
          console.log(`  ${mode.padEnd(5)} #${i + 1} ERREUR ${error instanceof Error ? error.message.slice(0, 120) : error}`);
        }
      }
    }
  }
  for (const mode of ["avant", "apres"] as const) {
    const s = score[mode];
    console.log(`\n${mode.toUpperCase()} : réponses justes ${s.ok}/${s.total} ; bon contexte récupéré ${s.ctx}/${s.ctxTotal}`);
  }
})();
