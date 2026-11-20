/**
 * Banc d'essai du shimaoré de Tamilya : construit-elle, ou récite-t-elle ?
 * Vrai Gemini, par le relais du site en ligne, avec le vrai cerveau (Supabase).
 *
 *   NODE_ENV=development node --conditions=react-server --env-file=.env.local --import tsx scripts/shimaore-bench.ts [sortie.json]
 *
 * Méthode « une phrase cachée » : pour chaque phrase validée par un locuteur, on la retire
 * du cerveau (expressions ET dictionnaire), puis :
 *  - Construire : le moteur de composition (composeShimaore, le vrai chemin « comment on dit »)
 *    doit la refaire à partir du français. Comparée mot à mot à la phrase validée.
 *  - Comprendre : Tamilya reçoit la phrase shimaoré et doit dire ce qu'elle veut dire en français.
 *    Un juge (Gemini) dit si le sens est le même. Le juge peut se tromper : chiffre indicatif.
 * Une phrase retrouvée par cœur ne compte pas : elle est cachée.
 */
import { glossFor, loadTamilyaBrain, wordsFor, type TamilyaBrain } from "../src/server/services/ai/brain";
import { composeShimaore } from "../src/server/services/ai/compose";
import { completeText } from "../src/server/services/ai/complete";
import { createRelayProvider, relayUrl } from "../src/server/services/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { frenchKey } from "@/lib/language/compose";
import { shimaoreKey } from "@/lib/language/shimaore-match";
import fs from "node:fs";

type Pair = { french: string; shimaore: string; from: string };

const wordsOf = (text: string) => (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).map(shimaoreKey).filter(Boolean);

