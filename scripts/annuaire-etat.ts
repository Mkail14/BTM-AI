/* eslint-disable @typescript-eslint/no-explicit-any -- réponses JSON des API de l'État, lues champ par champ */
/**
 * Remplit l'annuaire des entreprises (table business_listings) avec les annuaires de l'État,
 * en brouillon : l'équipe complète ensuite (téléphone, horaires…) puis publie.
 *
 * Sources, gratuites, sans clé :
 *  - services publics de Mayotte (mairies, préfecture, CAF…) : annuaire de service-public.fr,
 *    souvent avec téléphone, horaires, adresse et point GPS ;
 *  - entreprises en activité : recherche-entreprises.api.gouv.fr (Sirene de l'INSEE + RNE),
 *    nom, SIRET, activité, adresse ; jamais de téléphone ni d'horaires.
 *
 * Une fiche par entreprise et par commune (le siège s'il y est, sinon son premier établissement
 * ouvert). Un SIRET déjà dans la table n'est jamais réécrit : relancer le script n'ajoute que
 * les nouvelles. Les entreprises non diffusibles (protégées par l'INSEE) sont laissées de côté.
 *
 * Usage :
 *   node --env-file=.env.local --import tsx scripts/annuaire-etat.ts           (essai, n'écrit rien)
 *   node --env-file=.env.local --import tsx scripts/annuaire-etat.ts --ecrire  (ajoute les fiches)
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { COMMUNES } from "../src/lib/entreprises/listing";

const WRITE = process.argv.includes("--ecrire");
const OUT = process.argv.find((a) => a.startsWith("--sortie="))?.slice(9);

type Row = {
  name: string;
  aliases: string[];
  siret: string | null;
  category: string;
  commune: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phones: string[];
  email: string | null;
  website: string | null;
  hours: Record<string, string>;
  opened_on: string | null;
  published: false;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cut = (v: string | null | undefined, n: number) => (v ? v.trim().slice(0, n) || null : null);
const inMayotte = (lat: number | null, lon: number | null) =>
  lat !== null && lon !== null && lat >= -13.1 && lat <= -12.5 && lon >= 44.9 && lon <= 45.4;

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "annuaire-import/1.0" } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`Trop d'échecs : ${url}`);
}

// ---------- Services publics ----------

const DAY_IDS: Record<string, number> = { Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5, Dimanche: 6 };
const DAY_KEYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const hm = (v: string) => {
  const [h, m] = v.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

function hoursOf(raw: string | null): Record<string, string> {
  const hours: Record<string, string> = {};
  if (!raw) return hours;
  for (const p of JSON.parse(raw) as Record<string, string>[]) {
    const from = DAY_IDS[p.nom_jour_debut];
    const to = DAY_IDS[p.nom_jour_fin] ?? from;
    if (from === undefined) continue;
    const slots = [1, 2, 3]
      .filter((i) => p[`valeur_heure_debut_${i}`] && p[`valeur_heure_fin_${i}`])
      .map((i) => `${hm(p[`valeur_heure_debut_${i}`])}-${hm(p[`valeur_heure_fin_${i}`])}`);
    if (!slots.length) continue;
    for (let d = from; d <= to; d++) hours[DAY_KEYS[d]] = slots.join(", ").slice(0, 80);
  }
  return hours;
}

async function publicServices(): Promise<Row[]> {
  const rows: Row[] = [];
  const base = "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records";
  for (let offset = 0; ; offset += 100) {
    const page = await getJson(`${base}?where=${encodeURIComponent('startswith(code_insee_commune, "976")')}&limit=100&offset=${offset}`);
    for (const r of page.results) {
      if (!String(r.code_insee_commune ?? "").startsWith("976")) continue;
      const a = r.adresse ? JSON.parse(r.adresse)[0] : null;
      const lat = a?.latitude ? Number(a.latitude) : null;
      const lon = a?.longitude ? Number(a.longitude) : null;
      const address = a ? [a.numero_voie, a.complement1, a.complement2, [a.code_postal, a.nom_commune].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;
      const phones = (r.telephone ? (JSON.parse(r.telephone) as { valeur: string }[]) : [])
        .map((t) => t.valeur.replace(/[^\d+]/g, ""))
        .filter((t) => /^\+?\d{9,15}$/.test(t))
        .slice(0, 4);
      const site = r.site_internet ? (JSON.parse(r.site_internet) as { valeur: string }[])[0]?.valeur : null;
      rows.push({
        name: cut(r.nom, 120)!,
        aliases: r.sigle ? [cut(r.sigle, 80)!] : [],
        siret: /^\d{14}$/.test(r.siret ?? "") ? r.siret : null,
        category: "service public",
        commune: r.code_insee_commune in COMMUNES ? r.code_insee_commune : null,
        address: cut(address, 200),
        latitude: inMayotte(lat, lon) ? lat : null,
        longitude: inMayotte(lat, lon) ? lon : null,
        phones,
        email: cut(r.adresse_courriel, 120),
        website: site && /^https?:\/\//.test(site) ? site : null,
        hours: hoursOf(r.plage_ouverture),
        opened_on: null,
        published: false,
      });
    }
    if (offset + 100 >= page.total_count) break;
  }
  return rows;
}

// ---------- Entreprises (Sirene) ----------

/** Code d'activité INSEE (NAF) → catégorie de l'annuaire. Le plus précis d'abord. */
const NAF: [RegExp, string][] = [
  [/^43\.22/, "plomberie"],
  [/^43\.21/, "électricité"],
  [/^(43\.99C|43\.12|41\.20|43\.99)/, "maçonnerie"],
  [/^43\.34/, "peinture"],
  [/^43\.32/, "menuiserie"],
  [/^(46\.73|47\.52)/, "matériaux et quincaillerie"],
  [/^56\.10C/, "restauration rapide"],
  [/^56/, "restauration"],
  [/^10\.71/, "boulangerie"],
  [/^47\.(11|2)/, "alimentation"],
  [/^47\.73/, "pharmacie"],
  [/^47\.71/, "vêtements"],
  [/^47\.76/, "fleuriste"],
  [/^47\.30/, "station-service"],
  [/^49\.32/, "taxi"],
  [/^45/, "garage automobile"],
  [/^77\.1/, "location de voitures"],
  [/^96\.02B/, "beauté"],
  [/^96\.02/, "coiffure"],
  [/^14/, "couture"],
  [/^86\.21/, "médecin généraliste"],
  [/^(86|87|88|75)/, "santé"],
  [/^85\.53/, "auto-école"],
  [/^85/, "formation"],
  [/^55/, "hôtel"],
  [/^(79|90|91|93)/, "tourisme et loisirs"],
  [/^(62|63|95\.1)/, "informatique"],
  [/^61/, "téléphonie"],
  [/^81\.2/, "nettoyage"],
  [/^80/, "sécurité"],
  [/^69\.2/, "comptabilité"],
  [/^71\.11/, "architecture"],
  [/^(64|65|66)/, "banque et assurance"],
  [/^68/, "immobilier"],
  [/^03/, "pêche"],
  [/^(01|02)/, "agriculture"],
  [/^(49|50|51|52|53)/, "transport"],
  [/^(41|42|43)/, "construction"],
  [/^94/, "association"],
  [/^84/, "service public"],
];

