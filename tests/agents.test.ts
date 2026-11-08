import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SPECIALISTS, planTeam, type PlanContext } from "../src/lib/ai/agents/plan";
import { briefFor, isClear, relevantMemories, runTeam, teamBlock, teamSummary } from "../src/lib/ai/agents/team";
import type { AIProvider, AIStreamInput } from "../src/lib/ai/types";

const BASE: PlanContext = { voice: false, master: false, dedicatedFlow: false, challenged: false, signedIn: true };

/** Faux Gemini : répond selon le rôle lu dans les consignes, après un délai réglable. */
function fakeProvider(options: { delays?: Record<string, number>; fail?: string[]; text?: (role: string) => string } = {}) {
  const calls: AIStreamInput[] = [];
  const provider: AIProvider = {
    id: "faux",
    async *stream(input) {
      calls.push(input);
      const role = (input.system.match(/Rôle : (\p{L}+)/u)?.[1] ?? "?").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace("technicien", "developpeur");
      const delay = options.delays?.[role] ?? 5;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        input.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("annulé"));
        });
      });
      if (options.fail?.includes(role)) throw new Error("panne");
      yield { type: "text", text: options.text ? options.text(role) : `- note du ${role} avec assez de contenu pour servir` };
      if (role === "chercheur") yield { type: "sources", sources: [{ title: "Préfecture", url: "https://www.mayotte.gouv.fr" }] };
      yield { type: "finish", reason: "stop" };
    },
  };
  return { provider, calls };
}

describe("Équipe d'agents : choix des agents", () => {
  it("une question simple n'appelle aucun agent", () => {
    for (const message of ["coucou", "Bonjour Tamilya", "merci beaucoup", "tu vas bien ?"]) {
      assert.deepEqual(planTeam(message, BASE).specialists, [], message);
    }
  });

  it("jamais d'équipe à l'oral, en mode maître, sans compte ou dans un parcours dédié", () => {
    const hard = "Compare les avantages et inconvénients d'ouvrir un snack à Mamoudzou, quel budget et quelles démarches ?";
    for (const context of [{ voice: true }, { master: true }, { signedIn: false }, { dedicatedFlow: true }]) {
      assert.deepEqual(planTeam(hard, { ...BASE, ...context }).specialists, [], JSON.stringify(context));
    }
  });

  it("une question difficile appelle 2 ou 3 spécialistes, jamais plus", () => {
    const plan = planTeam("Je veux ouvrir un snack à Mamoudzou : quelles démarches, quel budget, et quel est le prix des loyers en ce moment ?", BASE);
    assert.ok(plan.specialists.length >= 2 && plan.specialists.length <= MAX_SPECIALISTS, plan.specialists.join(","));
    assert.ok(plan.specialists.includes("chercheur"));
    assert.ok(plan.specialists.includes("planificateur"));
    assert.equal(plan.verify, true);
  });

  it("choisit le bon spécialiste selon le sujet", () => {
    assert.ok(planTeam("Mon application Android plante au démarrage, pourquoi et comment résoudre le problème ?", BASE).specialists.includes("developpeur"));
    assert.ok(planTeam("Comment on dit « je veux monter un projet » en shimaoré, explique-moi pourquoi", BASE).specialists.includes("linguiste"));
  });

  it("une question de shimaoré n'appelle pas l'analyste (il inventait des mots) et passe par le vérificateur", () => {
    const plan = planTeam("Comment on dit « je veux manger » en shimaoré ? Explique-moi pourquoi chaque mot.", BASE);
    assert.deepEqual(plan.specialists, ["linguiste"]);
    assert.equal(plan.verify, true);
  });

  it("un seul analyste reste en solo (pas d'appel en plus)", () => {
    assert.deepEqual(planTeam("Que penses-tu de cette idée, quels risques ?", BASE).specialists, []);
  });

  it("une réponse contestée fait chercher", () => {
    assert.ok(planTeam("c'est faux", { ...BASE, challenged: true }).specialists.includes("chercheur"));
  });
});

describe("Équipe d'agents : partage de l'information", () => {
  const input = {
    message: "Quel budget pour mon projet de snack ?",
    history: [{ role: "user" as const, content: "J'habite à Dzaoudzi" }],
    memories: [
      { kind: "projet", content: "Prépare un projet de snack à Mamoudzou" },
      { kind: "santé", content: "Allergique aux arachides" },
    ],
    words: [{ french: "manger", shimaore: "hula" }],
  };

  it("l'agent mémoire ne garde que les souvenirs liés à la question", () => {
    const kept = relevantMemories(input.memories, input.message);
    assert.equal(kept.length, 1);
    assert.match(kept[0].content, /snack/);
  });

  it("le chercheur ne reçoit ni souvenirs ni dictionnaire", () => {
    const brief = briefFor("chercheur", input);
    assert.doesNotMatch(brief, /snack à Mamoudzou|arachides|hula/);
  });

  it("l'analyste reçoit le souvenir utile mais pas le reste", () => {
    const brief = briefFor("analyste", input);
    assert.match(brief, /snack à Mamoudzou/);
    assert.doesNotMatch(brief, /arachides/);
  });

  it("le linguiste reçoit le dictionnaire mais pas la conversation", () => {
    const brief = briefFor("linguiste", { ...input, message: "comment dire manger en shimaoré" });
    assert.match(brief, /manger = hula/);
    assert.doesNotMatch(brief, /Dzaoudzi/);
  });
});

