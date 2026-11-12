import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { hasActiveBooking } from "@/lib/code-exam/duplicate";
import { codeExamPartnerReady, PARTNER_IMPLEMENTED } from "@/lib/code-exam/partner";
import { bargeDemoText, foodDemoText, settleAction, type PreparedAction, type SettleSteps } from "@/lib/mesh/pay";
import { CLAIM_STALE_MS, claimMessage, MAX_DEVICES_PER_USER, registerDevice, spendAction } from "@/lib/mesh/store";
import { fakeClient, fakeDb } from "./fake-supabase";

const ago = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();

describe("examen du code : partenariat La Poste", () => {
  it("la clé seule ne branche pas le partenariat tant que le code n'est pas écrit", () => {
    assert.equal(PARTNER_IMPLEMENTED, false);
    assert.equal(codeExamPartnerReady({ LAPOSTE_PARTNER_KEY: "cle" }), false);
    assert.equal(codeExamPartnerReady({ LAPOSTE_PARTNER_KEY: "cle" }, true), true);
    assert.equal(codeExamPartnerReady({}, true), false);
  });
});

describe("examen du code : même créneau demandé deux fois", () => {
  const startsAt = "2026-11-20T06:00:00.000Z";
  const booking = { userId: "u1", centerId: "c1", startsAt };

  it("refuse un créneau déjà demandé (en attente ou réservé), pas un créneau annulé", async () => {
    const db = fakeDb({ code_exam_requests: [{ user_id: "u1", center_id: "c1", starts_at: startsAt, status: "cancelled" }] });
    assert.equal(await hasActiveBooking(fakeClient(db), booking), false);
    db.tables.code_exam_requests.push({ user_id: "u1", center_id: "c1", starts_at: startsAt, status: "booked" });
    assert.equal(await hasActiveBooking(fakeClient(db), booking), true);
  });

  it("un autre bureau, une autre heure ou un autre compte ne comptent pas", async () => {
    const db = fakeDb({
      code_exam_requests: [
        { user_id: "u1", center_id: "c2", starts_at: startsAt, status: "pending" },
        { user_id: "u1", center_id: "c1", starts_at: "2026-11-20T07:00:00.000Z", status: "booked" },
        { user_id: "u2", center_id: "c1", starts_at: startsAt, status: "booked" },
      ],
    });
    assert.equal(await hasActiveBooking(fakeClient(db), booking), false);
  });
});

describe("repas et barge : le code de paiement n'est pris que juste avant le débit", () => {
  for (const [file, refusals] of [
    ["src/app/api/food/route.ts", ["Indique ton numéro", "Solde insuffisant : il te manque", "consumeRateLimits(["]],
    ["src/app/api/barge/route.ts", ["Solde insuffisant : il te manque", "consumeRateLimits(["]],
  ] as const) {
    it(file, () => {
      const source = readFileSync(file, "utf8");
      const grant = source.indexOf("takePaymentGrant(user.id)");
      const debit = source.indexOf("recordDemoOperation(user.id");
      assert.ok(grant > 0 && debit > grant, "accord pris avant le débit");
      for (const refusal of refusals) {
        const at = source.indexOf(refusal);
        assert.ok(at > 0 && at < grant, `« ${refusal} » vérifié avant de prendre l'accord`);
      }
    });
  }
});

describe("Tamilya Connect : message réservé puis abandonné", () => {
  const device = { id: "d1", userId: "u1", publicKey: "k" };
  const reply = { v: 1 as const, type: "reply" as const, id: "m", nonce: "n", ct: "c" };

  it("nouveau, en cours, déjà répondu, ou venu d'un autre appareil", async () => {
    const db = fakeDb();
    const admin = fakeClient(db);
    const id = randomUUID();
    assert.deepEqual(await claimMessage(admin, id, device), { state: "new" });
    assert.deepEqual(await claimMessage(admin, id, device), { state: "pending" });
    assert.deepEqual(await claimMessage(admin, id, { ...device, id: "d2" }), { state: "foreign" });
    db.tables.mesh_messages[0].reply = reply;
    assert.deepEqual(await claimMessage(admin, id, device), { state: "done", reply });
  });

  it("reprend une réservation sans réponse plus vieille que 90 s, jamais une réponse déjà faite", async () => {
    const id = randomUUID();
    const db = fakeDb({ mesh_messages: [{ id, device_id: "d1", user_id: "u1", reply: null, created_at: ago(CLAIM_STALE_MS + 1_000) }] });
    assert.deepEqual(await claimMessage(fakeClient(db), id, device), { state: "new" });
    assert.equal(db.tables.mesh_messages.length, 1);
    assert.ok(Date.parse(db.tables.mesh_messages[0].created_at as string) > Date.now() - 5_000);

    const answered = fakeDb({ mesh_messages: [{ id, device_id: "d1", user_id: "u1", reply, created_at: ago(10 * 60_000) }] });
    assert.deepEqual(await claimMessage(fakeClient(answered), id, device), { state: "done", reply });
  });

  it("deux renvois simultanés d'un message abandonné : un seul le reprend", async () => {
    const id = randomUUID();
    const db = fakeDb({ mesh_messages: [{ id, device_id: "d1", user_id: "u1", reply: null, created_at: ago(CLAIM_STALE_MS * 2) }] });
    const admin = fakeClient(db);
    const claims = await Promise.all([claimMessage(admin, id, device), claimMessage(admin, id, device), claimMessage(admin, id, device)]);
    assert.equal(claims.filter((c) => c.state === "new").length, 1);
    assert.ok(claims.every((c) => c.state === "new" || c.state === "pending"));
    assert.equal(db.tables.mesh_messages.length, 1);
  });
});

