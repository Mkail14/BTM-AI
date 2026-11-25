import "server-only";
import { unstable_cache } from "next/cache";
import type { ApplyInfo, ApplyWay } from "@/lib/emploi/apply";
import type { JobOffer } from "@/lib/emploi/intent";
import { fetchTerritorialOffers } from "@/server/services/live/emploi-territorial";

/**
 * ESSAI ADMIN (2026-11-25) : comment postuler à chaque offre Emploi Territorial de Mayotte.
 * Le flux RSS ne le dit pas : on lit la partie « Contact et modalités de candidature »
 * de la page de l'offre (robots.txt l'autorise, seul /exportoffres/ est refusé).
 *
 * Réservé aux admins tant que le GIP Informatique des CDG (qui tient le site) n'a pas
 * donné son accord : leurs mentions légales interdisent de reprendre le contenu sans autorisation.
 *
 * Chaque page est gardée 24 h (une offre ne change presque jamais) ; 3 pages lues en même temps au plus.
 */
const SITE = "https://www.emploi-territorial.fr";
const TIMEOUT_MS = 10_000;
const PARALLEL = 3;
const DAY_S = 86_400;

export type { ApplyInfo, ApplyWay };

export type OfferWithApply = JobOffer & { apply: ApplyInfo | null };

const text = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

const unique = (values: string[]) => [...new Set(values)];
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /https?:\/\/[^\s<>"')]+/g;
const isTerritorial = (value: string) => /emploi-territorial\.fr/i.test(value);

/** Lit la partie candidature d'une page d'offre (sans réseau, testée). */
export function parseApplyInfo(html: string): ApplyInfo {
  const start = html.indexOf("Contact et modalités de candidature");
  const endAt = start < 0 ? -1 : html.indexOf('id="div_trav_handicap"', start);
  const section = start < 0 ? "" : html.slice(start, endAt > start ? endAt : start + 20_000);

  const items = new Map<string, string>();
  for (const [, label, value] of section.matchAll(/<div class="offre-item-label[^"]*">([\s\S]*?)<\/div>\s*<div class="offre-item-(?:value|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    items.set(text(label), value);
  }
  const noteHtml = items.get("Informations complémentaires") ?? "";
  const note = text(noteHtml) || null;
  const linkHtml = items.get("Lien de candidature") ?? "";

  const emails = unique([...(note?.match(EMAIL) ?? []), ...[...section.matchAll(/mailto:([^"?]+)/g)].map((m) => m[1])])
    .map((e) => e.replace(/\.$/, "").toLowerCase())
    .filter((e) => !isTerritorial(e));
  const found = unique([...[...linkHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ...(note?.match(URL_RE) ?? [])])
    .map((u) => u.replace(/[.,;]$/, ""))
    .filter((u) => /^https?:\/\//.test(u) && !isTerritorial(u));
  // « https://recrutements.mayotte » coupé dans le texte, à côté du vrai lien : on garde le lien entier.
  const links = found.filter((u) => !found.some((other) => other !== u && other.startsWith(u)));
  const formPath = html.match(/href=['"](\/candidature\/[^'"]+)['"]/)?.[1];
  const form = formPath ? `${SITE}${formPath}` : null;
  const phone = items.has("Contact") ? text(items.get("Contact")!) || null : null;
  // Courrier seulement quand rien d'autre n'est proposé (« déposées exclusivement en ligne » contient aussi « adressées à »).
  const postal = !emails.length && !links.length && !form && note && /adress(?:er|ée?s?)\s+à|par courrier|\bBP\s*\d/i.test(note) ? note : null;

  const way: ApplyWay = emails.length ? "mail" : links.length ? "site" : form ? "formulaire" : postal ? "courrier" : "inconnu";
  return { way, emails, links, form, postal, phone, note };
}

async function readOffer(link: string): Promise<ApplyInfo> {
  if (!link.startsWith(`${SITE}/offre/`)) throw new Error("lien d'offre inattendu");
  const response = await fetch(link, {
    headers: { Accept: "text/html", "Accept-Language": "fr-FR,fr;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; TamilyaBot/1.0)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`page de l'offre illisible (HTTP ${response.status})`);
  return parseApplyInfo(await response.text());
}

/** Une page d'offre, gardée 24 h. */
const cachedOffer = (link: string) => unstable_cache(() => readOffer(link), ["emploi-territorial-candidature", link], { revalidate: DAY_S })();

/** Comment postuler à une seule offre (bouton Postuler de la conversation) ; null : pas une page d'offre Emploi Territorial. */
export async function getApplyForOffer(link: string): Promise<ApplyInfo | null> {
  if (!link.startsWith(`${SITE}/offre/`) || link.length > 300) return null;
  return cachedOffer(link);
}

/** Les offres de Mayotte avec leur façon de postuler (null : page de l'offre illisible cette fois). */
export async function getTerritorialOffersWithApply(): Promise<OfferWithApply[]> {
  const offers = await fetchTerritorialOffers();
  const result: OfferWithApply[] = [];
  for (let i = 0; i < offers.length; i += PARALLEL) {
    const batch = offers.slice(i, i + PARALLEL);
    const infos = await Promise.allSettled(batch.map((o) => cachedOffer(o.link)));
    batch.forEach((offer, k) => {
      const info = infos[k];
      if (info.status === "rejected") console.error("[emploi] candidature illisible", offer.link, info.reason);
      result.push({ ...offer, apply: info.status === "fulfilled" ? info.value : null });
    });
  }
  return result;
}
