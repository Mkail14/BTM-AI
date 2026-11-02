"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * Ticket de commande : le code à dicter et le QR code à montrer au livreur
 * ou au restaurant. Rien à télécharger : il suffit de l'écran.
 */
export function OrderTicket({ code, summary }: { code: string; summary: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(`${code} · ${summary}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((value) => alive && setSvg(value))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code, summary]);

  return (
    <div className="mx-auto mt-5 w-full max-w-64 rounded-3xl border border-border bg-bg-subtle p-4">
      <div
        role="img"
        aria-label={`QR code de la commande ${code}`}
        className="mx-auto aspect-square w-40 rounded-xl bg-white p-2 [&_svg]:size-full"
        // SVG produit localement par la bibliothèque qrcode, à partir de notre propre texte.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <p className="mt-3 text-[11px] font-medium tracking-wide text-fg-muted uppercase">Code de commande</p>
      <p className="font-mono text-2xl font-semibold tracking-[0.2em] select-all">{code}</p>
      <p className="mt-1 text-xs text-fg-muted">Montre ce QR code ou dicte ce code au livreur.</p>
    </div>
  );
}
