"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { CodeView, type CodeLang } from "./highlight";

const TABS = ["curl", "JavaScript", "Python"] as const;
type Tab = (typeof TABS)[number];

const FILES: Record<Tab, string> = { curl: "appel.sh", JavaScript: "appel.js", Python: "appel.py" };
const FILE_BADGES: Record<Tab, string> = { curl: "$", JavaScript: "JS", Python: "PY" };
const FILE_COLORS: Record<Tab, string> = { curl: "#89e051", JavaScript: "#f1e05a", Python: "#3572a5" };
const LANGS: Record<Tab, CodeLang> = { curl: "shell", JavaScript: "js", Python: "python" };

function examples(endpoint: string): Record<Tab, string> {
  return {
    curl: `curl ${endpoint} \\
  -H "Authorization: Bearer $TAMILYA_CODE" \\
  -H "X-Gemini-Key: $GEMINI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Comment on dit merci en shimaoré ?" }
    ],
    "context": "Application de covoiturage à Mayotte."
  }'`,
    JavaScript: `const response = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.TAMILYA_CODE}\`,
    "X-Gemini-Key": process.env.GEMINI_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Comment on dit merci en shimaoré ?" }],
    context: "Application de covoiturage à Mayotte.",
  }),
});

const { reply, error } = await response.json();`,
    Python: `import os, requests

response = requests.post(
    "${endpoint}",
    headers={
        "Authorization": f"Bearer {os.environ['TAMILYA_CODE']}",
        "X-Gemini-Key": os.environ["GEMINI_KEY"],
    },
    json={
        "messages": [{"role": "user", "content": "Comment on dit merci en shimaoré ?"}],
        "context": "Application de covoiturage à Mayotte.",
    },
    timeout=60,
)

print(response.json()["reply"])`,
  };
}

/** Exemple d'appel dans trois langages, avec bouton Copier. */
export function CodeExamples({ endpoint, className = "" }: { endpoint: string; className?: string }) {
  const [tab, setTab] = useState<Tab>("curl");
  const [copied, setCopied] = useState(false);
  const code = examples(endpoint)[tab];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  // Fenêtre façon VS Code : barre de titre, onglets « fichiers », code coloré.
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#2b2b2b] bg-[#1e1e1e] shadow-[0_24px_48px_-28px_rgb(0_0_0/0.6)] ${className}`}>
      <div className="flex h-8 shrink-0 items-center gap-2 bg-[#323233] px-3">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex-1 text-center font-mono text-[11px] text-[#cccccc]/70">tamilya — {FILES[tab]}</span>
        <button type="button" onClick={copy} className="-my-1 rounded px-3 py-2 text-[11px] text-[#cccccc] transition hover:bg-white/10">
          {copied ? (
            <span className="inline-flex items-center gap-1">
              Copié <Check aria-hidden="true" className="size-3.5" />
            </span>
          ) : (
            "Copier"
          )}
        </button>
      </div>
      <div role="tablist" aria-label="Langage" className="flex shrink-0 bg-[#252526]">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => {
              setTab(name);
              setCopied(false);
            }}
            className={`flex items-center gap-1.5 border-t-2 px-3.5 py-2 font-mono text-[12px] transition ${
              tab === name
                ? "border-[var(--persona,var(--accent))] bg-[#1e1e1e] text-white"
                : "border-transparent bg-[#2d2d2d] text-[#969696] hover:text-[#cccccc]"
            }`}
          >
            <span aria-hidden="true" className="text-[10px] font-bold" style={{ color: FILE_COLORS[name] }}>
              {FILE_BADGES[name]}
            </span>
            {FILES[name]}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1">
        <CodeView code={code} lang={LANGS[tab]} className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
