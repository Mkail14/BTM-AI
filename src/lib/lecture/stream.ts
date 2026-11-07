/**
 * Lecture en 3D sans attendre la page entière : Gemini écrit le script en JSON, dans l'ordre imposé
 * (titre, lieu, intro, décor, personnages, puis les répliques). Ce découpeur rend le début dès que
 * la clé « repliques » apparaît, puis chaque réplique dès que son objet est fermé. La lecture
 * commence ainsi après la première réplique au lieu d'attendre toute la page (~13 s mesurées).
 */

const LINES_KEY = '"repliques"';

export type ScriptPieces = { meta?: unknown; lines: unknown[] };

export function createScriptStream() {
  let text = "";
  let metaDone = false;
  /** Position où reprendre la lecture des répliques ; -1 tant que le tableau n'a pas commencé. */
  let scan = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;
  let finished = false;

  function readLines(): unknown[] {
    const lines: unknown[] = [];
    if (scan < 0 || finished) return lines;
    for (; scan < text.length; scan++) {
      const c = text[scan];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") {
        if (depth === 0 && c === "{") objectStart = scan;
        depth++;
      } else if (c === "}" || c === "]") {
        if (depth === 0 && c === "]") {
          finished = true;
          break;
        }
        depth--;
        if (depth === 0 && c === "}" && objectStart >= 0) {
          try {
            lines.push(JSON.parse(text.slice(objectStart, scan + 1)));
          } catch {
            // Objet mal formé : écarté.
          }
          objectStart = -1;
        }
      }
    }
    return lines;
  }

  return {
    /** Ajoute un morceau de la réponse ; renvoie le début (une seule fois) et les répliques complètes. */
    push(chunk: string): ScriptPieces {
      text += chunk;
      const pieces: ScriptPieces = { lines: [] };
      if (!metaDone) {
        const key = text.indexOf(LINES_KEY);
        if (key < 0) return pieces;
        const open = text.indexOf("[", key + LINES_KEY.length);
        if (open < 0) return pieces;
        metaDone = true;
        try {
          pieces.meta = JSON.parse(`${text.slice(0, key).trimEnd().replace(/,$/, "")}}`);
        } catch {
          pieces.meta = undefined;
        }
        scan = open + 1;
      }
      pieces.lines = readLines();
      return pieces;
    },
    /** Tout le texte reçu (pour tout relire d'un coup si le découpage a échoué). */
    get text() {
      return text;
    },
    get started() {
      return metaDone;
    },
  };
}
