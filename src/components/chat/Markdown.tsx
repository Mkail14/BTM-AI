import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Le HTML brut n'est pas interprété (pas de rehype-raw) : seul le Markdown est rendu.
const components: Components = {
  a: ({ href, title, children }) => (
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
        {text}
      </ReactMarkdown>
    </div>
  );
});