/** Mots communs (sans tenir compte de l'ordre) : rappel, précision, F1. Et l'ordre exact. */
function compare(got: string, want: string) {
  const g = wordsOf(got);
  const w = wordsOf(want);
  const pool = [...w];
  let hit = 0;
  for (const x of g) {
    const i = pool.indexOf(x);
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  const p = g.length ? hit / g.length : 0;
  const r = w.length ? hit / w.length : 0;
  return { exact: g.join(" ") === w.join(" "), f1: p + r ? (2 * p * r) / (p + r) : 0 };
}

/** Le cerveau sans cette phrase (ni dans les expressions, ni dans le dictionnaire, ni dans les exemples de grammaire). */
function without(brain: TamilyaBrain, pair: Pair): TamilyaBrain {
  const f = frenchKey(pair.french);
  const s = wordsOf(pair.shimaore).join(" ");
  const same = (e: { french: string; shimaore: string }) => frenchKey(e.french) === f || wordsOf(e.shimaore).join(" ") === s;
  return {
    ...brain,
    lexicon: brain.lexicon.filter((e) => !same(e)),
    words: brain.words.filter((e) => !same(e)),
    grammar: brain.grammar.filter((g) => !g.examples.includes(pair.shimaore) && frenchKey(g.title) !== f),
  };
}

const UNDERSTAND = `Tu es Tamilya. On te donne une phrase en shimaoré (langue de Mayotte) et ce que tu en sais (lecture mot à mot, vocabulaire, règles).
Donne ton meilleur sens en français, en une phrase, sur la première ligne.
Sur la deuxième ligne, écris exactement SÛRE, PARTIEL ou DEVINÉ selon ta certitude. Si tu n'as vraiment aucune idée, écris seulement JE NE SAIS PAS.`;

const JUDGE = `Deux phrases françaises. Disent-elles la même chose (même sens, même personne, même négation, même temps) ? Réponds seulement OUI ou NON.`;

void (async () => {
  const out = process.argv[2] ?? "shimaore-bench.json";
  const url = relayUrl();
  const secret = keysSecret();
  if (!url || !secret) throw new Error("Il faut AI_RELAY_URL, AI_KEYS_SECRET et NODE_ENV=development.");
  const provider = createRelayProvider(url, secret);
  const brain = await loadTamilyaBrain();

  // Phrases de référence : expressions validées courtes (au moins 2 mots), et les exemples « a → b » de la grammaire.
  const pairs: Pair[] = brain.lexicon
    .filter((e) => wordsOf(e.shimaore).length >= 2 && e.french.length <= 90)
    .map((e) => ({ french: e.french, shimaore: e.shimaore, from: "expression" }));
  const seen = new Set(pairs.map((p) => frenchKey(p.french)));
  for (const g of brain.grammar) {
    for (const line of g.examples.split(/\n/)) {
      const m = line.match(/^(.+?)\s*(?:→|=)\s*(.+)$/);
      if (m && !seen.has(frenchKey(m[1])) && wordsOf(m[2]).length >= 2) {
        seen.add(frenchKey(m[1]));
        pairs.push({ french: m[1].trim(), shimaore: m[2].trim(), from: "grammaire" });
      }
    }
  }
  // Les phrases du dictionnaire (catégorie phrase / conversation) : nombreuses et courtes.
  for (const w of brain.words) {
    if (wordsOf(w.shimaore).length >= 2 && /phrase|conversation/i.test(w.category ?? "") && !seen.has(frenchKey(w.french))) {
      seen.add(frenchKey(w.french));
      pairs.push({ french: w.french, shimaore: w.shimaore, from: "dictionnaire" });
    }
  }

  const results = [];
  for (const pair of pairs) {
    const hidden = without(brain, pair);
    const c = await composeShimaore(provider, hidden, pair.french);
    const built = compare(c.shimaore, pair.shimaore);

    const gloss = glossFor(hidden, pair.shimaore);
    const words = wordsFor(hidden, pair.shimaore).slice(0, 80);
    const content = [
      `Phrase : ${pair.shimaore}`,
      `Lecture mot à mot : ${gloss.known.map((k) => `${k.written} = ${k.french}`).join(" ; ") || "(rien)"}${gloss.unknown.length ? ` ; inconnus : ${gloss.unknown.join(", ")}` : ""}`,
      `Vocabulaire :\n${words.map((w) => `- ${w.french} → ${w.shimaore}`).join("\n")}`,
      `Règles :\n${hidden.grammar.map((g) => `- ${g.title} : ${g.rule}`).join("\n")}`,
    ].join("\n\n");
    let understood = "";
    let judged = "";
    try {
      understood = (await completeText(provider, { system: UNDERSTAND, content, maxOutputTokens: 300, timeoutMs: 20_000 })).trim();
      judged = /JE NE SAIS PAS/i.test(understood)
        ? "abstient"
        : (await completeText(provider, { system: JUDGE, content: `A : ${pair.french}\nB : ${understood.split("\n")[0]}`, maxOutputTokens: 200, timeoutMs: 15_000 })).trim().toUpperCase().startsWith("OUI")
          ? "juste"
          : "faux";
    } catch (error) {
      judged = `erreur ${String(error).slice(0, 80)}`;
    }

    const row = {
      ...pair,
      construit: c.shimaore,
      exact: built.exact,
      f1: Number(built.f1.toFixed(2)),
      motsDevines: c.unsure,
      // Ce que verrait la personne : phrase donnée comme sûre, donnée en demandant confirmation, ou « je ne sais pas ».
      montre: c.shimaore && c.unsure.length === 0 ? "proposée" : "refusée",
      compris: understood.split("\n")[0],
      certitude: (understood.match(/SÛRE|PARTIEL|DEVINÉ/i)?.[0] ?? "").toUpperCase(),
      sens: judged,
    };
    results.push(row);
    console.log(`${row.exact ? "EXACT" : row.f1.toFixed(2)} | ${row.montre} | sens ${row.sens} | ${pair.french} → attendu « ${pair.shimaore} » / construit « ${c.shimaore} » / compris « ${understood} »`);
  }

  const n = results.length;
  const proposed = results.filter((r) => r.montre === "proposée");
  const summary = {
    phrases: n,
    construction: {
      exactes: results.filter((r) => r.exact).length,
      f1Moyen: Number((results.reduce((s, r) => s + r.f1, 0) / n).toFixed(2)),
      proposees: proposed.length,
      proposeesExactes: proposed.filter((r) => r.exact).length,
      proposeesF1: proposed.length ? Number((proposed.reduce((s, r) => s + r.f1, 0) / proposed.length).toFixed(2)) : 0,
    },
    comprehension: {
      juste: results.filter((r) => r.sens === "juste").length,
      faux: results.filter((r) => r.sens === "faux").length,
      abstient: results.filter((r) => r.sens === "abstient").length,
      erreurs: results.filter((r) => r.sens.startsWith("erreur")).length,
      sureEtFaux: results.filter((r) => r.certitude === "SÛRE" && r.sens === "faux").length,
      sureEtJuste: results.filter((r) => r.certitude === "SÛRE" && r.sens === "juste").length,
    },
  };
  console.log(JSON.stringify(summary, null, 1));
  fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), summary, results }, null, 1));
})();
