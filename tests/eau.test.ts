import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mayotteTime, readPlanning, sectorNow, type DayCell, type WaterPlanning } from "@/lib/water/schedule";
import { buildWaterMap, namedSpots, waterSummary } from "@/lib/water/map";
import { findZone } from "@/lib/water/zones";
import { detectWater, followsWater } from "@/lib/water/intent";
import { understand } from "@/lib/ai/understanding";

/** Lieux du planning officiel de la SMAE du 02 au 22/11/2026, recopiés de son image. */
const SECTORS = {
  "1": [
    "Acoua Haut", "Bambo-Est", "Bambo-Ouest", "Bandraboua village (nord)", "Barakani", "Bouyouni", "Coconi", "Combani Sud",
    "Convaslescence – Mdz (100 villas, vertivert)", "Dembeni village", "Doujani", "Hagnoundrou", "Handrema", "Hapandzo", "Hauts Vallons", "Iloni",
    "Kani-Kéli village", "Labattoir – Centre", "Majicavo-Lamir", "Mamoudzou Centre", "Mbouenatsa", "Mramadoudou", "Mtsahara", "Mtsamoudou Bas",
    "Mtsapéré Bonovo", "Nyambadao", "Pamandzi Est", "Pamandzi La Vigie", "Passamainty Manguiers", "Poroani", "Sohoa", "Trévani", "Tsingoni",
  ],
  "2": [
    "Acoua bas", "Bandraboua village (sud – Ngambo Titi)", "Bandrélé village", "Bouéni (quartier Mrambolé)", "Chembenyoumba", "Chiconi village",
    "Chirongui village", "Combani Champs d'Ylangs", "Convalescence - Cavani Sud", "Dapani", "Ironi-Bé", "Kani-Bé", "Kawéni village", "Koungou village",
    "Labattoir – Badamiers", "Longoni", "Mamoudzou – Boboka et Marché Couvert", "Mbouini", "Miréréni (Chirongui)", "Miréréni (Tsingoni)",
    "Moinatrindri Bas", "Mroalé", "Mtsamboro village", "Mtsangadoua", "Musicale Plage", "Mzouazia", "Ouangani village",
    "Passamainty Kavani-Bé + Ngambo Titi", "Tsararano", "Tsoundzou I",
  ],
  "3": [
    "Acoua Marvatou et Bon Soleil", "Bouéni (sauf Mrambolé)", "Cavani-Mamoudzou", "Choungui", "Combani Nord", "Dzaoudzi – Blv des Crabes", "Dzoumogné",
    "Hajangoua", "Hamjago", "Hamouro", "Kahani", "Kangani", "Kwalé", "Labattoir La Vigie", "Majicavo-Koropa", "Malamani", "Mangajou", "Mgnambani",
    "Mliha", "Moinatrindri Haut", "Mronabéja", "Mtsamoudou Haut", "Mtsangamboua", "Mtsangamouji village", "Mtsapéré", "Ongoujou", "Pamandzi Ouest",
    "Passi-Kéli", "Sada", "Tsimkoura", "Tsoundzou II", "Vahibé",
  ],
  "4": ["Z.I. Kawéni", "Z.I. Vallée 3"],
};

/** Semaine du 02 au 08/11/2026, recopiée de l'image de la SMAE. */
const WEEK: Record<string, DayCell[]> = {
  "1": ["fermeture", "ferme", "ouverture", "fermeture", "ferme", "ouverture", "fermeture"],
  "2": ["ferme", "ouverture", "fermeture", "ferme", "ouverture", "fermeture", "ferme"],
  "3": ["ouverture", "fermeture", "ferme", "ouverture", "fermeture", "ferme", "ouverture"],
  "4": Array<DayCell>(7).fill("journee"),
};

