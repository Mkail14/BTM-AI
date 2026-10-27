"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type CSSProperties } from "react";
import { choosePersonalityAction } from "@/app/parametres/actions";
import type { PersonalityCard, PersonalityId } from "@/lib/ai/personalities";
import { PERSONALITY_LOOKS as LOOKS } from "@/lib/ai/personality-looks";

const FALLBACK_LOOK = { color: "#c2185b", traits: [] as string[] };

/** Dégradé d'une carte : sa couleur vers une version plus sombre d'elle-même. */
const gradient = (color: string) =>
  `linear-gradient(155deg, color-mix(in srgb, ${color} 85%, white), color-mix(in srgb, ${color} 45%, black))`;

/** Trois cartes au choix (boutons radio) + validation. */
export function PersonalityPicker({
  cards,
  current,
  submitLabel = "Enregistrer",
  layout = "stack",
  onSaved,
}: {
  cards: PersonalityCard[];
  current: PersonalityId | null;
  submitLabel?: string;
  /** « row » : grandes cartes colorées côte à côte (bienvenue) ; « stack » : liste compacte (Paramètres). */
  layout?: "stack" | "row";
  onSaved?: (personality: PersonalityId) => void;
}) {
  const router = useRouter();
  const name = useId();
  const [selected, setSelected] = useState<PersonalityId | null>(current);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const row = layout === "row";

  function save() {
    if (!selected) return;
    startTransition(async () => {
      const result = await choosePersonalityAction(selected);
      if (result.status === "error") {
        setMessage({ error: true, text: result.message ?? "L'enregistrement a échoué." });
        return;
      }
      setMessage({ error: false, text: result.message ?? "Enregistré." });
      onSaved?.(selected);
      router.refresh();
    });
  }

  const selectedColor = selected ? (LOOKS[selected] ?? FALLBACK_LOOK).color : undefined;
  const selectedLabel = cards.find((c) => c.id === selected)?.label;

  return (
    <div className={row ? "space-y-7" : "space-y-5"}>
      <fieldset className={row ? "grid gap-4 md:grid-cols-3 md:gap-5" : "space-y-3"}>
        <legend className="sr-only">Personnalité d&apos;Awa</legend>
        {cards.map((p) => {
          const look = LOOKS[p.id] ?? FALLBACK_LOOK;
          const checked = selected === p.id;
          const radio = (
            <input
              type="radio"
              name={name}
              value={p.id}
              checked={checked}
              onChange={() => setSelected(p.id)}
              className="sr-only"
            />
          );

          if (row) {
            return (
              <label
                key={p.id}
                style={{ backgroundImage: gradient(look.color) }}
                className={`group relative isolate flex cursor-pointer items-center gap-4 overflow-hidden rounded-3xl p-5 text-white transition duration-200 focus-within:ring-4 focus-within:ring-white/70 md:min-h-80 md:flex-col md:items-start md:justify-between md:p-6 ${
                  checked
                    ? "shadow-2xl ring-4 ring-white ring-offset-4 ring-offset-bg md:scale-[1.03]"
                    : selected
                      ? "opacity-50 saturate-50 hover:opacity-90 hover:saturate-100"
                      : "hover:-translate-y-1 hover:shadow-2xl"
                }`}
              >
                {radio}
                {/* Grand emoji en filigrane : du caractère sans ajouter de texte. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-6 -bottom-8 -z-10 rotate-12 text-[8rem] leading-none opacity-15 select-none md:text-[12rem]"
                >
                  {p.emoji}
                </span>

                <span aria-hidden="true" className="text-5xl leading-none drop-shadow md:text-6xl">
                  {p.emoji}
                </span>

                <span className="min-w-0 pr-8 md:pr-0">
                  <span className="block text-xl font-black tracking-tight uppercase md:text-2xl">{p.label}</span>
                  {p.sample ? (
                    <span className="mt-1.5 block text-sm leading-snug text-white/85 md:text-base">« {p.sample} »</span>
                  ) : null}
                </span>

                {checked ? (
                  <span
                    aria-hidden="true"
                    style={{ color: look.color }}
                    className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-white text-sm font-black shadow-lg"
                  >
                    ✓
                  </span>
                ) : null}
              </label>
            );
          }

          return (
            <label
              key={p.id}
              style={{ "--c": look.color } as CSSProperties}
              className={`relative flex cursor-pointer gap-3 rounded-2xl border-2 bg-bg p-4 transition focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--c)_30%,transparent)] ${
                checked
                  ? "border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_10%,var(--bg))]"
                  : "border-border hover:border-[color-mix(in_srgb,var(--c)_50%,var(--border))]"
              }`}
            >
              {radio}
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--c)_18%,transparent)] text-2xl leading-none"
              >
                {p.emoji}
              </span>
              <span className="min-w-0 pr-6">
                <span className="block font-semibold text-[var(--c)]">{p.label}</span>
                <span className="mt-0.5 block text-sm text-fg-muted">{p.description}</span>
                {p.sample ? <span className="mt-2 block text-sm italic">« {p.sample} »</span> : null}
              </span>
              {checked ? (
                <span
                  aria-hidden="true"
                  className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-[var(--c)] text-xs font-bold text-white"
                >
                  ✓
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>

      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-sm ${row ? "text-center" : ""} ${message.error ? "text-danger" : "text-accent"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className={row ? "flex justify-center" : ""}>
        <button
          type="button"
          onClick={save}
          disabled={!selected || pending || selected === current}
          style={selectedColor ? { backgroundColor: selectedColor } : undefined}
          className={`rounded-2xl px-8 py-3.5 font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${
            selectedColor ? "" : "bg-accent"
          } ${row ? "w-full max-w-sm text-lg" : "w-full"}`}
        >
          {pending
            ? "Enregistrement…"
            : row && selectedLabel
              ? `${submitLabel} avec ${selectedLabel}`
              : row
                ? "Choisis une personnalité"
                : submitLabel}
        </button>
      </div>
    </div>
  );
}
