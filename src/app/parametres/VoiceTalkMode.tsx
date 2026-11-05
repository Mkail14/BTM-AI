"use client";

import { useSyncExternalStore } from "react";
import { readTalkMode, saveTalkMode, subscribeTalkMode, TALK_MODES } from "@/lib/voice-live/talk-mode";

/** Choix de la façon de parler à Tamilya en vocal (gardé sur cet appareil). */
export function VoiceTalkMode() {
  const current = useSyncExternalStore(subscribeTalkMode, readTalkMode, () => null);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {TALK_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-pressed={current === mode.id}
          onClick={() => saveTalkMode(mode.id)}
          className={`rounded-2xl border p-4 text-left transition ${current === mode.id ? "border-accent bg-accent-soft" : "border-border hover:bg-bg-muted"}`}
        >
          <span className="block text-sm font-medium">{mode.title}</span>
          <span className="mt-0.5 block text-sm text-fg-muted">{mode.detail}</span>
        </button>
      ))}
    </div>
  );
}
