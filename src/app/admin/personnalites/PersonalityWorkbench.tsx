"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { Markdown } from "@/components/chat/Markdown";
import { IconClose, IconPlus, IconSend, IconTrash } from "@/components/ui/icons";
import {
  BEHAVIOR_LIMITS,
  personalityCard,
  type Lesson,
  type PersonalityBehavior,
  type PersonalityId,
} from "@/lib/ai/personalities";
import { savePersonalityAction, testPersonalityAction, type ActionResult } from "./actions";

const TEST_SUGGESTIONS = [
  "Salut ! Ça va ?",
  "J'ai raté mon permis aujourd'hui…",
  "Comment je fais pour refaire ma carte d'identité ?",
  "T'es nulle comme IA.",
];

const sameBehavior = (a: PersonalityBehavior, b: PersonalityBehavior) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Le caractère tient en un seul texte : l'ancienne « façon de parler », si
 * elle existe, y est rattachée (et vidée) pour n'avoir qu'un champ à écrire.
 */
function simplify(behavior: PersonalityBehavior): PersonalityBehavior {
  if (!behavior.speech.trim()) return behavior;
  return { ...behavior, attitude: [behavior.attitude.trim(), behavior.speech.trim()].filter(Boolean).join("\n\n"), speech: "" };
}

const inputClass =
  "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/** Liste éditable : une ligne par élément (réglages avancés). */
