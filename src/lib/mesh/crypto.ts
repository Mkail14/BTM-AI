import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  randomBytes,
  verify,
  type KeyObject,
} from "node:crypto";

/**
 * Tamilya Connect : chiffrement des messages qui passent de téléphone en
 * téléphone (réseau maillé). Le téléphone d'origine chiffre pour le serveur
 * (ECDH P-256 + HKDF-SHA256 + AES-256-GCM) et signe avec sa clé d'appareil
 * (ECDSA P-256) : un relais ne peut ni lire ni modifier le message.
 * Format côté Android : « ct » = texte chiffré suivi de l'étiquette GCM (16 octets), comme Cipher.doFinal.
 */

export const MESH_INFO = "tamilya-connect v1";
const TAG_BYTES = 16;

export type ServerKey = { keyId: string; privateKey: KeyObject; publicKey: string };

/** Identifiant court d'une clé publique (SPKI) : 16 caractères hexadécimaux. */
export const keyIdOf = (spkiBase64: string) => createHash("sha256").update(Buffer.from(spkiBase64, "base64")).digest("hex").slice(0, 16);

/** Clé du serveur, depuis MESH_PRIVATE_KEY (PKCS#8 DER en base64, courbe P-256). null si absente ou invalide. */
export function loadServerKey(pkcs8Base64 = process.env.MESH_PRIVATE_KEY): ServerKey | null {
  if (!pkcs8Base64?.trim()) return null;
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(pkcs8Base64.trim(), "base64"), format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    const publicKey = (createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer).toString("base64");
    return { keyId: keyIdOf(publicKey), privateKey, publicKey };
  } catch {
    return null;
  }
}

/** Clé publique d'appareil (SPKI base64, P-256) acceptée ? */
export function readDevicePublicKey(spkiBase64: string): KeyObject | null {
  try {
    const key = createPublicKey({ key: Buffer.from(spkiBase64, "base64"), format: "der", type: "spki" });
    return key.asymmetricKeyDetails?.namedCurve === "prime256v1" ? key : null;
  } catch {
    return null;
  }
}

export type SignedFields = { v: number; id: string; deviceId: string; createdAt: number; keyId: string; epk: string; nonce: string; ct: string };

/** Texte signé par le téléphone d'origine. */
export const signedText = (e: SignedFields) => [e.v, e.id, e.deviceId, e.createdAt, e.keyId, e.epk, e.nonce, e.ct].join("|");

export function verifySignature(e: SignedFields, sigBase64: string, devicePublicKey: KeyObject): boolean {
  try {
    return verify("sha256", Buffer.from(signedText(e)), { key: devicePublicKey, dsaEncoding: "der" }, Buffer.from(sigBase64, "base64"));
  } catch {
    return false;
  }
}

function gcmOpen(key: Buffer, nonce: Buffer, sealed: Buffer): Buffer | null {
  if (nonce.length !== 12 || sealed.length <= TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()]);
  } catch {
    return null;
  }
}

function gcmSeal(key: Buffer, plain: Buffer): { nonce: string; ct: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const sealed = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { nonce: nonce.toString("base64"), ct: sealed.toString("base64") };
}

/** Clé AES dérivée du secret partagé (même calcul que le téléphone). */
export function deriveKey(privateKey: KeyObject, peerSpkiBase64: string): Buffer | null {
  const peer = readDevicePublicKey(peerSpkiBase64);
  if (!peer) return null;
  try {
    const shared = diffieHellman({ privateKey, publicKey: peer });
    return Buffer.from(hkdfSync("sha256", shared, Buffer.alloc(0), MESH_INFO, 32));
  } catch {
    return null;
  }
}

/** Contenu d'une demande, déchiffré avec la clé du serveur. null s'il a été modifié ou mal chiffré. */
export function openRequest(server: ServerKey, e: { epk: string; nonce: string; ct: string }): unknown {
  const key = deriveKey(server.privateKey, e.epk);
  if (!key) return null;
  const plain = gcmOpen(key, Buffer.from(e.nonce, "base64"), Buffer.from(e.ct, "base64"));
  if (!plain) return null;
  try {
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return null;
  }
}

/** Réponse chiffrée avec la clé de réponse choisie par le téléphone (32 octets). */
export function sealReply(replyKeyBase64: string, body: unknown): { nonce: string; ct: string } | null {
  const key = Buffer.from(replyKeyBase64, "base64");
  if (key.length !== 32) return null;
  return gcmSeal(key, Buffer.from(JSON.stringify(body), "utf8"));
}

/** Pour les tests : ce que fait le téléphone (chiffrer une demande, ouvrir une réponse). */
export const testing = { gcmSeal, gcmOpen };
