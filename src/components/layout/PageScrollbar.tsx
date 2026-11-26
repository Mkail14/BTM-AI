"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** La boîte qui fait défiler la page : l'accueil et les pages vitrines (« .landing ») ont la leur. */
function findScroller(): HTMLElement {
  return (
    document.querySelector<HTMLElement>(".landing-home") ??
    document.querySelector<HTMLElement>(".landing") ??
    document.documentElement
  );
}

/**
 * Barre de défilement de la page, à nous : le navigateur ne sait pas flouter la sienne
 * (sa bande reste noire). Fond flouté comme la barre du haut, curseur rose qu'on glisse.
 * Ordinateur seulement (souris) et jamais dans l'application Android.
 */
export function PageScrollbar() {
  const pathname = usePathname();
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false });
  const scroller = useRef<HTMLElement | null>(null);
  const drag = useRef<{ startY: number; startScroll: number } | null>(null);
  const update = useRef(() => {});

  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute("data-app") || !window.matchMedia("(pointer: fine)").matches) return;
    root.classList.add("barre-perso");

    const obs = new ResizeObserver(() => update.current());
    update.current = () => {
      const el = findScroller();
      if (el !== scroller.current) {
        obs.disconnect();
        obs.observe(document.body);
        for (const c of el.children) obs.observe(c);
        // Cache la barre du navigateur sur cette boîte : la nôtre la remplace.
        el.style.scrollbarWidth = "none";
        scroller.current = el;
      }
      const view = el.clientHeight;
      const total = el.scrollHeight;
      if (total <= view + 1) {
        setThumb((t) => (t.visible ? { ...t, visible: false } : t));
        return;
      }
      const height = Math.max(32, (view / total) * view);
      const top = (el.scrollTop / (total - view)) * (view - height);
      setThumb({ top, height, visible: true });
    };
    const onScroll = () => update.current();
    update.current();
    // Les boîtes qui défilent ne remontent pas l'événement : on l'écoute à la capture.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      root.classList.remove("barre-perso");
      scroller.current?.style.removeProperty("scrollbar-width");
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      obs.disconnect();
    };
  }, []);

  // Changement de page : la boîte qui défile change aussi.
  useEffect(() => {
    const id = requestAnimationFrame(() => update.current());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  if (!thumb.visible) return null;

  const ratio = () => {
    const el = scroller.current ?? document.documentElement;
    return (el.scrollHeight - el.clientHeight) / (el.clientHeight - thumb.height || 1);
  };
  const scrollTo = (top: number) => (scroller.current ?? document.documentElement).scrollTo({ top, behavior: "instant" });

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 right-0 bottom-0 z-[56] w-2.5 border-l border-black/[0.06] bg-[rgb(255_255_255/0.3)] backdrop-blur-2xl backdrop-saturate-[1.8] dark:border-white/[0.06] dark:bg-[rgb(58_58_60/0.3)]"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // Clic sur la piste : saute à cet endroit.
        scrollTo((e.clientY - thumb.height / 2) * ratio());
      }}
    >
      <div
        className="absolute right-[2px] left-[2px] cursor-grab rounded-full bg-[color-mix(in_srgb,var(--accent)_60%,transparent)] transition-colors hover:bg-accent active:cursor-grabbing active:bg-accent"
        style={{ top: thumb.top, height: thumb.height }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startY: e.clientY, startScroll: scroller.current?.scrollTop ?? 0 };
        }}
        onPointerMove={(e) => {
          if (drag.current) scrollTo(drag.current.startScroll + (e.clientY - drag.current.startY) * ratio());
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  );
}
