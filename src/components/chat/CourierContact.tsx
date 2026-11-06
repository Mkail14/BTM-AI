"use client";

import { useEffect, useRef, useState } from "react";
import type { Courier } from "@/lib/food/courier";
import type { PlacedOrder } from "./OrderTracker";

const PERSONA = "var(--persona,var(--accent))";
/** Messages échangés avec le livreur, gardés sur l'appareil : « btm-food-chat:<code> ». */
const CHAT_KEY = "btm-food-chat:";
/** Heure du moment, lue seulement dans les gestionnaires d'événements. */
const stamp = () => Date.now();
const QUICK = ["Vous êtes où ?", "Je descends", "Sonnez au portail", "Merci !"];

type Message = { from: "me" | "courier"; text: string; at: number };

/** « 0639981234 » → « 06 39 98 12 34 ». */
export const formatPhone = (phone: string) => phone.replace(/(\d{2})(?=\d)/g, "$1 ");
/** Lien d'appel international (+262 : Mayotte). */
export const telLink = (phone: string) => `tel:+262${phone.replace(/^0/, "")}`;

/**
 * Réponse du livreur de la démonstration, selon l'étape et le message. Avec
 * un vrai partenaire, la messagerie passera par son application de livreurs.
 */
function demoReply(text: string, phase: number, minutesLeft: number, commune: string): string {
  const t = text.toLowerCase();
  if (/merci/.test(t)) return "Avec plaisir, bon appétit !";
  if (phase === 2) return "Je suis devant chez toi. Prépare ton code, je te le demande en arrivant.";
  if (/o[uù]|quand|combien|temps/.test(t)) {
    return phase === 0
      ? "Je suis au restaurant, ta commande est en cuisine. Je pars dès qu'elle est prête."
      : `Je suis en route vers ${commune}, j'arrive dans ${minutesLeft} min environ.`;
  }
  if (/portail|sonne|digicode|porte|étage|etage/.test(t)) return "C'est noté, merci pour l'info.";
  if (/descend|sors|j'arrive/.test(t)) return phase === 1 ? "Pas encore, je te préviens quand je suis là !" : "Super, à tout de suite !";
  return "Bien reçu !";
}

/** Nombre de messages échangés avec le livreur (pastille du bouton « Message »). */
export function useCourierMessageCount(code: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () => {
      try {
        setCount((JSON.parse(localStorage.getItem(CHAT_KEY + code) ?? "[]") as Message[]).length);
      } catch {
        setCount(0);
      }
    };
    read();
    window.addEventListener(CHAT_KEY, read);
    return () => window.removeEventListener(CHAT_KEY, read);
  }, [code]);
  return count;
}

/** Discussion avec le livreur : messages, réponses rapides et champ de saisie (remplit son volet). */
export function CourierChat({ order, courier, phase, arrives }: { order: PlacedOrder; courier: Courier; phase: number; arrives: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const key = CHAT_KEY + order.code;

  useEffect(() => {
    try {
      // Discussion reprise après un rechargement.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(JSON.parse(localStorage.getItem(key) ?? "[]") as Message[]);
    } catch {
      setMessages([]);
    }
  }, [key]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const save = (next: Message[]) => {
    setMessages(next);
    localStorage.setItem(key, JSON.stringify(next.slice(-40)));
    window.dispatchEvent(new Event(CHAT_KEY));
  };

  function send(text: string) {
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const mine = [...messages, { from: "me" as const, text: clean, at: stamp() }];
    save(mine);
    setDraft("");
    if (!order.demo) return;
    setTyping(true);
    const minutesLeft = Math.max(1, Math.ceil((arrives - stamp()) / 60_000));
    window.setTimeout(() => {
      setTyping(false);
      save([...mine, { from: "courier", text: demoReply(clean, phase, minutesLeft, order.commune), at: stamp() }]);
    }, 1200);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={list} className="min-h-40 flex-1 space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl bg-bg-subtle p-3" aria-live="polite">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-fg-muted">Écris à {courier.name} : une précision, un repère, une question…</p>
        ) : null}
        {messages.map((m) => (
          <p
            key={m.at + m.from}
            className={`w-fit max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${m.from === "me" ? "ml-auto text-white" : "bg-bg"}`}
            style={m.from === "me" ? { background: PERSONA } : undefined}
          >
            {m.text}
          </p>
        ))}
        {typing ? <p className="w-fit rounded-2xl bg-bg px-3 py-1.5 text-sm text-fg-muted">{courier.name} écrit…</p> : null}
      </div>
      <div className="mt-2 flex shrink-0 gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs whitespace-nowrap hover:bg-bg-muted"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex shrink-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          aria-label={`Message pour ${courier.name}`}
          placeholder={`Message à ${courier.name}…`}
          className="min-w-0 flex-1 rounded-full border border-border bg-bg px-3.5 py-2 text-sm outline-none focus:border-[var(--persona,var(--accent))]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="shrink-0 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: PERSONA }}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
