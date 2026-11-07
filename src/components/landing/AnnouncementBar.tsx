import Link from "next/link";
import type { Announcement } from "@/lib/site/announcement-rules";

/**
 * Bandeau sous la barre du haut de l'accueil, à la manière du site d'Apple :
 * une phrase centrée (alerte, bon plan, publicité) et un lien facultatif « … › ».
 * Il défile avec la page (seule la barre du haut reste collée). Réglé dans
 * l'administration, rubrique Bandeau ; aussi utilisé pour l'aperçu là-bas.
 */
export function AnnouncementBar({ announcement }: { announcement: Announcement }) {
  const { text, linkLabel, linkUrl } = announcement;
  const label = linkLabel.trim() || "En savoir plus";
  // Rose dans les deux thèmes : clair = rose clair, sombre = léger voile rose, texte rose pâle.
  const linkClass = "zone-appui relative font-medium whitespace-nowrap text-accent underline-offset-4 hover:underline";
  return (
    <aside
      aria-label="Annonce"
      className="relative z-10 border-b border-[#f5bfd2] bg-[#fcdbe7] px-4 py-3 text-center text-[13px] leading-snug text-fg/85 sm:text-sm dark:border-[color-mix(in_oklab,var(--persona,var(--accent))_22%,transparent)] dark:bg-[color-mix(in_oklab,var(--persona,var(--accent))_12%,transparent)] dark:text-[#f3d3df]"
    >
      <p className="mx-auto max-w-[1024px] text-pretty">
        {text}
        {linkUrl ? (
          <>
            {" "}
            {linkUrl.startsWith("/") ? (
              <Link href={linkUrl} className={linkClass}>
                {label} <span aria-hidden="true">›</span>
              </Link>
            ) : (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {label} <span aria-hidden="true">›</span>
              </a>
            )}
          </>
        ) : null}
      </p>
    </aside>
  );
}
