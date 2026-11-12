import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleMeshPayload } from "@/lib/mesh/handle";

const replyKey = "A".repeat(43) + "=";

/**
 * Base simulée où chaque aller-retour prend un peu de temps : compte combien sont en
 * cours en même temps (peak) et retient les écritures. rows : ce que rend chaque table.
 */
function slowAdmin(account: { id: string } | null, rows: Record<string, unknown> = {}) {
  const seen = { inFlight: 0, peak: 0, writes: [] as string[] };
  const trip = async <T>(value: T): Promise<T> => {
    seen.inFlight += 1;
    seen.peak = Math.max(seen.peak, seen.inFlight);
    await new Promise((done) => setTimeout(done, 5));
    seen.inFlight -= 1;
    return value;
  };
  const from = (table: string) => {
    const query: unknown = new Proxy(
      {},
      {
        get(_target, method: string) {
          if (method === "then") {
            return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              trip({ data: rows[table] ?? null, error: null }).then(resolve, reject);
          }
          return () => {
            if (["insert", "update", "delete", "upsert"].includes(method)) seen.writes.push(`${table}.${method}`);
            return query;
          };
        },
      },
    );
    return query;
  };
  const admin = {
    from,
    auth: { admin: { getUserById: () => trip({ data: { user: account ? { ...account, email: "a@b.fr", app_metadata: {} } : null }, error: null }) } },
  } as unknown as SupabaseClient;
  return { admin, seen };
}

const device = (userId: string) => ({ id: randomUUID(), userId, publicKey: "" });

describe("Tamilya Connect : vitesse du serveur", () => {
  it("les lectures d'un message se font en même temps, pas l'une après l'autre", async () => {
    const userId = randomUUID();
    const conversationId = randomUUID();
    const { admin, seen } = slowAdmin({ id: userId }, { conversations: { id: conversationId, user_id: userId }, messages: [], awa_memories: [] });
    const reply = await handleMeshPayload(admin, device(userId), { kind: "chat", text: "Kwezi Tamilya", conversationId, replyKey });
    // Compte, conversation, historique et souvenirs : au moins quatre allers-retours ensemble.
    assert.ok(seen.peak >= 4, `seulement ${seen.peak} lecture(s) en même temps`);
    // Aucune IA réglée dans les tests : pas de réponse, et rien n'est écrit.
    assert.equal(reply.status, "error");
    assert.deepEqual(seen.writes, []);
  });

  it("trop de messages d'un même appareil : refusé, sans rien écrire", async () => {
    const userId = randomUUID();
    const { admin, seen } = slowAdmin({ id: userId });
    const phone = device(userId);
    const texts: string[] = [];
    // 10 par minute : sur 21, au moins un est refusé même si la minute change en route.
    for (let i = 0; i < 21; i++) texts.push((await handleMeshPayload(admin, phone, { kind: "action", actionId: "a".repeat(24), replyKey })).text);
    assert.equal(texts[0], "Ce choix n'existe pas.");
    assert.ok(texts.some((text) => /Trop de messages/.test(text)));
    assert.deepEqual(seen.writes, []);
  });

  it("compte supprimé : réponse claire", async () => {
    const { admin } = slowAdmin(null);
    const reply = await handleMeshPayload(admin, device(randomUUID()), { kind: "chat", text: "Kwezi", replyKey });
    assert.deepEqual(reply, { status: "error", text: "Ce compte n'existe plus.", actions: [] });
  });
});
