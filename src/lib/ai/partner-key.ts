import { createHash, timingSafeEqual } from "node:crypto";
import type { SiteId } from "@/lib/ai/sites";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Secret partagé avec un site de GROUPE BTM qui fait parler Tamilya
 * (routes /api/tamilya et /api/orchestr). Seule son empreinte SHA-256 est
 * gardée, dans la table awa_partner_keys, lisible par le serveur seulement.
 */
const digest = (value: string) => createHash("sha256").update(value).digest();

const CACHE_MS = 60_000;
const hashes = new Map<SiteId, { hash: Buffer | null; expiresAt: number }>();

async function partnerHash(site: SiteId): Promise<Buffer | null> {
  const cached = hashes.get(site);
  if (cached && cached.expiresAt > Date.now()) return cached.hash;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("awa_partner_keys").select("secret_hash").eq("site", site).maybeSingle();
  if (error) console.error("[tamilya] Secrets des sites illisibles (migration awa_partner_keys appliquée ?)", error);
  const hash = typeof data?.secret_hash === "string" && /^[0-9a-f]{64}$/.test(data.secret_hash) ? Buffer.from(data.secret_hash, "hex") : null;
  hashes.set(site, { hash, expiresAt: Date.now() + CACHE_MS });
  return hash;
}

/** Vrai si la requête porte le secret du site ; sans secret enregistré pour ce site, la route lui est fermée. */
export async function isPartnerRequest(request: Request, site: SiteId): Promise<boolean> {
  const expected = await partnerHash(site);
  if (!expected) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  return timingSafeEqual(digest(given), expected);
}
