import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { globeFlightFrames } from "../src/components/chat/globe-origin";

const rect = (left: number, top: number, size: number) => ({ left, top, width: size, height: size }) as DOMRect;
const read = (frame: Keyframe) => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(String(frame.transform));
  return m ? { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) } : null;
};

describe("vol du globe vers la première réponse", () => {
  const frames = globeFlightFrames(rect(100, 300, 136), rect(20, 100, 32));

  it("part de la place du grand globe, à sa taille, et finit à la place du petit rond", () => {
    assert.deepEqual(read(frames[0]), { x: 132, y: 252, scale: 4.25 });
    assert.equal(frames.at(-1)?.transform, "translate(0, 0) scale(1)");
    assert.equal(frames.at(-1)?.offset, 1);
  });

  it("rétrécit pendant tout le trajet, sans rétrécir d'abord sur place", () => {
    const path = frames.map(read).filter((f) => f !== null);
    for (let i = 1; i < path.length; i++) assert.ok(path[i].scale <= path[i - 1].scale, `image ${i}`);
    // Dès qu'il a rétréci de moitié, il a déjà bien avancé.
    const half = path.find((f) => f.scale <= 2.125)!;
    assert.ok(Math.hypot(half.x, half.y) < Math.hypot(132, 252) * 0.75);
  });

  it("ne s'écrase pas en se posant (même échelle en largeur et en hauteur)", () => {
    for (const frame of frames) assert.doesNotMatch(String(frame.transform), /scale\([\d.]+, /);
  });
});
