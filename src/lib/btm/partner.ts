import "server-only";
import { CATALOGUE_LOCAL, OUVRAGE_IDS, PRIX_LOCAUX, type Catalogue, type PrixBtm, type ResultatDevis } from "./ouvrages";

/**
 * Lien avec btm.yt (fonction Supabase « devis-tamilya » du site BTM), de
 * serveur à serveur, protégé par un secret partagé :
 * - BTM_DEVIS_URL : adresse de la fonction (https://<projet>.supabase.co/functions/v1/devis-tamilya) ;
 * - BTM_DEVIS_SECRET : même valeur que le secret TAMILYA_SECRET de la fonction.
 * Sans eux, le devis se calcule quand même (prix de repli) et s'ouvre sur btm.yt.
 */
const config = () => {
  const url = process.env.BTM_DEVIS_URL?.trim();
  const secret = process.env.BTM_DEVIS_SECRET?.trim();
  return url && secret ? { url, secret } : null;
};

export const btmPartnerConfigured = () => config() !== null;

async function call(body: Record<string, unknown>, timeoutMs: number): Promise<{ status: number; json: Record<string, unknown> }> {
  const c = config();
  if (!c) throw new Error("btm_not_configured");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tamilya-secret": c.secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const PRIX_MS = 5 * 60_000;
let prixCache: { value: PrixBtm; expiresAt: number } | null = null;

/** Prix des matériaux et constantes de calcul de btm.yt (5 min en cache) ; prix de repli si le site ne répond pas. */
export async function loadBtmPrices(): Promise<PrixBtm> {
  if (prixCache && prixCache.expiresAt > Date.now()) return prixCache.value;
  if (!config()) return PRIX_LOCAUX;
  try {
    const { status, json } = await call({ action: "prix" }, 4_000);
    if (status !== 200) throw new Error(`prix ${status}`);
    const catalogue: Catalogue = { ...CATALOGUE_LOCAL };
    for (const m of Array.isArray(json.materiaux) ? json.materiaux : []) {
      const prix = Number(m?.prix_unitaire);
      if (typeof m?.id === "string" && typeof m.libelle === "string" && typeof m.unite === "string" && Number.isFinite(prix) && prix >= 0) {
        catalogue[m.id] = { id: m.id, libelle: m.libelle, unite: m.unite, prixUnitaire: prix };
      }
    }
    const parametres: PrixBtm["parametres"] = {};
    for (const t of Array.isArray(json.types) ? json.types : []) {
      if (!(OUVRAGE_IDS as readonly string[]).includes(t?.id) || !t.parametres || typeof t.parametres !== "object") continue;
      parametres[t.id as (typeof OUVRAGE_IDS)[number]] = Object.fromEntries(
        Object.entries(t.parametres as Record<string, unknown>)
          .map(([k, v]) => [k, Number(v)] as const)
          .filter(([, v]) => Number.isFinite(v)),
      );
    }
    const value: PrixBtm = { catalogue, parametres, source: "btm" };
    prixCache = { value, expiresAt: Date.now() + PRIX_MS };
    return value;
  } catch (error) {
    console.error("[btm] Prix de btm.yt indisponibles, prix de repli", error);
    // Nouvel essai dans une minute, pas à chaque devis.
    prixCache = { value: PRIX_LOCAUX, expiresAt: Date.now() + 60_000 };
    return PRIX_LOCAUX;
  }
}

/** Prix du devis chez un fournisseur partenaire de btm.yt (son catalogue, sinon le prix BTM). */
export type OffreFournisseur = {
  id: string;
  nom: string;
  commune: string;
  livraison: boolean;
  logo: string | null;
  /** Fiche fictive de btm.yt, en attendant les premiers partenaires. */
  demonstration: boolean;
  total: number;
  totalComptoir: number;
  prix: { id: string; prixUnitaire: number; sousTotal: number }[];
  /** Matériaux du devis qu'il ne vend pas ou n'a plus. */
  manquants: string[];
};

const OFFRES_MS = 60_000;
const offresCache = new Map<string, { value: OffreFournisseur[]; expiresAt: number }>();

/** Fournisseurs de btm.yt qui vendent les matériaux du devis, avec leur prix (1 min en cache) ; null si btm.yt ne répond pas. */
export async function loadBtmFournisseurs(resultat: ResultatDevis): Promise<OffreFournisseur[] | null> {
  if (!config()) return null;
  const lignes = resultat.lignes.map((l) => ({ id: l.id, quantite: l.quantite }));
  const key = JSON.stringify(lignes);
  const hit = offresCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  try {
    const { status, json } = await call({ action: "fournisseurs", lignes }, 6_000);
    if (status !== 200 || !Array.isArray(json.fournisseurs)) throw new Error(`fournisseurs ${status}`);
    const value = (json.fournisseurs as OffreFournisseur[]).filter((f) => typeof f?.id === "string" && Number.isFinite(f.total));
    if (offresCache.size > 200) offresCache.clear();
    offresCache.set(key, { value, expiresAt: Date.now() + OFFRES_MS });
    return value;
  } catch (error) {
    console.error("[btm] Fournisseurs de btm.yt indisponibles", error);
    return null;
  }
}

export type SaveResult =
  | { ok: true; code: string; nom: string; total: number; fournisseur: string | null }
  | { ok: false; reason: "no_account" | "not_allowed" | "rate_limited" | "unavailable" | "supplier" };

/**
 * Enregistre le devis dans « Mes projets » du compte btm.yt qui a la même
 * adresse e-mail (vérifiée des deux côtés). btm.yt revérifie les prix et
 * donne le code de retrait.
 */
export async function saveBtmDevis(email: string, nom: string, resultat: ResultatDevis, fournisseurId?: string): Promise<SaveResult> {
  if (!config()) return { ok: false, reason: "unavailable" };
  try {
    const { status, json } = await call(
      { action: "enregistrer", email, nom, type: resultat.type, dimensions: resultat.dimensions, resultat, fournisseur_id: fournisseurId },
      15_000,
    );
    if (status === 200 && json.ok === true && typeof json.code === "string") {
      return {
        ok: true,
        code: json.code,
        nom: typeof json.nom === "string" ? json.nom : nom,
        total: Number(json.total) || resultat.total,
        fournisseur: typeof json.fournisseur === "string" ? json.fournisseur : null,
      };
    }
    if (status === 404) return { ok: false, reason: "no_account" };
    if (status === 403) return { ok: false, reason: "not_allowed" };
    if (status === 429) return { ok: false, reason: "rate_limited" };
    if (status === 400 && json.erreur === "Fournisseur indisponible.") return { ok: false, reason: "supplier" };
    console.error("[btm] Enregistrement du devis refusé", status, json.erreur);
    return { ok: false, reason: "unavailable" };
  } catch (error) {
    console.error("[btm] btm.yt injoignable", error);
    return { ok: false, reason: "unavailable" };
  }
}

export type ChoiceResult = { ok: true; total: number; fournisseur: string } | { ok: false; reason: "not_found" | "paid" | "supplier" | "unavailable" };

/** Change le fournisseur d'un devis déjà enregistré : le code de retrait reste le même. */
export async function chooseBtmFournisseur(email: string, code: string, fournisseurId: string): Promise<ChoiceResult> {
  if (!config()) return { ok: false, reason: "unavailable" };
  try {
    const { status, json } = await call({ action: "choisir", email, code, fournisseur_id: fournisseurId }, 10_000);
    if (status === 200 && json.ok === true) {
      return { ok: true, total: Number(json.total) || 0, fournisseur: typeof json.fournisseur === "string" ? json.fournisseur : "" };
    }
    if (status === 404) return { ok: false, reason: "not_found" };
    if (status === 409) return { ok: false, reason: "paid" };
    if (status === 400) return { ok: false, reason: "supplier" };
    console.error("[btm] Choix du fournisseur refusé", status, json.erreur);
    return { ok: false, reason: "unavailable" };
  } catch (error) {
    console.error("[btm] btm.yt injoignable", error);
    return { ok: false, reason: "unavailable" };
  }
}
