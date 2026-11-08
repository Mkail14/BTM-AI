import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { normalizeAddressLine } from "@/lib/auth/signup";
import { moveBlockValue, saveBlockValue } from "@/lib/chat/block-key";
import { readingSubject } from "@/lib/voice-live/tools";

/** Contrôle qualité du 2026-11-08 : chaque correction a sa preuve ici. */

describe("adresse écrite à l'inscription", () => {
  it("garde les « s » et ramène les espaces à un seul", () => {
    // Avant : /s+/ au lieu de /\s+/, chaque « s » devenait un espace (« rue des Roses » → « rue de  Ro e »).
    assert.equal(normalizeAddressLine("  12 rue des Roses,\n  Passamaïnty  "), "12 rue des Roses, Passamaïnty");
    assert.equal(normalizeAddressLine("Missiri  sss"), "Missiri sss");
  });
});

describe("sujet d'une histoire demandée au vocal", () => {
  it("garde les « s » et met le sujet sur une ligne", () => {
    assert.equal(readingSubject({ sujet: "  une histoire de sorcières\n à Sada " }), "une histoire de sorcières à Sada");
  });

  it("vide sans sujet, coupé à 300 caractères", () => {
    assert.equal(readingSubject({}), "");
    assert.equal(readingSubject({ sujet: "s".repeat(400) }).length, 300);
  });
});

describe("achat gardé sur l'appareil (barge, repas)", () => {
  /** Stockage plein ou bloqué : chaque appel lève une erreur, comme Safari ou une WebView sans stockage. */
  function withBrokenStorage(run: () => void) {
    const failing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: failing, configurable: true, writable: true });
    try {
      run();
    } finally {
      if (before) Object.defineProperty(globalThis, "localStorage", before);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it("un stockage plein ne fait pas croire à un paiement raté", () => {
    // Avant : setItem levait l'erreur dans le bloc du paiement, déjà débité, qui affichait « Pas de connexion ».
    withBrokenStorage(() => {
      assert.equal(saveBlockValue("barge/c/1#0", "{}"), false);
      assert.doesNotThrow(() => moveBlockValue("barge/#0", "barge/c/1#0"));
    });
  });

  it("garde l'achat quand le stockage marche", () => {
    const store = new Map<string, string>();
    const working = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: working, configurable: true, writable: true });
    try {
      assert.equal(saveBlockValue("repas/#0", "{\"code\":\"A1\"}"), true);
      moveBlockValue("repas/#0", "repas/c/1#0");
      assert.equal(store.get("repas/c/1#0"), "{\"code\":\"A1\"}");
      assert.equal(store.has("repas/#0"), false);
    } finally {
      if (before) Object.defineProperty(globalThis, "localStorage", before);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("expressions régulières des espaces", () => {
  it("aucun replace(/s+/) sans barre oblique inverse dans src", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    const typos = files.filter((file) => /replace\(\/[sdw][+*]\//.test(readFileSync(file, "utf8")));
    assert.deepEqual(typos, []);
  });
});
