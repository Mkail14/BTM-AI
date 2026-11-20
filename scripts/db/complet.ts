/**
 * Regénère database/btm-ai.sql, la base complète en un seul fichier.
 *
 *   pnpm db:complet
 *
 * À lancer après chaque nouvelle migration dans supabase/migrations.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildCompleteSql, finalTables, readMigrations } from "./base-complete";
import { ROOT } from "./pg";

const migrations = readMigrations(ROOT);
const target = path.join(ROOT, "database", "btm-ai.sql");
writeFileSync(target, buildCompleteSql(migrations), "utf8");
console.log(`✓ ${path.relative(ROOT, target)} : ${migrations.length} migrations, ${finalTables(migrations).length} tables`);
