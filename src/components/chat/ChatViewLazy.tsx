"use client";

import dynamic from "next/dynamic";

/**
 * La conversation dans un fichier JS à part. À utiliser depuis une page serveur
 * qui affiche aussi autre chose (ex. la page d'accueil : ChatView pour les
 * comptes, GuestHome pour les visiteurs) : importée directement, ChatView
 * partirait aussi chez les visiteurs, qui ne la voient pas tout de suite.
 * Rendu serveur gardé (pas de ssr: false) : rien ne change pour les comptes.
 */
export const ChatViewLazy = dynamic(() => import("./ChatView").then((m) => m.ChatView));
