import dynamic from "next/dynamic";
import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { markUnknownWords } from "@/lib/language/unknown-words";
import { BARGE_BLOCK } from "@/lib/barge/intent";
import { BTM_DEVIS_BLOCK } from "@/lib/btm/intent";
import { UnknownWord } from "./UnknownWord";

// Tickets de barge, créneaux du code et commande de repas : chargés seulement
// quand Tamilya écrit le bloc spécial (carte, QR code, formulaires…).
const BargeTickets = dynamic(() => import("./BargeTickets").then((m) => m.BargeTickets));
const BtmDevis = dynamic(() => import("./BtmDevis").then((m) => m.BtmDevis));
const CodeExamSlots = dynamic(() => import("./CodeExamSlots").then((m) => m.CodeExamSlots));
const FoodOrder = dynamic(() => import("./FoodOrder").then((m) => m.FoodOrder));

/** Texte brut d'un contenu Markdown rendu (le mot entre [[ ]]). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** Bloc ```creneaux-code``` écrit par Tamilya : remplacé par le tableau des créneaux du code. */
export const CODE_EXAM_BLOCK = "creneaux-code";
/** Bloc ```commande-repas``` : remplacé par la commande de repas (FoodOrder). */
export const FOOD_BLOCK = "commande-repas";

/** Tableau que Tamilya peut piloter à la voix (lib/voice-live/board.ts). */
const Board = ({ children }: { children: ReactNode }) => <div data-voice-board>{children}</div>;

// Le HTML brut n'est pas interprété (pas de rehype-raw) : seul le Markdown est rendu.
const components: Components = {
  pre: ({ children }) => {
    const code = isValidElement<{ className?: string }>(children) ? children.props.className : undefined;
    // Le contenu du bloc nomme le bureau visé (« Kaweni ») : le tableau s'ouvre sur ses horaires.
    // Bureau, puis jour et moment voulus (« jour: 2026-11-03 ») ajoutés par le serveur : nouveau contenu, tableau rouvert.
    if (code === `language-${CODE_EXAM_BLOCK}`) {
      const block = textOf(children).trim();
      return (
        <Board>
          <CodeExamSlots key={block} office={block} />
        </Board>
      );
    }
    // Le contenu du bloc dit ce que la personne veut manger (« tacos », « pizza Pizza Mangrove »).
    if (code === `language-${FOOD_BLOCK}`) {
      return (
        <Board>
          <FoodOrder query={textOf(children).trim()} />
        </Board>
      );
    }
    // Bloc ```ticket-barge``` : achat de tickets de barge (Mamoudzou → Dzaoudzi).
    if (code === `language-${BARGE_BLOCK}`) {
      return (
        <Board>
          <BargeTickets query={textOf(children).trim()} />
        </Board>
      );
    }
    // Bloc ```devis-btm``` : devis de matériaux BTM (« dalle longueur=8 largeur=6 »), avec code de retrait.
    if (code === `language-${BTM_DEVIS_BLOCK}`) {
      const block = textOf(children).trim();
      return (
        <Board>
          <BtmDevis key={block} query={block} />
        </Board>
      );
    }
    return <pre>{children}</pre>;
  },
  a: ({ href, title, children }) =>
    // [[mot]] : mot que Tamilya ne connaît pas encore en shimaoré (voir markUnknownWords).
    href === "#fr" ? (
      <UnknownWord french={textOf(children)}>{children}</UnknownWord>
    ) : (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ),
  // Aucune image écrite par le modèle n'est chargée (elle pourrait renseigner un autre site
  // sur la personne) : un simple lien texte, ouvert seulement si on clique.
  img: ({ src, alt }) =>
    typeof src === "string" && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt?.trim() || "image"}
      </a>
    ) : (
      <>{alt}</>
    ),
};

// « / » seul : lien du site ; « // » ou « /\ » (autre domaine) refusés.
const ALLOWED_PROTOCOLS = /^(https?:|mailto:|tel:|#|\/(?![\/\\]))/i;

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
