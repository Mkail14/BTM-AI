import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Chiffrement des clés d'API stockées en base (AES-256-GCM).
 * Clé dérivée de AI_KEYS_SECRET, ou à défaut de SUPABASE_SECRET_KEY :
 * changer l'une ou l'autre rend les clés enregistrées illisibles (à ressaisir).
 */
function secretKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const material = env.AI_KEYS_SECRET?.trim() || env.SUPABASE_SECRET_KEY?.trim();
  return material ? createHash("sha256").update(`btm-ai-keys:${material}`).digest() : null;
}

export function canEncrypt(env?: Record<string, string | undefined>): boolean {
  return secretKey(env) !== null;
}

export function encryptSecret(plain: string, env?: Record<string, string | undefined>): string {
  const key = secretKey(env);
  if (!key) throw new Error("Aucune clé de chiffrement (AI_KEYS_SECRET ou SUPABASE_SECRET_KEY).");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** null si la valeur est illisible (clé de chiffrement changée, donnée altérée). */
export function decryptSecret(sealed: string, env?: Record<string, string | undefined>): string | null {
  const key = secretKey(env);
  const [version, iv, tag, data] = sealed.split(".");
  if (!key || version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
