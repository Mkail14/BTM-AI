"use client";

import { useSyncExternalStore } from "react";
import { readTalkMode, saveTalkMode, subscribeTalkMode, TALK_MODES } from "@/lib/voice-live/talk-mode";
import { RadioRow, SettingsGroup } from "./ui";

/** Choix de la façon de parler à Tamilya en vocal (gardé sur cet appareil). */
export function VoiceTalkMode() {
  const current = useSyncExternalStore(subscribeTalkMode, readTalkMode, () => null);
  return (
    <SettingsGroup title="Le vocal" description="Comment tu lui parles. Ce choix est gardé sur cet appareil.">
      {TALK_MODES.map((mode) => (
        <RadioRow key={mode.id} name="mode-vocal" checked={current === mode.id} onSelect={() => saveTalkMode(mode.id)} title={mode.title} detail={mode.detail} />
      ))}
    </SettingsGroup>
  );
}
