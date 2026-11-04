import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth/identity";

type Me = typeof import("@/lib/account/me");
type MeDeps = import("@/lib/account/me").MeDeps;
type Settings = typeof import("@/lib/account/settings");
let me: Me;
let settings: Settings;

before(async () => {
  me = await import("@/lib/account/me");
  settings = await import("@/lib/account/settings");
});

const USER: SessionUser = { id: "11111111-1111-4111-8111-111111111111", email: "fatima@example.test", isAdmin: false, isPrincipalAdmin: false };

type Row = { display_name: string | null; personality: string | null };

/** Double minimal de la table profiles (select ... maybeSingle, update ... eq). */
function fakeSupabase(row: Row, opts: { failUpdate?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      assert.equal(table, "profiles");
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            if (opts.failUpdate) return { error: new Error("boom") };
            updates.push(patch);
            Object.assign(row, patch);
            return { error: null };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

const CARDS = [{ id: "cool", label: "Cool", emoji: "x", description: "d", sample: "s" }] as never;

function deps(extra: Partial<MeDeps> = {}) {
  const sent: unknown[] = [];
  const base = {
    loadCards: async () => CARDS,
    rateLimit: async () => ({ allowed: true as const }),
    notifyChange: async (_email: unknown, change: unknown) => void sent.push(change),
    notifyDeleted: async () => void sent.push("deleted"),
    getAdminClient: () => null,
  };
  return { sent, deps: { ...base, ...extra } as unknown as MeDeps };
}

const anonymous = { supabase: null, user: null };
const code = (body: unknown) => (body as { error: { code: string } }).error.code;
const message = (body: unknown) => (body as { error: { message: string } }).error.message;

describe("GET /api/me", () => {
  it("sans authentification : 401 unauthorized", async () => {
    const res = await me.getMe(anonymous, deps().deps);
    assert.equal(res.status, 401);
    assert.equal(code(res.body), "unauthorized");
  });

  it("renvoie profil, personnalités et personnalité par défaut", async () => {
    const { client } = fakeSupabase({ display_name: "Fatima", personality: "cool" });
    const res = await me.getMe({ supabase: client, user: USER }, deps().deps);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      profile: { email: "fatima@example.test", displayName: "Fatima", personality: "cool" },
      personalities: CARDS,
      defaultPersonality: "professionnelle",
    });
  });

  it("personnalité jamais choisie : null", async () => {
    const { client } = fakeSupabase({ display_name: null, personality: null });
    const res = await me.getMe({ supabase: client, user: USER }, deps().deps);
    assert.equal((res.body as { profile: { personality: unknown } }).profile.personality, null);
  });
});

