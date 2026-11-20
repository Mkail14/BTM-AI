"use client";

import { useState, useSyncExternalStore } from "react";
import { readTalkMode, saveTalkMode, subscribeTalkMode, TALK_MODES } from "@/lib/voice-live/talk-mode";
import { RadioRow, SECONDARY, SettingsRow } from "./ui";

/** Façon de parler à Tamilya en vocal (gardée sur cet appareil) : une ligne, les choix s'ouvrent dessous. */
export function VoiceTalkMode() {
  const current = useSyncExternalStore(subscribeTalkMode, readTalkMode, () => null);
  const [open, setOpen] = useState(false);
  const chosen = TALK_MODES.find((mode) => mode.id === current);

  return (
    <>
      <SettingsRow label="Vocal" value={chosen?.title ?? "Non choisi"}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={SECONDARY}>
          {open ? "Fermer" : "Changer"}
        </button>
      </SettingsRow>
      {open
        ? TALK_MODES.map((mode) => (
            <RadioRow
              key={mode.id}
              name="mode-vocal"
              checked={current === mode.id}
              onSelect={() => {
                saveTalkMode(mode.id);
                setOpen(false);
              }}
              title={mode.title}
              detail={mode.detail}
            />
          ))
        : null}
    </>
  );
}
