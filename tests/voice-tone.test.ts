import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { DEFAULT_PERSONALITY } from "../src/lib/ai/personalities";
import { VOICE_TONE } from "../src/lib/ai/voice-tone";

test("le ton oral s'ajoute seulement en vocal", () => {
  assert.ok(buildSystemPrompt(DEFAULT_PERSONALITY, { voice: true }).includes(VOICE_TONE));
  assert.ok(!buildSystemPrompt(DEFAULT_PERSONALITY, {}).includes(VOICE_TONE));
});

test("le ton oral reste court et n'emploie que des mots validés", () => {
  assert.ok(VOICE_TONE.includes("une à deux phrases"));
  assert.ok(VOICE_TONE.includes("Marahaba mingih"));
  assert.doesNotMatch(VOICE_TONE, /\b(kwaheri|mendji|vhendza|tsidiyo|kibushi)\b/i);
});

test("Tamilya ne répète pas une affirmation, à l'écrit comme à l'oral, sauf en mode maître", () => {
  const rule = "Ne dis jamais deux fois la même chose";
  assert.ok(buildSystemPrompt(DEFAULT_PERSONALITY, {}).includes(rule));
  assert.ok(buildSystemPrompt(DEFAULT_PERSONALITY, { voice: true }).includes(rule));
  assert.ok(!buildSystemPrompt(DEFAULT_PERSONALITY, { teacher: true }).includes(rule));
});

test("le mode question complexe ne fait plus reformuler", () => {
  const deep = buildSystemPrompt(DEFAULT_PERSONALITY, { deep: true });
  assert.ok(deep.includes("simple affirmation"));
  assert.doesNotMatch(deep, /reformule le vrai besoin/);
});
