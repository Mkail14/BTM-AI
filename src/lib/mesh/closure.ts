import { siteClosure, type SiteStatus } from "@/lib/site/status";

/**
 * Site fermé (maintenance, attente d'un partenaire) et Tamilya Connect.
 *
 * Le proxy ne peut pas reconnaître un administrateur ici : le message arrive par le
 * téléphone d'un autre (le relais), sans session. La route /api/mesh/relay reste donc
 * ouverte, et c'est le compte signataire du message, relu en base, qui décide :
 * administrateur, Tamilya répond ; sinon, une réponse claire au lieu d'un silence
 * (avant le 2026-11-08, le relais recevait la page d'attente et réessayait sans fin).
 * Renvoie le texte à répondre, ou null si Tamilya répond normalement.
 */
export function meshClosure(isAdmin: boolean, status: SiteStatus, env: Record<string, string | undefined> = process.env): string | null {
  if (isAdmin) return null;
  return siteClosure(status, env)?.apiError ?? null;
}