const categoryOf = (naf: string | null, nature: string | null) => {
  if (nature?.startsWith("92")) return "association";
  if (nature?.startsWith("7")) return "service public";
  return NAF.find(([re]) => naf && re.test(naf))?.[1] ?? "autre";
};

const SECTIONS = "ABCDEFGHIJKLMNOPQRSTU".split("");

async function searchAll(params: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 400; page++) {
    const data = await getJson(`https://recherche-entreprises.api.gouv.fr/search?${params}&etat_administratif=A&per_page=25&page=${page}`);
    out.push(...data.results);
    await sleep(160); // 7 appels par seconde au plus
    if (page >= data.total_pages) break;
  }
  return out;
}

async function companiesIn(commune: string): Promise<Row[]> {
  const first = await getJson(`https://recherche-entreprises.api.gouv.fr/search?code_commune=${commune}&etat_administratif=A&per_page=1`);
  let results: any[] = [];
  if (first.total_results < 10_000) results = await searchAll(`code_commune=${commune}`);
  else for (const s of SECTIONS) results.push(...(await searchAll(`code_commune=${commune}&section_activite_principale=${s}`)));

  const rows: Row[] = [];
  for (const c of results) {
    if (c.statut_diffusion !== "O" || /NON-DIFFUSIBLE/i.test(c.nom_complet ?? "")) continue;
    const etabs: any[] = [c.siege, ...(c.matching_etablissements ?? [])].filter(
      (e) => e && e.commune === commune && e.etat_administratif === "A" && e.statut_diffusion_etablissement !== "P",
    );
    const e = etabs.find((x) => x.est_siege) ?? etabs[0];
    if (!e) continue;
    const brand = e.liste_enseignes?.[0] ?? e.nom_commercial ?? null;
    const name = cut(brand ?? c.nom_complet, 120);
    if (!name || name.length < 2) continue;
    const aliases = [...new Set([c.nom_raison_sociale, c.sigle, brand ? c.nom_complet : null].filter((v) => v && v !== name))]
      .slice(0, 8)
      .map((v) => cut(v, 80)!);
    const lat = e.latitude ? Number(e.latitude) : null;
    const lon = e.longitude ? Number(e.longitude) : null;
    rows.push({
      name,
      aliases,
      siret: e.siret,
      category: categoryOf(e.activite_principale ?? c.activite_principale, c.nature_juridique),
      commune,
      address: cut(e.adresse, 200),
      latitude: inMayotte(lat, lon) ? lat : null,
      longitude: inMayotte(lat, lon) ? lon : null,
      phones: [],
      email: null,
      website: null,
      hours: {},
      opened_on: /^\d{4}-\d{2}-\d{2}$/.test(e.date_creation ?? "") ? e.date_creation : null,
      published: false,
    });
  }
  return rows;
}

