/**
 * Sauvegarde gratuite de la base Supabase (offre Free : pas de sauvegarde
 * téléchargeable) avec pg_dump, puis vérification et restauration d'essai locale.
 *
 *   pnpm db:sauvegarde
 *
 * Lecture seule sur Supabase. Adresse lue dans .env.local : SUPABASE_DB_URL
 * (Supabase → Project Settings → Database → Connection string → « Session
 * pooler », mot de passe compris). Elle n'est jamais affichée.
 *
 * Écrit dans BACKUP_DIR (par défaut ../sauvegardes-btm/<date>, hors du dépôt git) :
 *   structure.sql       structure de public et private (lisible)
 *   donnees.dump        données de public, private et auth (comptes) — format pg_restore
 *   complet.dump        structure + données de public et private — pour la restauration d'essai
 *   comptages.json      nombre de lignes de chaque table au moment de la sauvegarde
 *   SHA256SUMS.txt      empreintes des fichiers (intégrité)
 *
 * Puis : pg_restore --list sur chaque .dump, restauration de complet.dump dans
 * la base locale btm_restore_check, et comparaison des comptages.
 *
 * ⚠ Ces fichiers contiennent des données personnelles et les empreintes des mots
 * de passe : ne les mettez ni dans git, ni dans un dossier partagé, ni en pièce jointe.
 * Durée de conservation : voir supabase/local/README.md.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { connectionEnv, localEnv, pgTool, psql, readEnvLocal, ROOT, run } from "./pg";

const SCHEMAS = ["public", "private"];
const RESTORE_DB = "btm_restore_check";

function step(message: string) {
  console.log(`\n▸ ${message}`);
}
function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// --essai-local : toute la procédure sur la base locale fictive btm_test (pnpm db:tests-securite
// la crée), pour vérifier la sauvegarde et la restauration sans toucher à Supabase.
const trial = process.argv.includes("--essai-local");

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
let remote: Record<string, string>;
if (trial) {
  remote = localEnv("btm_test");
} else {
  const url = readEnvLocal("SUPABASE_DB_URL");
  if (!url) fail("SUPABASE_DB_URL absente de .env.local (voir l'en-tête de ce script).");
  remote = connectionEnv(url);
  if (/^(localhost|127\.0\.0\.1|::1)$/.test(remote.PGHOST)) fail("SUPABASE_DB_URL pointe vers cette machine, pas vers Supabase.");
}
const defaultDir = trial ? path.join(tmpdir(), "btm-essai-sauvegarde", stamp) : path.join(ROOT, "..", "sauvegardes-btm", stamp);
const dir = path.resolve(process.env.BACKUP_DIR ?? defaultDir);
if (dir.startsWith(ROOT + path.sep)) fail("BACKUP_DIR ne doit pas être dans le dépôt git.");
mkdirSync(dir, { recursive: true });
console.log(`Dossier : ${dir}`);

/** Comptage exact de chaque table (public, private, auth.users). */
function countRows(env: Record<string, string>): Record<string, number> {
  const list = psql(env, [
    "-c",
    `select format('select %L, count(*) from %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'private') order by 1`,
  ]);
  if (list.status !== 0) fail(`Comptage impossible :\n${list.stderr}`);
  const query = [...list.stdout.trim().split(/\r?\n/).filter(Boolean), "select 'auth.users', count(*) from auth.users"].join(" union all ");
  const counts = psql(env, ["-F", "\t", "-c", query]);
  if (counts.status !== 0) fail(`Comptage impossible :\n${counts.stderr}`);
  return Object.fromEntries(
    counts.stdout.trim().split(/\r?\n/).map((line) => {
      const [table, n] = line.split("\t");
      return [table, Number(n)];
    }),
  );
}

/** Messages d'erreur des outils : jamais le mot de passe. */
const hide = (text: string) => (remote.PGPASSWORD ? text.replaceAll(remote.PGPASSWORD, "••••") : text);

// 1. Connexion et comptages avant.
step(trial ? "Essai local : source = base fictive btm_test" : "Connexion à Supabase (lecture seule)");
const version = psql(remote, ["-c", "select current_setting('server_version')"]);
if (version.status !== 0) fail(`Connexion impossible :\n${hide(version.stderr)}`);
console.log(`  PostgreSQL ${version.stdout.trim()} — ${remote.PGHOST}`);
const before = countRows(remote);

