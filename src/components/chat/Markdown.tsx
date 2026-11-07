import { stripEmoji } from "@/lib/chat/no-emoji";
import dynamic from "next/dynamic";
import { Children, isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { markUnknownWords } from "@/lib/language/unknown-words";
import { ATTESTATION_BLOCK, SIGNATURES_STEP } from "@/lib/attestation/intent";
import { BARGE_BLOCK } from "@/lib/barge/intent";
import { BTM_DEVIS_BLOCK } from "@/lib/btm/intent";
import { CYCLONE_BLOCK } from "@/lib/cyclone/intent";
import { SONG_BLOCK } from "@/lib/music/intent";
import { GROUP_BLOCK } from "@/lib/food/group-block";
import { TRIP_BLOCK } from "@/lib/trip/intent";
import { COMBINED_BLOCK } from "@/lib/voice-live/combined";
import { groupYouTubeLines, parseYouTubeLink } from "@/lib/youtube/link";
import { UnknownWord } from "./UnknownWord";
import { VoiceBoard as Board } from "./VoiceBoard";
import { YouTubeCard, YouTubeRow } from "./YouTubeCard";

// Tickets de barge, créneaux du code et commande de repas : chargés seulement
// quand Tamilya écrit le bloc spécial (carte, QR code, formulaires…).
const AttestationHebergement = dynamic(() => import("./AttestationHebergement").then((m) => m.AttestationHebergement));
const BargeTickets = dynamic(() => import("./BargeTickets").then((m) => m.BargeTickets));
const BtmDevis = dynamic(() => import("./BtmDevis").then((m) => m.BtmDevis));
const CombinedBoard = dynamic(() => import("./CombinedBoard").then((m) => m.CombinedBoard));
const CycloneCard = dynamic(() => import("./CycloneCard").then((m) => m.CycloneCard));
const CodeExamSlots = dynamic(() => import("./CodeExamSlots").then((m) => m.CodeExamSlots));
const FoodOrder = dynamic(() => import("./FoodOrder").then((m) => m.FoodOrder));
const TripCard = dynamic(() => import("./TripCard").then((m) => m.TripCard));
const SongCard = dynamic(() => import("./SongCard").then((m) => m.SongCard));

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
    // Bloc ```commande-groupee``` : le panier composé par Tamilya, un article par ligne.
    if (code === `language-${GROUP_BLOCK}`) {
      return (
        <Board>
          <FoodOrder query={textOf(children).trim()} group />
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
    // Bloc ```attestation-hebergement``` : formulaire, signatures et PDF, le tout sur l'appareil.
    if (code === `language-${ATTESTATION_BLOCK}`) {
      return (
        <Board>
          <AttestationHebergement resume={textOf(children).trim() === SIGNATURES_STEP} mode={textOf(children).trim()} />
        </Board>
      );
    }
    // Bloc ```itineraire``` : carte du trajet (« vers: cssm », « depuis: sada »), temps et boutons Google Maps / Waze.
    if (code === `language-${TRIP_BLOCK}`) {
      const block = textOf(children).trim();
      return <TripCard key={block} spec={block} />;
    }
    // Bloc ```carte-cyclones``` : carte des cyclones de l'océan Indien (en cours et en formation).
    if (code === `language-${CYCLONE_BLOCK}`) return <CycloneCard />;
    // Bloc ```chanson``` : paroles écrites par Tamilya, chantées avec des instruments (Lyria) ; le globe chante.
    // Sans clé : la carte doit garder son état pendant que le bloc s'écrit.
    if (code === `language-${SONG_BLOCK}`) return <SongCard spec={textOf(children)} />;
    // Bloc ```tableau-combine``` : plusieurs services en un tableau, créé par Tamilya sur demande.
    if (code === `language-${COMBINED_BLOCK}`) {
      const block = textOf(children).trim();
      return (
        <Board>
          <CombinedBoard key={block} text={block} />
        </Board>
      );
    }
    return <pre>{children}</pre>;
  },
  // Paragraphe fait seulement de vidéos YouTube : rangée qui défile vers la droite.
  p: ({ children }) => {
    const items = Children.toArray(children).filter((c) => !(typeof c === "string" && !c.trim()));
    const onlyVideos = items.length > 0 && items.every((c) => isValidElement<{ href?: string }>(c) && parseYouTubeLink(c.props.href));
    return onlyVideos ? <YouTubeRow>{items}</YouTubeRow> : <p>{children}</p>;
  },
  a: ({ href, title, children }) => {
    // [[mot]] : mot que Tamilya ne connaît pas encore en shimaoré (voir markUnknownWords).
    if (href === "#fr") return <UnknownWord french={textOf(children)}>{children}</UnknownWord>;
    // Vidéo proposée : carte qui ouvre l'app YouTube.
    const youtube = parseYouTubeLink(href);
    if (youtube) return <YouTubeCard link={youtube}>{children}</YouTubeCard>;
    return (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
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
        {groupYouTubeLines(markUnknownWords(stripEmoji(text)))}
      </ReactMarkdown>
    </div>
  );
});
