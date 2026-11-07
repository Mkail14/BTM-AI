import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Simulation du client Supabase pour les tests (aucun appel réseau, aucune
 * base touchée) : tables en mémoire, filtres eq / neq / is / lt, insert,
 * update, delete, select (avec count). Chaque requête s'exécute d'un bloc au
 * moment de l'attente, après avoir rendu la main : deux requêtes lancées
 * ensemble s'entrecroisent comme deux fonctions du serveur.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeDb = { tables: Record<string, Row[]>; unique: Record<string, string[]> };

export function fakeDb(tables: Record<string, Row[]> = {}, unique: Record<string, string[]> = {}): FakeDb {
  return { tables, unique };
}

type Result = { data: unknown; error: { code: string; message: string } | null; count?: number | null };

class Query {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private values: Row | null = null;
  private returning = false;
  private head = false;
  private counting = false;
  private max = Infinity;
  private one: "maybe" | "single" | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.counting = Boolean(options?.count);
      this.head = Boolean(options?.head);
    } else this.returning = true;
    return this;
  }
  insert(values: Row) {
    this.op = "insert";
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((r) => String(r[column]) < value);
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }

  private run(): Result {
    const rows = (this.db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === "insert") {
      const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...this.values };
      for (const column of ["id", ...(this.db.unique[this.table] ?? [])]) {
        if (rows.some((r) => r[column] === row[column])) return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      rows.push(row);
      return { data: this.one ? { ...row } : [{ ...row }], error: null };
    }
    const hit = rows.filter(match).slice(0, this.max);
    if (this.op === "update") hit.forEach((r) => Object.assign(r, this.values));
    if (this.op === "delete") this.db.tables[this.table] = rows.filter((r) => !hit.includes(r));
    if (this.op !== "select" && !this.returning) return { data: null, error: null };
    if (this.head) return { data: null, error: null, count: hit.length };
    const data = hit.map((r) => ({ ...r }));
    if (this.one) return { data: data[0] ?? null, error: null };
    return { data, error: null, count: this.counting ? hit.length : null };
  }

  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    // Rend la main avant d'exécuter : laisse les autres requêtes en cours s'intercaler.
    return new Promise<Result>((done) => setImmediate(() => done(this.run()))).then(resolve, reject);
  }
}

export function fakeClient(db: FakeDb): SupabaseClient {
  return { from: (table: string) => new Query(db, table) } as unknown as SupabaseClient;
}