// 2. Sauvegardes.
const pgDump = pgTool("pg_dump");
const schemaArgs = SCHEMAS.flatMap((s) => ["--schema", s]);
const dumps: [string, string[]][] = [
  ["structure.sql", ["--schema-only", "--no-owner", ...schemaArgs]],
  ["donnees.dump", ["--data-only", "--format=custom", ...schemaArgs, "--schema", "auth"]],
  ["complet.dump", ["--format=custom", "--no-owner", ...schemaArgs]],
];
for (const [file, args] of dumps) {
  step(`pg_dump → ${file}`);
  const result = run(pgDump, ["-w", ...args, "--file", path.join(dir, file)], remote);
  if (result.status !== 0) fail(`pg_dump a échoué :\n${hide(result.stderr)}`);
}
const after = countRows(remote);
writeFileSync(path.join(dir, "comptages.json"), `${JSON.stringify({ avant: before, apres: after }, null, 2)}\n`);

// 3. Intégrité : empreintes et lecture du sommaire de chaque archive.
step("Vérification de l'intégrité");
const files = [...dumps.map(([f]) => f), "comptages.json"];
const sums = files.map((f) => `${createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex")}  ${f}`);
writeFileSync(path.join(dir, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
for (const f of ["donnees.dump", "complet.dump"]) {
  const list = run(pgTool("pg_restore"), ["--list", path.join(dir, f)], {});
  if (list.status !== 0) fail(`${f} illisible :\n${list.stderr}`);
  const entries = list.stdout.split(/\r?\n/).filter((l) => l && !l.startsWith(";")).length;
  console.log(`  ✓ ${f} lisible (${entries} éléments)`);
}
if (!readFileSync(path.join(dir, "structure.sql"), "utf8").includes("CREATE TABLE public.messages")) fail("structure.sql incomplet.");
console.log("  ✓ structure.sql complet");

// 4. Restauration d'essai locale (structure + données de public et private).
step(`Restauration d'essai dans la base locale ${RESTORE_DB}`);
const admin = localEnv("postgres");
for (const sql of [`drop database if exists ${RESTORE_DB} with (force)`, `create database ${RESTORE_DB} encoding 'UTF8' template template0`]) {
  const r = psql(admin, ["-c", sql]);
  if (r.status !== 0) fail(r.stderr);
}
const local = localEnv(RESTORE_DB);
const stub = psql(local, ["-1", "-f", path.join(ROOT, "supabase", "local", "00_supabase_stub.sql")]);
if (stub.status !== 0) fail(`Imitation de Supabase impossible :\n${stub.stderr}`);
// Les tables pointent vers auth.users : on y met seulement les identifiants des comptes.
const ids = psql(remote, ["-c", "select id from auth.users"]);
if (ids.status !== 0) fail(ids.stderr);
const values = ids.stdout.trim().split(/\r?\n/).filter(Boolean).map((id) => `('${id.replace(/[^0-9a-f-]/gi, "")}')`);
if (values.length) {
  const insert = psql(local, ["-c", `insert into auth.users (id) values ${values.join(",")}`]);
  if (insert.status !== 0) fail(insert.stderr);
}
const restore = run(pgTool("pg_restore"), ["-w", "--no-owner", "--dbname", RESTORE_DB, path.join(dir, "complet.dump")], local);
// Les rôles internes de Supabase n'existent pas ici : leurs droits sont ignorés, rien d'autre.
const errors = restore.stderr
  .split(/\r?\n/)
  .filter((l) => /ERROR|ERREUR/.test(l) && !/role .* does not exist|le rôle .* n'existe pas|schema "(public|private)" already exists|le schéma « (public|private) » existe déjà/.test(l));
if (errors.length) fail(`Restauration d'essai en erreur :\n${errors.join("\n")}`);

const restored = countRows(local);
const mismatches = Object.keys(before)
  .filter((t) => t !== "auth.users")
  .filter((t) => restored[t] !== before[t] && restored[t] !== after[t]);
if (mismatches.length) {
  fail(`Comptages différents après restauration : ${mismatches.map((t) => `${t} (source ${before[t]}, restauré ${restored[t]})`).join(", ")}`);
}
const total = Object.entries(restored).filter(([t]) => t !== "auth.users").reduce((sum, [, n]) => sum + n, 0);
console.log(`  ✓ ${Object.keys(restored).length - 1} tables restaurées, ${total} lignes, comptages identiques à la source`);

step("Sauvegarde terminée et vérifiée");
console.log(`  ${dir}`);
console.log(existsSync(path.join(dir, "SHA256SUMS.txt")) ? "  Empreintes : SHA256SUMS.txt" : "");
console.log(`  Base d'essai locale ${RESTORE_DB} : à supprimer après contrôle${trial ? "" : " (elle contient de vraies données)"}.`);
