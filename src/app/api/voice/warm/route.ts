import { NextResponse } from "next/server";
import { loadTamilyaBrain } from "@/lib/ai/brain";
import { listKeyModels } from "@/lib/ai/providers/gemini";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";
import { loadVoice } from "@/lib/ai/voice/settings";
import { getAuthContext } from "@/lib/auth/session";

/**
 * Appelée à l'ouverture du mode vocal : le serveur se réveille et met en cache
 * ce que la première réponse lira (cerveau de Tamilya, chaîne d'API, modèles
 * de voix, voix choisie), pendant que la personne parle encore. Ne fait aucun
 * appel payant à Gemini (la liste des modèles est gratuite et gardée une heure).
 */
export async function POST() {
  const { user } = await getAuthContext();
  if (!user) return new NextResponse(null, { status: 204 });
  await Promise.allSettled([
    loadTamilyaBrain(),
    loadVoice(),
    geminiKey().then((key) => listKeyModels(key, AbortSignal.timeout(5_000))),
  ]);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
