/**
 * N'accepte qu'un chemin relatif interne (« /c/123 ») pour les paramètres de
 * redirection, afin d'éviter les redirections ouvertes vers un site tiers.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}

/** Routes qui exigent une session. */
export const PROTECTED_PATH_PREFIXES = [
  "/c/",
  "/parametres",
  "/admin",
  "/auth/nouveau-mot-de-passe",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

/** Page d'accueil avec ouverture de la fenêtre de connexion. */
export function authRequiredPath(nextPath: string): string {
  return `/?auth=required&next=${encodeURIComponent(safeNextPath(nextPath))}`;
}
