import assert from "node:assert/strict";
import { test } from "node:test";
import { hangUpVoice, isVoiceIdle, VOICE_HANG_UP_EVENT, VOICE_IDLE_LIMIT_MS } from "../src/lib/voice-live/hang-up";

test("le vocal raccroche après deux minutes sans échange, pas avant", () => {
  assert.equal(isVoiceIdle(1_000, 1_000 + VOICE_IDLE_LIMIT_MS - 1), false);
  assert.equal(isVoiceIdle(1_000, 1_000 + VOICE_IDLE_LIMIT_MS), true);
});

test("un écran par-dessus le vocal le coupe", () => {
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", { value: target, configurable: true });
  let heard = 0;
  target.addEventListener(VOICE_HANG_UP_EVENT, () => heard++);
  hangUpVoice();
  assert.equal(heard, 1);
  Reflect.deleteProperty(globalThis, "window");
});
