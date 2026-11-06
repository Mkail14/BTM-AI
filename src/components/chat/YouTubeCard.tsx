"use client";

import { useState, type ReactNode } from "react";
import { androidYouTubeIntent, type YouTubeLink } from "@/lib/youtube/link";

const thumbUrl = (link: YouTubeLink) =>
  link.kind === "video" ? `/api/youtube/thumb?v=${link.id}` : `/api/youtube/thumb?q=${encodeURIComponent(link.query)}`;

/** Vidéo proposée par Tamilya : miniature, titre ; un toucher ouvre l'app YouTube (ou le site). */
export function YouTubeCard({ link, children }: { link: YouTubeLink; children: ReactNode }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(event) => {
        if (!/Android/i.test(navigator.userAgent)) return;
        event.preventDefault();
        window.location.href = androidYouTubeIntent(link.url);
      }}
      className="not-prose flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-bg no-underline transition hover:bg-bg-muted"
    >
      <span className="relative block aspect-video w-full bg-bg-muted">
        {!thumbFailed && (
          // eslint-disable-next-line @next/next/no-img-element -- image servie par notre propre serveur
          <img src={thumbUrl(link)} alt="" loading="lazy" onError={() => setThumbFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span aria-hidden="true" className="absolute bottom-2 left-2 grid h-7 w-10 place-items-center rounded-lg bg-[#ff0000] text-white">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      <span className="block px-3 py-2">
        <span className="line-clamp-2 text-sm font-medium text-fg">{children}</span>
        <span className="block text-xs text-fg-muted">{link.kind === "search" ? "Voir sur YouTube" : "Ouvrir dans YouTube"}</span>
      </span>
    </a>
  );
}

/** Plusieurs vidéos : une rangée qui défile vers la droite. */
export function YouTubeRow({ children }: { children: ReactNode }) {
  return <div className="not-prose -mx-1 my-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">{children}</div>;
}
