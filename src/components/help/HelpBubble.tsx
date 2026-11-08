"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useBackToClose } from "@/components/layout/useBackToClose";
import { IconClose, IconHelp } from "@/components/ui/icons";
import { EDGE, safeArea } from "./help-geometry";

/**
 * Le panneau (questions fréquentes, assistant, e-mail) part dans un fichier à part : il n'est
 * pas envoyé avec chaque page, seulement chargé quand le navigateur est au repos ou dès qu'on
 * approche le rond, pour s'ouvrir sans attente.
 */
const loadHelpPanel = () => import("./HelpPanel");
const HelpPanel = dynamic(() => loadHelpPanel().then((m) => m.HelpPanel), { ssr: false });

/** Taille du rond (ordinateur, puis téléphone sous 640 px de large), en px. */
const SIZE = 52;
const SIZE_SMALL = 44;
/** Place par défaut : tout en bas (la position affichée est ensuite bornée à l'écran). */
const BOTTOM = 100_000;
/** Au-delà de ce déplacement (px), un appui devient un glisser, pas un clic. */
const DRAG_THRESHOLD = 6;
const STORAGE_KEY = "aide-rond";

type Spot = { side: "left" | "right"; y: number };

/** Hauteur bornée à l'écran visible, sous l'encoche et au-dessus de la barre d'accueil. */
const clampY = (y: number, size: number) => {
  const safe = safeArea();
  return Math.min(Math.max(y, EDGE + safe.top), window.innerHeight - size - EDGE - safe.bottom);
};

/**
 * Rond d'aide, sur toutes les pages (sauf l'administration) : on le fait
 * glisser où l'on veut, il se range contre le bord le plus proche et garde sa
 * place (localStorage). Un appui ouvre le panneau d'aide : questions
 * fréquentes, assistant d'aide (IA) et message à l'équipe par e-mail.
 */
export function HelpBubble() {
  const pathname = usePathname();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const gesture = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  // Un glisser se termine par un « click » du navigateur : on l'ignore pour ne pas ouvrir l'aide.
  const dragged = useRef(false);
  const close = useCallback(() => setOpen(false), []);
  // Téléphone et tablette : le bouton retour ferme l'aide au lieu de quitter la page.
  const dismiss = useBackToClose(open, close);

  // Position lue après le montage (la taille de l'écran n'est connue que dans le navigateur).
  // On garde la hauteur voulue telle quelle : c'est l'affichage (CSS) qui la borne à
  // l'écran. Ainsi, quand le clavier du téléphone réduit l'écran puis se ferme, le
  // rond revient à sa place au lieu de rester remonté sur le bouton Envoyer.
  useEffect(() => {
    let saved: Spot | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpot(
      saved && (saved.side === "left" || saved.side === "right") && Number.isFinite(saved.y)
        ? { side: saved.side, y: saved.y }
        : { side: "right", y: BOTTOM },
    );
    // Téléphone : rond un peu plus petit.
    const narrow = window.matchMedia("(max-width: 639px)");
    const onChange = () => setSmall(narrow.matches);
    onChange();
    narrow.addEventListener("change", onChange);
    return () => narrow.removeEventListener("change", onChange);
  }, []);

  // Panneau préchargé quand le navigateur n'a plus rien à faire (après la conversation de l'accueil).
  const hidden = pathname.startsWith("/admin");
  useEffect(() => {
    if (hidden) return;
    const warm = () => void loadHelpPanel().catch(() => {});
    const idle = window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 5000 });
      else warm();
    }, 4000);
    return () => window.clearTimeout(idle);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!spot || hidden) return null;
  const size = small ? SIZE_SMALL : SIZE;

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    gesture.current = { startX: e.clientX, startY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, moved: false };
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Appui avant le préchargement : le panneau part tout de suite.
    void loadHelpPanel().catch(() => {});
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) return;
    g.moved = true;
    setDrag({
      x: Math.min(Math.max(e.clientX - g.offsetX, 0), window.innerWidth - size),
      y: Math.min(Math.max(e.clientY - g.offsetY, 0), window.innerHeight - size),
    });
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moved || !drag) {
      setDrag(null);
      return;
    }
    dragged.current = true;
    // Lâché : il se range contre le bord le plus proche.
    const next: Spot = { side: drag.x + size / 2 < window.innerWidth / 2 ? "left" : "right", y: clampY(drag.y, size) };
    setSpot(next);
    setDrag(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  // Bornée à l'écran visible, au-dessus de la barre d'accueil de l'iPhone.
  const top = `max(calc(${EDGE}px + env(safe-area-inset-top)), min(${spot.y}px, calc(100dvh - ${size + EDGE}px - env(safe-area-inset-bottom))))`;
  const style = drag
    ? { left: drag.x, top: drag.y }
    : spot.side === "left"
      ? { left: EDGE, top }
      : { right: EDGE, top };

  return (
    <>
      {open ? (
        <>
          {/* Fond flouté et un peu assombri derrière l'aide ; un clic dessus la ferme. */}
          <div aria-hidden="true" onClick={dismiss} className="help-backdrop fixed inset-0 z-[57] bg-black/20 backdrop-blur-md" />
          <HelpPanel side={spot.side} anchorY={clampY(spot.y, size)} size={size} onClose={dismiss} onLeave={close} />
        </>
      ) : null}
      <button
        type="button"
        data-help-bubble=""
        aria-label={open ? "Fermer l'aide" : "Aide : questions fréquentes, assistant, nous écrire"}
        aria-expanded={open}
        title="Aide — tu peux me déplacer"
        // Appui, Entrée ou Espace : ouvre ou ferme (le glisser, lui, déplace seulement le rond).
        onClick={() => {
          if (dragged.current) dragged.current = false;
          else if (open) dismiss();
          else setOpen(true);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null;
          setDrag(null);
        }}
        style={{ ...style, width: size, height: size }}
        data-dragging={drag ? "" : undefined}
        className={`help-bubble btn-rose btn-rose--icon btn-rose--lagon fixed z-[58] touch-none shadow-lg select-none ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? <IconClose width={22} height={22} /> : <IconHelp width={26} height={26} />}
      </button>
    </>
  );
}
