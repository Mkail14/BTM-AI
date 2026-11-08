import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { normalizeAddressLine } from "@/lib/auth/signup";
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
