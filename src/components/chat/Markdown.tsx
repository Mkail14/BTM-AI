import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { markUnknownWords } from "@/lib/language/unknown-words";
import { UnknownWord } from "./UnknownWord";

/** Texte brut d'un contenu Markdown rendu (le mot entre [[ ]]). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

// Le HTML brut n'est pas interprété (pas de rehype-raw) : seul le Markdown est rendu.
const components: Components = {
  a: ({ href, title, children }) =>
    // [[mot]] : mot qu'Awa ne connaît pas encore en shimaoré (voir markUnknownWords).
    href === "#fr" ? (
      <UnknownWord french={textOf(children)}>{children}</UnknownWord>
    ) : (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ),
};

const ALLOWED_PROTOCOLS = /^(https?:|mailto:|tel:|#|\/)/i;

function safeUrl(url: string) {
  return ALLOWED_PROTOCOLS.test(url.trim()) ? url : "";
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
        {markUnknownWords(text)}
      </ReactMarkdown>
    </div>
  );
});
