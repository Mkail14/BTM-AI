import type { CSSProperties } from "react";
import { BRAND } from "./brand";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg" | "xl";
  /** Masque le badge « AI » (logo du groupe seul). */
  groupOnly?: boolean;
  className?: string;
};

/** Hauteur du logo en pixels ; la largeur suit les proportions du fichier. */
const HEIGHTS = { sm: 22, md: 28, lg: 44, xl: 72 } as const;

/**
 * Logo du Groupe BTM suivi du badge « AI ». La forme détourée sert de masque :
 * elle prend la couleur du texte (`currentColor`), donc s'adapte seule aux
 * thèmes clair et sombre.
 */
export function BrandLogo({ size = "md", groupOnly = false, className = "" }: BrandLogoProps) {
  const height = HEIGHTS[size];
  const mask: CSSProperties = {
    width: Math.round(height * BRAND.logo.ratio),
    height,
    backgroundColor: "currentColor",
    WebkitMaskImage: `url(${BRAND.logo.src})`,
    maskImage: `url(${BRAND.logo.src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };

  return (
    <span
      role="img"
      aria-label={groupOnly ? BRAND.parent : `${BRAND.name} — ${BRAND.parent}`}
      className={`inline-flex shrink-0 items-end gap-[0.35em] text-fg select-none ${className}`}
      style={{ fontSize: height }}
    >
      <span aria-hidden="true" className="block" style={mask} />
      {groupOnly ? null : (
        <span
          aria-hidden="true"
          className="mb-[0.02em] rounded-[0.18em] bg-accent px-[0.22em] py-[0.06em] text-[0.36em] leading-none font-bold tracking-wide text-accent-fg"
        >
          {BRAND.wordmark.secondary}
        </span>
      )}
    </span>
  );
}
