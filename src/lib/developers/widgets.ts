import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Widgets de Tamilya (table developer_widgets) : une bulle de discussion à
 * coller sur un site, payée par BTM. L'identifiant public n'est pas un secret ;
 * ce sont les domaines autorisés et les limites qui protègent BTM.
 */

export const MAX_WIDGETS = 5;
export const MAX_WIDGET_ORIGINS = 5;
const PUBLIC_ID_PATTERN = /^pub_[A-Za-z0-9_-]{16}$/;

export type DeveloperWidget = {
  id: string;
  label: string;
  publicId: string;
  origins: string[];
  mission: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * Adresse saisie par le développeur → origine (« https://mon-site.yt »), ou null.
 * « mon-site.yt » et « https://mon-site.yt/contact » sont acceptés ; http seulement pour localhost.
 */
export function normalizeOrigin(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (!local && !url.hostname.includes(".")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Widgets actifs de l'utilisateur ; null si la table est illisible (migration absente). */
export async function listDeveloperWidgets(userId: string): Promise<DeveloperWidget[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("developer_widgets")
    .select("id, label, public_id, origins, mission, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[developpeurs] Widgets illisibles (migration 20261215000000_widgets_developpeurs.sql appliquée ?)", error);
    return null;
  }
  return data.map((row) => ({
    id: row.id,
    label: row.label,
    publicId: row.public_id,
    origins: row.origins,
    mission: row.mission,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export type CreateWidgetResult = { ok: true } | { ok: false; reason: "limit" | "error" };

export async function createDeveloperWidget(userId: string, label: string, origins: string[], mission: string | null): Promise<CreateWidgetResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, reason: "error" };
  const { count, error: countError } = await admin
    .from("developer_widgets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (countError) return { ok: false, reason: "error" };
  if ((count ?? 0) >= MAX_WIDGETS) return { ok: false, reason: "limit" };

  const { error } = await admin.from("developer_widgets").insert({
    user_id: userId,
    label,
    public_id: `pub_${randomBytes(12).toString("base64url")}`,
    origins,
    mission,
  });
  if (error) {
    console.error("[developpeurs] Création du widget impossible", error);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

export async function updateWidgetMission(userId: string, id: string, mission: string | null): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("developer_widgets").update({ mission }).eq("id", id).eq("user_id", userId).is("revoked_at", null);
  if (error) console.error("[developpeurs] Mission du widget non enregistrée", error);
  return !error;
}

export async function revokeDeveloperWidget(userId: string, id: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin
    .from("developer_widgets")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) console.error("[developpeurs] Suppression du widget impossible", error);
  return !error;
}

/** Widget reçu par l'API : identifiant, compte, domaines autorisés et mission s'il est actif, sinon null. */
export async function findDeveloperWidget(publicId: string): Promise<{ id: string; userId: string; origins: string[]; mission: string | null } | null> {
  if (!PUBLIC_ID_PATTERN.test(publicId)) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("developer_widgets")
    .select("id, user_id, origins, mission")
    .eq("public_id", publicId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) console.error("[developpeurs] Vérification du widget impossible", error);
  if (!data) return null;
  return { id: data.id, userId: data.user_id, origins: data.origins, mission: data.mission };
}

/** Date de dernière utilisation, affichée sur /developpeurs (appelée après la réponse, avec after()). */
export async function touchDeveloperWidget(id: string): Promise<void> {
  const { error } = (await getSupabaseAdminClient()?.from("developer_widgets").update({ last_used_at: new Date().toISOString() }).eq("id", id)) ?? {};
  if (error) console.error("[developpeurs] Date d'utilisation du widget non enregistrée", error);
}
