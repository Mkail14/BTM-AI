/**
 * Découpe incrémentale d'un flux Server-Sent Events : renvoie le contenu des
 * lignes « data: » complètes.
 */
export function createSseDataParser() {
  let buffer = "";

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      const data: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      return data;
    },
  };
}
