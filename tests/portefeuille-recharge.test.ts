import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { settleTopup } from "@/lib/wallet";
import type { CheckoutSession } from "@/lib/wallet/stripe";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Recharge du portefeuille (vrai argent) : quand le solde est crédité, quand la
 * recharge est marquée ratée, et quand rien ne bouge. Stripe et la base sont simulés.
 */

type Call = { fn: string; args: Record<string, unknown> };

function fakeAdmin(error: { message: string } | null = null) {
  const calls: Call[] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: true, error };
      },
    } as never,
  };
}

const session = (over: Partial<CheckoutSession>): CheckoutSession => ({
  id: "cs_test_123",
  url: null,
  payment_status: "unpaid",
  status: "open",
  metadata: { kind: "wallet_topup", user_id: "u1" },
  payment_intent: null,
  ...over,
});

describe("recharge Stripe : crédit du solde", () => {
  it("payée : crédite une fois par la base (wallet_complete_topup), avec le moyen de paiement", async () => {
    const { admin, calls } = fakeAdmin();
    const paid = session({
      payment_status: "paid",
      status: "complete",
      payment_intent: { payment_method: { type: "card", card: { brand: "visa", last4: "4242" } } },
    });
    const state = await settleTopup("cs_test_123", "checkout.session.completed", { admin, readCheckout: async () => paid });
    assert.equal(state, "paid");
    assert.deepEqual(calls, [{ fn: "wallet_complete_topup", args: { p_session_id: "cs_test_123", p_method: "Visa •••• 4242" } }]);
  });

  it("l'identifiant de session vient toujours de Stripe, jamais du navigateur", async () => {
    const { admin, calls } = fakeAdmin();
    const asked: string[] = [];
    await settleTopup("cs_venu_du_navigateur", undefined, {
      admin,
      readCheckout: async (id) => {
        asked.push(id);
        return session({ id: "cs_relu_chez_stripe", payment_status: "paid", status: "complete" });
      },
    });
    assert.deepEqual(asked, ["cs_venu_du_navigateur"]);
    assert.equal(calls[0].args.p_session_id, "cs_relu_chez_stripe");
  });

  it("autre paiement Stripe (pas une recharge) : rien n'est crédité", async () => {
    const { admin, calls } = fakeAdmin();
    const other = session({ payment_status: "paid", status: "complete", metadata: { kind: "autre" } });
    assert.equal(await settleTopup("cs_x", undefined, { admin, readCheckout: async () => other }), "failed");
    const none = session({ payment_status: "paid", status: "complete", metadata: null });
    assert.equal(await settleTopup("cs_y", undefined, { admin, readCheckout: async () => none }), "failed");
    assert.deepEqual(calls, []);
  });

  it("abandonnée (expirée) ou paiement différé refusé : marquée ratée, jamais créditée", async () => {
    const { admin, calls } = fakeAdmin();
    assert.equal(await settleTopup("cs_a", "checkout.session.expired", { admin, readCheckout: async () => session({ status: "expired" }) }), "failed");
    assert.equal(
      await settleTopup("cs_b", "checkout.session.async_payment_failed", { admin, readCheckout: async () => session({ status: "complete" }) }),
      "failed",
    );
    assert.deepEqual(calls.map((c) => c.fn), ["wallet_fail_topup", "wallet_fail_topup"]);
  });

  it("paiement différé encore en cours : rien ne bouge", async () => {
    const { admin, calls } = fakeAdmin();
    const waiting = session({ status: "complete", payment_status: "unpaid" });
    assert.equal(await settleTopup("cs_c", "checkout.session.completed", { admin, readCheckout: async () => waiting }), "pending");
    assert.deepEqual(calls, []);
  });

  it("erreur de la base : remontée (Stripe renverra le webhook)", async () => {
    const { admin } = fakeAdmin({ message: "panne" });
    const paid = session({ payment_status: "paid", status: "complete" });
    await assert.rejects(settleTopup("cs_d", undefined, { admin, readCheckout: async () => paid }));
  });

  it("sans clé secrète : refuse de continuer", async () => {
    await assert.rejects(settleTopup("cs_e", undefined, { admin: null, readCheckout: async () => session({}) }), /SUPABASE_SECRET_KEY/);
  });
});

describe("vérification d'origine des requêtes qui modifient (isSameOrigin)", () => {
  const request = (headers: Record<string, string>) => new Request("https://tamilya.yt/api/wallet/topup", { method: "POST", headers });

  it("accepte le site lui-même", () => {
    assert.equal(isSameOrigin(request({ origin: "https://tamilya.yt", host: "tamilya.yt" })), true);
    // Derrière Vercel : l'hôte public est dans x-forwarded-host.
    assert.equal(isSameOrigin(request({ origin: "https://tamilya.yt", host: "interne.vercel", "x-forwarded-host": "tamilya.yt" })), true);
  });

  it("refuse un autre site, un sous-domaine ou une origine illisible", () => {
    assert.equal(isSameOrigin(request({ origin: "https://pirate.example", host: "tamilya.yt" })), false);
    assert.equal(isSameOrigin(request({ origin: "https://tamilya.yt.pirate.example", host: "tamilya.yt" })), false);
    assert.equal(isSameOrigin(request({ origin: "https://dev.tamilya.yt", host: "tamilya.yt" })), false);
    assert.equal(isSameOrigin(request({ origin: "null", host: "tamilya.yt" })), false);
  });

  it("sans Origin : refusé seulement si le navigateur dit que c'est un autre site", () => {
    assert.equal(isSameOrigin(request({ host: "tamilya.yt", "sec-fetch-site": "cross-site" })), false);
    assert.equal(isSameOrigin(request({ host: "tamilya.yt", "sec-fetch-site": "same-origin" })), true);
    // Client hors navigateur (app, script) : laissé à l'authentification.
    assert.equal(isSameOrigin(request({ host: "tamilya.yt" })), true);
  });
});
