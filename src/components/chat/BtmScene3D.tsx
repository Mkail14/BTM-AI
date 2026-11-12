"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { lireNombre, type OuvrageId } from "@/lib/btm/ouvrages";

/**
 * Rendu 3D de l'ouvrage du devis BTM, qui suit les mesures pendant qu'on les
 * tape. Fait en CSS 3D (des boîtes à six faces) : rien à télécharger, ce qui
 * compte avec le débit de Mayotte, et ça tourne même sur un petit téléphone.
 * Tourne seul doucement ; on peut le faire pivoter au doigt.
 */

type Vec = { x: number; y: number; z: number };
type Faces = { top: string; side: string; front?: string; texture?: { image: string; size: string } };

const C = {
  parpaing: "#b9b3a6",
  beton: "#a7aaae",
  betonClair: "#c9cbcd",
  terre: "#8a6b4e",
  sol: "rgba(120,140,110,0.28)",
  carreau: "#e9e1d3",
  ouverture: "#4a5866",
};

// Parpaings en quinconce : deux rangs de 20 cm, joints décalés d'un demi-bloc.
const PARPAINGS =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0.5H40M0 20.5H40M0.5 0V20M20.5 20V40' stroke='%23857f73' stroke-width='1.2' fill='none'/%3E%3C/svg%3E\")";
const GRILLE = (couleur: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M0 0.5H20M0.5 0V20' stroke='${encodeURIComponent(couleur)}' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

const face = (w: number, h: number, transform: string, background: string, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: -w / 2,
  top: -h / 2,
  width: w,
  height: h,
  transform,
  background,
  backfaceVisibility: "hidden",
  transition: "all 320ms cubic-bezier(0.2,0.8,0.2,1)",
  ...extra,
});

