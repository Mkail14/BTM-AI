"use client";

import QRCode from "qrcode";
import { useId, useMemo } from "react";

/**
 * Ticket de commande : un QR code aux couleurs de BTM (points ronds, coins
 * arrondis, logo « BTM » au centre) et, dessous, le code à dicter au livreur.
 * Version 4 (33 × 33) et correction maximale (H) : le logo couvre un tiers de
 * la largeur et le QR reste lu à 100 % (essai : 150 codes, image réduite et floutée).
 * Le motif d'alignement (bas à droite) est dessiné à part : en points, il n'est plus reconnu.
 */

/** Part de la largeur laissée libre au centre pour le logo. */
const LOGO_RATIO = 0.34;
const QR_VERSION = 4;

type Matrix = { size: number; dark: (row: number, col: number) => boolean };

function buildMatrix(text: string): Matrix | null {
  try {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "H", version: QR_VERSION });
    return { size: modules.size, dark: (row, col) => Boolean(modules.get(row, col)) };
  } catch {
    return null;
  }
}

/** Les trois carrés de repérage (7 × 7), dessinés à part en carrés arrondis. */
const isFinder = (row: number, col: number, size: number) =>
  (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);

/** Motif d'alignement des versions 2 à 6 : 5 × 5, centré en (size − 7, size − 7). */
const isAlignment = (row: number, col: number, size: number) => Math.abs(row - (size - 7)) <= 2 && Math.abs(col - (size - 7)) <= 2;

export function StyledQr({ text, label }: { text: string; label: string }) {
  const id = useId().replace(/:/g, "");
  const matrix = useMemo(() => buildMatrix(text), [text]);
  if (!matrix) return null;

  const { size, dark } = matrix;
  const quiet = 2;
  const view = size + quiet * 2;
  const logo = Math.ceil(size * LOGO_RATIO) | 1; // impair : centré sur un module
  const logoStart = (size - logo) / 2;
  const inLogo = (row: number, col: number) =>
    row >= logoStart && row < logoStart + logo && col >= logoStart && col < logoStart + logo;

  const dots: { x: number; y: number }[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (dark(row, col) && !isFinder(row, col, size) && !isAlignment(row, col, size) && !inLogo(row, col)) dots.push({ x: col, y: row });
    }
  }
  const finders = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ] as const;

  const center = quiet + size / 2;
  const badge = logo - 0.6;

  return (
    <svg viewBox={`0 0 ${view} ${view}`} role="img" aria-label={label} className="order-qr size-full">
      <defs>
        <linearGradient id={`${id}-ink`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#14090e" />
          <stop offset="100%" stopColor="#5c1230" />
        </linearGradient>
        <linearGradient id={`${id}-brand`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d63369" />
          <stop offset="100%" stopColor="#8f1a43" />
        </linearGradient>
      </defs>

      <rect width={view} height={view} rx={view * 0.12} fill="#fff" />

      <g fill={`url(#${id}-ink)`} transform={`translate(${quiet} ${quiet})`}>
        {dots.map(({ x, y }) => (
          <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.45} />
        ))}
      </g>

      {/* Motif d'alignement : petit carré arrondi et point central */}
      <g transform={`translate(${quiet + size - 9} ${quiet + size - 9})`}>
        <rect x={0.5} y={0.5} width={4} height={4} rx={1.3} fill="none" stroke={`url(#${id}-ink)`} strokeWidth={1} />
        <circle cx={2.5} cy={2.5} r={0.6} fill={`url(#${id}-ink)`} />
      </g>

      {/* Carrés de repérage : anneau arrondi rose et pastille sombre */}
      {finders.map(([x, y]) => (
        <g key={`${x}-${y}`} transform={`translate(${quiet + x} ${quiet + y})`}>
          <rect x={0.5} y={0.5} width={6} height={6} rx={2} fill="none" stroke={`url(#${id}-brand)`} strokeWidth={1} />
          <rect x={2} y={2} width={3} height={3} rx={1} fill={`url(#${id}-ink)`} />
        </g>
      ))}

      {/* Logo BTM au centre */}
      <g className="order-qr-logo" style={{ transformOrigin: `${center}px ${center}px` }}>
        <rect
          x={center - badge / 2}
          y={center - badge / 2}
          width={badge}
          height={badge}
          rx={badge * 0.26}
          fill={`url(#${id}-brand)`}
          stroke="#fff"
          strokeWidth={0.6}
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={badge * 0.36}
          fontWeight={800}
          letterSpacing={-badge * 0.012}
          fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        >
          BTM
        </text>
      </g>
    </svg>
  );
}

export function OrderTicket({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-border bg-bg-subtle px-4 pt-5 pb-4 text-center">
      <div className="aspect-square w-[min(12rem,28dvh)] rounded-[1.6rem] bg-white p-1 shadow-[0_10px_40px_-12px_rgba(200,41,95,0.45)]">
        {/* Le code seul : un QR moins dense, plus beau et plus vite lu. */}
        <StyledQr text={code} label={`QR code de la commande ${code}`} />
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tracking-[0.2em] select-all">{code}</p>
      <p className="mt-0.5 text-xs text-fg-muted">Montre ce QR code ou dicte ce code au livreur.</p>
    </div>
  );
}
