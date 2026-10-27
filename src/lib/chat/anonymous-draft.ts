import type { ChatTurn } from "./types";

/**
 * Conversation anonyme conservée uniquement dans le navigateur (localStorage),
 * pour 24 heures au maximum. Elle n'est jamais enregistrée sur nos serveurs,
 * sauf si l'utilisateur se connecte puis accepte explicitement de l'importer.
 */
const STORAGE_KEY = "btm-ai:anonymous-conversation:v1";
export const ANONYMOUS_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredDraft = { savedAt: number; messages: ChatTurn[] };

function isTurn(value: unknown): value is ChatTurn {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    (value.role === "user" || value.role === "assistant") &&
    "content" in value &&
    typeof value.content === "string"
  );
}

export function loadAnonymousDraft(now = Date.now()): ChatTurn[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    if (
      typeof draft.savedAt !== "number" ||
      now - draft.savedAt > ANONYMOUS_DRAFT_TTL_MS ||
      !Array.isArray(draft.messages)
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const messages = draft.messages.filter(isTurn);
    return messages.length > 0 ? messages : null;
  } catch {
    return null;
  }
}

export function saveAnonymousDraft(messages: ChatTurn[]) {
  try {
    if (messages.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const draft: StoredDraft = { savedAt: Date.now(), messages };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Stockage indisponible (navigation privée, quota) : sans conséquence.
  }
}

export function clearAnonymousDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignoré.
  }
}
