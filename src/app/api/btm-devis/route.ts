import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";
import { calculerDevis, isOuvrageId, nomDevis, OUVRAGES, trouverOuvrage, validerValeurs, type Ouvrage, type PrixBtm } from "@/lib/btm/ouvrages";
import { btmPartnerConfigured, chooseBtmFournisseur, loadBtmPrices, saveBtmDevis } from "@/lib/btm/partner";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const saveSchema = z.object({
  type: z.string().max(20),
  valeurs: z.record(z.string().max(30), z.union([z.string().max(20), z.number()])),
  /** Fournisseur choisi : le devis est établi pour lui, à son prix. */
  fournisseurId: z.string().regex(UUID).optional(),
});

const chooseSchema = z.object({ code: z.string().min(1).max(40), fournisseurId: z.string().regex(UUID) });

/** Adresse confirmée du compte : c'est elle qui le relie au compte btm.yt. */
async function confirmedEmail(userId: string): Promise<string | NextResponse> {
  const admin = getSupabaseAdminClient();
  if (!admin) return fail(503, "Service momentanément indisponible.", { reason: "unavailable" });
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !email || !data.user.email_confirmed_at) {
    return fail(403, "Confirme d'abord ton adresse e-mail pour enregistrer un devis.", { reason: "not_allowed" });
  }
  return email;
}

/** Ce que renvoie POST : le devis enregistré sur btm.yt et son code de retrait. */
export type BtmDevisSaved = { ok: true; code: string; nom: string; total: number; email: string; fournisseur: string | null };

/**
 * Enregistre le devis dans le compte btm.yt qui a la même adresse e-mail
 * (vérifiée). Recalculé ici avec les prix de btm.yt, jamais ceux du navigateur.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  if (!user) return fail(401, "Connecte-toi pour enregistrer ton devis.");
  if (!(await canUse(user, "devis"))) return fail(403, "Le devis BTM n'est pas ouvert pour l'instant.");
  if (!btmPartnerConfigured()) return fail(503, "L'enregistrement sur btm.yt n'est pas encore branché.", { reason: "unavailable" });

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isOuvrageId(parsed.data.type)) return fail(400, "Devis invalide.");
  const ouvrage = trouverOuvrage(parsed.data.type)!;
  if (!validerValeurs(ouvrage, parsed.data.valeurs).valide) return fail(400, "Vérifie les mesures du devis.");

  const email = await confirmedEmail(user.id);
  if (typeof email !== "string") return email;

  try {
    const limit = await consumeRateLimits([{ key: `btm-devis:${user.id}`, rules: RATE_LIMIT_POLICIES.btmDevis }]);
    if (!limit.allowed) return fail(429, "Trop de devis d'un coup : réessaie dans une heure.", { reason: "rate_limited" });
  } catch (err) {
    console.error("[btm-devis] Limite de débit indisponible", err);
    return fail(503, "Service momentanément indisponible : réessaie dans un instant.", { reason: "unavailable" });
  }

  const resultat = calculerDevis(ouvrage.id, parsed.data.valeurs, await loadBtmPrices());
  if (!resultat) return fail(400, "Vérifie les mesures du devis.");
  const saved = await saveBtmDevis(email, nomDevis(resultat), resultat, parsed.data.fournisseurId);
  if (!saved.ok) {
    const messages = {
      no_account: "Aucun compte btm.yt n'a ton adresse e-mail.",
      not_allowed: "Ce compte btm.yt ne peut pas enregistrer de devis.",
      rate_limited: "Trop de devis d'un coup : réessaie dans une heure.",
      unavailable: "btm.yt ne répond pas : réessaie dans un instant.",
      supplier: "Ce fournisseur n'a plus ces matériaux : choisis-en un autre.",
    } as const;
    const status = { no_account: 404, not_allowed: 403, rate_limited: 429, unavailable: 503, supplier: 409 }[saved.reason];
    return fail(status, messages[saved.reason], { reason: saved.reason, email });
  }
  const body: BtmDevisSaved = { ok: true, code: saved.code, nom: saved.nom, total: saved.total, email, fournisseur: saved.fournisseur };
  return NextResponse.json(body);
}

/** Ce que renvoie PATCH : le même code de retrait, chez le nouveau fournisseur. */
export type BtmDevisChoice = { ok: true; total: number; fournisseur: string };

/** Change le fournisseur d'un devis déjà enregistré (le code de retrait ne change pas). */
export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  if (!user) return fail(401, "Connecte-toi pour choisir ton fournisseur.");
  if (!(await canUse(user, "devis"))) return fail(403, "Le devis BTM n'est pas ouvert pour l'instant.");
  if (!btmPartnerConfigured()) return fail(503, "Le lien avec btm.yt n'est pas encore branché.", { reason: "unavailable" });
  const parsed = chooseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Demande invalide.");
  const email = await confirmedEmail(user.id);
  if (typeof email !== "string") return email;

  try {
    const limit = await consumeRateLimits([{ key: `btm-fournisseurs:${user.id}`, rules: RATE_LIMIT_POLICIES.btmFournisseurs }]);
    if (!limit.allowed) return fail(429, "Trop de changements : réessaie dans un moment.", { reason: "rate_limited" });
  } catch (err) {
    console.error("[btm-devis] Limite de débit indisponible", err);
  }

  const chosen = await chooseBtmFournisseur(email, parsed.data.code, parsed.data.fournisseurId);
  if (!chosen.ok) {
    const messages = {
      not_found: "Ce devis n'est plus dans ton compte btm.yt.",
      paid: "Ce devis est déjà payé : le fournisseur ne peut plus changer.",
      supplier: "Ce fournisseur n'a plus ces matériaux : choisis-en un autre.",
      unavailable: "btm.yt ne répond pas : réessaie dans un instant.",
    } as const;
    const status = { not_found: 404, paid: 409, supplier: 409, unavailable: 503 }[chosen.reason];
    return fail(status, messages[chosen.reason], { reason: chosen.reason });
  }
  const body: BtmDevisChoice = { ok: true, total: chosen.total, fournisseur: chosen.fournisseur };
  return NextResponse.json(body);
}