const planning: WaterPlanning = {
  from: "2026-11-02",
  to: "2026-11-08",
  sectors: Object.entries(SECTORS).map(([id, villages]) => ({ id, villages })),
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-11-0${i + 2}`,
    cells: Object.fromEntries(Object.entries(WEEK).map(([id, cells]) => [id, cells[i]])),
  })),
  source: "https://www.mahoraisedeseaux.com/article/article/363",
  title: "Planning des tours d'eau du 02.11.2026 au 22.11.2026",
  images: [],
  readAt: "2026-11-20T10:00:00Z",
};

const at = (date: string, hour: number) => mayotteTime(date, hour);

describe("tours d'eau : état d'un secteur", () => {
  it("avant la première fermeture de la période, l'eau coule", () => {
    const s = sectorNow(planning, "1", at("2026-11-02", 9));
    assert.equal(s.state, "eau");
    assert.equal(s.next?.at, at("2026-11-02", 16));
  });
  it("jour « fermé » : pas d'eau jusqu'à l'ouverture suivante", () => {
    const s = sectorNow(planning, "1", at("2026-11-03", 12));
    assert.equal(s.state, "coupee");
    assert.deepEqual(s.next, { on: true, at: at("2026-11-04", 10) });
  });
  it("juste après 10 h : l'eau revient (elle peut tarder)", () => {
    const s = sectorNow(planning, "1", at("2026-11-04", 11));
    assert.equal(s.state, "eau");
    assert.equal(s.arriving, true);
    assert.equal(sectorNow(planning, "1", at("2026-11-04", 15)).arriving, false);
  });
  it("secteur 4 : de 7 h à 17 h seulement", () => {
    assert.equal(sectorNow(planning, "4", at("2026-11-05", 6)).state, "coupee");
    assert.equal(sectorNow(planning, "4", at("2026-11-05", 12)).state, "eau");
    assert.equal(sectorNow(planning, "4", at("2026-11-05", 18)).state, "coupee");
  });
  it("hors de la période : inconnu", () => {
    assert.equal(sectorNow(planning, "2", at("2026-11-09", 12)).state, "inconnu");
    assert.equal(sectorNow(planning, "2", at("2026-11-01", 12)).state, "inconnu");
  });
});

describe("tours d'eau : carte", () => {
  it("chaque lieu du planning officiel a une place sur la carte", () => {
    const missing = Object.values(SECTORS).flat().filter((name) => !findZone(name));
    assert.deepEqual(missing, []);
  });
  it("deux lieux différents ne tombent jamais au même endroit", () => {
    const zones = Object.values(SECTORS).flat().map((name) => findZone(name)!.name);
    assert.equal(new Set(zones).size, zones.length);
  });
  it("colore selon le planning, hachure ce dont la SMAE ne parle pas", () => {
    const map = buildWaterMap(planning, [], at("2026-11-03", 12));
    assert.equal(map.spots.find((s) => s.name === "Koungou village")?.state, "eau");
    assert.equal(map.spots.find((s) => s.name === "Mamoudzou Centre")?.state, "coupee");
    assert.equal(map.spots.find((s) => s.name === "Hachénoi")?.state, "inconnu");
    assert.deepEqual(map.unplaced, []);
  });
  it("une coupure annoncée passe le lieu en rouge", () => {
    const alert = { id: "a", places: ["Koungou village"], from: "2026-11-03T00:00:00Z", until: "2026-11-04T12:00:00Z", note: "incident électrique" };
    const map = buildWaterMap(planning, [alert], at("2026-11-03", 12));
    const koungou = map.spots.find((s) => s.name === "Koungou village")!;
    assert.equal(koungou.state, "coupee");
    assert.match(koungou.detail, /incident électrique/);
  });
  it("sans planning pour aujourd'hui : tout est hachuré", () => {
    const map = buildWaterMap(planning, [], at("2026-11-20", 12));
    assert.equal(map.period, null);
    assert.ok(map.spots.every((s) => s.state === "inconnu"));
  });
  it("retrouve le lieu nommé dans la question", () => {
    const map = buildWaterMap(planning, [], at("2026-11-03", 12));
    assert.equal(namedSpots(map, "y a de l'eau à Koungou ?")[0]?.name, "Koungou village");
    assert.ok(namedSpots(map, "et à Labattoir ?").length >= 3);
    assert.match(waterSummary(map, "y a de l'eau à Koungou ?"), /Koungou village \(secteur 2\)/);
  });
  it("relit un planning enregistré et refuse un planning cassé", () => {
    assert.ok(readPlanning(JSON.parse(JSON.stringify(planning))));
    assert.equal(readPlanning({ from: "2026-11-02" }), null);
    assert.equal(readPlanning({ ...planning, from: "2026-12-01" }), null);
  });
});

describe("tours d'eau : questions reconnues", () => {
  for (const q of ["y a de l'eau à Koungou ?", "Les tours d'eau de demain", "L'eau revient quand à Sada", "montre la carte de l'eau", "coupure d'eau à Pamandzi"]) {
    it(`oui : ${q}`, () => assert.equal(detectWater(q), true));
  }
  for (const q of ["je veux boire de l'eau", "une bouteille d'eau coûte combien", "l'eau de coco c'est bon ?", "il y a un cyclone ?"]) {
    it(`non : ${q}`, () => assert.equal(detectWater(q), false));
  }
});

describe("tours d'eau : suite d'une question sur l'eau", () => {
  // 2026-11-26 : « et a trévani ? » après l'eau à Kawéni → « aucune information, regarde le Facebook de la SMAE ».
  it("« et à Trévani ? » après « ya de l'eau a kawéni ? » : toujours l'eau", () => {
    const follows = understand("et a trévani ?", [
      { role: "user", content: "ya de l'eau a kawéni ?" },
      { role: "assistant", content: "Pas d'eau à Kawéni village.\n\n```carte-eau\nKawéni village\n```" },
    ]);
    assert.equal(follows.followUp, true);
    assert.equal(followsWater(follows.previousAsks[0]), true);
  });
  it("la carte de l'eau dans la dernière réponse suffit", () => {
    assert.equal(followsWater("le planning ?", "Voici.\n\n```carte-eau\n\n```"), true);
  });
  it("pas une suite, ou une suite d'autre chose : non", () => {
    assert.equal(followsWater(undefined, "```carte-eau\n\n```"), false);
    assert.equal(followsWater("il y a un cyclone ?", "Rien en vue."), false);
  });
  it("le lieu de la suite est retrouvé sur la carte", () => {
    const map = buildWaterMap(planning, [], at("2026-11-03", 12));
    assert.ok(namedSpots(map, "et a trévani ?").some((s) => s.name.startsWith("Trévani")));
  });
});
