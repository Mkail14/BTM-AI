"use client";

import type { CSSProperties } from "react";
import type { PublicReview } from "@/lib/reviews/rules";

/** En dessous, le défilé tournerait sur trop peu d'avis : ils restent immobiles. */
const SCROLL_FROM = 4;
/** Chaque colonne boucle sur assez d'avis pour remplir sa hauteur. */
const MIN_PER_COLUMN = 5;
/** Secondes par avis : plus il y en a, plus le tour est long, à vitesse égale. */
const SECONDS_PER_REVIEW = 6;

const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Indian/Mayotte" });

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span role="img" className={`flex gap-px text-[13px] leading-none ${className}`} aria-label={`${rating} étoile${rating > 1 ? "s" : ""} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= rating ? "text-warning" : "text-fg/15"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Carte d'avis au fond flouté : les couleurs de la section passent à travers. */
function ReviewCard({ review, hidden }: { review: PublicReview; hidden?: boolean }) {
  return (
    <article aria-hidden={hidden || undefined} className="review-card flex flex-col gap-3.5 rounded-xl p-5">
      <Stars rating={review.rating} />
      {review.comment ? <p className="line-clamp-5 text-[15px] leading-relaxed text-pretty text-fg">{review.comment}</p> : null}
      <footer className="mt-auto flex min-w-0 items-center gap-2.5 border-t border-border pt-3.5">
        <span aria-hidden="true" className="btn-rose btn-rose--icon pointer-events-none size-8 shrink-0 text-xs font-semibold">
          {review.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-sm font-semibold">{review.name}</strong>
          <small className="block truncate text-xs text-fg-muted">
            {review.commune ? `${review.commune} · ` : ""}
            <time dateTime={review.date}>{monthYear.format(new Date(review.date))}</time>
            {review.edited ? " · modifié" : ""}
          </small>
        </span>
      </footer>
    </article>
  );
}

/** Carte qui invite à donner son avis (jamais de faux avis pour remplir). */
function InviteCard({ onReview, first }: { onReview: () => void; first: boolean }) {
  return (
    <div className="review-invite flex flex-col items-start justify-between gap-4 rounded-xl p-5">
      <p className="text-[15px] leading-relaxed text-pretty text-fg-muted">
        {first ? "Sois le premier à dire ce que tu penses de Tamilya." : "Tu as parlé avec Tamilya ?"} Ton avis aide les autres à la découvrir.
      </p>
      <button
        type="button"
        onClick={onReview}
        className="group zone-appui relative inline-flex items-center gap-1.5 text-sm font-semibold text-[color-mix(in_oklab,var(--persona,var(--accent))_80%,var(--fg))]"
      >
        Donner mon avis
        <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </button>
    </div>
  );
}

function lengthen(list: PublicReview[], minimum: number) {
  let out = [...list];
  while (out.length < minimum) out = [...out, ...list];
  return out;
}

/**
 * Mur d'avis : deux colonnes qui défilent en sens inverse, en boucle (chaque
 * colonne est doublée pour que la fin rejoigne le début sans saut). Pause au
 * survol ou au clavier ; immobile si l'appareil limite les animations.
 */
export function ReviewsWall({ reviews, onReview }: { reviews: PublicReview[]; onReview: () => void }) {
  if (reviews.length < SCROLL_FROM) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
        <InviteCard onReview={onReview} first={reviews.length === 0} />
      </div>
    );
  }

  // Un avis sur deux dans chaque colonne ; la seconde va un peu moins vite, pour ne pas défiler en miroir.
  const columns = [reviews.filter((_, i) => i % 2 === 0), reviews.filter((_, i) => i % 2 === 1)];

  return (
    <div className="reviews-wall grid h-[30rem] grid-cols-2 gap-3 overflow-hidden sm:h-[max(30rem,calc(100dvh-12rem))]" aria-label="Avis des utilisateurs">
      {columns.map((unique, c) => {
        const loop = lengthen(unique, MIN_PER_COLUMN);
        return (
          <div key={c} className="reviews-column min-w-0" data-reverse={c === 1 || undefined}>
            <div
              className="reviews-track flex flex-col gap-3"
              style={{ "--reviews-duration": `${loop.length * SECONDS_PER_REVIEW * (c === 1 ? 1.15 : 1)}s` } as CSSProperties}
            >
              {/* Les copies (répétitions de la boucle) ne sont lues qu'une fois par les lecteurs d'écran. */}
              {[...loop, ...loop].map((review, i) => (
                <ReviewCard key={`${review.id}-${i}`} review={review} hidden={i >= unique.length} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
