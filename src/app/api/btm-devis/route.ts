import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { calculerDevis, isOuvrageId, nomDevis, OUVRAGES, trouverOuvrage, validerValeurs, type Ouvrage, type PrixBtm } from "@/lib/btm/ouvrages";
import { btmPartnerConfigured, loadBtmPrices, saveBtmDevis } from "@/lib/btm/partner";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

/** Ce que renvoie GET : lu par le devis BTM dans la conversation. */
export type BtmDevisInfo = {
  ouvrages: readonly Ouvrage[];
  prix: PrixBtm;
  signedIn: boolean;
  /** Le lien avec btm.yt est réglé : le devis peut y être enregistré d'ici. */
  canSave: boolean;
};

/** Ouvrages et prix à jour de btm.yt : le devis se calcule dans le navigateur, sans compte. */
export async function GET() {
  const [{ user }, prix] = await Promise.all([getAuthContext(), loadBtmPrices()]);
  const body: BtmDevisInfo = { ouvrages: OUVRAGES, prix, signedIn: Boolean(user), canSave: btmPartnerConfigured() };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

const saveSchema = z.object({
  type: z.string().max(20),
  valeurs: z.record(z.string().max(30), z.union([z.string().max(20), z.number()])),
});

/** Ce que renvoie POST : le devis enregistré sur btm.yt et son code de retrait. */
export type BtmDevisSaved = { ok: true; code: string; nom: string; total: number; email: string };

/**
 * Enregistre le devis dans le compte btm.yt qui a la même adresse e-mail
 * (vérifiée). Recalculé ici avec les prix de btm.yt, jamais ceux du navigateur.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  if (!user) return fail(401, "Connecte-toi pour enregistrer ton devis.");
  if (!btmPartnerConfigured()) return fail(503, "L'enregistrement sur btm.yt n'est pas encore branché.", { reason: "unavailable" });

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isOuvrageId(parsed.data.type)) return fail(400, "Devis invalide.");
  const ouvrage = trouverOuvrage(parsed.data.type)!;
  if (!validerValeurs(ouvrage, parsed.data.valeurs).valide) return fail(400, "Vérifie les mesures du devis.");

  // L'adresse doit être confirmée : c'est elle qui relie le compte à celui de btm.yt.
  const admin = getSupabaseAdminClient();
  if (!admin) return fail(503, "Service momentanément indisponible.", { reason: "unavailable" });
  const { data, error } = await admin.auth.admin.getUserById(user.id);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !email || !data.user.email_confirmed_at) {
    return fail(403, "Confirme d'abord ton adresse e-mail pour enregistrer un devis.", { reason: "not_allowed" });
  }

  try {
    const limit = await consumeRateLimits([{ key: `btm-devis:${user.id}`, rules: RATE_LIMIT_POLICIES.btmDevis }]);
    if (!limit.allowed) return fail(429, "Trop de devis d'un coup : réessaie dans une heure.", { reason: "rate_limited" });
  } catch (err) {
    console.error("[btm-devis] Limite de débit indisponible", err);
    return fail(503, "Service momentanément indisponible : réessaie dans un instant.", { reason: "unavailable" });
  }

  const resultat = calculerDevis(ouvrage.id, parsed.data.valeurs, await loadBtmPrices());
  if (!resultat) return fail(400, "Vérifie les mesures du devis.");
  const saved = await saveBtmDevis(email, nomDevis(resultat), resultat);
  if (!saved.ok) {
    const messages = {
      no_account: "Aucun compte btm.yt n'a ton adresse e-mail.",
      not_allowed: "Ce compte btm.yt ne peut pas enregistrer de devis.",
      rate_limited: "Trop de devis d'un coup : réessaie dans une heure.",
      unavailable: "btm.yt ne répond pas : réessaie dans un instant.",
    } as const;
    const status = { no_account: 404, not_allowed: 403, rate_limited: 429, unavailable: 503 }[saved.reason];
    return fail(status, messages[saved.reason], { reason: saved.reason, email });
  }
  const body: BtmDevisSaved = { ok: true, code: saved.code, nom: saved.nom, total: saved.total, email };
  return NextResponse.json(body);
}
