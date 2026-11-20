import { NextResponse, type NextRequest } from "next/server";
import { recordAiUsage } from "@/server/services/ai/usage";
import { liveTicketSecret, readLiveTicket } from "@/server/services/voice-live/ticket";

/**
 * Appelée par le relais Cloudflare à la fin d'une conversation vocale en direct : ce que
 * Google a compté (somme des tours, son et texte à part), pour la jauge « Crédit Google ».
 * Avant le 2026-11-20 le vocal n'était pas compté : la jauge disait environ 1 € quand le
 * crédit était épuisé. Le rapport est signé par le relais (même secret que les tickets,
 * valable 60 s) : personne d'autre ne peut fausser la jauge.
 */

type UsageReport = { uid: string; exp: number; model?: unknown; audioIn?: unknown; textIn?: unknown; audioOut?: unknown; textOut?: unknown };

/** Nombre de jetons plausible (une conversation de 15 min reste loin de 50 millions). */
const tokens = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 50_000_000 ? Math.round(value) : 0);

export async function POST(request: NextRequest) {
  const secret = liveTicketSecret();
  if (!secret) return NextResponse.json({ error: "Non configuré" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { report?: unknown } | null;
  const report = typeof body?.report === "string" ? (readLiveTicket(body.report, secret) as UsageReport | null) : null;
  if (!report) return NextResponse.json({ error: "Rapport refusé" }, { status: 401 });

  const model = (typeof report.model === "string" ? report.model : "").replace(/^models\//, "").slice(0, 150) || "gemini-live";
  const name = model.startsWith("gemini") ? model : `gemini-live-${model}`;
  recordAiUsage(`${name}:son`, tokens(report.audioIn), tokens(report.audioOut));
  recordAiUsage(`${name}:texte`, tokens(report.textIn), tokens(report.textOut));
  return NextResponse.json({ ok: true });
}
