import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveIntent } from "@/lib/live/intent";
import { parseRss } from "@/lib/live/news";

describe("sources en direct", () => {
  it("lit un flux RSS (CDATA, entités, balises)", () => {
    const xml = `<rss><channel><item><title><![CDATA[Incendie à Bouéni]]></title>
      <link>https://exemple.yt/a</link><pubDate>Sun, 01 Nov 2026 12:49:26 +0000</pubDate>
      <description><![CDATA[<p>Les secours l&#8217;ont &amp; maîtrisé [&#8230;]</p>]]></description></item>
      <item><title>Sans lien</title></item></channel></rss>`;
    const items = parseRss(xml, "Test");
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Incendie à Bouéni");
    assert.equal(items[0].summary, "Les secours l’ont & maîtrisé …");
    assert.equal(items[0].date, "2026-11-01T12:49:26.000Z");
  });

  it("repère une question sur l'emploi ou l'actualité", () => {
    assert.deepEqual(liveIntent("Il y a des offres d'emploi à Mamoudzou ?"), { jobs: true, news: false });
    assert.deepEqual(liveIntent("Quoi de neuf à Mayotte aujourd'hui ?"), { jobs: false, news: true });
    assert.deepEqual(liveIntent("Comment on dit merci ?"), { jobs: false, news: false });
    assert.equal(liveIntent("Il se passe quoi à Mayotte ?").news, true);
    assert.equal(liveIntent("Les dernières nouvelles ?").news, true);
  });

  it("retrouve les articles qui parlent du sujet du message", async () => {
    const { matchNews } = await import("@/lib/live/match");
    const item = (title: string, summary = "") => ({ source: "T", title, link: "https://x.yt", date: null, summary });
    const items = [item("Grève des taxis à Mamoudzou", "Les chauffeurs bloquent la ville"), item("Match de football à Dembéni")];
    assert.deepEqual(matchNews(items, "c'est quoi cette grève des taxis ?", 5).map((n) => n.title), ["Grève des taxis à Mamoudzou"]);
    assert.deepEqual(matchNews(items, "Comment vas-tu à Mayotte ?", 5), []);
  });
});


describe("carte du shimaoré", () => {
  it("range les mots appris dans l'arbre, synonymes et accents compris", async () => {
    const { buildLexiconTree, nodeRatio } = await import("@/lib/language/curriculum");
    const tree = buildLexiconTree([
      { french: "Bonjour", shimaore: "kwezi" },
      { french: "pardon / excuse-moi", shimaore: "somahane" },
      { french: "baobab", shimaore: "x", category: "Nature" },
    ]);
    const salutations = tree.children!.find((t) => t.id === "salutations")!;
    const saluer = salutations.children![0];
    assert.equal(saluer.children![0].word?.shimaore, "kwezi");
    assert.equal(saluer.children![1].word?.shimaore, null);
    assert.equal(salutations.learned, 2);
    assert.equal(tree.learned, 2);
    const plus = tree.children!.find((t) => t.id === "nature")!.children!.at(-1)!;
    assert.equal(plus.label, "En plus");
    assert.equal(nodeRatio(plus), 1);
  });
});

describe("rangement automatique des mots", () => {
  it("garde les catégories de la liste, « ? » devient « À ranger »", async () => {
    const { parseSorting } = await import("@/lib/language/sort-words");
    const sorted = parseSorting("1|Nourriture › Plats\n2|?\n3|Inventé › Rien\n9|Couleurs › Vives\n4 | Nature & animaux > Animaux", 4);
    assert.deepEqual([...sorted], [
      [0, "Nourriture › Plats"],
      [1, "À ranger"],
      [3, "Nature & animaux › Animaux"],
    ]);
  });

  it("range un mot selon sa catégorie, sinon dans « À ranger »", async () => {
    const { buildLexiconTree } = await import("@/lib/language/curriculum");
    const tree = buildLexiconTree([
      { id: "a", french: "mabawa", shimaore: "x", category: "Nourriture › Plats" },
      { id: "b", french: "truc", shimaore: "y", category: null },
      { french: "On se voit au marché", shimaore: "z" },
    ]);
    const plats = tree.children!.find((t) => t.id === "nourriture")!.children!.find((g) => g.label === "Plats")!;
    assert.ok(plats.children!.some((n) => n.label === "mabawa" && n.word?.bonus));
    assert.equal(tree.children!.at(-1)!.label, "À ranger");
    const phrases = tree.children!.find((t) => t.id === "phrases")!;
    assert.equal(phrases.children!.at(-1)!.label, "Apprises en parlant");
  });
});
