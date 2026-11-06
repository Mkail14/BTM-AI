"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { getVoiceMood, voiceLevel } from "@/lib/chat/voice-level";

/** Durée de l'animation du clic avant d'ouvrir (voix ou zone de saisie). */
const POP_MS = 520;
/** Images par seconde de la goutte quand elle bouge (cœur, voix…), puis au repos. */
const FPS_ACTIVE = 30;
const FPS_IDLE = 20;

/**
 * Place du globe au moment du clic : le mode vocal s'en sert pour faire
 * « grandir » ce même globe jusqu'au centre de l'écran (morphose), au lieu
 * d'en ouvrir un autre par-dessus.
 */
let launch: { rect: DOMRect; at: number } | null = null;

/** Place du globe touché il y a moins d'une seconde (une seule fois), sinon null. */
export function takeLaunchOrigin(): DOMRect | null {
  const origin = launch && performance.now() - launch.at < 1000 ? launch.rect : null;
  launch = null;
  return origin;
}

/** Bruit lisse à une dimension : valeurs au hasard sur une grille, reliées en douceur. Jamais deux fois le même chemin. */
function makeNoise() {
  const lattice = Float32Array.from({ length: 512 }, () => Math.random() * 2 - 1);
  const at = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = lattice[((i % 512) + 512) % 512];
    const b = lattice[(((i + 1) % 512) + 512) % 512];
    return a + (b - a) * u;
  };
  // Deux octaves : un grand mouvement lent et des frémissements.
  return (x: number) => at(x) * 0.72 + at(x * 2.3 + 91.7) * 0.28;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Tamilya vivante : une goutte qui ne fait jamais deux fois le même mouvement.
 * Sa forme, sa dérive, sa rotation et ses gouttelettes suivent un bruit
 * aléatoire calculé à chaque image, avec de temps en temps un sursaut ; son
 * cœur bat « boum-boum » et la colore à chaque coup. Quand Tamilya parle, la goutte suit
 * sa voix syllabe par syllabe (voice-level.ts) : elle gonfle et s'étire comme
 * une bouche, les gouttelettes s'écartent. Quand la personne parle, elle
 * frémit (elle écoute) ; `busy` : elle réfléchit, plus vive et resserrée.
 * Au clic : écrasement, rebond et ondes, puis l'action (onActivate).
 */
