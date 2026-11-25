"use client";

import { useEffect, useRef } from "react";
import { Markdown } from "./Markdown";

/** Pont posé par l'application Android (CardFrame.java) : taille de la carte et plein écran. */
type Bridge = { hauteur?: (px: number) => void; pleinEcran?: (on: boolean) => void };

/**
 * Carte seule (page /apercu/carte), pour la conversation native de l'application : elle dit
 * à l'app sa hauteur, et quand un panneau plein écran s'ouvre (« Voir la carte »), pour que
 * l'app lui donne tout l'écran le temps qu'il reste ouvert.
 */
export function CardEmbed({ block, content }: { block: string; content: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const bridge = (window as unknown as { TamilyaCarte?: Bridge }).TamilyaCarte;
    let height = -1;
    let full: boolean | null = null;
    let frame = 0;
    const send = () => {
      frame = 0;
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h !== height) {
        height = h;
        bridge?.hauteur?.(h);
      }
      const open = document.querySelector('[aria-modal="true"]') !== null;
      if (open !== full) {
        full = open;
        bridge?.pleinEcran?.(open);
      }
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(send);
    };
    const size = new ResizeObserver(later);
    size.observe(el);
    const changes = new MutationObserver(later);
    changes.observe(document.body, { childList: true, subtree: true });
    send();
    // Un lien du site (« Voir en grand » vers /mayotte…) ne change jamais de page dans ce petit cadre :
    // il part en vraie navigation, que l'application ouvre en dehors de la carte.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.getAttribute("href")?.startsWith("#") || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = link.href;
    };
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      size.disconnect();
      changes.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/* Rien d'autre que la carte : ni écran de lancement, ni message de connexion, ni pastille, fond transparent. */}
      <style>{`
        html, body { background: transparent !important; min-height: 0 !important; }
        /* Pas de rond de Tamilya à côté ici : sans ça, le décalage « téléphone » de .chat-card coupe la carte à gauche. */
        [data-carte-seule] .chat-card { margin-left: 0 !important; }
        body:has(> [data-carte-seule]) > #ecran-chargement,
        body:has(> [data-carte-seule]) > [aria-live="polite"],
        body:has(> [data-carte-seule]) > [aria-hidden="true"].fixed { display: none !important; }
      `}</style>
      <div ref={box} data-carte-seule="" className="py-0.5">
        <Markdown text={`\`\`\`${block}\n${content}\n\`\`\``} />
      </div>
    </>
  );
}
