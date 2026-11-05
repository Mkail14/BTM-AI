"use client";

import type { ReactNode } from "react";
import { androidYouTubeIntent, type YouTubeLink } from "@/lib/youtube/link";

/** Vidéo proposée par Tamilya : un toucher ouvre l'app YouTube (ou le site si elle n'est pas là). */
export function YouTubeCard({ link, children }: { link: YouTubeLink; children: ReactNode }) {
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
      className="not-prose my-1 flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-bg p-2.5 pr-4 no-underline transition hover:bg-bg-muted"
    >
      <span aria-hidden="true" className="grid h-9 w-12 shrink-0 place-items-center rounded-xl bg-[#ff0000] text-white">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{children}</span>
        <span className="block text-xs text-fg-muted">{link.kind === "search" ? "Voir les vidéos sur YouTube" : "Ouvrir dans YouTube"}</span>
      </span>
    </a>
  );
}
