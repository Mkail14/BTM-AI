"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, Camera, RotateCcw } from "lucide-react";
import { parseReadingSpec, READING_BLOCK } from "@/lib/lecture/intent";
import { takeReadingAutoStart } from "@/lib/lecture/auto";
import { getServerStories, getStories, playStory, playStoryOnce, subscribeStories, unlockAudio, type StorySource } from "@/lib/lecture/stage";
import { useMessageInfo } from "./message-context";

/**
 * Lecture en 3D dans la conversation : une simple ligne. L'histoire se joue dans le grand globe
 * de Tamilya, en plein écran (StoryStage), jamais dans la conversation (demande de l'utilisateur,
 * répétée : pas de « lecteur » avec ses boutons). Une réponse reçue à l'instant ouvre le globe toute
 * seule dès que le serveur a fini d'envoyer ; une ancienne conversation montre « Réécouter ».
 * Une vraie page de livre (« page ») demande d'abord la photo.
 */

const FENCE = "```";

/** Le bloc complet dans la réponse entière (le texte affiché s'écrit encore lettre à lettre). */
function fullSpec(content: string | undefined, typed: string) {
  if (!content) return typed;
  const start = content.indexOf(FENCE + READING_BLOCK);
  if (start < 0) return typed;
  const from = start + FENCE.length + READING_BLOCK.length;
  const end = content.indexOf(FENCE, from);
  return end < 0 ? typed : content.slice(from, end);
}

export function ReadingCard({ spec }: { spec: string }) {
  const message = useMessageInfo();
  const block = fullSpec(message?.content, spec).replace(/\r/g, "").trim();
  const mode = parseReadingSpec(block);
  const source: StorySource | null = mode?.kind === "texte" ? { text: mode.text } : mode?.kind === "histoire" ? { story: mode.request } : null;
  // Une clé par réponse : la même demande deux fois donne deux histoires.
  const key = `${message?.id ?? "vocal"}:${block}`;
  // Lancée depuis le vocal en direct (auto.ts) : vérifié une seule fois, à l'ouverture.
  const [fromVoice] = useState(() => takeReadingAutoStart(spec));
  const input = useRef<HTMLInputElement>(null);
  const { stories } = useSyncExternalStore(subscribeStories, getStories, getServerStories);
  const story = stories.get(key);

  const fresh = Boolean(fromVoice || (message?.fresh && message.done));
  useEffect(() => {
    if (fresh && source) playStoryOnce(key, source);
    // source dépend de key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, key]);

  function takePhoto() {
    unlockAudio();
    input.current?.click();
  }

  const title = story?.title || (mode?.kind === "page" ? "Lecture d'une page" : "Histoire");
  const busy = story && (story.status === "preparing" || story.status === "ready" || story.status === "playing" || story.status === "paused");

  return (
    <div className="not-prose my-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) playStory(`${key}:${file.name}:${file.lastModified}`, { photo: file });
        }}
      />
      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
        <BookOpen size={16} aria-hidden="true" className="shrink-0 text-accent" />
        <span className="truncate">{title}</span>
      </span>
      {mode?.kind === "page" ? (
        <button type="button" onClick={takePhoto} className="zone-appui inline-flex items-center gap-1 font-medium text-accent">
          <Camera size={14} aria-hidden="true" /> Prendre la page en photo
        </button>
      ) : source && !busy ? (
        <button type="button" onClick={() => playStory(key, source)} className="zone-appui inline-flex items-center gap-1 font-medium text-accent">
          <RotateCcw size={14} aria-hidden="true" /> {story ? "Réécouter" : "Écouter"}
        </button>
      ) : null}
      {story?.status === "error" && story.message ? <span className="w-full text-fg-muted">{story.message}</span> : null}
    </div>
  );
}
