import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Aucun vrai projet Supabase : URL fictive, fetch remplacé, clients factices.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projet-fictif.supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cle_fictive";

type Bearer = typeof import("@/lib/supabase/bearer");
type Session = typeof import("@/lib/auth/identity");
type Identity = Session;
type Security = typeof import("@/lib/security/request");
let bearer: Bearer;
let session: Session;
let identity: Identity;
let security: Security;

before(async () => {
  bearer = await import("@/lib/supabase/bearer");
  session = await import("@/lib/auth/identity");
  identity = session;
  security = await import("@/lib/security/request");
});

const ISS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** Jeton factice (signature bidon : la vérification cryptographique est faite par getClaims, simulé ici). */
const makeToken = (payload: Record<string, unknown> = {}, header: Record<string, unknown> = {}) =>
  `${b64({ alg: "ES256", typ: "JWT", kid: "k1", ...header })}.${b64({ iss: ISS, aud: "authenticated", ...payload })}.c2ln`;
const JWT = makeToken();
const USER_ID = "11111111-1111-4111-8111-111111111111";

type ClaimsAnswer = { data: { claims: Record<string, unknown> } | null; error: Error | null };

/** Client factice : enregistre les arguments de getClaims. */
function fakeClient(answer: ClaimsAnswer) {
  const calls: Array<string | undefined> = [];
  const client = {
    auth: {
      getClaims: async (token?: string) => {
        calls.push(token);
        return answer;
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const validClaims = { sub: USER_ID, role: "authenticated", email: "fatima@example.test", app_metadata: {} };

describe("choix de la source d'identité", () => {
  it("sans cookie ni en-tête : invité", () => {
    assert.deepEqual(bearer.chooseAuthSource([], null), { kind: "none" });
    assert.deepEqual(bearer.chooseAuthSource(["btm_device"], null), { kind: "none" });
  });

  it("un cookie de session Supabase prime sur l'en-tête Authorization", () => {
    for (const name of ["sb-abc-auth-token", "sb-abc-auth-token.0", "sb-abc-auth-token.1"]) {
      assert.deepEqual(bearer.chooseAuthSource([name], `Bearer ${JWT}`), {
        kind: "cookie",
        fallback: { kind: "bearer", token: JWT },
      });
    }
    // Navigateur : jamais d'en-tête Authorization, aucun repli.
    assert.deepEqual(bearer.chooseAuthSource(["sb-abc-auth-token"], null), { kind: "cookie", fallback: null });
  });

  it("sans cookie de session, un Bearer bien formé est retenu", () => {
    assert.deepEqual(bearer.chooseAuthSource(["btm_device"], `Bearer ${JWT}`), { kind: "bearer", token: JWT });
    assert.deepEqual(bearer.chooseAuthSource([], `bearer   ${JWT}  `), { kind: "bearer", token: JWT });
  });

  it("un Bearer vide ou qui n'a pas la forme d'un JWT est refusé (pas d'invité)", () => {
    for (const value of ["Bearer", "Bearer ", "Bearer sb_secret_pas_un_jwt", "Bearer a.b", `Bearer ${"a".repeat(9000)}.b.c`]) {
      assert.deepEqual(bearer.chooseAuthSource([], value), { kind: "bearer-malformed" }, value.slice(0, 30));
    }
  });

  it("un autre schéma d'autorisation est ignoré", () => {
    assert.deepEqual(bearer.chooseAuthSource([], "Basic dXNlcjpwdw=="), { kind: "none" });
  });
});

describe("validation du jeton Bearer (getSessionUser)", () => {
  it("jeton valide : utilisateur issu du jeton, getClaims reçoit le jeton", async () => {
    const { client, calls } = fakeClient({ data: { claims: validClaims }, error: null });
    bearer.registerBearerClient(client, JWT);
    const user = await session.userFromClient(client);
    assert.deepEqual(user, { id: USER_ID, email: "fatima@example.test", isAdmin: false, isPrincipalAdmin: false, authenticatedAt: null });
    assert.deepEqual(calls, [JWT]);
  });

  it("jeton invalide ou expiré : aucun utilisateur", async () => {
    const { client } = fakeClient({ data: null, error: new Error("invalid JWT") });
    bearer.registerBearerClient(client, JWT);
    assert.equal(await session.userFromClient(client), null);
  });

  it("getClaims qui lève une exception : aucun utilisateur", async () => {
    const client = {
      auth: {
        getClaims: async () => {
          throw new Error("réseau");
        },
      },
    } as unknown as SupabaseClient;
    bearer.registerBearerClient(client, JWT);
    assert.equal(await session.userFromClient(client), null);
  });

  it("refuse les jetons qui ne sont pas ceux d'un utilisateur connecté (clé anon, service role)", async () => {
    for (const claims of [{ role: "anon" }, { role: "service_role" }, { sub: USER_ID, role: "anon" }, { sub: USER_ID }]) {
      const { client } = fakeClient({ data: { claims }, error: null });
      bearer.registerBearerClient(client, JWT);
      assert.equal(await session.userFromClient(client), null, JSON.stringify(claims));
    }
  });

  it("en-tête Bearer inexploitable : refusé sans appeler Supabase", async () => {
    const { client, calls } = fakeClient({ data: { claims: validClaims }, error: null });
    bearer.registerBearerClient(client, "");
    assert.equal(await session.userFromClient(client), null);
    assert.equal(calls.length, 0);
  });

  it("rôle administrateur lu dans app_metadata, comme pour le cookie", async () => {
    const { client } = fakeClient({ data: { claims: { ...validClaims, app_metadata: { role: "admin" } } }, error: null });
    bearer.registerBearerClient(client, JWT);
    const user = await session.userFromClient(client);
    assert.equal(user?.isAdmin, true);
    assert.equal(user?.isPrincipalAdmin, true);
  });
});

describe("contrôle local du jeton avant tout appel réseau (R-3) et comptes anonymes (R-2)", () => {
  it("jeton bien formé du bon projet : accepté par le contrôle local", () => {
    assert.equal(bearer.precheckBearerToken(JWT), true);
    assert.equal(bearer.precheckBearerToken(makeToken({}, { alg: "RS256" })), true);
    assert.equal(bearer.precheckBearerToken(makeToken({}, { alg: "HS256" })), true);
  });

  it("refuse sans appeler Supabase : autre projet, alg inattendu, autre audience, charge illisible", async () => {
    const bad = [
      makeToken({ iss: "https://autre-projet.supabase.test/auth/v1" }),
      makeToken({ iss: ISS + "/x" }),
      makeToken({}, { alg: "none" }),
      makeToken({}, { alg: "ES512" }),
      makeToken({ aud: "anon" }),
      "xxx.yyy.zzz",
    ];
    for (const token of bad) {
      const { client, calls } = fakeClient({ data: { claims: validClaims }, error: null });
      bearer.registerBearerClient(client, token);
      assert.equal(await session.userFromClient(client), null);
      assert.equal(calls.length, 0, "getClaims ne doit pas être appelé");
    }
  });

  it("refuse un jeton de compte anonyme Supabase", async () => {
    const { client } = fakeClient({ data: { claims: { ...validClaims, is_anonymous: true } }, error: null });
    bearer.registerBearerClient(client, JWT);
    assert.equal(await session.userFromClient(client), null);
    const ok = fakeClient({ data: { claims: { ...validClaims, is_anonymous: false } }, error: null });
    bearer.registerBearerClient(ok.client, JWT);
    assert.equal((await session.userFromClient(ok.client))?.id, USER_ID);
  });
});

describe("cookie sans session + Bearer (R-6)", () => {
  const cookieOnly = (answer: ClaimsAnswer) => fakeClient(answer).client;
  const make = (tag: string) => (token: string) => bearer.registerBearerClient({ tag } as unknown as SupabaseClient, token);

  it("cookie valide : il prime, le Bearer est ignoré", async () => {
    const cookie = cookieOnly({ data: { claims: { sub: USER_ID } }, error: null });
    const source = bearer.chooseAuthSource(["sb-abc-auth-token"], `Bearer ${JWT}`);
    assert.equal(await identity.selectClient(source, () => cookie, make("bearer")), cookie);
  });

  it("cookie sans session et Bearer présent : le Bearer prend le relais", async () => {
    const cookie = cookieOnly({ data: null, error: new Error("Auth session missing") });
    const source = bearer.chooseAuthSource(["sb-abc-auth-token"], `Bearer ${JWT}`);
    const chosen = await identity.selectClient(source, () => cookie, make("bearer"));
    assert.notEqual(chosen, cookie);
    assert.equal(bearer.bearerTokenOf(chosen), JWT);
  });

  it("cookie sans session et Bearer mal formé : refus (pas d'invité)", async () => {
    const cookie = cookieOnly({ data: null, error: new Error("x") });
    const source = bearer.chooseAuthSource(["sb-abc-auth-token"], "Bearer nimporte");
    const chosen = await identity.selectClient(source, () => cookie, make("bearer"));
    assert.equal(bearer.bearerTokenOf(chosen), "");
  });

  it("cookie sans session et sans Bearer (navigateur) : client cookie, sans validation supplémentaire", async () => {
    const { client, calls } = fakeClient({ data: null, error: new Error("x") });
    const source = bearer.chooseAuthSource(["sb-abc-auth-token"], null);
    assert.equal(await identity.selectClient(source, () => client, make("bearer")), client);
    assert.equal(calls.length, 0);
  });
});

describe("instant d'authentification (amr), base de l'exigence de connexion récente", () => {
  it("prend le plus récent des timestamps amr ; ignore iat", async () => {
    const claims = { ...validClaims, iat: 9999999999, amr: [{ method: "password", timestamp: 1000 }, { method: "otp", timestamp: 2000 }] };
    const { client } = fakeClient({ data: { claims }, error: null });
    bearer.registerBearerClient(client, JWT);
    assert.equal((await session.userFromClient(client))?.authenticatedAt, 2000);
  });

  it("amr absent ou illisible : null", () => {
    assert.equal(session.authenticationTime({}), null);
    assert.equal(session.authenticationTime({ amr: ["password", { timestamp: "x" }] }), null);
  });
});

describe("chemin cookie inchangé", () => {
  it("client cookie : getClaims() sans argument (la session vient des cookies)", async () => {
    const { client, calls } = fakeClient({ data: { claims: { sub: USER_ID, email: "a@b.test" } }, error: null });
    const user = await session.userFromClient(client);
    assert.equal(user?.id, USER_ID);
    assert.deepEqual(calls, [undefined]);
  });

  it("le chemin cookie n'exige pas de rôle (comportement historique)", async () => {
    const { client } = fakeClient({ data: { claims: { sub: USER_ID } }, error: null });
    assert.equal((await session.userFromClient(client))?.email, null);
  });
});

describe("contexte d'authentification (invité, cookie, Bearer)", () => {
  it("sans client Supabase : invité, pas de Bearer refusé", async () => {
    assert.deepEqual(await session.resolveAuthContext(null), { supabase: null, user: null, invalidBearer: false });
  });

  it("invité (client cookie sans session) : pas d'utilisateur et invalidBearer faux", async () => {
    const { client } = fakeClient({ data: null, error: new Error("Auth session missing") });
    const ctx = await session.resolveAuthContext(client);
    assert.equal(ctx.user, null);
    assert.equal(ctx.invalidBearer, false);
  });

  it("Bearer invalide : invalidBearer vrai (les routes invité répondent 401)", async () => {
    const { client } = fakeClient({ data: null, error: new Error("JWT expired") });
    bearer.registerBearerClient(client, JWT);
    const ctx = await session.resolveAuthContext(client);
    assert.equal(ctx.user, null);
    assert.equal(ctx.invalidBearer, true);
  });

  it("Bearer valide : utilisateur présent, invalidBearer faux", async () => {
    const { client } = fakeClient({ data: { claims: validClaims }, error: null });
    bearer.registerBearerClient(client, JWT);
    const ctx = await session.resolveAuthContext(client);
    assert.equal(ctx.user?.id, USER_ID);
    assert.equal(ctx.invalidBearer, false);
  });
});

describe("client Bearer (RLS avec l'identité de l'utilisateur)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("envoie le jeton de l'utilisateur à PostgREST, sans session persistée", async () => {
    const seen: Headers[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const client = bearer.createBearerClient(JWT);
    assert.equal(bearer.bearerTokenOf(client), JWT);
    assert.equal(bearer.isBearerClient(client), true);
    await client.from("conversations").select("id");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].get("authorization"), `Bearer ${JWT}`);
    assert.equal(seen[0].get("apikey"), "sb_publishable_cle_fictive");
  });

  it("un client quelconque n'est pas un client Bearer", () => {
    assert.equal(bearer.isBearerClient({}), false);
    assert.equal(bearer.isBearerClient(null), false);
  });
});

