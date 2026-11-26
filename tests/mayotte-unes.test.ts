import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newsPlace } from "@/lib/mayotte/news-place";
import { pickHeadlines } from "@/server/controllers/mayotte/une.controller";
import { imageOf, type NewsItem } from "@/server/services/live/news";

describe("unes de la page Mayotte", () => {
  it("trouve le lieu de l'article, d'abord dans le titre", () => {
    assert.equal(newsPlace("Pamandzi : première projection du documentaire")?.name, "Pamandzi");
    assert.equal(newsPlace("Accident à Kani-Kéli ce matin")?.name, "Kani-Kéli");
    assert.equal(newsPlace("Incendie à Mtsapéré")?.name, "M'Tsapéré");
    assert.equal(newsPlace("Coupure d'eau à Passamaïnty")?.name, "Passamainty");
    assert.equal(newsPlace("Barrages sur la route", "Les gendarmes sont intervenus à Combani")?.name, "Combani");
    assert.equal(newsPlace("Le collège de Petite-Terre fermé")?.name, "Petite-Terre");
    assert.equal(newsPlace("L'inflation remonte à Mayotte", "Les prix augmentent sur l'île"), null);
    assert.equal(newsPlace("Écoles fermées vendredi", "Des barrages à Ouangani, Kahani et Tsingoni"), null);
    assert.equal(newsPlace("Treize interpellations à Tsoundzou")?.name, "Tsoundzou");
  });

  it("prend la photo de l'article dans le flux, jamais une vidéo ni une icône", () => {
    assert.equal(imageOf(`<item><media:content url="https://j.yt/a.jpg" medium="image"/></item>`), "https://j.yt/a.jpg");
    assert.equal(imageOf(`<item><enclosure url="https://j.yt/v.mp4" type="video/mp4" /></item>`), undefined);
    assert.equal(
      imageOf(`<item><content:encoded><![CDATA[<img src="https://j.yt/loading.svg"/><p>x</p><img class="a" src="https://j.yt/b.jpg?w=1&amp;h=2"/>]]></content:encoded></item>`),
      "https://j.yt/b.jpg?w=1&h=2",
    );
  });

  it("garde les plus récents sans doublon, en mélangeant les journaux", () => {
    const item = (source: string, title: string, n: number): NewsItem => ({ source, title, link: `https://j.yt/${n}`, date: null, summary: "" });
    const items = [
      item("A", "Grève à Mamoudzou", 1),
      item("B", "Grève à Mamoudzou !", 2),
      ...Array.from({ length: 6 }, (_, i) => item("A", `Titre ${i}`, 10 + i)),
      item("C", "Fête à Sada", 30),
    ];
    const picked = pickHeadlines(items);
    assert.deepEqual(
      picked.map((h) => h.title),
      ["Grève à Mamoudzou", "Titre 0", "Titre 1", "Titre 2", "Fête à Sada"],
    );
    assert.equal(picked[0].place?.name, "Mamoudzou");
  });
});
