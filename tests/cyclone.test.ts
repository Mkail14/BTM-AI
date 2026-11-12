import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backtest, closestOf, estimate, stateOf } from "@/lib/cyclone/engine";
import { cycloneBlock, cycloneZoneFor, cycloneZoneOf } from "@/lib/cyclone/intent";
import { motionOf, positionAt } from "@/lib/cyclone/motion";

const p = (at: string, lat: number, lng: number, forecast = false) => ({ at, lat, lng, forecast });

/** Système n°2 tel que GDACS le donnait le 9 novembre 2026 (mesures jusqu'au 8 à 12 h UTC, puis prévision). */
const track = [
  p("2026-11-07T06:00:00Z", -13.57, 54.08),
  p("2026-11-07T12:00:00Z", -13.99, 53.59),
  p("2026-11-07T18:00:00Z", -13.51, 52.73),
  p("2026-11-08T00:00:00Z", -13.35, 52.06),
  p("2026-11-08T06:00:00Z", -12.77, 51.26),
  p("2026-11-08T12:00:00Z", -11.8, 50.54),
  p("2026-11-09T00:00:00Z", -11.18, 49.62, true),
  p("2026-11-09T12:00:00Z", -11.07, 48.34, true),
];
const systeme2 = { now: { lat: -11.8, lng: 50.54, at: "2026-11-08T12:00:00Z" }, track, windKmh: 63 };

describe("cyclones : déplacement", () => {
  it("dit de combien il a bougé sur 24 h, vers où, et s'il s'approche de Mayotte", () => {
    const m = motionOf(systeme2);
    assert.ok(m);
    assert.equal(m.since, "2026-11-07T12:00:00Z");
    assert.equal(m.hours, 24);
    assert.ok(m.movedKm > 350 && m.movedKm < 450, `parcouru ${m.movedKm} km`);
    assert.equal(m.direction, "le nord-ouest");
    assert.ok(m.closerKm > 300, `rapproché de ${m.closerKm} km`);
  });

  it("une seule mesure : rien à comparer", () => {
    assert.equal(motionOf({ now: systeme2.now, track: [p(systeme2.now.at, -11.8, 50.54)] }), null);
  });

  it("rejoue le trajet entre deux points", () => {
    const mid = positionAt(track, Date.parse("2026-11-08T03:00:00Z"));
    assert.ok(mid);
    assert.equal(Math.round(mid.lat * 100) / 100, -13.06);
    assert.equal(Math.round(mid.lng * 100) / 100, 51.66);
    assert.equal(positionAt(track, 0), track[0]);
    assert.equal(positionAt(track, Date.parse("2030-01-01")), track[track.length - 1]);
  });
});

describe("cyclones : moteur d'estimation", () => {
  it("plus courte distance mesurée sur le trait, pas seulement aux points", () => {
    // Passe à 50 km au nord de Mayotte entre deux points éloignés.
    const c = closestOf({ xy: [[-300, 50], [300, 50]], t: [0, 10] });
    assert.equal(Math.round(c.km), 50);
    assert.equal(c.t, 5);
  });

  it("vitesse sur les 12 dernières heures", () => {
    const s = stateOf(systeme2);
    assert.ok(s.vx < -10 && s.vy > 10, "vers le nord-ouest");
  });

  it("donne des chances cohérentes, avec des anciens cyclones pour l'expliquer", () => {
    const e = estimate(systeme2);
    assert.ok(e);
    assert.ok(e.within100 <= e.within200 && e.within200 <= e.within300);
    assert.ok(e.within300 >= 0 && e.within300 <= 100);
    assert.equal(e.basis, "officielle+archives");
    assert.ok(e.analogs >= 8);
    assert.ok(e.examples.length > 0 && e.examples.every((x) => x.name && x.year >= 1980));
    assert.ok(e.spread.length > 0 && e.spread.every((line) => line.every(([lng, lat]) => Math.abs(lng) <= 180 && Math.abs(lat) <= 90)));
    // Même entrée, même résultat (aucun hasard).
    assert.deepEqual(estimate(systeme2), e);
  });

  it("droit sur Mayotte avec une prévision longue : chances élevées", () => {
    const at = (h: number) => new Date(Date.parse("2027-01-10T00:00:00Z") + h * 3_600_000).toISOString();
    const straight = [p(at(-12), -12.8, 48.2), p(at(0), -12.8, 47.2), p(at(24), -12.8, 46.2, true), p(at(48), -12.8, 45.2, true), p(at(72), -12.8, 44.2, true)];
    const e = estimate({ now: { lat: -12.8, lng: 47.2, at: at(0) }, track: straight, windKmh: 150 });
    assert.ok(e);
    assert.ok(e.within200 >= 60, `${e.within200} %`);
    assert.ok(e.when && Math.abs(Date.parse(e.when) - Date.parse(at(48))) < 18 * 3_600_000);
  });

  it("sur 40 ans d'archive, fait mieux que la moyenne des saisons", () => {
    const r = backtest({ fromSeason: 2005 });
    assert.ok(r.cases > 200, `${r.cases} cas`);
    assert.ok(r.skill > 0.05, `gain ${r.skill}`);
  });
});

describe("cyclones : notre océan ou le monde", () => {
  it("« les autres cyclones », « le monde », un typhon : la carte s'ouvre sur le monde", () => {
    for (const m of ["Montre-moi les autres cyclones", "il y a des cyclones dans le monde ?", "un typhon au Japon ?", "et ailleurs, des cyclones ?"]) {
      assert.equal(cycloneZoneFor(m), "monde", m);
    }
  });
  it("une question sur Mayotte reste sur notre océan", () => {
    for (const m of ["il y a un cyclone ?", "un cyclone arrive à Mayotte cette semaine ?"]) assert.equal(cycloneZoneFor(m), "ocean-indien", m);
  });
  it("le bloc garde la zone, et la carte la relit", () => {
    assert.equal(cycloneZoneOf(cycloneBlock("monde").split("\n")[3]), "monde");
    assert.equal(cycloneZoneOf("ocean-indien"), "ocean-indien");
    assert.equal(cycloneZoneOf(""), "ocean-indien");
  });
});
