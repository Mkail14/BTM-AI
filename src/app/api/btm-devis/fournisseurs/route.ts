import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { calculerDevis, isOuvrageId, trouverOuvrage, validerValeurs } from "@/lib/btm/ouvrages";
import { loadBtmFournisseurs, loadBtmPrices, type OffreFournisseur } from "@/lib/btm/partner";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/security/request";

/** Ce que renvoie POST : les fournisseurs de btm.yt qui vendent ce devis, avec leur prix. */
export type BtmFournisseursInfo = { fournisseurs: OffreFournisseur[] };

const schema = z.object({
  type: z.string().max(20),
  valeurs: z.record(z.string().max(30), z.union([z.string().max(20), z.number()])),
});

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Prix du devis chez chaque fournisseur partenaire. Sans compte : ces prix sont
 * déjà publics sur btm.yt. Quantités recalculées ici, jamais celles du navigateur.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isOuvrageId(parsed.data.type)) return fail(400, "Devis invalide.");
  const ouvrage = trouverOuvrage(parsed.data.type)!;
  if (!validerValeurs(ouvrage, parsed.data.valeurs).valide) return fail(400, "Vérifie les mesures du devis.");

  try {
    const limit = await consumeRateLimits([{ key: `btm-fournisseurs:${getClientIp(request.headers)}`, rules: RATE_LIMIT_POLICIES.btmFournisseurs }]);
    if (!limit.allowed) return fail(429, "Trop de demandes : réessaie dans un moment.");
  } catch (err) {
    console.error("[btm-devis] Limite de débit indisponible", err);
  }

  const resultat = calculerDevis(ouvrage.id, parsed.data.valeurs, await loadBtmPrices());
  if (!resultat) return fail(400, "Vérifie les mesures du devis.");
  const fournisseurs = await loadBtmFournisseurs(resultat);
  if (!fournisseurs) return fail(503, "Les fournisseurs ne répondent pas pour le moment.");
  const body: BtmFournisseursInfo = { fournisseurs };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
