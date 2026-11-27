import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseVoiceRequest, VOICE_MAX_BODY_BYTES } from "../src/lib/developers/voice-request";
import { RATE_LIMIT_POLICIES } from "../src/server/middlewares/rate-limit/policies";

describe("API des développeurs : voix de Tamilya", () => {
  it("accepte un texte, sans les espaces autour", () => {
    assert.deepEqual(parseVoiceRequest(JSON.stringify({ text: "  Karibu !  " })), { ok: true, text: "Karibu !" });
    assert.deepEqual(parseVoiceRequest(JSON.stringify({ text: "a".repeat(2_000) })), { ok: true, text: "a".repeat(2_000) });
  });

  it("refuse un texte vide, trop long, ou un corps illisible (400)", () => {
    for (const raw of [
      JSON.stringify({ text: "   " }),
      JSON.stringify({ text: "a".repeat(2_001) }),
      JSON.stringify({}),
      JSON.stringify({ text: 42 }),
      "pas du json",
      "null",
    ]) {
      assert.deepEqual(parseVoiceRequest(raw), { ok: false, status: 400 }, raw.slice(0, 30));
    }
  });

  it("refuse les champs inconnus, y compris le choix d'une autre voix", () => {
    assert.deepEqual(parseVoiceRequest(JSON.stringify({ text: "Bonjour", voice: "Kore" })), { ok: false, status: 400 });
    assert.deepEqual(parseVoiceRequest(JSON.stringify({ text: "Bonjour", extra: 1 })), { ok: false, status: 400 });
  });

  it("refuse un corps de plus de 64 Ko (413), comptés en octets", () => {
    assert.deepEqual(parseVoiceRequest(" ".repeat(VOICE_MAX_BODY_BYTES + 1)), { ok: false, status: 413 });
    assert.deepEqual(parseVoiceRequest("é".repeat(VOICE_MAX_BODY_BYTES / 2 + 1)), { ok: false, status: 413 });
  });

  it("a ses propres quotas, à part des questions texte", () => {
    assert.deepEqual(
      RATE_LIMIT_POLICIES.developerVoiceKey.map((r) => [r.limit, r.windowSeconds]),
      [[20, 60], [300, 86_400]],
    );
  });

  it("n'envoie pas d'en-tête CORS et ne garde aucun code en dur", () => {
    const code = readFileSync("src/server/controllers/v1/tamilya-voice.controller.ts", "utf8");
    assert.doesNotMatch(code, /Access-Control-Allow/i);
    assert.doesNotMatch(code, /tml_[A-Za-z0-9]/);
  });
});
