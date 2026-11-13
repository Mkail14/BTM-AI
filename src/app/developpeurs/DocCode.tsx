"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { CodeView, type CodeLang } from "./highlight";

/** Bloc de code de la documentation : nom de fichier, code coloré, bouton Copier. */
export function DocCode({ code, lang, title }: { code: string; lang: CodeLang; title: string }) {
  const [copied, setCopied] = useState(false);

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
    <div className="my-4 overflow-hidden rounded-xl border border-[#2b2b2b] bg-[#1e1e1e] shadow-[0_18px_40px_-30px_rgb(0_0_0/0.5)]">
      <div className="flex h-8 items-center justify-between gap-2 bg-[#252526] pl-4">
        <span className="truncate font-mono text-[11px] text-[#cccccc]/70">{title}</span>
        <button type="button" onClick={copy} className="h-full shrink-0 px-3 text-[11px] text-[#cccccc] transition hover:bg-white/10">
          {copied ? (
            <span className="inline-flex items-center gap-1">
              Copié <Check aria-hidden="true" className="size-3.5" />
            </span>
          ) : (
            "Copier"
          )}
        </button>
      </div>
      <CodeView code={code} lang={lang} />
    </div>
  );
}