// ---------- Écriture ----------

async function main() {
  const all: Row[] = [];
  const seen = new Set<string>();
  const add = (rows: Row[]) => {
    for (const r of rows) {
      if (r.siret && seen.has(r.siret)) r.siret = null; // plusieurs services sous le même SIRET
      if (r.siret) seen.add(r.siret);
      if (!r.siret && r.category !== "service public") continue;
      all.push(r);
    }
  };

  const publics = await publicServices();
  add(publics);
  console.log(`Services publics : ${publics.length}`);
  for (const code of Object.keys(COMMUNES)) {
    const rows = await companiesIn(code);
    add(rows);
    console.log(`${COMMUNES[code]} : ${rows.length}`);
  }

  const complete = all.filter((r) => r.phones.length && Object.keys(r.hours).length && r.address && r.commune).length;
  console.log(`Total : ${all.length} fiches (${complete} complètes, ${all.length - complete} à compléter)`);
  if (OUT) writeFileSync(OUT, JSON.stringify(all, null, 1));
  if (!WRITE) return console.log("Essai seulement : rien n'est écrit (ajouter --ecrire).");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY manquants (.env.local).");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const existing = new Set<string>();
  const names = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("business_listings").select("siret, name").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data) {
      if (r.siret) existing.add(r.siret);
      names.add(r.name);
    }
    if (data.length < 1000) break;
  }
  const fresh = all.filter((r) => (r.siret ? !existing.has(r.siret) : !names.has(r.name)));
  console.log(`Déjà dans la table : ${all.length - fresh.length} ; à ajouter : ${fresh.length}`);

  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await db.from("business_listings").insert(fresh.slice(i, i + 500));
    if (error) throw new Error(`Lot ${i} : ${error.message}`);
    console.log(`Ajoutées : ${Math.min(i + 500, fresh.length)} / ${fresh.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
