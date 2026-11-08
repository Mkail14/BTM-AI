"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { IconCheck, IconClose, IconMail, IconSend } from "@/components/ui/icons";
import { FAQ, HELP_TOPICS, type HelpTopic } from "@/lib/help/faq";
import { EDGE, safeArea } from "./help-geometry";

type Tab = "faq" | "chat" | "email";
type Turn = { role: "user" | "assistant"; content: string };

/** `onClose` : croix, Échap, fond ; `onLeave` : lien suivi vers une autre page (garde l'historique de la navigation). */
export function HelpPanel({
  side,
  anchorY,
  size,
  onClose,
  onLeave,
}: {
  side: "left" | "right";
  anchorY: number;
  size: number;
  onClose: () => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState<Tab>("faq");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  // Ordinateur : à côté du rond, à sa hauteur autant que possible. Téléphone : panneau qui monte du bas.
  const safe = safeArea();
  const height = Math.min(600, window.innerHeight - 2 * EDGE - safe.top - safe.bottom);
  const top = Math.min(Math.max(anchorY + size - height, EDGE + safe.top), window.innerHeight - height - EDGE - safe.bottom);
  const offset = EDGE + size + 12;

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label="Aide"
      style={{ ["--help-top" as string]: `${top}px`, ["--help-height" as string]: `${height}px`, ["--help-offset" as string]: `${offset}px` }}
      className={`help-panel fixed z-[59] flex flex-col overflow-hidden border border-border bg-bg text-fg shadow-2xl outline-none max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[85dvh] max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)] sm:top-[var(--help-top)] sm:h-[var(--help-height)] sm:w-[22rem] sm:rounded-2xl ${
        side === "left" ? "sm:left-[var(--help-offset)]" : "sm:right-[var(--help-offset)]"
      }`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="font-semibold">Besoin d&apos;aide ?</p>
          <p className="text-xs text-fg-muted">On est là pour toi.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer l'aide" className="zone-appui relative grid size-9 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg">
          <IconClose width={18} height={18} />
        </button>
      </header>

      <div role="tablist" aria-label="Rubriques d'aide" className="grid grid-cols-3 gap-1 border-b border-border p-1.5 text-sm">
        {(
          [
            ["faq", "Questions"],
            ["chat", "Assistant"],
            ["email", "Écrire"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-lg py-2.5 font-medium transition-colors ${tab === id ? "bg-bg-muted text-fg" : "text-fg-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "faq" ? <FaqTab onClose={onLeave} onAsk={() => setTab("chat")} /> : null}
        {tab === "chat" ? <ChatTab onWrite={() => setTab("email")} /> : null}
        {tab === "email" ? <EmailTab /> : null}
      </div>
    </div>
  );
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

function FaqTab({ onClose, onAsk }: { onClose: () => void; onAsk: () => void }) {
  const [query, setQuery] = useState("");
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const topics = FAQ.map((topic) => ({
    ...topic,
    questions: topic.questions.filter((item) => words.every((w) => normalize(`${item.q} ${item.a}`).includes(w))),
  })).filter((topic) => topic.questions.length > 0);

  return (
    <div className="h-full overflow-y-auto overscroll-contain p-3">
      <label htmlFor="help-search" className="sr-only">
        Chercher dans les questions
      </label>
      <input
        id="help-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher (quota, code, compte…)"
        className="w-full rounded-xl border border-border bg-bg-subtle px-3.5 py-2 text-base outline-none focus:border-accent sm:text-sm"
      />
      {topics.map((topic) => (
        <section key={topic.title} className="mt-4">
          <h3 className="px-1 text-[11px] font-medium tracking-wide text-fg-muted uppercase">{topic.title}</h3>
          <div className="mt-1.5 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {topic.questions.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium hover:bg-bg-muted [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="text-fg-muted transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="px-3.5 pb-3 text-sm leading-relaxed text-fg-muted">
                  {item.a}
                  {item.link ? (
                    <Link href={item.link.href} onClick={onClose} className="mt-1.5 block font-medium text-accent hover:underline">
                      {item.link.label} →
                    </Link>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
      <div className="mt-5 rounded-xl bg-bg-subtle p-3.5 text-sm">
        {topics.length === 0 ? <p className="font-medium">Aucune question ne correspond.</p> : <p className="font-medium">Pas trouvé ta réponse ?</p>}
        <button type="button" onClick={onAsk} className="mt-1 font-medium text-accent hover:underline">
          Demande à l&apos;assistant d&apos;aide →
        </button>
      </div>
    </div>
  );
}

/** Longueur maximale de chaque tour envoyé à l'assistant d'aide. */
const TURN_MAX = 1500;

function ChatTab({ onWrite }: { onWrite: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const question = text.trim();
    if (!question || pending) return;
    const before = turns;
    const next = [...turns, { role: "user" as const, content: question.slice(0, TURN_MAX) }].slice(-12);
    setTurns(next);
    setText("");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/aide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Chaque tour est raccourci : une longue réponse de l'assistant ne doit pas faire refuser la question suivante.
        body: JSON.stringify({ kind: "chat", messages: next.map((t) => ({ ...t, content: t.content.slice(0, TURN_MAX) })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "L'assistant n'a pas pu répondre.");
      setTurns([...next, { role: "assistant", content: data.answer }]);
    } catch (err) {
      // La question restée sans réponse quitte l'historique (sinon elle repartirait en double) et revient dans le champ.
      setTurns(before);
      setText((current) => current || question);
      setError(err instanceof Error ? err.message : "L'assistant n'a pas pu répondre.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={list} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3 text-sm" aria-live="polite">
        <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-bg-muted px-3.5 py-2 leading-relaxed">
          Bonjour ! Je suis l&apos;assistant d&apos;aide de BTM AI. Pose-moi ta question sur le site : compte, quotas, code de la route, portefeuille…
        </p>
        {turns.map((turn, i) => (
          <p
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed whitespace-pre-wrap ${
              turn.role === "user" ? "ml-auto rounded-br-md bg-[var(--persona-soft,var(--accent-soft))]" : "rounded-bl-md bg-bg-muted"
            }`}
          >
            {turn.content}
          </p>
        ))}
        {pending ? (
          <p className="w-fit rounded-2xl rounded-bl-md bg-bg-muted px-3.5 py-2 text-fg-muted" aria-label="L'assistant écrit">
            …
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-danger">
            {error}{" "}
            <button type="button" onClick={onWrite} className="font-medium underline underline-offset-2">
              Écrire à l&apos;équipe
            </button>
          </div>
        ) : null}
      </div>
      <form onSubmit={ask} className="flex items-center gap-2 border-t border-border p-2.5">
        <label htmlFor="help-question" className="sr-only">
          Ta question
        </label>
        <input
          id="help-question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={TURN_MAX}
          autoComplete="off"
          placeholder="Ta question…"
          className="min-w-0 flex-1 rounded-full border border-border bg-bg-subtle px-4 py-2 text-base outline-none focus:border-accent sm:text-sm"
        />
        <button type="submit" disabled={!text.trim() || pending} aria-label="Envoyer la question" className="btn-rose btn-rose--icon size-9 shrink-0">
          <IconSend width={16} height={16} />
        </button>
      </form>
    </div>
  );
}

const MESSAGE_MAX = 3000;

/**
 * Message à l'équipe : à qui on écrit, le sujet en pastilles, l'adresse de
 * réponse (déjà remplie si on est connecté) et le message. Après l'envoi, un
 * écran de confirmation remplace le formulaire.
 */
function EmailTab() {
  const { user } = useAuth();
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/aide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "email", topic: topic ?? undefined, email, message, page: window.location.pathname }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean; error?: string };
      if (!res.ok || !data.sent) throw new Error(data.error ?? "L'envoi a échoué. Réessaie.");
      setSentTo(email.trim());
      setMessage("");
      setTopic(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi a échoué. Réessaie.");
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <IconCheck width={26} height={26} />
        </span>
        <p className="text-base font-semibold">Message envoyé</p>
        <p className="max-w-[16rem] text-sm leading-relaxed text-fg-muted">
          L&apos;équipe de GROUPE BTM te répond à <strong className="break-all text-fg">{sentTo}</strong>.
        </p>
        <button type="button" onClick={() => setSentTo(null)} className="mt-2 text-sm font-medium text-accent hover:underline">
          Écrire un autre message
        </button>
      </div>
    );
  }

  const field =
    "w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none transition focus:border-[var(--persona,var(--accent))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--persona,var(--accent))_12%,transparent)] sm:text-sm";

  return (
    // Page fixe, sans défilement : seule la zone du message s'agrandit ou rétrécit pour remplir le panneau.
    <form onSubmit={send} className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
        {/* À qui on écrit */}
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--persona-soft,var(--accent-soft))] text-[var(--persona,var(--accent))]">
            <IconMail width={20} height={20} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">L&apos;équipe de GROUPE BTM</p>
            <p className="text-fg-muted">Une vraie personne te répond.</p>
          </div>
        </div>

        <fieldset>
          <legend className="text-xs font-medium tracking-wide text-fg-muted uppercase">Sujet</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {HELP_TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={topic === t}
                onClick={() => setTopic(topic === t ? null : t)}
                className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                  topic === t
                    ? "border-[var(--persona,var(--accent))] bg-[var(--persona-soft,var(--accent-soft))] font-medium text-fg"
                    : "border-border text-fg-muted hover:border-fg/25 hover:text-fg"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="help-email" className="text-xs font-medium tracking-wide text-fg-muted uppercase">
            Ton e-mail
          </label>
          <input
            id="help-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="toi@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1.5 ${field}`}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between">
            <label htmlFor="help-message" className="text-xs font-medium tracking-wide text-fg-muted uppercase">
              Ton message
            </label>
            <span aria-hidden="true" className="text-[11px] text-fg-muted tabular-nums">
              {message.length} / {MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id="help-message"
            required
            minLength={5}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Explique ce qui se passe, et sur quelle page…"
            className={`mt-1.5 min-h-16 flex-1 resize-none leading-relaxed ${field}`}
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {/* Bas du panneau : bouton toujours visible, et l'adresse directe pour qui préfère sa messagerie. */}
      <div className="shrink-0 space-y-1.5 border-t border-border p-3">
        <button
          type="submit"
          disabled={pending || !email.trim() || message.trim().length < 5}
          className="btn-rose w-full gap-2 rounded-xl py-2.5 text-sm font-semibold"
        >
          {pending ? "Envoi…" : "Envoyer à l'équipe"}
          {pending ? null : <IconSend width={15} height={15} />}
        </button>
        <p className="text-center text-xs text-fg-muted">
          ou directement à{" "}
          <a href="mailto:contact@btm.yt" className="font-medium text-fg underline-offset-2 hover:underline">
            contact@btm.yt
          </a>
        </p>
      </div>
    </form>
  );
}
