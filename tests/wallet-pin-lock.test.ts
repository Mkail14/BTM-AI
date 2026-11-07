import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RATE_LIMIT_POLICIES } from "../src/lib/rate-limit/policies";
import { describePinWait, hashPin, pinLockMs, pinTriesLeft, removePin, savePin, verifyPin } from "../src/lib/wallet/pin";

/**
 * Faux client Supabase : une seule table wallet_pins en mémoire. Chaque requête
 * attend un tour de la boucle (setImmediate), pour que des essais lancés en même
 * temps se croisent vraiment entre la lecture et l'écriture.
 */
type Row = { user_id: string; pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null };

function fakeAdmin(initial: Row | null) {
  const state = { row: initial ? { ...initial } : null, writes: 0 };
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  function query() {
    let op: "select" | "update" | "delete" | "upsert" = "select";
    let patch: Partial<Row> = {};
    let returning = false;
    const filters: [keyof Row, unknown][] = [];
    const matches = () => Boolean(state.row) && filters.every(([column, value]) => state.row![column] === value);
    async function run(): Promise<{ data: unknown; error: null }> {
      await tick();
      if (op === "select") return { data: matches() ? { ...state.row } : null, error: null };
      if (op === "upsert") {
        state.row = { ...(state.row ?? ({} as Row)), ...patch } as Row;
        state.writes++;
        return { data: null, error: null };
      }
      if (op === "delete") {
        if (matches()) state.row = null;
        return { data: null, error: null };
      }
      const hit = matches();
      if (hit) {
        state.row = { ...state.row!, ...patch };
        state.writes++;
      }
      return { data: returning ? (hit ? [{ user_id: state.row!.user_id }] : []) : null, error: null };
    }
    const builder = {
      select() {
        if (op === "update") returning = true;
        return builder;
      },
      update(values: Partial<Row>) {
        op = "update";
        patch = values;
        return builder;
      },
      upsert(values: Partial<Row>) {
        op = "upsert";
        patch = values;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(column: keyof Row, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      maybeSingle: run,
      then<T>(onFulfilled: (value: { data: unknown; error: null }) => T, onRejected?: (reason: unknown) => T) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const admin = { from: () => query() } as unknown as SupabaseClient;
  return { admin, state };
}

const USER = "00000000-0000-0000-0000-000000000001";
const SALT = "sel-de-test-0001";
const GOOD = "4821";
const BAD = "1357";
const T0 = Date.parse("2026-11-07T10:00:00Z");
const MIN = 60_000;

const pinRow = (extra: Partial<Row> = {}): Row => ({ user_id: USER, pin_hash: hashPin(GOOD, SALT), salt: SALT, failed_attempts: 0, locked_until: null, ...extra });

describe("blocage progressif du code de paiement", () => {
  it("paliers : 15 min à 5 erreurs, 1 h à 10, 24 h à 15 et après chaque erreur", () => {
    assert.equal(pinLockMs(4), null);
    assert.equal(pinLockMs(5), 15 * MIN);
    assert.equal(pinLockMs(7), null);
    assert.equal(pinLockMs(10), 60 * MIN);
    assert.equal(pinLockMs(12), null);
    assert.equal(pinLockMs(15), 24 * 60 * MIN);
    assert.equal(pinLockMs(16), 24 * 60 * MIN);
    assert.deepEqual([1, 4, 5, 6, 9, 11].map(pinTriesLeft), [4, 1, 5, 4, 1, 4]);
  });

  it("compte les erreurs et bloque 15 min à la 5e, sans remettre le compteur à zéro", async () => {
    const { admin, state } = fakeAdmin(pinRow());
    for (let i = 1; i <= 4; i++) assert.deepEqual(await verifyPin(admin, USER, BAD, T0), { ok: false, reason: "wrong", left: 5 - i });
    const fifth = await verifyPin(admin, USER, BAD, T0);
    assert.equal(fifth.ok, false);
    assert.equal(!fifth.ok && fifth.reason, "locked");
    assert.equal(state.row!.failed_attempts, 5);
    assert.equal(Date.parse(state.row!.locked_until!), T0 + 15 * MIN);
    // Pendant le blocage, même le bon code est refusé, et rien n'est compté.
    assert.equal((await verifyPin(admin, USER, GOOD, T0 + MIN)).ok, false);
    assert.equal(state.row!.failed_attempts, 5);
  });

  it("après un blocage écoulé, l'erreur suivante continue le compte jusqu'à 1 h puis 24 h", async () => {
    const { admin, state } = fakeAdmin(pinRow({ failed_attempts: 5, locked_until: new Date(T0 - 1).toISOString() }));
    const sixth = await verifyPin(admin, USER, BAD, T0);
    assert.deepEqual(sixth, { ok: false, reason: "wrong", left: 4 });
    assert.equal(state.row!.failed_attempts, 6);
    assert.equal(state.row!.locked_until, null);
    state.row!.failed_attempts = 9;
    const tenth = await verifyPin(admin, USER, BAD, T0);
    assert.equal(!tenth.ok && tenth.reason, "locked");
    assert.equal(Date.parse(state.row!.locked_until!), T0 + 60 * MIN);
    // Bien plus tard, au-delà de 15 erreurs : 24 h à chaque erreur.
    state.row!.failed_attempts = 15;
    state.row!.locked_until = new Date(T0 - 1).toISOString();
    const next = await verifyPin(admin, USER, BAD, T0);
    assert.equal(!next.ok && next.reason, "locked");
    assert.equal(state.row!.failed_attempts, 16);
    assert.equal(Date.parse(state.row!.locked_until!), T0 + 24 * 60 * MIN);
  });

  it("un code juste remet le compteur à zéro", async () => {
    const { admin, state } = fakeAdmin(pinRow({ failed_attempts: 7, locked_until: new Date(T0 - 1).toISOString() }));
    assert.deepEqual(await verifyPin(admin, USER, GOOD, T0), { ok: true });
    assert.equal(state.row!.failed_attempts, 0);
    assert.equal(state.row!.locked_until, null);
  });

  it("sans code enregistré : « none », rien n'est écrit", async () => {
    const { admin, state } = fakeAdmin(null);
    assert.deepEqual(await verifyPin(admin, USER, GOOD, T0), { ok: false, reason: "none" });
    assert.equal(state.writes, 0);
  });

  it("essais simultanés : aucune erreur perdue, le code n'est jamais comparé sans être compté", async () => {
    const { admin, state } = fakeAdmin(pinRow());
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyPin(admin, USER, BAD, T0)));
    assert.equal(results.every((r) => !r.ok), true);
    // Avant : les 8 lisaient 0 et écrivaient tous 1. Maintenant chaque écriture monte d'un cran.
    assert.equal(state.row!.failed_attempts, state.writes);
    assert.ok(state.row!.failed_attempts >= 2);
  });

  it("essais simultanés avec le bon code au milieu : chaque code comparé a d'abord été compté", async () => {
    const { admin, state } = fakeAdmin(pinRow());
    const guesses = Array.from({ length: 20 }, (_, i) => (i === 12 ? GOOD : BAD));
    const results = await Promise.all(guesses.map((pin) => verifyPin(admin, USER, pin, T0)));
    const accepted = results.filter((r) => r.ok).length;
    assert.ok(accepted <= 1);
    // Écritures = erreurs comptées (+ la remise à zéro si le bon code est passé) : peu d'essais réellement comparés.
    assert.ok(state.writes <= 4, `${state.writes} écritures`);
    if (!accepted) assert.equal(state.row!.failed_attempts, state.writes);
  });

  it("changer ou supprimer le code avec un mauvais code actuel compte une erreur", async () => {
    const { admin, state } = fakeAdmin(pinRow());
    assert.deepEqual(await savePin(admin, USER, "9024", BAD), { ok: false, reason: "wrong", left: 4 });
    assert.deepEqual(await removePin(admin, USER, BAD), { ok: false, reason: "wrong", left: 3 });
    assert.equal(state.row!.failed_attempts, 2);
    assert.deepEqual(await removePin(admin, USER, GOOD), { ok: true });
    assert.equal(state.row, null);
  });

  it("durée de blocage dite en mots", () => {
    assert.equal(describePinWait(new Date(T0 + 15 * MIN).toISOString(), T0), "15 minutes");
    assert.equal(describePinWait(new Date(T0 + 60 * MIN).toISOString(), T0), "1 heure");
    assert.equal(describePinWait(new Date(T0 + 24 * 60 * MIN).toISOString(), T0), "24 heures");
    assert.equal(describePinWait(new Date(T0 + 10_000).toISOString(), T0), "1 minute");
  });

  it("limites : 10 appels du code par quart d'heure, e-mails de sécurité bornés", () => {
    assert.deepEqual(RATE_LIMIT_POLICIES.walletPin, [{ name: "wallet-pin-15min", limit: 10, windowSeconds: 900 }]);
    assert.equal(RATE_LIMIT_POLICIES.authDevice[0].limit, 10);
    assert.equal(RATE_LIMIT_POLICIES.passwordNotice[0].limit, 3);
    // Une conversation vocale fait un enregistrement par échange : la limite par minute reste large.
    assert.ok(RATE_LIMIT_POLICIES.voiceLiveTurn[0].limit >= 30);
    assert.ok(RATE_LIMIT_POLICIES.voiceLiveTool[0].limit >= 20);
  });
});