export function AwaBlob({
  label,
  onActivate,
  className = "",
  size,
  goo = 7,
  busy = false,
  immediate = false,
  still = false,
}: {
  label: string;
  onActivate: () => void;
  className?: string;
  /** Largeur CSS (par défaut, celle de l'accueil). */
  size?: string;
  /** Flou du filtre « goo », en px : à augmenter avec la taille. */
  goo?: number;
  busy?: boolean;
  /** Ouvre l'action sans attendre la fin de l'animation du clic (mode vocal). */
  immediate?: boolean;
  /** Figée : la goutte garde sa forme et ne bouge plus (réponses finies de la conversation). */
  still?: boolean;
}) {
  const filterId = `awa-goo-${useId().replace(/:/g, "")}`;
  const [popping, setPopping] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLButtonElement>(null);
  const glow = useRef<HTMLSpanElement>(null);
  const beat = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const shine = useRef<HTMLSpanElement>(null);
  const drops = useRef<(HTMLSpanElement | null)[]>([]);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (still || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.current?.setAttribute("data-live", "");
    const noise = makeNoise();
    let frame = 0;
    let last = performance.now();
    let t = rand(0, 300);
    let rotation = rand(0, 360);
    let voice = 0;
    // Cœur : premier battement peu après l'arrivée.
    let nextBeat = last + rand(600, 1000);
    let beats: { at: number; strength: number }[] = [];
    // Couleurs du battement : tournent doucement et sautent à chaque coup, jamais à la même place.
    let colorTurn = rand(0, 360);
    // Sursaut de temps en temps : la goutte se tend dans une direction.
    let nextJolt = last + rand(2500, 6000);
    let jolt = { at: -1e9, x: 0, y: 0 };
    const dropState = [0, 1, 2].map(() => ({ angle: rand(0, 360), speed: rand(25, 70) * (Math.random() < 0.5 ? -1 : 1), seed: rand(0, 1000) }));
    // Dernière intensité des couleurs posée : on ne réécrit que si elle change (moins de calcul de style).
    let lastRainbow = "";

    // Images par seconde : 30 quand elle bouge vraiment (cœur, voix, sursaut,
    // réflexion), 20 au repos où tout glisse lentement. Assez pour l'œil, bien moins de calcul.
    let lively = true;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      // Petite marge : sur un écran à 60 Hz, l'image tombe sur la 2e (ou 3e) image de l'écran.
      if (now - last < (lively ? 1000 / FPS_ACTIVE : 1000 / FPS_IDLE) - 4) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const mood = getVoiceMood();
      const thinking = busyRef.current;
      const speed = mood === "speaking" ? 1.9 : thinking ? 2.4 : mood === "listening" ? 1.4 : 1;
      t += dt * speed;

      // Voix : montée immédiate, retombée douce.
      const target = voiceLevel();
      voice += (target - voice) * (target > voice ? 0.55 : 0.18);

      // Cœur : « boum-boum » (un coup fort, un plus léger), à un rythme régulier.
      if (now >= nextBeat) {
        const strength = rand(0.85, 1);
        beats.push({ at: now, strength });
        colorTurn += rand(70, 150);
        beats.push({ at: now + rand(230, 270), strength: strength * rand(0.6, 0.75) });
        nextBeat = now + (thinking ? rand(650, 750) : rand(1050, 1250));
      }
      beats = beats.filter((b) => now - b.at < 700);
      const heart = beats.reduce((max, b) => {
        const d = now - b.at;
        if (d < 0) return max;
        return Math.max(max, b.strength * (d < 90 ? d / 90 : Math.exp(-(d - 90) / 180)));
      }, 0);

      if (now >= nextJolt) {
        const a = rand(0, Math.PI * 2);
        jolt = { at: now, x: Math.cos(a), y: Math.sin(a) };
        nextJolt = now + rand(2500, 7000);
      }
      const jd = (now - jolt.at) / 1000;
      const joltAmount = jd < 1.2 ? Math.sin(Math.min(1, jd / 0.18) * Math.PI * 0.5) * Math.exp(-jd * 3.2) : 0;

      // Dérive et rotation : vitesses qui changent sans cesse.
      const tx = noise(t * 0.22 + 11) * 5 + jolt.x * joltAmount * 6;
      const ty = noise(t * 0.19 + 47) * 5 + jolt.y * joltAmount * 6;
      rotation += noise(t * 0.12 + 300) * 55 * dt * speed;
      const tilt = noise(t * 0.3 + 700) * 8;

      // Taille : cœur, voix (comme une bouche qui s'ouvre), sursaut qui étire.
      const grow = 1 + heart * 0.07 + voice * 0.2 + (thinking ? noise(t * 3) * 0.03 : 0);
      const sx = grow * (1 - voice * 0.06 + joltAmount * 0.08 * Math.abs(jolt.x));
      const sy = grow * (1 + voice * 0.12 + joltAmount * 0.08 * Math.abs(jolt.y));
      if (beat.current) beat.current.style.transform = `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) rotate(${tilt.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;

      // Les couleurs s'allument avec chaque coup du cœur, puis s'effacent.
      colorTurn += 120 * dt * speed;
      const rainbow = clamp(heart * 1.2, 0, 1).toFixed(3);
      if (rainbow !== lastRainbow) {
        root.current?.style.setProperty("--rainbow", rainbow);
        lastRainbow = rainbow;
      }
      // Couleurs éteintes entre deux battements : leur rotation ne se voit pas, inutile de la poser.
      if (rainbow !== "0.000") root.current?.style.setProperty("--rainbow-turn", `${(colorTurn % 360).toFixed(1)}deg`);

      // Forme : huit rayons qui bougent chacun à leur rythme, plus fort quand elle parle.
      if (body.current) {
        const wobble = 14 + voice * 10 + (thinking ? 4 : 0);
        const r = Array.from({ length: 8 }, (_, i) => clamp(50 + noise(t * (0.35 + i * 0.04) + i * 37.3) * wobble, 28, 72).toFixed(1));
        body.current.style.borderRadius = `${r[0]}% ${r[1]}% ${r[2]}% ${r[3]}% / ${r[4]}% ${r[5]}% ${r[6]}% ${r[7]}%`;
        body.current.style.transform = `rotate(${rotation.toFixed(2)}deg)`;
      }

      // Gouttelettes : chacune tourne à sa vitesse (qui change), s'éloigne, revient se fondre.
      dropState.forEach((d, i) => {
        const el = drops.current[i];
        if (!el) return;
        d.angle += (d.speed + noise(t * 0.4 + d.seed) * 60) * dt * speed;
        const distance = clamp(55 + noise(t * 0.33 + d.seed + 50) * 75 + voice * 45 + (thinking ? -25 : 0), 0, 150);
        const s = clamp(0.75 + noise(t * 0.5 + d.seed + 90) * 0.3 + voice * 0.15, 0.4, 1.2);
        el.style.transform = `rotate(${d.angle.toFixed(1)}deg) translateX(${distance.toFixed(1)}%) scale(${s.toFixed(3)})`;
      });

      if (glow.current) {
        glow.current.style.opacity = clamp(0.5 + heart * 0.35 + voice * 0.5, 0, 1).toFixed(3);
        glow.current.style.transform = `scale(${(0.95 + heart * 0.12 + voice * 0.3).toFixed(3)})`;
      }
      if (shine.current) shine.current.style.transform = `translate(${(noise(t * 0.25 + 900) * 8).toFixed(2)}%, ${(noise(t * 0.25 + 950) * 6).toFixed(2)}%)`;

      // Prochain battement tout proche : on repasse à 30 images juste avant, pour ne pas le rater.
      lively = thinking || mood !== "idle" || voice > 0.01 || heart > 0.01 || joltAmount > 0.01 || nextBeat - now < 120 || beats.length > 0;
    };
    // L'animation tourne seulement si le globe est à l'écran (page pas défilée plus bas) et l'onglet visible.
    let onScreen = !root.current;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!onScreen || document.visibilityState === "hidden") return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    if (root.current) observer.observe(root.current);
    else sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      cancelAnimationFrame(frame);
    };
  }, [still]);

  return (
    <button
      ref={root}
      type="button"
      aria-label={label}
      title={label}
      data-popping={popping || undefined}
      data-still={still || undefined}
      onClick={() => {
        if (popping) return;
        if (root.current) launch = { rect: root.current.getBoundingClientRect(), at: performance.now() };
        // Animations réduites : on ouvre tout de suite.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onActivate();
        setPopping(true);
        if (immediate) onActivate();
        timer.current = window.setTimeout(() => {
          setPopping(false);
          if (!immediate) onActivate();
        }, POP_MS);
      }}
      className={`awa-blob ${className}`}
      style={size ? ({ width: size } as CSSProperties) : undefined}
    >
      <svg aria-hidden="true" className="absolute size-0">
        <filter id={filterId}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={goo} result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
        </filter>
      </svg>
      <span ref={glow} aria-hidden="true" className="awa-blob__glow" />
      <span ref={beat} aria-hidden="true" className="awa-blob__beat">
        <span className="awa-blob__goo" style={{ filter: `url(#${filterId})` }}>
          <span ref={body} className="awa-blob__body" />
          {[1, 2, 3].map((n, i) => (
            <span
              key={n}
              ref={(el) => {
                drops.current[i] = el;
              }}
              className={`awa-blob__drop awa-blob__drop--${n}`}
            />
          ))}
        </span>
        <span ref={shine} className="awa-blob__shine" />
      </span>
      {/* Ondes du clic */}
      <span aria-hidden="true" className="awa-blob__ripple" />
      <span aria-hidden="true" className="awa-blob__ripple awa-blob__ripple--late" />
    </button>
  );
}
