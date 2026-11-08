"use client";

import { createContext, use } from "react";

/**
 * Ce qu'une carte de la conversation a besoin de savoir sur la réponse qui la contient :
 * fresh, reçue à l'instant (pas une ancienne conversation rouverte) ; done, le serveur a fini
 * d'envoyer ; content, la réponse complète (le texte affiché, lui, s'écrit encore lettre à lettre).
 */
export type MessageInfo = { id: string; fresh: boolean; done: boolean; content: string };

export const MessageContext = createContext<MessageInfo | null>(null);

export const useMessageInfo = () => use(MessageContext);
