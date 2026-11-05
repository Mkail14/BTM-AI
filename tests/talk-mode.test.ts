import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readTalkMode, saveTalkMode, subscribeTalkMode } from "@/lib/voice-live/talk-mode";

describe("choix du mode vocal", () => {
  it("demande le choix tant que rien n'est enregistré, et ignore une valeur inconnue", () => {
    const store = new Map([["tamilya-vocal-mode", "autre"]]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) },
    });
    assert.equal(readTalkMode(), null);
  });

  it("retient le choix et prévient les paramètres", () => {
    let changes = 0;
    const unsubscribe = subscribeTalkMode(() => changes++);
    saveTalkMode("free");
    unsubscribe();
    saveTalkMode("free");
    assert.equal(readTalkMode(), "free");
    assert.equal(changes, 1);
  });

  it("garde le choix en mémoire si le navigateur refuse le stockage", () => {
    const refuse = () => {
      throw new Error("refusé");
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: refuse, setItem: refuse } });
    saveTalkMode("hold");
    assert.equal(readTalkMode(), "hold");
  });
});
