import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { buildCompleteSql, finalTables, readMigrations } from "../scripts/db/base-complete";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("database/btm-ai.sql", () => {
  it("est à jour avec supabase/migrations (sinon : pnpm db:complet)", () => {
    const saved = readFileSync(path.join(ROOT, "database", "btm-ai.sql"), "utf8").replace(/\r\n/g, "\n");
    assert.equal(saved, buildCompleteSql(readMigrations(ROOT)));
  });
});

describe("finalTables", () => {
  it("suit les créations, renommages et suppressions dans l'ordre", () => {
    const tables = finalTables([
      { name: "1.sql", sql: "create table public.a (id int);\ncreate table if not exists b (id int);\ncreate table private.secret (id int);" },
      { name: "2.sql", sql: "alter table public.b rename to c;\ndrop table if exists public.a;\n-- create table ignoree (id int);" },
    ]);
    assert.deepEqual(tables, ["c"]);
  });
});
