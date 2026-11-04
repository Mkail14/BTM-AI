/**
 * Description lisible d'un appareil et d'un lieu, pour les e-mails de sécurité.
 * Approximatif par nature : on ne promet jamais plus que « Chrome sur Android ».
 */

export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Appareil inconnu";

  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : null;

  // L'ordre compte : Edge, Opera et Samsung Internet se présentent aussi comme Chrome.
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;

  if (browser && system) return `${browser} sur ${system}`;
  return browser ?? system ?? "Appareil inconnu";
}

const countries = new Intl.DisplayNames(["fr"], { type: "region" });

/** Ville et pays d'après les en-têtes de Vercel ; rien en local. */
export function describePlace(headers: Headers): string | undefined {
  const decode = (value: string | null) => {
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const city = decode(headers.get("x-vercel-ip-city"));
  const code = headers.get("x-vercel-ip-country");
  let country: string | null = null;
  if (code && /^[A-Z]{2}$/.test(code)) {
    try {
      country = countries.of(code) ?? code;
    } catch {
      country = code;
    }
  }
  const place = [city, country].filter(Boolean).join(", ");
  return place || undefined;
}

/**
 * Adresse publique du site, pour les liens et le logo des e-mails : SITE_URL,
 * sinon l'adresse de production donnée par Vercel. En production, jamais
 * l'en-tête Host de la requête (un tiers pourrait le choisir et glisser son
 * propre site dans nos e-mails) : sans adresse connue, chaîne vide, et les
 * e-mails partent sans lien vers le site (voir renderEmailHtml). L'adresse de
 * la requête (fallback) ne sert qu'en développement.
 */
export function siteOrigin(fallback: string, env: Record<string, string | undefined> = process.env) {
  const configured = env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (vercel) return `https://${vercel}`;
  return env.NODE_ENV === "production" ? "" : fallback;
}
