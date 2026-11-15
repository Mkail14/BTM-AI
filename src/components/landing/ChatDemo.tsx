"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DEMO_SCRIPT } from "@/lib/site/landing-demo-script";
import { PHONE, PREVIEW_PATH } from "./phone";

/**
 * Accueil, section Tamilya : un iPhone 17 qui montre la page de conversation.
 * L'écran n'est pas une copie : c'est une vraie page du site (/apercu/conversation,
 * ConversationPreview), faite avec les pièces de la conversation et affichée à la
 * largeur d'un téléphone. Quand la conversation change, le téléphone change avec.
 * Ici, on ne dessine que le téléphone : son bord, la barre d'iOS et le trait du bas.
 */
export function ChatDemo() {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [near, setNear] = useState(false);

  // Le téléphone est dessiné à sa vraie taille, puis réduit à la place disponible.
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / (PHONE.width + 2 * PHONE.bezel));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // La page de l'écran n'est chargée qu'à l'approche du téléphone : la conversation démarre quand on arrive dessus.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // .phone-demo mesure la place disponible ; le téléphone y entre en entier, sans se déformer.
    <div className="phone-demo mx-auto aspect-[422/894] w-full max-w-[20rem] md:aspect-auto md:h-full md:max-w-none">
      <div ref={frame} className="phone-demo__frame" style={scale ? ({ "--phone-scale": scale } as CSSProperties) : undefined}>
        <div className="phone-demo__body text-fg">
          <span aria-hidden="true" className="phone-demo__button top-[168px] -left-[3px] h-[30px]" />
          <span aria-hidden="true" className="phone-demo__button top-[226px] -left-[3px] h-[58px]" />
          <span aria-hidden="true" className="phone-demo__button top-[298px] -left-[3px] h-[58px]" />
          <span aria-hidden="true" className="phone-demo__button top-[262px] -right-[3px] h-[92px]" />

          <div className="phone-demo__screen">
            {/* Pour les lecteurs d'écran : la conversation d'exemple, en français. L'écran lui-même se regarde. */}
            <ul className="sr-only" aria-label="Exemple de conversation avec Tamilya">
              {DEMO_SCRIPT.map((line) => (
                <li key={line.fr}>
                  {line.from === "user" ? "Visiteur" : "Tamilya"} : {line.fr}
                </li>
              ))}
            </ul>
            {near ? <iframe src={PREVIEW_PATH} title="Exemple de conversation avec Tamilya" aria-hidden="true" tabIndex={-1} className="phone-demo__page" /> : null}

            {/* Barre d'iOS : heure à gauche, îlot au milieu, réseau, wifi et batterie à droite. */}
            <div aria-hidden="true" className="phone-demo__status">
              <span className="phone-demo__time">9:41</span>
              <span className="phone-demo__island" />
              <span className="flex items-center gap-[6px]">
                <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
                  <rect x="0" y="8" width="3" height="4" rx="0.9" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="0.9" />
                  <rect x="10" y="2.8" width="3" height="9.2" rx="0.9" />
                  <rect x="15" y="0" width="3" height="12" rx="0.9" />
                </svg>
                <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1.3 4.4a10.2 10.2 0 0 1 14.4 0" />
                  <path d="M3.9 7.1a6.5 6.5 0 0 1 9.2 0" />
                  <path d="M8.5 11.7 6.2 9.4a3.25 3.25 0 0 1 4.6 0Z" fill="currentColor" stroke="none" />
                </svg>
                <svg width="27" height="13" viewBox="0 0 27 13" fill="currentColor">
                  <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" strokeOpacity="0.4" />
                  <rect x="2" y="2" width="20" height="9" rx="2.4" />
                  <path d="M25 4.5v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2Z" fillOpacity="0.45" />
                </svg>
              </span>
            </div>
            <span aria-hidden="true" className="phone-demo__home" />
          </div>
        </div>
      </div>
    </div>
  );
}
