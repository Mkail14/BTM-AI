import "server-only";
import { createHmac, randomBytes } from "node:crypto";

const fallbackSalt = randomBytes(32).toString("hex");

/**
 * Adresse IP du client. En production, l'application doit être derrière un
 * proxy de confiance (Vercel, Nginx…) qui réécrit X-Forwarded-For.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Empreinte HMAC : aucune adresse IP n'est stockée en clair. */
export function hashIdentifier(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT || fallbackSalt;
  return createHmac("sha256", salt).update(value).digest("hex").slice(0, 32);
}

/**
 * Protection CSRF complémentaire : les requêtes qui modifient des données
 * doivent provenir de la même origine que l'application.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Les navigateurs envoient Origin sur les POST/DELETE ; son absence
    // indique un client non-navigateur, déjà soumis à l'authentification.
    return request.headers.get("sec-fetch-site") !== "cross-site";
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