describe("PATCH /api/me", () => {
  it("sans authentification : 401", async () => {
    assert.equal((await me.patchMe(anonymous, { displayName: "x" }, deps().deps)).status, 401);
  });

  it("refuse un corps vide, inconnu, ou un champ en trop (400 invalid_request)", async () => {
    const { client, updates } = fakeSupabase({ display_name: null, personality: null });
    for (const body of [null, {}, "texte", { foo: 1 }, { displayName: "ok", admin: true }]) {
      const res = await me.patchMe({ supabase: client, user: USER }, body, deps().deps);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(code(res.body), "invalid_request");
    }
    assert.equal(updates.length, 0);
  });

  it("nom trop long : 400 avec le message du site", async () => {
    const { client } = fakeSupabase({ display_name: null, personality: null });
    const res = await me.patchMe({ supabase: client, user: USER }, { displayName: "a".repeat(61) }, deps().deps);
    assert.equal(res.status, 400);
    assert.equal(message(res.body), "60 caractères maximum.");
  });

  it("personnalité inconnue : 400 « Personnalité inconnue. »", async () => {
    const { client, updates } = fakeSupabase({ display_name: null, personality: null });
    for (const personality of ["gentille", 3, null]) {
      const res = await me.patchMe({ supabase: client, user: USER }, { personality }, deps().deps);
      assert.equal(res.status, 400, String(personality));
      assert.equal(message(res.body), "Personnalité inconnue.");
    }
    assert.equal(updates.length, 0);
  });

  it("change le nom (espaces retirés), prévient par e-mail, renvoie le profil", async () => {
    const { client, updates } = fakeSupabase({ display_name: "Ancien", personality: "cool" });
    const { deps: d, sent } = deps();
    const res = await me.patchMe({ supabase: client, user: USER }, { displayName: "  Fatima  " }, d);
    assert.equal(res.status, 200);
    assert.deepEqual(updates, [{ display_name: "Fatima" }]);
    assert.equal(sent.length, 1);
    assert.deepEqual(res.body, {
      profile: { email: "fatima@example.test", displayName: "Fatima", personality: "cool" },
      message: "Paramètres enregistrés.",
    });
  });

  it("nom inchangé : pas d'e-mail ; nom vide : retiré (null)", async () => {
    const same = fakeSupabase({ display_name: "Fatima", personality: null });
    const a = deps();
    await me.patchMe({ supabase: same.client, user: USER }, { displayName: "Fatima" }, a.deps);
    assert.equal(a.sent.length, 0);

    const empty = fakeSupabase({ display_name: "Fatima", personality: null });
    const b = deps();
    await me.patchMe({ supabase: empty.client, user: USER }, { displayName: "   " }, b.deps);
    assert.deepEqual(empty.updates, [{ display_name: null }]);
    assert.equal(b.sent.length, 1);
  });

  it("personnalité seule : message dédié", async () => {
    const { client, updates } = fakeSupabase({ display_name: null, personality: null });
    const res = await me.patchMe({ supabase: client, user: USER }, { personality: "mechante" }, deps().deps);
    assert.equal(res.status, 200);
    assert.deepEqual(updates, [{ personality: "mechante" }]);
    assert.equal((res.body as { message: string }).message, "C'est noté, Tamilya change de personnalité !");
  });

  it("limite de débit dépassée : 429 + Retry-After, rien n'est écrit", async () => {
    const { client, updates } = fakeSupabase({ display_name: null, personality: null });
    const { deps: d } = deps({ rateLimit: async () => ({ allowed: false as const, retryAfterSeconds: 42 }) });
    const res = await me.patchMe({ supabase: client, user: USER }, { displayName: "x" }, d);
    assert.equal(res.status, 429);
    assert.equal(res.headers?.["Retry-After"], "42");
    assert.equal(updates.length, 0);
  });

  it("échec d'écriture : 500 internal avec le message du site", async () => {
    const { client } = fakeSupabase({ display_name: null, personality: null }, { failUpdate: true });
    const res = await me.patchMe({ supabase: client, user: USER }, { personality: "cool" }, deps().deps);
    assert.equal(res.status, 500);
    assert.equal(message(res.body), "L'enregistrement a échoué. Réessaie.");
  });
});

describe("DELETE /api/me", () => {
  const admin = (error: { message: string } | null, deleted: string[]) => () =>
    ({ auth: { admin: { deleteUser: async (id: string) => (deleted.push(id), { error }) } } }) as never;
  const ctx = { supabase: {} as SupabaseClient, user: USER };

  it("sans authentification : 401", async () => {
    assert.equal((await me.deleteMe(anonymous, { confirmation: "SUPPRIMER" }, deps().deps)).status, 401);
  });

  it("confirmation absente ou fausse : 400, aucune suppression", async () => {
    const deleted: string[] = [];
    const { deps: d } = deps({ getAdminClient: admin(null, deleted) });
    for (const body of [null, {}, { confirmation: "supprimer" }, { confirmation: "OUI" }, { confirmation: "SUPPRIMER", x: 1 }]) {
      const res = await me.deleteMe(ctx, body, d);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(deleted.length, 0);
  });

  it("supprime le compte, prévient par e-mail : 200", async () => {
    const deleted: string[] = [];
    const { deps: d, sent } = deps({ getAdminClient: admin(null, deleted) });
    const res = await me.deleteMe(ctx, { confirmation: "SUPPRIMER" }, d);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { message: "Ton compte a été supprimé." });
    assert.deepEqual(deleted, [USER.id]);
    assert.deepEqual(sent, ["deleted"]);
  });

  it("clé de service absente : 503 service_unavailable", async () => {
    const res = await me.deleteMe(ctx, { confirmation: "SUPPRIMER" }, deps().deps);
    assert.equal(res.status, 503);
    assert.equal(code(res.body), "service_unavailable");
  });

  it("compte administrateur protégé : 403 ; autre échec : 500", async () => {
    const r1 = await me.deleteMe(
      { supabase: ctx.supabase, user: { ...USER, isAdmin: true } },
      { confirmation: "SUPPRIMER" },
      deps({ getAdminClient: admin({ message: "Database error" }, []) }).deps,
    );
    assert.equal(r1.status, 403);
    assert.equal(message(r1.body), "Ce compte administrateur est protégé : il ne peut pas être supprimé.");

    const r2 = await me.deleteMe(ctx, { confirmation: "SUPPRIMER" }, deps({ getAdminClient: admin({ message: "autre" }, []) }).deps);
    assert.equal(r2.status, 500);
  });
});

