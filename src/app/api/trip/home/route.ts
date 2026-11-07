import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isInMayotte } from "@/lib/address";
import { getAuthContext } from "@/lib/auth/session";
import { getProfileContact, saveProfileAddress } from "@/lib/profile-contact";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Épingle posée sur la maison depuis la carte du trajet : la position est
 * gardée avec l'adresse écrite du compte (qui ne change pas). Les trajets
 * « depuis chez moi » et les livraisons partent ensuite de ce point exact.
 */

/** Une épingle posée au doigt sur une carte zoomée : à une dizaine de mètres près. */
const PIN_ACCURACY_M = 10;

const bodySchema = z.object({ lat: z.number().finite(), lng: z.number().finite() });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Connecte-toi pour enregistrer ta maison." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isInMayotte(parsed.data.lat, parsed.data.lng)) return NextResponse.json({ error: "Pose l'épingle à Mayotte." }, { status: 400 });
  const { address } = await getProfileContact(supabase, user.id);
  if (!address) return NextResponse.json({ error: "Enregistre d'abord ton adresse dans les paramètres." }, { status: 400 });
  try {
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    await saveProfileAddress(supabase, user.id, { ...address, geo: { lat: round(parsed.data.lat), lng: round(parsed.data.lng), accuracy: PIN_ACCURACY_M } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[trajet] Épingle non enregistrée", error);
    return NextResponse.json({ error: "Épingle non enregistrée : réessaie." }, { status: 503 });
  }
}