function ListField({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="block text-sm font-medium">{label}</legend>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <label htmlFor={`${id}-${index}`} className="sr-only">
              {label} {index + 1}
            </label>
            <input
              id={`${id}-${index}`}
              value={item}
              maxLength={BEHAVIOR_LIMITS.listItem}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={`Retirer : ${item || "ligne vide"}`}
              className="shrink-0 rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              <IconClose width={16} height={16} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={items.length >= BEHAVIOR_LIMITS.listItems}
        onClick={() => onChange([...items, ""])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
      >
        <IconPlus width={16} height={16} /> Ajouter
      </button>
    </fieldset>
  );
}

/** Une leçon affichée comme un bout de conversation, modifiable sur place. */
function LessonItem({
  lesson,
  emoji,
  onChange,
  onRemove,
}: {
  lesson: Lesson;
  emoji: string;
  onChange: (lesson: Lesson) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(!lesson.user || !lesson.reply);
  const id = useId();

  if (editing) {
    return (
      <li className="space-y-2 rounded-xl border border-accent/40 bg-bg-subtle p-3">
        <label htmlFor={`${id}-user`} className="block text-xs font-medium text-fg-muted">
          Quand on lui dit…
        </label>
        <input
          id={`${id}-user`}
          value={lesson.user}
          maxLength={BEHAVIOR_LIMITS.lessonUser}
          placeholder="Ex. : T'es nulle comme IA."
          onChange={(e) => onChange({ ...lesson, user: e.target.value })}
          className={inputClass}
        />
        <label htmlFor={`${id}-reply`} className="block text-xs font-medium text-fg-muted">
          …elle répond exactement :
        </label>
        <textarea
          id={`${id}-reply`}
          rows={3}
          value={lesson.reply}
          maxLength={BEHAVIOR_LIMITS.lessonReply}
          placeholder="Ex. : Nulle ? Moi ? Dit celui qui me demande l'heure alors qu'il a un téléphone dans la main…"
          onChange={(e) => onChange({ ...lesson, reply: e.target.value })}
          className={inputClass}
        />
        <div className="flex justify-between gap-2">
          <button type="button" onClick={onRemove} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft">
            Supprimer
          </button>
          <button
            type="button"
            disabled={!lesson.user.trim() || !lesson.reply.trim()}
            onClick={() => setEditing(false)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group relative space-y-1.5 rounded-xl border border-border p-3">
      <p className="ml-auto w-fit max-w-[85%] break-words rounded-2xl rounded-br-md bg-bg-muted px-3 py-1.5 text-sm">{lesson.user}</p>
      <p className="w-fit max-w-[85%] break-words rounded-2xl rounded-bl-md bg-accent-soft px-3 py-1.5 text-sm whitespace-pre-wrap">
        <span aria-hidden="true">{emoji} </span>
        {lesson.reply}
      </p>
      <div className="absolute top-2 left-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg bg-bg px-2 py-1 text-xs font-medium shadow-sm ring-1 ring-border hover:bg-bg-muted"
        >
          Modifier
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Supprimer la leçon : ${lesson.user}`}
          className="rounded-lg bg-bg p-1 text-fg-muted shadow-sm ring-1 ring-border hover:text-danger"
        >
          <IconTrash width={14} height={14} />
        </button>
      </div>
    </li>
  );
}

type TestTurn = { question: string; result: ActionResult };
type PanelId = "character" | "lessons" | "teach" | "advanced";

const PANEL_TITLES: Record<PanelId, string> = {
  character: "Son caractère",
  lessons: "Ses leçons",
  teach: "Lui apprendre",
  advanced: "Plus de réglages",
};

/** Bloc de la page : un titre, une ligne de résumé ; le clic ouvre son panneau. */
function Tile({
  icon,
  title,
  summary,
  onOpen,
}: {
  icon: string;
  title: string;
  summary: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-bg px-6 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99]"
    >
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-3xl">
        {icon}
      </span>
      <span className="w-full min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block truncate text-sm text-fg-muted">{summary}</span>
      </span>
    </button>
  );
}

/** Panneau ouvert par un bloc : à droite sur ordinateur, plein écran sur téléphone, page floutée derrière. */
function Panel({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-bg shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
        <div className="border-t border-border px-5 py-3">{footer}</div>
      </div>
    </>
  );
}

export function PersonalityWorkbench({
  id,
  saved,
  defaults,
  customized,
}: {
  id: PersonalityId;
  /** Version enregistrée (ou réglages d'origine si jamais personnalisée). */
  saved: PersonalityBehavior;
  defaults: PersonalityBehavior;
  customized: boolean;
}) {
  const router = useRouter();
  const base = simplify(saved);
  const [draft, setDraft] = useState(base);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [panel, setPanel] = useState<PanelId | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);

  const [testMessage, setTestMessage] = useState("");
  const [asked, setAsked] = useState("");
  const [turn, setTurn] = useState<TestTurn | null>(null);
  const [correction, setCorrection] = useState<string | null>(null);
  const [learned, setLearned] = useState(false);
  const [testing, startTesting] = useTransition();

  const dirty = !sameBehavior(draft, base);
  const isDefault = sameBehavior(draft, simplify(defaults));
  const card = personalityCard(id, draft);
  const lessonsFull = draft.lessons.length >= BEHAVIOR_LIMITS.lessons;

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = <K extends keyof PersonalityBehavior>(key: K, value: PersonalityBehavior[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };

  const setLessons = (update: (lessons: Lesson[]) => Lesson[]) => set("lessons", update(draft.lessons));

  function save(behavior: PersonalityBehavior | null) {
    startSaving(async () => {
      const result = await savePersonalityAction(id, behavior);
      setStatus(result);
      if (result.ok) {
        if (behavior === null) setDraft(simplify(defaults));
        router.refresh();
      }
    });
  }

  function runTest(message: string) {
    const question = message.trim();
    if (!question) return;
    setTestMessage("");
    setAsked(question);
    setCorrection(null);
    setLearned(false);
    startTesting(async () => {
      const result = await testPersonalityAction(id, draft, question);
      setTurn({ question, result });
    });
  }

  /** Transforme la réponse (telle quelle ou corrigée) en leçon. */
  function learn(reply: string) {
    if (!turn || !reply.trim() || lessonsFull) return;
    setLessons((lessons) => [...lessons, { user: turn.question, reply: reply.trim() }]);
    setCorrection(null);
    setLearned(true);
  }

  const statusText = status
    ? status.message
    : dirty
      ? "Modifications non enregistrées."
      : customized
        ? "Version personnalisée en ligne."
        : "Réglages d'origine en ligne.";

  const saveButton = (
    <button
      type="button"
      onClick={() => save(draft)}
      disabled={!dirty || saving}
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
    >
      {saving ? "Enregistrement…" : "Enregistrer"}
    </button>
  );

  const panelFooter = (
    <div className="flex items-center gap-3">
      <p role="status" className={`min-w-0 flex-1 truncate text-sm ${status && !status.ok ? "text-danger" : "text-fg-muted"}`}>
        {statusText}
      </p>
      {saveButton}
    </div>
  );

  const attitudeSummary = draft.attitude.trim().replace(/\s+/g, " ") || "Pas encore décrit";

  return (
    <>
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
        <Tile icon="🧠" title="Son caractère" summary={attitudeSummary} onOpen={() => setPanel("character")} />
        <Tile
          icon="📚"
          title={`Ses leçons (${draft.lessons.length})`}
          summary={draft.lessons.length ? `Dernière : « ${draft.lessons.at(-1)!.user} »` : "Aucune leçon pour l'instant"}
          onOpen={() => setPanel("lessons")}
        />
        <Tile icon="💬" title="Lui apprendre" summary="Discute avec elle, garde ou corrige ses réponses" onOpen={() => setPanel("teach")} />
        <Tile icon="⚙️" title="Plus de réglages" summary="Règles, phrases types, présentation" onOpen={() => setPanel("advanced")} />
      </div>

      {/* Discret quand tout est en ligne ; le message de résultat reste lisible. */}
      <div className="mt-4 flex flex-col items-center gap-2 text-center text-sm empty:hidden">
        {status && !dirty ? (
          <p role="status" className={status.ok ? "text-success" : "text-danger"}>
            {status.ok ? "✓ " : ""}
            {status.message}
          </p>
        ) : null}
        {!dirty && (customized || !isDefault) ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Revenir aux réglages d'origine pour cette personnalité ? Ses leçons seront effacées.")) save(null);
            }}
            disabled={saving}
            className="text-fg-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-60"
          >
            Revenir aux réglages d&apos;origine
          </button>
        ) : null}
      </div>

      {/* Barre flottante, seulement quand il y a quelque chose à enregistrer */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg/95 py-2 pr-2 pl-5 shadow-2xl backdrop-blur">
            <p role="status" className={`text-sm ${status && !status.ok ? "text-danger" : "text-fg-muted"}`}>
              {status && !status.ok ? status.message : "Modifications non enregistrées"}
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft(base);
                setStatus(null);
              }}
              disabled={saving}
              className="rounded-full px-3 py-2 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => save(draft)}
              disabled={saving}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : null}

      {panel ? (
        <Panel title={`${card.emoji} ${PANEL_TITLES[panel]}`} onClose={closePanel} footer={panelFooter}>
          {panel === "character" ? (
            <>
              <label htmlFor="attitude" className="block text-sm text-fg-muted">
                Décris-la comme à un ami : qui elle est, son humeur, sa façon de parler, ses manies.
              </label>
              <textarea
                id="attitude"
                rows={14}
                autoFocus
                value={draft.attitude}
                maxLength={BEHAVIOR_LIMITS.attitude}
                placeholder="Ex. : Une grande sœur un peu moqueuse qui te charrie tout le temps, tutoie tout le monde, parle avec des expressions de Mayotte… mais qui t'aide toujours à la fin."
                onChange={(e) => set("attitude", e.target.value)}
                className={`mt-3 ${inputClass}`}
              />
            </>
          ) : null}

          {panel === "lessons" ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-fg-muted">Ce qu&apos;on lui dit → sa réponse idéale.</p>
                <button
                  type="button"
                  disabled={lessonsFull}
                  onClick={() => setLessons((lessons) => [...lessons, { user: "", reply: "" }])}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
                >
                  <IconPlus width={16} height={16} /> Ajouter
                </button>
              </div>
              {draft.lessons.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-fg-muted">
                  Aucune leçon. Ouvre « Lui apprendre » pour en créer en discutant, ou ajoute-en une à la main.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {draft.lessons.map((lesson, index) => (
                    <LessonItem
                      key={index}
                      lesson={lesson}
                      emoji={card.emoji}
                      onChange={(next) => setLessons((lessons) => lessons.map((l, i) => (i === index ? next : l)))}
                      onRemove={() => setLessons((lessons) => lessons.filter((_, i) => i !== index))}
                    />
                  ))}
                </ul>
              )}
            </>
          ) : null}

          {panel === "teach" ? (
            <div className="flex min-h-full flex-col">
              <div aria-live="polite" className="flex-1 space-y-3 text-sm">
                {testing ? (
                  <>
                    <p className="ml-auto w-fit max-w-[85%] break-words rounded-2xl rounded-br-md bg-bg-muted px-3 py-2">{asked}</p>
                    <p className="text-fg-muted">{card.emoji} Awa réfléchit…</p>
                  </>
                ) : turn ? (
                  <>
                    <p className="ml-auto w-fit max-w-[85%] break-words rounded-2xl rounded-br-md bg-bg-muted px-3 py-2">{turn.question}</p>
                    {turn.result.ok ? (
                      correction !== null ? (
                        <div className="space-y-2">
                          <label htmlFor="correction" className="block text-xs font-medium text-fg-muted">
                            Réécris sa réponse comme elle aurait dû la donner :
                          </label>
                          <textarea
                            id="correction"
                            rows={6}
                            autoFocus
                            value={correction}
                            maxLength={BEHAVIOR_LIMITS.lessonReply}
                            onChange={(e) => setCorrection(e.target.value)}
                            className={inputClass}
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCorrection(null)} className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-bg-muted">
                              Annuler
                            </button>
                            <button
                              type="button"
                              disabled={!correction.trim()}
                              onClick={() => learn(correction)}
                              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                            >
                              Lui apprendre cette réponse
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-fit max-w-[90%] break-words rounded-2xl rounded-bl-md border border-border px-3 py-2">
                            <Markdown text={turn.result.message} />
                          </div>
                          {learned ? (
                            <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-xs">
                              ✓ Leçon ajoutée. Pose-lui une autre question pour voir si elle a compris.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={lessonsFull}
                                onClick={() => learn(turn.result.message.slice(0, BEHAVIOR_LIMITS.lessonReply))}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-bg-muted disabled:opacity-50"
                              >
                                👍 C&apos;est elle
                              </button>
                              <button
                                type="button"
                                disabled={lessonsFull}
                                onClick={() => setCorrection(turn.result.message.slice(0, BEHAVIOR_LIMITS.lessonReply))}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-bg-muted disabled:opacity-50"
                              >
                                ✏️ Corriger
                              </button>
                              {lessonsFull ? <span className="text-xs text-fg-muted">{BEHAVIOR_LIMITS.lessons} leçons au plus.</span> : null}
                            </div>
                          )}
                        </>
                      )
                    ) : (
                      <p role="alert" className="text-danger">
                        {turn.result.message}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-fg-muted">Écris-lui comme un utilisateur. Garde ses bonnes réponses, corrige les autres.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEST_SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => runTest(s)}
                          className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-bg-muted"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runTest(testMessage);
                }}
                className="sticky bottom-0 mt-4 flex gap-2 bg-bg pt-3"
              >
                <label htmlFor="test-message" className="sr-only">
                  Message à envoyer à Awa
                </label>
                <input
                  id="test-message"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  maxLength={1000}
                  placeholder="Écris-lui…"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={testing || !testMessage.trim()}
                  aria-label="Envoyer"
                  className="shrink-0 rounded-xl bg-accent px-3 text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  <IconSend width={16} height={16} />
                </button>
              </form>
            </div>
          ) : null}

          {panel === "advanced" ? (
            <div className="space-y-6">
              <ListField label="Elle fait toujours" placeholder="Ex. : finir par une petite question" items={draft.always} onChange={(v) => set("always", v)} />
              <ListField label="Elle ne fait jamais" placeholder="Ex. : faire de longs pavés" items={draft.never} onChange={(v) => set("never", v)} />
              <ListField
                label="Phrases typiques (la première est montrée aux utilisateurs)"
                placeholder="Ex. : Encore toi ? Bon, vas-y…"
                items={draft.examples}
                onChange={(v) => set("examples", v)}
              />
              <div>
                <label htmlFor="description" className="block text-sm font-medium">
                  Présentation aux utilisateurs
                </label>
                <textarea
                  id="description"
                  rows={2}
                  value={draft.description}
                  maxLength={BEHAVIOR_LIMITS.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={`mt-2 ${inputClass}`}
                />
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
