import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { markUnknownWords } from "@/lib/language/unknown-words";
import { BARGE_BLOCK } from "@/lib/barge/intent";
import { BargeTickets } from "./BargeTickets";
import { CodeExamSlots } from "./CodeExamSlots";
import { FoodOrder } from "./FoodOrder";
import { UnknownWord } from "./UnknownWord";

/** Texte brut d'un contenu Markdown rendu (le mot entre [[ ]]). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** Bloc ```creneaux-code``` écrit par Awa : remplacé par le tableau des créneaux du code. */
export const CODE_EXAM_BLOCK = "creneaux-code";
/** Bloc ```commande-repas``` : remplacé par la commande de repas (FoodOrder). */
export const FOOD_BLOCK = "commande-repas";

// Le HTML brut n'est pas interprété (pas de rehype-raw) : seul le Markdown est rendu.
const components: Components = {
  pre: ({ children }) => {
    const code = isValidElement<{ className?: string }>(children) ? children.props.className : undefined;
    // Le contenu du bloc nomme le bureau visé (« Kaweni ») : le tableau s'ouvre sur ses horaires.
    // Bureau, puis jour et moment voulus (« jour: 2026-11-03 ») ajoutés par le serveur : nouveau contenu, tableau rouvert.
    if (code === `language-${CODE_EXAM_BLOCK}`) {
      const block = textOf(children).trim();
      return <CodeExamSlots key={block} office={block} />;
    }
    // Le contenu du bloc dit ce que la personne veut manger (« tacos », « pizza Pizza Mangrove »).
    if (code === `language-${FOOD_BLOCK}`) return <FoodOrder query={textOf(children).trim()} />;
    // Bloc ```ticket-barge``` : achat de tickets de barge (Mamoudzou → Dzaoudzi).
    if (code === `language-${BARGE_BLOCK}`) return <BargeTickets query={textOf(children).trim()} />;
    return <pre>{children}</pre>;
  },
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