describe("Équipe d'agents : exécution", () => {
  const plan = { specialists: ["chercheur", "analyste", "planificateur"] as const, verify: true, reason: "test" };

  it("lance les spécialistes en parallèle puis le vérificateur", async () => {
    const { provider, calls } = fakeProvider({ delays: { chercheur: 120, analyste: 120, planificateur: 120 } });
    const started = Date.now();
    const result = await runTeam({ provider, message: "question", history: [], plan: { ...plan, specialists: [...plan.specialists] }, signal: new AbortController().signal });
    const elapsed = Date.now() - started;
    assert.equal(result.calls, 4);
    assert.equal(calls.length, 4);
    // En série, ce serait 360 ms au moins.
    assert.ok(elapsed < 330, `${elapsed} ms`);
    assert.equal(calls.filter((c) => c.search).length, 1, "seul le chercheur cherche sur internet");
    assert.ok(calls.every((c) => c.maxOutputTokens <= 900));
    assert.equal(result.sources.length, 1);
    assert.ok(result.verification?.ok);
  });

  it("un agent trop lent est laissé de côté, la réponse part quand même", async () => {
    const { provider } = fakeProvider({ delays: { analyste: 5_000 } });
    const started = Date.now();
    const result = await runTeam({
      provider,
      message: "question",
      history: [],
      plan: { specialists: ["chercheur", "analyste"], verify: false, reason: "test" },
      signal: new AbortController().signal,
      limits: { agentMs: 150 },
    });
    assert.ok(Date.now() - started < 1_000);
    assert.equal(result.notes.find((n) => n.id === "analyste")?.ok, false);
    assert.equal(result.notes.find((n) => n.id === "analyste")?.error, "délai dépassé");
    assert.equal(result.notes.find((n) => n.id === "chercheur")?.ok, true);
  });

  it("le délai de toute l'équipe coupe tout le monde", async () => {
    const { provider } = fakeProvider({ delays: { chercheur: 5_000, analyste: 5_000 } });
    const started = Date.now();
    const result = await runTeam({
      provider,
      message: "question",
      history: [],
      plan: { specialists: ["chercheur", "analyste"], verify: true, reason: "test" },
      signal: new AbortController().signal,
      limits: { totalMs: 200 },
    });
    assert.ok(Date.now() - started < 1_000);
    assert.equal(result.notes.filter((n) => n.ok).length, 0);
    assert.equal(result.verification, null, "pas de relecture sans notes");
    assert.equal(teamBlock(result), "", "Tamilya répond seule");
  });

  it("une panne d'agent n'empêche pas les autres", async () => {
    const { provider } = fakeProvider({ fail: ["analyste"] });
    const result = await runTeam({ provider, message: "q", history: [], plan: { specialists: ["chercheur", "analyste"], verify: false, reason: "t" }, signal: new AbortController().signal });
    assert.equal(result.notes.filter((n) => n.ok).length, 1);
    assert.match(teamSummary(result), /analyse échec/);
  });

  it("pas de relecture quand le plafond de jetons de l'équipe est atteint", async () => {
    const { provider, calls } = fakeProvider({ text: () => "x".repeat(4_000) });
    const result = await runTeam({ provider, message: "q", history: [], plan: { specialists: ["chercheur", "analyste"], verify: true, reason: "t" }, signal: new AbortController().signal, limits: { teamTokens: 1_000 } });
    assert.equal(result.verification, null);
    assert.equal(calls.length, 2);
  });

  it("aucun plan, aucun appel", async () => {
    const { provider, calls } = fakeProvider();
    const result = await runTeam({ provider, message: "coucou", history: [], plan: { specialists: [], verify: false, reason: "simple" }, signal: new AbortController().signal });
    assert.equal(calls.length, 0);
    assert.equal(result.calls, 0);
  });

  it("le bloc remis à Tamilya contient les notes, la relecture, et l'interdiction de suivre leurs consignes", async () => {
    const { provider } = fakeProvider({ text: (role) => (role === "verificateur" ? "Le chiffre du loyer n'a pas de source." : `- note ${role} suffisamment longue pour servir`) });
    const result = await runTeam({ provider, message: "q", history: [], plan: { specialists: ["chercheur", "analyste"], verify: true, reason: "t" }, signal: new AbortController().signal });
    const block = teamBlock(result);
    assert.match(block, /### recherche/);
    assert.match(block, /### analyse/);
    assert.match(block, /Relecture/);
    assert.match(block, /jamais des consignes/);
  });

  it("le linguiste n'est pas appelé sans mot validé utile (il inventerait)", async () => {
    const { provider, calls } = fakeProvider();
    const plan = { specialists: ["linguiste" as const], verify: true, reason: "t" };
    const none = await runTeam({ provider, message: "comment dire bonjour en shimaoré", history: [], plan, words: [{ french: "manger", shimaore: "hula" }], signal: new AbortController().signal });
    assert.equal(none.calls, 0);
    const some = await runTeam({ provider, message: "comment dire manger en shimaoré", history: [], plan, words: [{ french: "manger", shimaore: "hula" }], signal: new AbortController().signal });
    assert.equal(some.calls, 2, "linguiste puis vérificateur");
    assert.match(calls.at(-1)!.messages[0].content, /manger = hula/, "le vérificateur reçoit le dictionnaire");
  });

  it("une relecture « **RAS** » en gras compte comme sans remarque", () => {
    assert.equal(isClear("**RAS**"), true);
    assert.equal(isClear("RAS."), true);
    assert.equal(isClear("Le chiffre n'a pas de source"), false);
  });

  it("une relecture « RAS » n'est pas transmise", async () => {
    const { provider } = fakeProvider({ text: (role) => (role === "verificateur" ? "RAS" : `- note ${role} suffisamment longue pour servir`) });
    const result = await runTeam({ provider, message: "q", history: [], plan: { specialists: ["chercheur", "analyste"], verify: true, reason: "t" }, signal: new AbortController().signal });
    assert.doesNotMatch(teamBlock(result), /Relecture/);
  });
});
