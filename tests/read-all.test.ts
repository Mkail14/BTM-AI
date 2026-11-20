import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAGE_ROWS, readAllRows } from "../src/server/models/read-all";

/** Faux Supabase : comme le vrai, jamais plus de 1 000 lignes par requête. */
function table(size: number, failAt?: number) {
  const rows = Array.from({ length: size }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    if (failAt !== undefined && from >= failAt) return { data: null, error: new Error("panne") };
    return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null };
  };
  return { page, calls };
}

describe("readAllRows : tout le dictionnaire malgré le plafond de 1 000 lignes", () => {
  it("lit les 1 860 mots du 2026-11-20, pas seulement les 1 000 premiers", async () => {
    const { page, calls } = table(1860);
    const { data, error } = await readAllRows(page);
    assert.equal(error, null);
    assert.equal(data.length, 1860);
    assert.deepEqual(data.at(-1), { id: 1859 });
    assert.deepEqual(calls, [[0, PAGE_ROWS - 1], [PAGE_ROWS, 2 * PAGE_ROWS - 1]]);
  });

  it("s'arrête à une page pleine suivie d'une page vide", async () => {
    const { page, calls } = table(2000);
    assert.equal((await readAllRows(page)).data.length, 2000);
    assert.equal(calls.length, 3);
  });

  it("respecte le maximum demandé", async () => {
    const { page } = table(5000);
    assert.equal((await readAllRows(page, 1500)).data.length, 1500);
  });

  it("garde les lignes déjà lues et rend l'erreur d'une page en panne", async () => {
    const { page } = table(3000, 1000);
    const { data, error } = await readAllRows(page);
    assert.equal(data.length, 1000);
    assert.ok(error instanceof Error);
  });
});
