import { BRAND } from "./brand";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: { text: "text-base", symbol: 20 },
  md: { text: "text-lg", symbol: 24 },
  lg: { text: "text-3xl", symbol: 36 },
} as const;

/**
 * Logo provisoire, purement typographique. Pour intégrer le futur symbole,
 * renseignez BRAND.symbolSrc : il s'affichera devant le nom sans autre changement.
 */
export function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  const { text, symbol } = SIZES[size];

  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      {BRAND.symbolSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- fichier SVG local, taille fixe
        <img src={BRAND.symbolSrc} alt="" width={symbol} height={symbol} aria-hidden="true" />
      ) : null}
      <span className={`${text} font-semibold tracking-tight leading-none`}>
        <span>{BRAND.wordmark.primary}</span>
        <span className="ml-[0.28em] font-normal text-accent">{BRAND.wordmark.secondary}</span>
      </span>
      <span className="sr-only">{` — ${BRAND.parent}`}</span>
    </span>
  );
}
