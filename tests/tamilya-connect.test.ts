import assert from "node:assert/strict";
import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID, sign, type KeyObject } from "node:crypto";
import { describe, it } from "node:test";
import { loadServerKey, MESH_INFO, openRequest, readDevicePublicKey, sealReply, signedText, testing, verifySignature } from "@/lib/mesh/crypto";
import { isStale, MESH_MAX_AGE_MS, payloadSchema, requestEnvelopeSchema } from "@/lib/mesh/envelope";
import { bargeOffer, foodOffers, MAX_FOOD_OFFERS } from "@/lib/mesh/offers";

const spki = (key: KeyObject) => (key.export({ format: "der", type: "spki" }) as Buffer).toString("base64");

/** Ce que fera l'app Android : chiffrer pour le serveur, signer avec la clé de l'appareil. */
function phoneEnvelope(serverPublic: string, keyId: string, device: { id: string; privateKey: KeyObject }, payload: object, createdAt = Date.now()) {
  const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: createPublicKey({ key: Buffer.from(serverPublic, "base64"), format: "der", type: "spki" }) });
  const key = Buffer.from(hkdfSync("sha256", shared, Buffer.alloc(0), MESH_INFO, 32));
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]).toString("base64");
  const fields = { v: 1 as const, id: randomUUID(), deviceId: device.id, createdAt, keyId, epk: spki(ephemeral.publicKey), nonce: nonce.toString("base64"), ct };
  const sig = sign("sha256", Buffer.from(signedText(fields)), { key: device.privateKey, dsaEncoding: "der" }).toString("base64");
  return { ...fields, type: "request" as const, hops: 2, sig };
}

describe("Tamilya Connect : chiffrement et signature", () => {
  const serverPair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const server = loadServerKey((serverPair.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString("base64"))!;
  const devicePair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const device = { id: randomUUID(), privateKey: devicePair.privateKey };
  const deviceKey = readDevicePublicKey(spki(devicePair.publicKey))!;
  const replyKey = randomBytes(32).toString("base64");

  it("le serveur lit un message chiffré par le téléphone et vérifie qui l'envoie", () => {
    assert.ok(server && /^[0-9a-f]{16}$/.test(server.keyId));
    const envelope = phoneEnvelope(server.publicKey, server.keyId, device, { kind: "chat", text: "Kwezi Tamilya", replyKey });
    assert.ok(requestEnvelopeSchema.safeParse(envelope).success);
    assert.ok(verifySignature(envelope, envelope.sig, deviceKey));
    assert.deepEqual(openRequest(server, envelope), { kind: "chat", text: "Kwezi Tamilya", replyKey });
    assert.ok(payloadSchema.safeParse(openRequest(server, envelope)).success);
  });

  it("un relais qui modifie le message, ou un autre appareil, est refusé", () => {
    const envelope = phoneEnvelope(server.publicKey, server.keyId, device, { kind: "chat", text: "Paie 2 billets", replyKey });
    const bytes = Buffer.from(envelope.ct, "base64");
    bytes[0] ^= 1;
    const tampered = { ...envelope, ct: bytes.toString("base64") };
    assert.equal(verifySignature(tampered, tampered.sig, deviceKey), false);
    assert.equal(openRequest(server, tampered), null);
    assert.equal(verifySignature({ ...envelope, createdAt: envelope.createdAt + 1 }, envelope.sig, deviceKey), false);
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    assert.equal(verifySignature(envelope, envelope.sig, readDevicePublicKey(spki(other.publicKey))!), false);
  });

  it("la réponse ne s'ouvre qu'avec la clé de réponse du téléphone", () => {
    const sealed = sealReply(replyKey, { status: "ok", text: "Marahaba !", actions: [] })!;
    const opened = testing.gcmOpen(Buffer.from(replyKey, "base64"), Buffer.from(sealed.nonce, "base64"), Buffer.from(sealed.ct, "base64"));
    assert.equal(JSON.parse(opened!.toString()).text, "Marahaba !");
    assert.equal(testing.gcmOpen(randomBytes(32), Buffer.from(sealed.nonce, "base64"), Buffer.from(sealed.ct, "base64")), null);
    assert.equal(sealReply(randomBytes(16).toString("base64"), {}), null);
  });

  it("refuse une clé qui n'est pas P-256, un message trop vieux ou daté dans le futur", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
    assert.equal(readDevicePublicKey(spki(rsa.publicKey)), null);
    assert.equal(loadServerKey("pas une clé"), null);
    const now = Date.now();
    assert.equal(isStale(now - MESH_MAX_AGE_MS - 1, now), true);
    assert.equal(isStale(now + 10 * 60_000, now), true);
    assert.equal(isStale(now - 60_000, now), false);
  });

  it("un code de paiement n'a que 4 chiffres, et un choix a un identifiant précis", () => {
    assert.ok(payloadSchema.safeParse({ kind: "action", actionId: "a".repeat(24), pin: "4821", replyKey }).success);
    assert.ok(!payloadSchema.safeParse({ kind: "action", actionId: "a".repeat(24), pin: "48211", replyKey }).success);
    assert.ok(!payloadSchema.safeParse({ kind: "action", actionId: "court", replyKey }).success);
    assert.ok(!payloadSchema.safeParse({ kind: "chat", text: "", replyKey }).success);
  });
});

describe("Tamilya Connect : choix proposés sans internet", () => {
  it("billet de barge : prix du catalogue, aujourd'hui ou demain", () => {
    const today = bargeOffer("Je veux 2 tickets de barge");
    assert.equal(today?.kind, "barge");
    assert.match(today!.label, /aujourd'hui : 2× Piéton · 2\s€/);
    assert.match(bargeOffer("un ticket de barge pour demain avec ma voiture")!.label, /demain : 1× Voiture · 15\s€/);
    assert.equal(bargeOffer("La barge part à quelle heure ?"), null);
  });

  it("repas : quelques plats précis, rien pour une envie vague", () => {
    const pizzas = foodOffers("je veux une pizza", []);
    assert.ok(pizzas.length > 0 && pizzas.length <= MAX_FOOD_OFFERS);
    assert.ok(pizzas.every((o) => o.kind === "food" && /livraison comprise/.test(o.label)));
    assert.deepEqual(foodOffers("j'ai faim", []), []);
    assert.deepEqual(foodOffers("il fait beau aujourd'hui", []), []);
  });
});
