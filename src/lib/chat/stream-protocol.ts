import type { ChatStreamEvent } from "./types";

/** Une ligne JSON par événement (NDJSON). */
export function encodeStreamEvent(event: ChatStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

const EVENT_TYPES = new Set(["meta", "delta", "done", "error"]);

function parseLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      typeof value.type === "string" &&
      EVENT_TYPES.has(value.type)
    ) {
      return value as ChatStreamEvent;
    }
  } catch {
    // Ligne invalide : ignorée.
  }
  return null;
}

/** Décodeur incrémental : les morceaux reçus peuvent couper une ligne en deux. */
export function createStreamEventParser() {
  let buffer = "";

  return {
    push(chunk: string): ChatStreamEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.map(parseLine).filter((e): e is ChatStreamEvent => e !== null);
    },
    flush(): ChatStreamEvent[] {
      const rest = parseLine(buffer);
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}
