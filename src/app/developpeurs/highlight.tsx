import type { ReactNode } from "react";

export type CodeLang = "shell" | "js" | "python" | "json";

/** Couleurs du thème « Dark+ » de VS Code. */
const COLORS = {
  keyword: "#569cd6",
  control: "#c586c0",
  string: "#ce9178",
  number: "#b5cea8",
  comment: "#6a9955",
  fn: "#dcdcaa",
  variable: "#9cdcfe",
  type: "#4ec9b0",
  flag: "#569cd6",
  plain: "#d4d4d4",
} as const;

type Kind = keyof typeof COLORS;

const KEYWORDS: Record<CodeLang, { keyword: string[]; control: string[]; type: string[] }> = {
  shell: { keyword: [], control: [], type: [] },
  js: {
    keyword: ["const", "let", "var", "function", "new", "true", "false", "null", "undefined", "this", "async"],
    control: ["await", "return", "if", "else", "import", "from", "export", "for", "while", "try", "catch", "throw"],
    type: ["JSON", "process", "Promise", "Object", "Array"],
  },
  python: {
    keyword: ["def", "class", "True", "False", "None", "and", "or", "not", "in", "is", "lambda"],
    control: ["import", "from", "return", "if", "elif", "else", "for", "while", "try", "except", "with", "as"],
    type: ["os", "requests"],
  },
  json: { keyword: ["true", "false", "null"], control: [], type: [] },
};

// Ordre : commentaires, chaînes, nombres, $VARIABLES, options (-H), mots.
const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|(f?"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)|((?<=\s)--?[A-Za-z][\w-]*)|([A-Za-z_][A-Za-z0-9_]*)/g;

function classify(lang: CodeLang, word: string, after: string, isFirstWord: boolean): Kind {
  const k = KEYWORDS[lang];
  if (k.control.includes(word)) return "control";
  if (k.keyword.includes(word)) return "keyword";
  if (k.type.includes(word)) return "type";
  if (lang === "shell") return isFirstWord ? "fn" : "plain";
  return /^\s*\(/.test(after) ? "fn" : "variable";
}

/** Colore un bout de code, à la manière de VS Code. */
export function highlight(code: string, lang: CodeLang): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of code.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) out.push(code.slice(last, start));
    const [text, comment, string, number, shellVar, flag, word] = match;
    let kind: Kind = "plain";
    if (comment) {
      // « # » n'est un commentaire qu'en Python et en shell ; « // » qu'en JavaScript.
      const isComment = comment.startsWith("#") ? lang === "python" || lang === "shell" : lang === "js";
      kind = isComment ? "comment" : "plain";
    } else if (string) {
      // Clé d'objet JSON ("messages": …) : couleur des propriétés.
      kind = /^\s*:/.test(code.slice(start + text.length)) ? "variable" : "string";
    } else if (number) kind = "number";
    else if (shellVar) kind = "variable";
    else if (flag) kind = lang === "shell" ? "flag" : "plain";
    else if (word) {
      const lineStart = code.lastIndexOf("\n", start - 1) + 1;
      const isFirstWord = code.slice(lineStart, start).trim() === "";
      kind = classify(lang, word, code.slice(start + text.length), isFirstWord && lineStart === 0);
    }
    out.push(
      kind === "plain" ? (
        text
      ) : (
        <span key={index++} style={{ color: COLORS[kind], fontStyle: kind === "comment" ? "italic" : undefined }}>
          {text}
        </span>
      ),
    );
    last = start + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/** Fenêtre de code façon VS Code : numéros de ligne et coloration. */
export function CodeView({ code, lang, className = "" }: { code: string; lang: CodeLang; className?: string }) {
  const lines = code.split("\n").length;
  return (
    <pre
      className={`flex overflow-auto bg-[#1e1e1e] font-mono text-[12.5px] leading-[1.7] text-[#d4d4d4] [tab-size:2] ${className}`}
    >
      <span aria-hidden="true" className="sticky left-0 shrink-0 select-none bg-[#1e1e1e] py-4 pr-4 pl-4 text-right text-[#6e7681]">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="block">
            {i + 1}
          </span>
        ))}
      </span>
      <code className="block py-4 pr-5">{highlight(code, lang)}</code>
    </pre>
  );
}
