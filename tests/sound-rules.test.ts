import assert from "node:assert/strict";
import { test } from "node:test";
import { tidyAmbiences, tidyCues } from "../src/lib/lecture/sound-rules";
import type { SceneAmbience, SoundCue } from "../src/lib/lecture/script";

const bed = (sound: string): SceneAmbience => ({ sound, side: 0, distance: "loin", height: "milieu", volume: 0.5, moving: false });
const cue = (sound: string): SoundCue => ({ sound, when: "pendant", from: 0, to: null, distance: "pres", height: "milieu", path: [] });
const scary = (s: string) => s === "tonnerre" || s === "coeur";
const sounds = (list: { sound: string }[]) => list.map((x) => x.sound);

test("décor : pas de mélange jour/nuit, le premier choisi décide", () => {
  assert.deepEqual(sounds(tidyAmbiences([bed("nuit"), bed("marche"), bed("vent")], false, scary)), ["nuit", "vent"]);
  assert.deepEqual(sounds(tidyAmbiences([bed("enfants"), bed("grenouilles")], false, scary)), ["enfants"]);
});

test("décor : deux au plus, sans doublon", () => {
  assert.deepEqual(sounds(tidyAmbiences([bed("vent"), bed("vent"), bed("pluie"), bed("oiseaux")], false, scary)), ["vent", "pluie"]);
});

test("décor : rien qui fait peur sous une musique légère", () => {
  assert.deepEqual(sounds(tidyAmbiences([bed("tonnerre"), bed("vent")], true, scary)), ["vent"]);
  assert.deepEqual(sounds(tidyAmbiences([bed("tonnerre"), bed("vent")], false, scary)), ["tonnerre", "vent"]);
});

test("bruits : deux au plus, pas le même qu'à la réplique d'avant", () => {
  assert.deepEqual(sounds(tidyCues([cue("pas"), cue("frappe"), cue("toux")], false, scary, new Set(), false)), ["pas", "frappe"]);
  assert.deepEqual(sounds(tidyCues([cue("pas"), cue("toux")], false, scary, new Set(["pas"]), false)), ["toux"]);
});

test("bruits : gardés quand la narratrice les imite, même répétés", () => {
  assert.deepEqual(sounds(tidyCues([cue("frappe")], false, scary, new Set(["frappe"]), true)), ["frappe"]);
});

test("bruits : « toc » puis « toc » dans la même réplique reste permis", () => {
  assert.deepEqual(sounds(tidyCues([cue("frappe"), cue("frappe")], false, scary, new Set(), false)), ["frappe", "frappe"]);
});

test("bruits : rien qui fait peur sous une musique légère", () => {
  assert.deepEqual(sounds(tidyCues([cue("coeur"), cue("rire")], true, scary, new Set(), false)), ["rire"]);
});
