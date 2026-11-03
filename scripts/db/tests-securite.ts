/**
 * Tests des droits d'accès sur la base locale de test.
 *
 *   pnpm db:tests-securite
 *
 * Recrée btm_test (imitation de Supabase + migrations), ajoute les données
 * fictives, puis joue supabase/local/20_tests_securite.sql. Sortie en échec
 * s'il y a une régression (ÉCHEC) ; les failles connues de l'audit sont
 * listées à part tant qu'elles ne sont pas corrigées.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { localEnv, psql, ROOT } from "./pg";

const DATABASE = process.env.LOCAL_PGDATABASE ?? "btm_test";

const setup = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts", "db", "local.ts")], { encoding: "utf8" });
if (setup.status !== 0) {
  console.error(setup.stdout, setup.stderr);
  process.exit(1);
}

const env = localEnv(DATABASE);
const seed = psql(env, ["-1", "-f", path.join(ROOT, "supabase", "local", "10_donnees_fictives.sql")]);
if (seed.status !== 0) {
  console.error(`✗ Données fictives :\n${seed.stderr}`);
  process.exit(1);
}

// -q masque les NOTICE : on les veut ici, mais pas les « SET », « BEGIN »…
const result = psql(env, ["-v", "VERBOSITY=terse", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "-f", path.join(ROOT, "supabase", "local", "20_tests_securite.sql")]);
const lines = result.stderr.split(/\r?\n/).map((l) => l.replace(/^.*?(NOTICE|REMARQUE)\s*:\s*/, "")).filter((l) => / \| /.test(l));
const errors = result.stderr.split(/\r?\n/).filter((l) => /ERROR|ERREUR/.test(l));

const ok = lines.filter((l) => l.startsWith("OK |"));
const known = lines.filter((l) => l.startsWith("FAILLE CONNUE"));
const failed = lines.filter((l) => l.startsWith("ÉCHEC |"));

for (const line of [...failed, ...known]) console.log(line);
console.log(`\n${ok.length} OK · ${known.length} faille(s) connue(s) · ${failed.length} échec(s)`);
if (errors.length || result.status !== 0) {
  console.error(`\n✗ Le script de tests s'est arrêté :\n${errors.join("\n") || result.stderr}`);
  process.exit(1);
}
process.exit(failed.length ? 1 : 0);
