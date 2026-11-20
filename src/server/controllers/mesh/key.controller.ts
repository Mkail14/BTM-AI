import { NextResponse } from "next/server";
import { loadServerKey } from "@/lib/mesh/crypto";

/** Tamilya Connect : clé publique du serveur, gardée par l'app pour chiffrer ses messages hors ligne. */
export function GET() {
  const key = loadServerKey();
  if (!key) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ keyId: key.keyId, publicKey: key.publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
