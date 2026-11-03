"use client";

import { useState } from "react";
import { MAYOTTE_COMMUNES } from "@/lib/code-exam/candidate";
import { REVIEW_COMMENT_MAX, type MyReview } from "@/lib/reviews/rules";
import { deleteReviewAction, saveReviewAction } from "./actions";
import { Feedback, PRIMARY, SECONDARY, useSave } from "./ContactForms";

const LABELS = ["", "Décevante", "Moyenne", "Bien", "Très bien", "Excellente"];

/**
 * Ton avis sur BTM IA : une note et quelques mots, affichés sur la page
 * d'accueil avec ton prénom et l'initiale de ton nom. Un seul avis par
 * compte, modifiable ou supprimable à tout moment.
 */
export function ReviewForm({ review, publicName, defaultCommune }: { review: MyReview | null; publicName: string; defaultCommune: string | null }) {
  const { pending, state, run } = useSave();
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [commune, setCommune] = useState(review ? (review.commune ?? "") : (defaultCommune ?? ""));
  const shown = hover || rating;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveReviewAction({ rating, comment, commune: commune || null }));
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium">Ta note</legend>
        <div className="mt-2 flex items-center gap-3">
          <div role="radiogroup" aria-label="Note sur 5" className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className={`text-3xl leading-none transition hover:scale-110 ${n <= shown ? "text-[#f59e0b]" : "text-border"}`}
              >
                ★
              </button>
            ))}
          </div>
          <span className="text-sm text-fg-muted" aria-live="polite">
            {LABELS[shown]}
          </span>
        </div>
      </fieldset>

      <div>
        <label htmlFor="avis-texte" className="text-sm font-medium">
          Ton avis <span className="font-normal text-fg-muted">(facultatif)</span>
        </label>
        <textarea
          id="avis-texte"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={REVIEW_COMMENT_MAX}
          rows={4}
          placeholder="Qu'est-ce que Tamilya t'a apporté ?"
          className="mt-1.5 w-full resize-y rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none focus:border-accent sm:text-sm"
        />
        <p className="mt-1 text-right text-xs text-fg-muted tabular-nums">
          {comment.length} / {REVIEW_COMMENT_MAX}
        </p>
      </div>

      <div>
        <label htmlFor="avis-commune" className="text-sm font-medium">
          Ta commune <span className="font-normal text-fg-muted">(facultatif)</span>
        </label>
        <select
          id="avis-commune"
          value={commune}
          onChange={(e) => setCommune(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none focus:border-accent sm:w-64 sm:text-sm"
        >
          <option value="">Ne pas l&apos;afficher</option>
          {MAYOTTE_COMMUNES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="rounded-2xl bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
        🌍 Ton avis est public : il s&apos;affiche sur la page d&apos;accueil sous le nom <strong className="text-fg">{publicName}</strong>
        {commune ? `, à ${commune}` : ""}. Jamais ton e-mail.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !rating} className={PRIMARY}>
          {pending ? "Enregistrement…" : review ? "Mettre à jour mon avis" : "Publier mon avis"}
        </button>
        {review ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Supprimer ton avis ? Il disparaîtra de la page d'accueil.")) {
                run(deleteReviewAction, () => {
                  setRating(0);
                  setComment("");
                });
              }
            }}
            className={`${SECONDARY} text-danger hover:bg-danger-soft`}
          >
            Supprimer mon avis
          </button>
        ) : null}
        <Feedback state={state} />
      </div>
    </form>
  );
}
