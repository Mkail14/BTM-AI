/**
 * Lien vers une page du tableau de bord Supabase du projet, déduit de l'URL
 * publique (https://<ref>.supabase.co). Null pour une instance auto-hébergée.
 */
export function supabaseDashboardLink(projectUrl: string, path: string): string | null {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(projectUrl.trim());
  return match ? `https://supabase.com/dashboard/project/${match[1]}/${path}` : null;
}
