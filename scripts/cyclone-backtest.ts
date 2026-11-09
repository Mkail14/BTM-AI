/**
 * Vérifie le moteur d'estimation des cyclones sur 40 ans d'archive, et essaie
 * plusieurs réglages pour garder le meilleur (à recopier dans TUNING, engine.ts).
 *
 *   node --conditions=react-server --import tsx scripts/cyclone-backtest.ts
 */
import { backtest, TUNING, type Tuning } from "../src/lib/cyclone/engine";

const show = (label: string, t: Tuning) => {
  const r = backtest({ tuning: t });
  console.log(`${label.padEnd(44)} cas ${r.cases}  oui ${r.positives}  Brier ${r.brier}  moyenne ${r.climatology}  gain ${(r.skill * 100).toFixed(1)} %`);
  return r.skill;
};

show("Réglage actuel", TUNING);

let best = { skill: -Infinity, t: TUNING };
for (const posKm of [200, 300]) {
  for (const speedKmh of [3, 4, 6]) {
    for (const days of [45, 90]) {
      for (const keep of [30, 50]) {
        const t = { ...TUNING, posKm, speedKmh, days, keep };
        const skill = show(`pos ${posKm} vit ${speedKmh} jours ${days} garde ${keep}`, t);
        if (skill > best.skill) best = { skill, t };
      }
    }
  }
}
console.log("\nMeilleur :", best.t, `gain ${(best.skill * 100).toFixed(1)} %`);
for (const r of [100, 300]) {
  const b = backtest({ radiusKm: r, tuning: best.t });
  console.log(`À moins de ${r} km :`, b);
}
