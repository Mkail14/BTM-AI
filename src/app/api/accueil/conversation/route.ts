import { NextResponse } from "next/server";
import { getLandingDemo } from "@/lib/site/landing-demo";

export const dynamic = "force-dynamic";

/** Conversation d'exemple de l'accueil, traduite par Tamilya (src/lib/site/landing-demo.ts). Ouverte à tous. */
export async function GET() {
  const lines = await getLandingDemo();
  return NextResponse.json({ lines }, { headers: { "Cache-Control": "public, max-age=60" } });
}
