"use client";

import { useState } from "react";

const TABS = ["curl", "JavaScript", "Python"] as const;
type Tab = (typeof TABS)[number];

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

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#16161a] text-[#e8e8ed] shadow-[0_24px_48px_-28px_rgb(0_0_0/0.5)] ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
        <div role="tablist" aria-label="Langage" className="flex">
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
              className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                tab === name ? "border-[var(--persona,var(--accent))] text-white" : "border-transparent text-white/55 hover:text-white/85"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <button type="button" onClick={copy} className="rounded-md px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white">
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <pre role="tabpanel" className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