describe("Tamilya Connect : appareils d'un compte", () => {
  it("deux inscriptions simultanées ne dépassent pas la limite", async () => {
    const existing = Array.from({ length: MAX_DEVICES_PER_USER - 1 }, (_, i) => ({ user_id: "u1", public_key: `cle-${i}`, revoked_at: null }));
    const db = fakeDb({ mesh_devices: existing }, { mesh_devices: ["public_key"] });
    const admin = fakeClient(db);
    await Promise.all([registerDevice(admin, "u1", "nouvelle-a"), registerDevice(admin, "u1", "nouvelle-b")]);
    assert.ok(db.tables.mesh_devices.length <= MAX_DEVICES_PER_USER);
    // Seul, l'appareil passe.
    assert.ok(await registerDevice(admin, "u1", "nouvelle-c"));
    assert.equal(db.tables.mesh_devices.length, MAX_DEVICES_PER_USER);
  });
});

describe("Tamilya Connect : choix touché (billet, repas)", () => {
  const ready: PreparedAction = { ok: true, kind: "barge", text: (code) => `ok ${code}` };
  const steps = (over: Partial<SettleSteps> = {}): SettleSteps & { spent: number } => {
    const s = {
      spent: 0,
      prepare: async () => ready,
      checkPin: async () => null,
      allow: async () => true,
      spend: async () => {
        s.spent++;
        return true;
      },
      code: () => "BTM-TEST",
      ...over,
    };
    return s;
  };

  it("un refus prévisible, un code faux ou la limite ne font pas perdre le choix", async () => {
    for (const over of [
      { prepare: async (): Promise<PreparedAction> => ({ ok: false, text: "Ce jour n'est plus disponible : redemande un billet." }) },
      { checkPin: async () => "Code faux. Il te reste 4 essais." },
      { allow: async () => false },
    ]) {
      const s = steps(over);
      const result = await settleAction(s);
      assert.equal(result.ok, false);
      assert.equal(s.spent, 0);
    }
    const s = steps();
    assert.deepEqual(await settleAction(s), { ok: true, text: "ok BTM-TEST" });
    assert.equal(s.spent, 1);
  });

  it("billet payé : les tickets à dessiner reprennent le même code", async () => {
    const result = await settleAction({
      prepare: async () => ({ ok: true, kind: "barge", text: (code) => `ok ${code}`, tickets: (code) => [{ code, title: "BARGE SEULE" }, { code: `${code}-2`, title: "VOITURE" }] }),
      checkPin: async () => null,
      allow: async () => true,
      spend: async () => true,
      code: () => "BTM-TEST",
    });
    assert.deepEqual(result.tickets, [{ code: "BTM-TEST", title: "BARGE SEULE" }, { code: "BTM-TEST-2", title: "VOITURE" }]);
  });

  it("deux messages simultanés avec le même choix : un seul aboutit", async () => {
    const db = fakeDb({ mesh_actions: [{ id: "choix-barge-1234567890", used_at: null }] });
    const admin = fakeClient(db);
    const run = () => settleAction(steps({ spend: () => spendAction(admin, "choix-barge-1234567890") }));
    const results = await Promise.all([run(), run()]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.find((r) => !r.ok)?.text, "Ce choix a déjà été utilisé.");
  });

  it("dit franchement que rien n'est payé", () => {
    const barge = bargeDemoText({ what: "2× Piéton", totalCents: 200, code: "BTM-7K3Q" });
    const food = foodDemoText({ item: "Pizza", restaurant: "Jeje", totalCents: 1250, line: "1 rue X", commune: "Mamoudzou", code: "BTM-7K3Q" });
    for (const text of [barge, food]) {
      assert.match(text, /de démonstration enregistrée?/);
      assert.match(text, /rien n'est payé/);
      assert.doesNotMatch(text, /Billet payé|Commande payée/);
    }
    assert.match(barge, /valable jusqu'au scan/);
    assert.match(food, /Mamoudzou/);
  });
});
