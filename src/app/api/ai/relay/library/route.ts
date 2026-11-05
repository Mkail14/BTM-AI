import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { relayEnabled, verifyRelay } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { addDocument, libraryContextFor } from "@/lib/library/store";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Bibliothèque Mayotte depuis un poste de l'équipe (demande signée avec le
 * secret du serveur, comme /api/ai/relay) : ajouter une page, ou tester une
 * recherche. Une page n'est publiée que si la demande le dit.
 */

export const maxDuration = 60;

const bodySchema = z.union([
  z.object({ url: z.url().max(1_000), title: z.string().trim().max(300).optional(), publish: z.boolean().optional() }),
  z.object({ query: z.string().trim().min(1).max(1_000) }),
]);

export async function POST(request: NextRequest) {
  if (!relayEnabled()) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 4_000) return NextResponse.json({ error: "Demande trop lourde." }, { status: 413 });
  const signed = verifyRelay(raw, request.headers.get("x-relay-time"), request.headers.get("x-relay-signature"), keysSecret() ?? undefined);
  if (!signed) return NextResponse.json({ error: "Relais refusé." }, { status: 401 });
  const limit = await consumeRateLimits([{ key: "ai-relay", rules: RATE_LIMIT_POLICIES.aiRelay }]).catch(() => null);
  if (!limit?.allowed) return NextResponse.json({ error: "Trop de demandes." }, { status: 429 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });

  try {
    if ("query" in parsed.data) return NextResponse.json({ context: await libraryContextFor(parsed.data.query) });
    const { url, title, publish } = parsed.data;
    const done = await addDocument({ url, title }, null);
    if (publish) await getSupabaseAdminClient()?.from("awa_library_documents").update({ status: "publie" }).eq("id", done.id);
    return NextResponse.json({ ...done, status: publish ? "publie" : "a_valider" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "Ajout impossible." }, { status: 502 });
  }
}
