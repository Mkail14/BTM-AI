/**
 * Outils communs des scripts de base de données (sauvegarde, base locale de test).
 * Les mots de passe ne passent jamais en argument de commande (visibles dans la
 * liste des processus) : ils sont donnés aux outils PostgreSQL par PGPASSWORD,
 * ou lus dans le fichier pgpass de l'utilisateur.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Outils PostgreSQL : PATH d'abord, sinon la plus récente installation Windows. */
export function pgTool(name: "psql" | "pg_dump" | "pg_restore" | "pg_dumpall"): string {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  if (which.status === 0) return which.stdout.split(/\r?\n/)[0].trim();
  const base = "C:\\Program Files\\PostgreSQL";
  if (existsSync(base)) {
    const versions = readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const candidate = path.join(base, version, "bin", `${name}.exe`);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`${name} introuvable : installez PostgreSQL ou ajoutez son dossier bin au PATH.`);
}

/** Variables de connexion libpq tirées d'une adresse postgresql://… (le mot de passe reste en mémoire). */
export function connectionEnv(url: string): Record<string, string> {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("Adresse de base invalide (postgresql://… attendu).");
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") ?? "require",
    PGCONNECT_TIMEOUT: "15",
  };
}

/** Base locale de test : jamais autre chose que cette machine. */
export const LOCAL = {
  host: process.env.LOCAL_PGHOST ?? "localhost",
  port: process.env.LOCAL_PGPORT ?? "5432",
  user: process.env.LOCAL_PGUSER ?? "postgres",
};

export function localEnv(database: string): Record<string, string> {
  if (!["localhost", "127.0.0.1", "::1"].includes(LOCAL.host)) {
    throw new Error(`Refusé : la base de test doit être locale (LOCAL_PGHOST=${LOCAL.host}).`);
  }
  return { PGHOST: LOCAL.host, PGPORT: LOCAL.port, PGUSER: LOCAL.user, PGDATABASE: database, PGSSLMODE: "disable" };
}

export function run(
  tool: string,
  args: string[],
  env: Record<string, string>,
  options: { input?: string } = {},
): SpawnSyncReturns<string> {
  return spawnSync(tool, args, {
    env: { ...process.env, PGCLIENTENCODING: "UTF8", ...env },
    encoding: "utf8",
    input: options.input,
    maxBuffer: 512 * 1024 * 1024,
  });
}

/** psql sans invite de mot de passe, arrêt à la première erreur, sortie brute. */
export function psql(env: Record<string, string>, args: string[], input?: string) {
  return run(pgTool("psql"), ["-w", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", ...args], env, { input });
}

/** Lit une variable de .env.local sans l'afficher. */
export function readEnvLocal(name: string): string | undefined {
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // Fichier absent : seules les variables déjà définies comptent.
  }
  return process.env[name]?.trim() || undefined;
}
