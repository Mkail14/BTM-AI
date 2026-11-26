"use client";

import { useEffect, useRef } from "react";
import { cardBridge, closeBigPage, FULL_ATTR, isBigPage, waitResize, whenBigOpen } from "./app-fullscreen";
import { Markdown } from "./Markdown";

/**
 * Carte seule (page /apercu/carte), pour la conversation native de l'application : elle dit
 * à l'app sa hauteur, et quand un panneau plein écran s'ouvre (« Voir la carte »), pour que
 * l'app lui donne tout l'écran le temps qu'il reste ouvert.
 */
/**
 * Page en grand : ouvre le panneau du bouton n° `index` (dès qu'il existe), puis dit à l'app
 * de retirer la page quand il est fermé. Rien ne s'ouvre (carte en erreur) : la page se retire.
 */
function openBig(el: HTMLElement, index: number) {
  let opened = false;
  let frame = 0;
  const check = () => {
    frame = 0;
    const open = document.querySelector('[aria-modal="true"]') !== null;
    if (open) opened = true;
    else if (opened) return closeBigPage();
    if (opened) return;
    const button = el.querySelectorAll<HTMLElement>("[data-grand]")[index];
    if (button) button.click();
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };
  const changes = new MutationObserver(later);
  changes.observe(document.body, { childList: true, subtree: true });
  check();
  const giveUp = setTimeout(() => !opened && closeBigPage(), 15000);
  return () => {
    changes.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(giveUp);
  };
}

/** big : page en grand de l'app (?grand=N ou attente), lu aussi par le serveur pour un premier rendu identique. */
export function CardEmbed({ block, content, big = false }: { block: string; content: string; big?: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (isBigPage()) {
      let stop = () => {};
      const unsubscribe = whenBigOpen((index) => {
        stop();
        stop = openBig(el, index);
      });
      return () => {
        unsubscribe();
        stop();
      };
    }
    const bridge = cardBridge();
    let prepared = false;
    const root = document.documentElement;
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
      // Une carte avec un bouton « Voir … » : l'app prépare déjà sa page en grand, pour l'ouvrir sans attendre.
      if (!prepared && bridge?.preparer && el.querySelector("[data-grand]")) {
        prepared = true;
        bridge.preparer();
      }
      const open = document.querySelector('[aria-modal="true"]') !== null;
      if (open !== full) {
        const wasFull = full;
        full = open;
        if (open) root.setAttribute(FULL_ATTR, "");
        bridge?.pleinEcran?.(open);
        // Panneau fermé : la petite carte revient seulement une fois l'app revenue à sa taille.
        if (!open && wasFull) void waitResize().then(() => !full && root.removeAttribute(FULL_ATTR));
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
    // « Voir … » (bouton data-grand) : l'app ouvre le panneau dans une page à part, déjà en plein
    // écran, et cette petite carte reste à sa place. Sans ce pouvoir (ancienne app), le panneau s'ouvre ici.
    const onBig = (e: MouseEvent) => {
      const button = (e.target as Element | null)?.closest?.("[data-grand]");
      if (!button || !bridge?.grand) return;
      e.preventDefault();
      e.stopPropagation();
      bridge.grand([...el.querySelectorAll("[data-grand]")].indexOf(button));
    };
    window.addEventListener("click", onBig, true);
    return () => {
      window.removeEventListener("click", onBig, true);
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
        /* Panneau plein écran ouvert : la petite carte ne reste pas visible en haut, sous le flou. */
        html[${FULL_ATTR}] [data-carte-seule] { visibility: hidden; }
        /* Page en grand : seulement le panneau, la carte elle-même reste dans la conversation. */
        [data-carte-grand] { visibility: hidden; }
        body:has(> [data-carte-seule]) > #ecran-chargement,
        body:has(> [data-carte-seule]) > [aria-live="polite"],
        body:has(> [data-carte-seule]) > [aria-hidden="true"].fixed { display: none !important; }
      `}</style>
      <div ref={box} data-carte-seule="" data-carte-grand={big ? "" : undefined} className="py-0.5">
        <Markdown text={`\`\`\`${block}\n${content}\n\`\`\``} />
      </div>
    </>
  );
}
