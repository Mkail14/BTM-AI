/** Bandeau de la page d'accueil : limites et règles communes à l'administration et au serveur. */

export type Announcement = { enabled: boolean; text: string; linkLabel: string; linkUrl: string };

export const ANNOUNCEMENT_LIMITS = { text: 140, linkLabel: 40, linkUrl: 300 } as const;

export const NO_ANNOUNCEMENT: Announcement = { enabled: false, text: "", linkLabel: "", linkUrl: "" };

/** Lien interne (« /partenaires ») ou https:// : jamais javascript:, ni //autre-site. */
export function isSafeAnnouncementLink(url: string) {
  if (url === "") return true;
  // Espaces et caractères invisibles : le navigateur les retire, « /⇥/autre-site » deviendrait « //autre-site ».
  if (/[\s\p{C}\\]/u.test(url)) return false;
  if (url === "/" || /^\/[^/\\]/.test(url)) return true;
  if (!url.startsWith("https://")) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Le bandeau ne s'affiche que s'il est allumé et a un texte. */
export const showsAnnouncement = (a: Announcement) => a.enabled && a.text.trim() !== "";