describe("protection CSRF (isSameOrigin)", () => {
  const req = (headers: Record<string, string>) => new Request("https://tamilya.example/api/chat", { method: "POST", headers });

  it("requête Bearer sans Origin (application mobile) : acceptée", () => {
    assert.equal(security.isSameOrigin(req({ authorization: `Bearer ${JWT}`, host: "tamilya.example" })), true);
  });

  it("requête de navigateur d'une autre origine : refusée, cookie ou non", () => {
    assert.equal(security.isSameOrigin(req({ origin: "https://pirate.example", host: "tamilya.example", cookie: "sb-abc-auth-token=x" })), false);
    assert.equal(security.isSameOrigin(req({ origin: "https://pirate.example", host: "tamilya.example", authorization: `Bearer ${JWT}` })), false);
  });

  it("requête cookie sans Origin mais marquée cross-site par le navigateur : refusée", () => {
    assert.equal(security.isSameOrigin(req({ "sec-fetch-site": "cross-site", cookie: "sb-abc-auth-token=x", host: "tamilya.example" })), false);
  });

  it("requête du site lui-même : acceptée", () => {
    assert.equal(security.isSameOrigin(req({ origin: "https://tamilya.example", host: "tamilya.example", cookie: "sb-abc-auth-token=x" })), true);
  });
});
