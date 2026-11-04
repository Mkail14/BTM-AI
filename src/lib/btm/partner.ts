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

export type SaveResult =
  | { ok: true; code: string; nom: string; total: number }
  | { ok: false; reason: "no_account" | "not_allowed" | "rate_limited" | "unavailable" };

/**
 * Enregistre le devis dans « Mes projets » du compte btm.yt qui a la même
 * adresse e-mail (vérifiée des deux côtés). btm.yt revérifie les prix et
 * donne le code de retrait.
 */
export async function saveBtmDevis(email: string, nom: string, resultat: ResultatDevis): Promise<SaveResult> {
  if (!config()) return { ok: false, reason: "unavailable" };
  try {
    const { status, json } = await call(
      { action: "enregistrer", email, nom, type: resultat.type, dimensions: resultat.dimensions, resultat },
      15_000,
    );
    if (status === 200 && json.ok === true && typeof json.code === "string") {
      return { ok: true, code: json.code, nom: typeof json.nom === "string" ? json.nom : nom, total: Number(json.total) || resultat.total };
    }
    if (status === 404) return { ok: false, reason: "no_account" };
    if (status === 403) return { ok: false, reason: "not_allowed" };
    if (status === 429) return { ok: false, reason: "rate_limited" };
    console.error("[btm] Enregistrement du devis refusé", status, json.erreur);
    return { ok: false, reason: "unavailable" };
  } catch (error) {
    console.error("[btm] btm.yt injoignable", error);
    return { ok: false, reason: "unavailable" };
  }
}
