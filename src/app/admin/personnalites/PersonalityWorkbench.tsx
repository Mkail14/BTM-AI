"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Markdown } from "@/components/chat/Markdown";
import { IconClose, IconPlus, IconRetry, IconSend, IconTrash } from "@/components/ui/icons";
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
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

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
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-medium">{label}</legend>
        <button
          type="button"
          disabled={items.length >= BEHAVIOR_LIMITS.listItems}
          onClick={() => onChange([...items, ""])}
          aria-label={`Ajouter : ${label}`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
        >
          <IconPlus width={14} height={14} /> Ajouter
        </button>
      </div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-1.5">
            <label htmlFor={`${id}-${index}`} className="sr-only">
              {label} {index + 1}
            </label>
            <input
              id={`${id}-${index}`}
              value={item}
              maxLength={BEHAVIOR_LIMITS.listItem}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
              className={`${inputClass} py-1.5`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={`Retirer : ${item || "ligne vide"}`}
              className="shrink-0 rounded-lg p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              <IconClose width={14} height={14} />
            </button>
          </li>
        ))}
      </ul>
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
          className={`${inputClass} resize-none`}
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

/** Colonne de l'espace de travail : en-tête fixe, contenu qui défile seul. */
function Pane({
  title,
  hint,
  aside,
  children,
}: {
  title: ReactNode;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-96 flex-col overflow-hidden rounded-xl border border-border bg-bg lg:min-h-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {typeof title === "string" ? <h2 className="shrink-0 text-sm font-semibold">{title}</h2> : title}
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted" title={hint}>
          {hint}
        </span>
        {aside}
      </div>
      {children}
    </section>
  );
}

type TestTurn = { question: string; result: ActionResult };
type CharacterTab = "attitude" | "settings";

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
  const [characterTab, setCharacterTab] = useState<CharacterTab>("attitude");

  const [testMessage, setTestMessage] = useState("");
  const [asked, setAsked] = useState("");
  const [turn, setTurn] = useState<TestTurn | null>(null);
  const [correction, setCorrection] = useState<string | null>(null);
  const [learned, setLearned] = useState(false);
  const [testing, startTesting] = useTransition();
  const lessonsEndRef = useRef<HTMLLIElement>(null);

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

  function addLesson(lesson: Lesson) {
    setLessons((lessons) => [...lessons, lesson]);
    requestAnimationFrame(() => lessonsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

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
    addLesson({ user: turn.question, reply: reply.trim() });
    setCorrection(null);
    setLearned(true);
  }

  const statusText = status
    ? status.message
    : dirty
      ? "Modifications non enregistrées"
      : customized
        ? "Version personnalisée en ligne"
        : "Réglages d'origine en ligne";

  return (
    <>
      {/* Petit écran : les colonnes s'empilent et cette zone défile seule. */}
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:overflow-hidden">
        {/* 1. Caractère et réglages */}
        <Pane
          title={
            <div role="tablist" aria-label="Caractère" className="inline-flex rounded-lg bg-bg-muted p-0.5">
              {(
                [
                  ["attitude", "Caractère"],
                  ["settings", "Règles et phrases"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={characterTab === tab}
                  onClick={() => setCharacterTab(tab)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    characterTab === tab ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {characterTab === "attitude" ? (
            <>
              <label htmlFor="attitude" className="sr-only">
                Son caractère
              </label>
              <textarea
                id="attitude"
                value={draft.attitude}
                maxLength={BEHAVIOR_LIMITS.attitude}
                placeholder="Décris-la comme à un ami : qui elle est, son humeur, sa façon de parler, ses manies. Ex. : une grande sœur un peu moqueuse qui tutoie tout le monde… mais qui t'aide toujours à la fin."
                onChange={(e) => set("attitude", e.target.value)}
                className="min-h-0 w-full flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none"
              />
              <span className="shrink-0 border-t border-border px-3 py-1 text-right text-[11px] text-fg-muted tabular-nums">
                {draft.attitude.length.toLocaleString("fr-FR")} / {BEHAVIOR_LIMITS.attitude.toLocaleString("fr-FR")}
              </span>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3">
              <ListField label="Elle fait toujours" placeholder="Ex. : finir par une petite question" items={draft.always} onChange={(v) => set("always", v)} />
              <ListField label="Elle ne fait jamais" placeholder="Ex. : faire de longs pavés" items={draft.never} onChange={(v) => set("never", v)} />
              <ListField
                label="Phrases typiques"
                placeholder="Ex. : Encore toi ? Bon, vas-y…"
                items={draft.examples}
                onChange={(v) => set("examples", v)}
              />
              <div>
                <label htmlFor="description" className="text-sm font-medium">
                  Présentation aux utilisateurs
                </label>
                <textarea
                  id="description"
                  rows={2}
                  value={draft.description}
                  maxLength={BEHAVIOR_LIMITS.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={`mt-1.5 resize-none ${inputClass}`}
                />
                <p className="mt-1 text-xs text-fg-muted">La première phrase typique est aussi montrée aux utilisateurs.</p>
              </div>
            </div>
          )}
        </Pane>

        {/* 2. Leçons */}
        <Pane
          title={`Leçons (${draft.lessons.length})`}
          hint="Ce qu'on lui dit → sa réponse idéale"
          aside={
            <button
              type="button"
              disabled={lessonsFull}
              onClick={() => addLesson({ user: "", reply: "" })}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
            >
              <IconPlus width={14} height={14} /> Ajouter
            </button>
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {draft.lessons.length === 0 ? (
              <p className="grid h-full place-items-center rounded-xl border border-dashed border-border p-4 text-center text-sm text-fg-muted">
                Aucune leçon. Discute avec elle à droite pour en créer, ou ajoute-en une à la main.
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.lessons.map((lesson, index) => (
                  <LessonItem
                    key={index}
                    lesson={lesson}
                    emoji={card.emoji}
                    onChange={(next) => setLessons((lessons) => lessons.map((l, i) => (i === index ? next : l)))}
                    onRemove={() => setLessons((lessons) => lessons.filter((_, i) => i !== index))}
                  />
                ))}
                <li ref={lessonsEndRef} aria-hidden="true" />
              </ul>
            )}
          </div>
        </Pane>

        {/* 3. Lui apprendre */}
        <Pane title="Lui apprendre" hint="Garde ses bonnes réponses, corrige les autres">
          <div aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 text-sm">
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
                        className={`${inputClass} resize-none`}
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
              <div className="grid h-full place-items-center">
                <div className="space-y-3 text-center">
                  <p className="text-fg-muted">Écris-lui comme un utilisateur, ou essaie :</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
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
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runTest(testMessage);
            }}
            className="flex shrink-0 gap-2 border-t border-border p-2"
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
              className="shrink-0 rounded-lg bg-accent px-3 text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              <IconSend width={16} height={16} />
            </button>
          </form>
        </Pane>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-bg px-4 py-2.5">
        <p
          role="status"
          className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${status && !status.ok ? "text-danger" : "text-fg-muted"}`}
        >
          {status && !status.ok ? null : (
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dirty ? "bg-accent" : "bg-success"}`} />
          )}
          <span className="truncate">{statusText}</span>
        </p>
        {!dirty && (customized || !isDefault) ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Revenir aux réglages d'origine pour cette personnalité ? Ses leçons seront effacées.")) save(null);
            }}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-60"
          >
            <IconRetry width={14} height={14} />
            Réglages d&apos;origine
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setDraft(base);
            setStatus(null);
          }}
          disabled={!dirty || saving}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-bg-muted disabled:opacity-60"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => save(draft)}
          disabled={!dirty || saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </>
  );
}
