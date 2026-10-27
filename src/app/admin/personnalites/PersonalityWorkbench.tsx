"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { Markdown } from "@/components/chat/Markdown";
import { IconClose, IconPlus, IconSend } from "@/components/ui/icons";
import {
  BEHAVIOR_LIMITS,
  personalityCard,
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

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`mt-1 block text-right text-xs tabular-nums ${value.length > max * 0.9 ? "text-danger" : "text-fg-muted"}`}>
      {value.length} / {max}
    </span>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent";

/** Liste éditable : une ligne par élément, ajout et suppression. */
function ListField({
  label,
  hint,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const id = useId();
  const full = items.length >= BEHAVIOR_LIMITS.listItems;
  return (
    <fieldset>
      <legend className="block text-sm font-medium">{label}</legend>
      <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
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
        disabled={full}
        onClick={() => onChange([...items, ""])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
      >
        <IconPlus width={16} height={16} /> Ajouter
      </button>
    </fieldset>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-bg p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();

  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<{ question: string; result: ActionResult } | null>(null);
  const [testing, startTesting] = useTransition();

  const dirty = !sameBehavior(draft, saved);
  const isDefault = sameBehavior(draft, defaults);
  const card = personalityCard(id, draft);

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

  function save(behavior: PersonalityBehavior | null) {
    startSaving(async () => {
      const result = await savePersonalityAction(id, behavior);
      setStatus(result);
      if (result.ok) {
        if (behavior === null) setDraft(defaults);
        router.refresh();
      }
    });
  }

  function runTest(message: string) {
    const question = message.trim();
    if (!question) return;
    setTestMessage(question);
    startTesting(async () => {
      const result = await testPersonalityAction(id, draft, question);
      setTestResult({ question, result });
    });
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      {/* Édition */}
      <div className="min-w-0 space-y-4">
        <Card title="Qui elle est">
          <div className="space-y-5">
            <Field
              label="Attitude"
              hint="Son caractère, son humeur, sa façon d'être avec les gens. Écrivez comme si vous la décriviez à un ami."
              htmlFor="attitude"
            >
              <textarea
                id="attitude"
                rows={4}
                value={draft.attitude}
                maxLength={BEHAVIOR_LIMITS.attitude}
                onChange={(e) => set("attitude", e.target.value)}
                className={inputClass}
              />
              <Counter value={draft.attitude} max={BEHAVIOR_LIMITS.attitude} />
            </Field>
            <Field
              label="Façon de parler"
              hint="Tutoiement ou vouvoiement, mots et expressions, longueur des phrases, emojis…"
              htmlFor="speech"
            >
              <textarea
                id="speech"
                rows={3}
                value={draft.speech}
                maxLength={BEHAVIOR_LIMITS.speech}
                onChange={(e) => set("speech", e.target.value)}
                className={inputClass}
              />
              <Counter value={draft.speech} max={BEHAVIOR_LIMITS.speech} />
            </Field>
          </div>
        </Card>

        <Card title="Règles de comportement">
          <div className="grid gap-6 md:grid-cols-2">
            <ListField
              label="Elle fait toujours"
              hint="Une habitude par ligne."
              placeholder="Ex. : finir par une petite question"
              items={draft.always}
              onChange={(v) => set("always", v)}
            />
            <ListField
              label="Elle ne fait jamais"
              hint="Une interdiction par ligne."
              placeholder="Ex. : faire de longs pavés"
              items={draft.never}
              onChange={(v) => set("never", v)}
            />
          </div>
        </Card>

        <Card title="Exemples de répliques">
          <ListField
            label="Phrases typiques"
            hint="Awa s'en inspire sans les répéter mot pour mot. La première est montrée aux utilisateurs au moment du choix."
            placeholder="Ex. : Encore toi ? Bon, vas-y…"
            items={draft.examples}
            onChange={(v) => set("examples", v)}
          />
        </Card>

        <Card title="Présentation aux utilisateurs">
          <Field
            label="Description"
            hint="Le texte affiché sur la carte quand l'utilisateur choisit sa personnalité."
            htmlFor="description"
          >
            <textarea
              id="description"
              rows={2}
              value={draft.description}
              maxLength={BEHAVIOR_LIMITS.description}
              onChange={(e) => set("description", e.target.value)}
              className={inputClass}
            />
            <Counter value={draft.description} max={BEHAVIOR_LIMITS.description} />
          </Field>
        </Card>

        {/* Barre d'enregistrement, collée en bas de l'écran */}
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg/95 px-4 py-3 shadow-lg backdrop-blur">
          <p role="status" className={`min-w-0 flex-1 text-sm ${status && !status.ok ? "text-danger" : "text-fg-muted"}`}>
            {status ? status.message : dirty ? "Modifications non enregistrées." : customized ? "Version personnalisée en ligne." : "Réglages d'origine en ligne."}
          </p>
          {dirty ? (
            <button
              type="button"
              onClick={() => {
                setDraft(saved);
                setStatus(null);
              }}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              Annuler les modifications
            </button>
          ) : null}
          {customized || !isDefault ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Revenir aux réglages d'origine pour cette personnalité ?")) save(null);
              }}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-bg-muted disabled:opacity-60"
            >
              Réglages d&apos;origine
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => save(draft)}
            disabled={!dirty || saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer et mettre en ligne"}
          </button>
        </div>
      </div>

      {/* Essai et aperçu */}
      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card title="Essayer" aside={<span className="text-xs text-fg-muted">avec le brouillon actuel</span>}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runTest(testMessage);
            }}
            className="flex gap-2"
          >
            <label htmlFor="test-message" className="sr-only">
              Message à envoyer à Awa
            </label>
            <input
              id="test-message"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              maxLength={1000}
              placeholder="Écrivez comme un utilisateur…"
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
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TEST_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={testing}
                onClick={() => runTest(s)}
                className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-bg-muted disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="mt-4 space-y-3 text-sm">
            {testing ? (
              <p className="text-fg-muted">
                {card.emoji} Awa réfléchit…
              </p>
            ) : testResult ? (
              <>
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-bg-muted px-3 py-2">{testResult.question}</p>
                {testResult.result.ok ? (
                  <div className="rounded-2xl border border-border px-3 py-2">
                    <Markdown text={testResult.result.message} />
                  </div>
                ) : (
                  <p role="alert" className="text-danger">
                    {testResult.result.message}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-fg-muted">
                Testez vos changements avant de les mettre en ligne. Les essais ne sont pas enregistrés et ne
                comptent pas dans les statistiques.
              </p>
            )}
          </div>
        </Card>

        <Card title="Aperçu pour les utilisateurs">
          <div className="flex gap-3 rounded-xl border border-accent bg-accent-soft p-4">
            <span aria-hidden="true" className="text-2xl leading-none">
              {card.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{card.label}</span>
              <span className="mt-0.5 block text-sm text-fg-muted">{card.description}</span>
              {card.sample ? <span className="mt-2 block text-sm italic">« {card.sample} »</span> : null}
            </span>
          </div>
        </Card>

        <p className="px-1 text-xs leading-relaxed text-fg-muted">
          Toujours actif, quoi que vous écriviez : jamais d&apos;insulte réelle ni de moquerie sur l&apos;origine, la
          religion ou le physique ; Awa redevient douce si la personne va mal ; elle dit qu&apos;elle est une IA si on
          le lui demande sérieusement ; l&apos;exactitude passe avant le style.
        </p>
      </aside>
    </div>
  );
}
