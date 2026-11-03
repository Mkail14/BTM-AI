/**
 * Base PostgreSQL locale de test (sans Docker).
 *
 *   pnpm db:local            recrée la base btm_test : imitation de Supabase
 *                            (supabase/local/00_supabase_stub.sql) puis toutes
 *                            les migrations, dans l'ordre, chacune dans une transaction
 *   pnpm db:local -- --keep  n'efface pas la base existante
 *
 * Seulement sur cette machine (localEnv refuse tout autre hôte). Connexion au
 * serveur local par le fichier pgpass, ou LOCAL_PGHOST / LOCAL_PGPORT / LOCAL_PGUSER.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { localEnv, psql, ROOT } from "./pg";

const DATABASE = process.env.LOCAL_PGDATABASE ?? "btm_test";
const keep = process.argv.includes("--keep");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const admin = localEnv("postgres");
if (!/^[a-z_][a-z0-9_]*$/.test(DATABASE)) fail(`Nom de base invalide : ${DATABASE}`);

if (!keep) {
  const drop = psql(admin, ["-c", `drop database if exists ${DATABASE} with (force)`]);
  if (drop.status !== 0) fail(`Suppression de ${DATABASE} impossible :\n${drop.stderr}`);
  const create = psql(admin, ["-c", `create database ${DATABASE} encoding 'UTF8' template template0`]);
  if (create.status !== 0) fail(`Création de ${DATABASE} impossible :\n${create.stderr}`);
  console.log(`✓ Base ${DATABASE} recréée`);
}

const env = localEnv(DATABASE);
const files = [
  path.join(ROOT, "supabase", "local", "00_supabase_stub.sql"),
  ...readdirSync(path.join(ROOT, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(ROOT, "supabase", "migrations", f)),
];

let failures = 0;
for (const file of files) {
  const result = psql(env, ["-1", "-f", file]);
  const name = path.relative(ROOT, file);
  if (result.status === 0) {
    console.log(`✓ ${name}`);
  } else {
    failures++;
    console.log(`✗ ${name}\n${result.stderr.trim().split("\n").map((l) => `    ${l}`).join("\n")}`);
  }
}

console.log(failures ? `\n${failures} fichier(s) en échec.` : `\nToutes les migrations passent sur ${DATABASE}.`);
process.exit(failures ? 1 : 0);
