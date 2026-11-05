// Joue le rôle du serveur avec WebCrypto (comme Next.js) contre l'app (InteropTest.java).
//   node tools/connect-interop.mjs prepare <dossier>   clé du serveur
//   node tools/connect-interop.mjs serve <dossier>     vérifie la demande, écrit la réponse
//   node tools/connect-interop.mjs check <dossier>     vérifie ce que l'app a lu
import { createVerify } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { subtle } = globalThis.crypto;
const [step, dir] = process.argv.slice(2);
const read = (name) => readFileSync(join(dir, name), "utf8").trim();
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const unb64 = (text) => new Uint8Array(Buffer.from(text, "base64"));
const REPLY = {
  text: "Il reste deux billets demain matin.",
  conversationId: "conv-42",
  actions: [{ id: "act-1", label: "Billet 8 h 30 · 2 €", pay: true }],
  status: "ok",
};

if (step === "prepare") {
  mkdirSync(dir, { recursive: true });
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  writeFileSync(join(dir, "server.pub"), b64(await subtle.exportKey("spki", pair.publicKey)));
  writeFileSync(join(dir, "server.key"), JSON.stringify(await subtle.exportKey("jwk", pair.privateKey)));
  writeFileSync(join(dir, "server.kid"), "kid-interop-1");
  console.log("clé du serveur prête");
} else if (step === "serve") {
  const env = JSON.parse(read("request.json"));
  const signed = [env.v, env.id, env.deviceId, env.createdAt, env.keyId, env.epk, env.nonce, env.ct].join("|");
  const devicePem = `-----BEGIN PUBLIC KEY-----\n${read("device.pub")}\n-----END PUBLIC KEY-----`;
  const verifier = createVerify("SHA256");
  verifier.update(signed);
  if (!verifier.verify(devicePem, Buffer.from(env.sig, "base64"))) throw new Error("signature refusée");
  if (env.keyId !== read("server.kid") || env.hops !== 0 || env.type !== "request" || env.v !== 1) throw new Error("champs");
  if (Buffer.byteLength(read("request.json")) > 8192) throw new Error("plus de 8 Ko");

  const server = await subtle.importKey("jwk", JSON.parse(read("server.key")), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const epk = await subtle.importKey("spki", unb64(env.epk), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await subtle.deriveBits({ name: "ECDH", public: epk }, server, 256);
  const hkdf = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("tamilya-connect v1") },
    hkdf, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  const plain = JSON.parse(new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: unb64(env.nonce) }, key, unb64(env.ct))));
  if (plain.kind !== "chat" || plain.text !== "Je veux un billet de barge pour demain" || plain.conversationId !== "conv-42") throw new Error("contenu");
  if (plain.replyKey !== read("replykey.txt")) throw new Error("replyKey");

  const replyKey = await subtle.importKey("raw", unb64(plain.replyKey), "AES-GCM", false, ["encrypt"]);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv: nonce }, replyKey, new TextEncoder().encode(JSON.stringify(REPLY)));
  writeFileSync(join(dir, "reply.json"), JSON.stringify({ v: 1, type: "reply", id: env.id, nonce: b64(nonce), ct: b64(ct) }));
  console.log("demande vérifiée (signature, déchiffrement, replyKey), réponse écrite");
} else if (step === "check") {
  const { deepStrictEqual } = await import("node:assert");
  // L'ordre des champs peut changer (org.json) : on compare le contenu.
  deepStrictEqual(JSON.parse(read("opened.json")), REPLY);
  console.log("réponse lue par l'app : identique");
} else {
  throw new Error("étape inconnue");
}