describe("cœur partagé avec les Server Actions", () => {
  it("mêmes messages que le site", async () => {
    const { client } = fakeSupabase({ display_name: null, personality: null });
    assert.deepEqual(await settings.savePersonality(client, USER, "cool"), {
      ok: true,
      message: "C'est noté, Tamilya change de personnalité !",
    });
    assert.deepEqual(await settings.savePersonality(client, USER, "x"), {
      ok: false,
      kind: "invalid_request",
      message: "Personnalité inconnue.",
    });
    assert.deepEqual(await settings.removeAccount(USER, "non"), {
      ok: false,
      kind: "invalid_request",
      message: "Écris SUPPRIMER pour confirmer.",
    });
  });
});

describe("R-4 : compte vérifié auprès de Supabase Auth sur PATCH et DELETE", () => {
  const gone = { verifyUser: async () => false };

  it("PATCH : compte supprimé ou banni -> 401, rien d'écrit", async () => {
    const { client, updates } = fakeSupabase({ display_name: null, personality: null });
    const res = await me.patchMe({ supabase: client, user: USER }, { displayName: "x" }, deps(gone).deps);
    assert.equal(res.status, 401);
    assert.equal(updates.length, 0);
  });

  it("DELETE : compte supprimé -> 401, aucune suppression tentée", async () => {
    let asked = false;
    const { deps: d } = deps({ ...gone, getAdminClient: (() => (asked = true, null)) as never });
    const res = await me.deleteMe({ supabase: {} as SupabaseClient, user: USER }, { confirmation: "SUPPRIMER" }, d);
    assert.equal(res.status, 401);
    assert.equal(asked, false);
  });

  it("GET ne fait pas ce contrôle (pas de getUser)", async () => {
    const { client } = fakeSupabase({ display_name: null, personality: null });
    const res = await me.getMe({ supabase: client, user: USER }, deps(gone).deps);
    assert.equal(res.status, 200);
  });

  it("par défaut, un client cookie n'est pas contrôlé (web inchangé)", async () => {
    const { client } = fakeSupabase({ display_name: null, personality: null });
    const base = deps().deps;
    delete (base as { verifyUser?: unknown }).verifyUser;
    const res = await me.patchMe({ supabase: client, user: USER }, { displayName: "y" }, base);
    assert.equal(res.status, 200);
  });
});

describe("R-4 : chemin par défaut avec un client Bearer", () => {
  it("appelle getUser(token) et refuse une erreur ou un autre identifiant", async () => {
    const bearer = await import("@/lib/supabase/bearer");
    for (const [answer, status] of [
      [{ data: { user: { id: USER.id } }, error: null }, 200],
      [{ data: { user: null }, error: new Error("User from sub claim in JWT does not exist") }, 401],
      [{ data: { user: { id: "autre" } }, error: null }, 401],
    ] as const) {
      const seen: unknown[] = [];
      const { client } = fakeSupabase({ display_name: null, personality: null });
      (client as unknown as { auth: unknown }).auth = { getUser: async (t: unknown) => (seen.push(t), answer) };
      bearer.registerBearerClient(client, "tok.en.x");
      const base = deps().deps;
      delete (base as { verifyUser?: unknown }).verifyUser;
      const res = await me.patchMe({ supabase: client, user: USER }, { personality: "cool" }, base);
      assert.equal(res.status, status);
      assert.deepEqual(seen, ["tok.en.x"]);
    }
  });
});