/** Boîte w × h × d (px) centrée en `at` ; y vers le haut. */
function Box({ w, h, d, at, faces, ghost }: { w: number; h: number; d: number; at: Vec; faces: Faces; ghost?: boolean }) {
  // Texture en premier calque, au-dessus de la couleur (un seul « background », sans propriété en conflit).
  const tex = (base: string) => (faces.texture ? `${faces.texture.image} 0 0 / ${faces.texture.size}, ${base}` : base);
  const front = faces.front ?? faces.side;
  // Mesure pas encore donnée : faces transparentes (une opacité sur le parent aplatirait la 3D).
  const g = ghost ? { opacity: 0.45 } : {};
  const shade = (c: string, k: number) => `linear-gradient(rgba(0,0,0,${k}),rgba(0,0,0,${k})), ${c}`;
  return (
    <div
      style={{
        position: "absolute",
        transformStyle: "preserve-3d",
        transform: `translate3d(${at.x}px, ${-at.y}px, ${at.z}px)`,
        transition: "transform 320ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
    >
      <div style={face(w, h, `translateZ(${d / 2}px)`, tex(front), g)} />
      <div style={face(w, h, `rotateY(180deg) translateZ(${d / 2}px)`, tex(shade(front, 0.18)), g)} />
      <div style={face(d, h, `rotateY(90deg) translateZ(${w / 2}px)`, tex(shade(faces.side, 0.12)), g)} />
      <div style={face(d, h, `rotateY(-90deg) translateZ(${w / 2}px)`, shade(faces.side, 0.25), g)} />
      <div style={face(w, d, `rotateX(90deg) translateZ(${h / 2}px)`, faces.top, g)} />
      <div style={face(w, d, `rotateX(-90deg) translateZ(${h / 2}px)`, shade(faces.side, 0.35), g)} />
    </div>
  );
}

/** Repère de mesure posé sur le sol (« 8 m »). */
function Cote({ text, at }: { text: string; at: Vec }) {
  return (
    <div
      style={{
        position: "absolute",
        // Toujours face à l'écran : le monde tourne de --yaw, l'étiquette tourne à l'envers.
        transform: `translate3d(${at.x}px, ${-at.y}px, ${at.z}px) rotateY(calc(var(--yaw, 0) * -1deg)) rotateX(24deg)`,
        transition: "transform 320ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
    >
      <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg/85 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-fg tabular-nums shadow-sm">
        {text}
      </span>
    </div>
  );
}

const nf = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);

/** Valeur tapée si elle est lisible, sinon l'exemple (affiché en transparence). */
function lire(valeurs: Record<string, string>, nom: string, defaut: number, min: number, max: number) {
  const n = lireNombre(valeurs[nom]);
  return Number.isFinite(n) && n >= min && n <= max ? { v: n, ok: true } : { v: defaut, ok: false };
}

const BOX = 170; // taille de la plus grande dimension, en px

function Scene({ type, valeurs }: { type: OuvrageId; valeurs: Record<string, string> }) {
  if (type === "mur") {
    const L = lire(valeurs, "longueur", 10, 0.1, 200);
    const H = lire(valeurs, "hauteur", 2.5, 0.1, 20);
    const s = BOX / Math.max(L.v, H.v * 1.6);
    const w = L.v * s, h = H.v * s, d = Math.max(0.2 * s, 5);
    const ouv = lireNombre(valeurs.ouvertures);
    const aire = Number.isFinite(ouv) && ouv > 0 ? Math.min(ouv, L.v * H.v * 0.8) : 0;
    // Portes et fenêtres : un seul rectangle de cette surface, posé au sol (comme une porte).
    const oh = Math.min(H.v * 0.85, 2.1, Math.sqrt(aire * 1.6)), ow = aire > 0 ? Math.min(aire / oh, L.v * 0.9) : 0;
    const block = 0.4 * s;
    return (
      <>
        <Box w={w} h={h} d={d} at={{ x: 0, y: h / 2, z: 0 }} ghost={!L.ok || !H.ok}
          faces={{ top: C.betonClair, side: C.parpaing, texture: { image: PARPAINGS, size: `${block}px ${block}px` } }} />
        {aire > 0 ? (
          <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translate3d(${w * 0.18}px, ${-(oh * s) / 2}px, ${d / 2 + 0.6}px)` }}>
            <div style={face(ow * s, oh * s, "", C.ouverture, { borderRadius: 2 })} />
          </div>
        ) : null}
        <Cote text={`${nf(L.v)} m`} at={{ x: 0, y: -6, z: d / 2 + 14 }} />
        <Cote text={`${nf(H.v)} m`} at={{ x: w / 2 + 18, y: h / 2, z: 0 }} />
      </>
    );
  }

  if (type === "dalle" || type === "terrasse") {
    const L = lire(valeurs, "longueur", type === "dalle" ? 8 : 6, 0.1, 200);
    const W = lire(valeurs, "largeur", type === "dalle" ? 6 : 4, 0.1, 200);
    const E = lire(valeurs, "epaisseur", type === "dalle" ? 12 : 10, 5, 60);
    const s = BOX / Math.max(L.v, W.v);
    const e = Math.max((E.v / 100) * s * 3, 4); // épaisseur grossie ×3 pour qu'on la voie
    const top = type === "terrasse" ? `linear-gradient(135deg, #d8d9da, ${C.betonClair} 60%, #bfc1c3)` : C.beton;
    return (
      <>
        <Box w={L.v * s} h={e} d={W.v * s} at={{ x: 0, y: e / 2, z: 0 }} ghost={!L.ok || !W.ok}
          faces={{ top, side: C.beton }} />
        {type === "dalle" ? (
          // Treillis soudé, vu par transparence sur le dessus
          <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translate3d(0, ${-e - 0.5}px, 0) rotateX(90deg)` }}>
            <div style={face(L.v * s * 0.92, W.v * s * 0.92, "", `${GRILLE("#6d7177")} 0 0 / ${0.4 * s}px ${0.4 * s}px`, { opacity: 0.35 })} />
          </div>
        ) : null}
        <Cote text={`${nf(L.v)} m`} at={{ x: 0, y: -4, z: (W.v * s) / 2 + 14 }} />
        <Cote text={`${nf(W.v)} m`} at={{ x: (L.v * s) / 2 + 18, y: -4, z: 0 }} />
        <Cote text={`${nf(E.v)} cm`} at={{ x: -(L.v * s) / 2 - 8, y: e + 10, z: (W.v * s) / 2 }} />
      </>
    );
  }

  if (type === "fondation") {
    const L = lire(valeurs, "longueur", 30, 0.1, 500);
    const W = lire(valeurs, "largeur", 0.5, 0.1, 5);
    const P = lire(valeurs, "profondeur", 0.6, 0.1, 5);
    // Les tranchées font le tour de la maison : un carré de côté longueur ÷ 4.
    const cote = L.v / 4;
    const s = BOX / cote;
    const c = cote * s, t = Math.max(W.v * s, 3), p = Math.max(P.v * s * 2, 4);
    const ghost = !L.ok || !W.ok || !P.ok;
    const beton = { top: C.betonClair, side: C.beton };
    return (
      <>
        <div style={{ position: "absolute", transformStyle: "preserve-3d", transform: "rotateX(90deg)" }}>
          <div style={face(c + 40, c + 40, "", C.sol, { borderRadius: 8 })} />
        </div>
        <Box w={c} h={p} d={t} at={{ x: 0, y: -p / 2, z: c / 2 - t / 2 }} faces={beton} ghost={ghost} />
        <Box w={c} h={p} d={t} at={{ x: 0, y: -p / 2, z: -c / 2 + t / 2 }} faces={beton} ghost={ghost} />
        <Box w={t} h={p} d={c - 2 * t} at={{ x: c / 2 - t / 2, y: -p / 2, z: 0 }} faces={beton} ghost={ghost} />
        <Box w={t} h={p} d={c - 2 * t} at={{ x: -c / 2 + t / 2, y: -p / 2, z: 0 }} faces={beton} ghost={ghost} />
        <Cote text={`${nf(L.v)} m en tout`} at={{ x: 0, y: 6, z: c / 2 + 16 }} />
        <Cote text={`${nf(W.v)} × ${nf(P.v)} m`} at={{ x: c / 2 + 22, y: 6, z: 0 }} />
      </>
    );
  }

  // Carrelage
  const L = lire(valeurs, "longueur", 5, 0.1, 200);
  const W = lire(valeurs, "largeur", 4, 0.1, 200);
  const format = { "30x30": 0.3, "45x45": 0.45, "60x60": 0.6 }[valeurs.format ?? "60x60"] ?? 0.6;
  const s = BOX / Math.max(L.v, W.v);
  const tile = Math.max(format * s, 3);
  return (
    <>
      <Box w={L.v * s} h={3} d={W.v * s} at={{ x: 0, y: 1.5, z: 0 }} ghost={!L.ok || !W.ok}
        faces={{ top: `${GRILLE("#b7ab97")} 0 0 / ${tile}px ${tile}px, ${C.carreau}`, side: "#cfc5b4" }} />
      <Cote text={`${nf(L.v)} m`} at={{ x: 0, y: -4, z: (W.v * s) / 2 + 14 }} />
      <Cote text={`${nf(W.v)} m`} at={{ x: (L.v * s) / 2 + 18, y: -4, z: 0 }} />
    </>
  );
}

export function BtmScene3D({ type, valeurs, compact = false }: { type: OuvrageId; valeurs: Record<string, string>; compact?: boolean }) {
  const world = useRef<HTMLDivElement>(null);
  const angle = useRef(-32);
  const drag = useRef<{ x: number; angle: number } | null>(null);
  const idleSince = useRef(0);

  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      // Tourne seul, sauf pendant le doigt et 2 s après.
      if (!reduce && !drag.current && now - idleSince.current > 2000) angle.current += dt * 0.012;
      if (world.current) {
        world.current.style.transform = `translateY(${compact ? 18 : 30}px) rotateX(-24deg) rotateY(${angle.current}deg)`;
        world.current.style.setProperty("--yaw", String(angle.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [compact]);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, angle: angle.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) angle.current = drag.current.angle + (e.clientX - drag.current.x) * 0.6;
  };
  const up = () => {
    drag.current = null;
    idleSince.current = performance.now();
  };

  return (
    <div
      role="img"
      aria-label="Aperçu 3D de l'ouvrage, à faire tourner au doigt"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing"
      style={{
        height: compact ? 150 : 210,
        perspective: 720,
        background: "radial-gradient(120% 90% at 50% 30%, var(--bg-subtle), var(--bg) 75%)",
      }}
    >
      <div className="absolute top-1/2 left-1/2" style={{ transformStyle: "preserve-3d" }}>
        <div ref={world} style={{ transformStyle: "preserve-3d" }}>
          <Scene type={type} valeurs={valeurs} />
        </div>
      </div>
    </div>
  );
}
