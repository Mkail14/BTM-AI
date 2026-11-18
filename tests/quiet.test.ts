import assert from "node:assert/strict";
import { test } from "node:test";
import { isMayotteNight, quietRules } from "../src/lib/voice-live/quiet";

test("chuchoter : la nuit de Mayotte va de 22 h à 7 h (UTC+3)", () => {
  assert.equal(isMayotteNight(new Date("2026-11-18T19:00:00Z")), true); // 22 h
  assert.equal(isMayotteNight(new Date("2026-11-18T03:59:00Z")), true); // 6 h 59
  assert.equal(isMayotteNight(new Date("2026-11-18T04:00:00Z")), false); // 7 h
  assert.equal(isMayotteNight(new Date("2026-11-18T18:59:00Z")), false); // 21 h 59
});

test("chuchoter : voix basse la nuit ou au casque, toujours possible sur demande", () => {
  assert.doesNotMatch(quietRules(false, false), /Voix basse/);
  assert.match(quietRules(false, false), /Chuchoter sur demande/);
  assert.match(quietRules(true, false), /il fait nuit\./);
  assert.match(quietRules(false, true), /casque/);
  assert.match(quietRules(true, true), /nuit et la personne t'écoute au casque/);
});
