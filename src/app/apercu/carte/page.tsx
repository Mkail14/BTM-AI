import type { Metadata } from "next";
import { CardEmbed } from "@/components/chat/CardEmbed";

export const metadata: Metadata = { title: "Carte", robots: { index: false, follow: false } };

/**
 * Une seule carte de la conversation (ticket de barge, carte de l'eau, offres d'emploi…),
 * sans le reste de la page. L'application Android la montre dans sa conversation native,
 * à la place du bloc ``` écrit par Tamilya : même rendu que sur le site.
 * ?bloc=carte-eau&contenu=Koungou
 */
export default async function CardEmbedPage({ searchParams }: PageProps<"/apercu/carte">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const block = one(params.bloc).toLowerCase();
  const content = one(params.contenu).slice(0, 4000);
  if (!/^[a-z0-9-]{1,40}$/.test(block)) return null;
  // ?grand=N : l'app ouvre le panneau de la carte dans une page à part, en plein écran.
  const big = /^\d{1,2}$/.test(one(params.grand));
  return <CardEmbed block={block} content={content} big={big} />;
}
