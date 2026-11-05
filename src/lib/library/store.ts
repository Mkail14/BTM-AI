import "server-only";
import { isPublicHttpsUrl } from "@/lib/security/public-url";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedTexts } from "./embed";
import { chunkText, htmlToText, MAX_DOCUMENT_CHARS, trustOf, type LibraryTrust } from "./text";

/**
 * Bibliothèque Mayotte : ajout de documents (toujours « à valider »), et
 * recherche par le sens dans les documents publiés. Une page lue sur internet
 * est une donnée : elle ne change jamais les consignes de Tamilya.
 */

export type LibraryDocument = {
  id: string;
  title: string;
  source_url: string | null;
  source_name: string;
  trust: LibraryTrust;
  published_at: string | null;
  verified_at: string;
  status: "a_valider" | "publie" | "rejete";
  chars: number;
  created_at: string;
};

const PAGE_MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;

async function readPage(url: string): Promise<{ title: string; text: string }> {
  // Adresses publiques en https seulement, revérifiées à chaque redirection : pas d'accès aux réseaux internes.
  let current = url;
  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicHttpsUrl(current)) throw new Error("Adresse refusée : une page publique en https seulement.");
    response = await fetch(current, {
      headers: { "User-Agent": "BTM-AI/1.0 (+https://btm.yt)" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const next = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!next) break;
    current = new URL(next, current).toString();
    response = null;
  }
  if (!response) throw new Error("Trop de redirections.");
  if (!response.ok) throw new Error(`La page répond ${response.status}.`);
  if (!/text\/html|text\/plain/.test(response.headers.get("content-type") ?? "")) throw new Error("Ce n'est pas une page de texte.");
  const raw = await response.text();
  if (raw.length > PAGE_MAX_BYTES) throw new Error("Page trop lourde.");
  return /text\/plain/.test(response.headers.get("content-type") ?? "") ? { title: "", text: raw } : htmlToText(raw);
}

/** Ajoute un document depuis une adresse ou un texte collé : découpé, empreint, et mis « à valider ». */
export async function addDocument(
  input: { url?: string; title?: string; text?: string; sourceName?: string; publishedAt?: string | null },
  userId: string | null,
): Promise<{ id: string; chunks: number }> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Base indisponible.");
  const url = input.url?.trim() || null;
  const page = url ? await readPage(url) : { title: "", text: input.text ?? "" };
  const text = page.text.slice(0, MAX_DOCUMENT_CHARS);
  if (text.trim().length < 80) throw new Error("Pas assez de texte à retenir.");
  const chunks = chunkText(text);
  const embeddings = await embedTexts(chunks, "RETRIEVAL_DOCUMENT", AbortSignal.timeout(50_000));

  const { data, error } = await admin
    .from("awa_library_documents")
    .insert({
      title: (input.title?.trim() || page.title || url || "Document").slice(0, 300),
      source_url: url,
      source_name: (input.sourceName?.trim() || (url ? new URL(url).hostname.replace(/^www\./, "") : "GROUPE BTM")).slice(0, 120),
      trust: trustOf(url),
      published_at: input.publishedAt || null,
      chars: text.length,
      added_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.code === "23505" ? "Cette adresse est déjà dans la bibliothèque." : error.message);

  const rows = chunks.map((content, position) => ({ document_id: data.id, position, content, embedding: JSON.stringify(embeddings[position]) }));
  const { error: chunkError } = await admin.from("awa_library_chunks").insert(rows);
  if (chunkError) {
    await admin.from("awa_library_documents").delete().eq("id", data.id);
    throw new Error(chunkError.message);
  }
  return { id: data.id as string, chunks: chunks.length };
}

export async function listDocuments(): Promise<LibraryDocument[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("awa_library_documents")
    .select("id, title, source_url, source_name, trust, published_at, verified_at, status, chars, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[bibliothèque] Lecture impossible (migration 20261129000000 appliquée ?)", error);
    return null;
  }
  return data as LibraryDocument[];
}

type Match = {
  content: string;
  title: string;
  source_name: string;
  source_url: string | null;
  trust: LibraryTrust;
  published_at: string | null;
  verified_at: string;
  similarity: number;
};

const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Indian/Mayotte" });
const TRUST_LABEL: Record<LibraryTrust, string> = { officiel: "source officielle", media: "média", autre: "source non officielle" };
const WAIT_MS = 1_500;

/**
 * Passages utiles pour ce message, prêts pour les consignes de Tamilya. null si
 * rien n'est assez proche, ou si la recherche dépasse 1,5 s : la réponse ne
 * dépend jamais de la bibliothèque.
 */
export async function libraryContextFor(message: string): Promise<string | null> {
  if (message.trim().length < 12) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const [query] = await embedTexts([message.slice(0, 1_000)], "RETRIEVAL_QUERY", AbortSignal.timeout(WAIT_MS));
  const { data, error } = await admin.rpc("match_library", { query: JSON.stringify(query), match_count: 5 });
  if (error) throw error;
  const matches = (data ?? []) as Match[];
  if (!matches.length) return null;
  return matches
    .map((m) => {
      const when = m.published_at ? `publié le ${day.format(new Date(m.published_at))}` : `vérifié le ${day.format(new Date(m.verified_at))}`;
      return `### ${m.title} — ${m.source_name} (${TRUST_LABEL[m.trust]}, ${when})\n${m.content}`;
    })
    .join("\n\n");
}
