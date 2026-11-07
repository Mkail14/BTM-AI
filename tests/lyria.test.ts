import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readInteraction } from "../src/lib/music/lyria";

describe("Lyria : lecture de la réponse", () => {
  it("prend le son (base64) et le texte des étapes model_output", () => {
    const audio = Buffer.from("ID3-son").toString("base64");
    const read = readInteraction({
      steps: [
        { type: "user_input", content: [{ type: "text", text: "ignoré" }] },
        { type: "model_output", content: [{ type: "text", text: "[Refrain]" }, { type: "audio", data: audio, mime_type: "audio/mpeg" }, { type: "text", text: "Tamilya chante" }] },
      ],
    });
    assert.equal(read.audio?.toString(), "ID3-son");
    assert.equal(read.mimeType, "audio/mpeg");
    assert.equal(read.text, "[Refrain]\nTamilya chante");
  });

  it("sans son : audio vide, pour qu'on le dise au lieu de jouer du silence", () => {
    const read = readInteraction({ steps: [{ type: "model_output", content: [{ type: "text", text: "refus" }] }] });
    assert.equal(read.audio, null);
    assert.equal(read.text, "refus");
    assert.equal(readInteraction({}).audio, null);
  });
});
