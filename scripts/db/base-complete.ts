/**
 * Fichier SQL complet de la base (database/btm-ai.sql), construit à partir des
 * migrations de supabase/migrations, dans l'ordre où Supabase les applique.
 * Les migrations restent la source : ce fichier en est la vue d'ensemble, à
 * regénérer avec `pnpm db:complet` après chaque nouvelle migration
 * (tests/database.test.ts échoue sinon).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type Migration = { name: string; sql: string };

const TABLE_NAME = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;
const CREATE_TABLE = new RegExp(String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?${TABLE_NAME}\s*\(`, "gi");
const DROP_TABLE = new RegExp(String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?${TABLE_NAME}`, "gi");
const RENAME_TABLE = new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?${TABLE_NAME}\s+rename\s+to\s+"?([a-z_][a-z0-9_]*)"?`, "gi");

export function readMigrations(root: string): Migration[] {
  const dir = path.join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), "utf8") }));
}

/** Tables du schéma public présentes une fois toutes les migrations jouées (hors schémas private et auth). */
export function finalTables(migrations: Migration[]): string[] {
  const tables = new Set<string>();
  for (const { sql } of migrations) {
    const code = sql.replace(/--[^\n]*/g, "");
    const events: { at: number; apply: () => void }[] = [];
    for (const m of code.matchAll(CREATE_TABLE)) {
      if (!/\bprivate\.|\bauth\./i.test(m[0])) events.push({ at: m.index, apply: () => tables.add(m[1]) });
    }
    for (const m of code.matchAll(DROP_TABLE)) events.push({ at: m.index, apply: () => tables.delete(m[1]) });
    for (const m of code.matchAll(RENAME_TABLE)) {
      events.push({ at: m.index, apply: () => tables.delete(m[1]) && tables.add(m[2]) });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return [...tables].sort();
}

export function buildCompleteSql(migrations: Migration[]): string {
  const tables = finalTables(migrations);
  const header = [
    "-- BTM AI — Base complète : tables, règles (contraintes, RLS), déclencheurs, vues,",
    "-- fonctions et données de référence (mots du lexique, réglages).",
    "--",
    "-- FICHIER GÉNÉRÉ par `pnpm db:complet` : ne pas le modifier à la main.",
    "-- Source : supabase/migrations, mises bout à bout dans l'ordre d'application.",
    "-- Toute modification de la base passe par une nouvelle migration, puis on regénère ce fichier.",
    "--",
    "-- Sur Supabase : à jouer sur un projet vide (Auth fournit le schéma auth).",
    "-- Sur un PostgreSQL local : jouer d'abord database/imitation-supabase.sql (voir database/README.md).",
    "--",
    `-- ${migrations.length} migrations · ${tables.length} tables dans le schéma public :`,
    ...wrap(tables.join(", "), 90).map((line) => `--   ${line}`),
  ];
  const body = migrations.map(({ name, sql }) => {
    const rule = `-- ${"=".repeat(76)}`;
    return `${rule}\n-- ${name}\n${rule}\n\n${sql.replace(/\r\n/g, "\n").trim()}\n`;
  });
  return `${header.join("\n")}\n\n${body.join("\n")}`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
