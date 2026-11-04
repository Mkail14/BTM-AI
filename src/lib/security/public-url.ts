import { isIP } from "node:net";

/**
 * Adresse d'API saisie dans l'administration : le serveur va l'appeler avec une
 * clé. Seules les adresses https publiques sont acceptées, jamais le réseau
 * interne (localhost, 10.…, 192.168.…, 169.254.… des métadonnées du cloud…),
 * pour que le serveur ne serve pas de relais vers ce qui n'est pas public.
 * Les noms de domaine ne sont pas résolus ici : fetch ne suit pas non plus les
 * redirections (voir key-check.ts).
 */

function privateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // réseau partagé des opérateurs
    (a === 169 && b === 254) || // lien local (métadonnées du cloud)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multidiffusion et réservé
  );
}

function privateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  // IPv4 écrite en IPv6 (::ffff:10.0.0.1)
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateIPv4(mapped[1]);
  if (v.startsWith("::ffff:")) return true;
  return /^(fe[89ab]|fc|fd|ff)/.test(v); // lien local, adresses privées, multidiffusion
}

/** Vrai si l'adresse est en https et vise un hôte public. */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return false;
  const kind = isIP(host);
  if (kind === 4) return !privateIPv4(host);
  if (kind === 6) return !privateIPv6(host);
  // Nombres seuls (« 2130706433 », « 0x7f.1 ») : interprétés comme des IP par certains outils.
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host)) return false;
  if (host === "localhost" || !host.includes(".")) return false;
  return !/\.(localhost|local|internal|lan|home|intranet|corp)$/.test(host);
}
