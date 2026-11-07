import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/email/device";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { attestationEmail } from "@/lib/email/templates";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/** Sous la limite de Vercel (4,5 Mo) : une attestation signée pèse bien moins. */
const MAX_PDF_BYTES = 4 * 1024 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

/**
 * Envoie l'attestation à l'adresse du compte, jamais à une adresse choisie :
 * le site ne doit pas pouvoir servir à écrire à des inconnus. Le PDF n'est pas gardé.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  if (!user?.email) return fail(401, "Connecte-toi pour recevoir le PDF par mail.");
  if (!emailConfigured()) return fail(503, "L'envoi par mail n'est pas encore ouvert. Télécharge le PDF.");

  const pdf = Buffer.from(await request.arrayBuffer());
  if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return fail(400, "Ce document ne peut pas être envoyé.");
  }

  const limit = await consumeRateLimits([{ key: `attestation-email:${user.id}`, rules: RATE_LIMIT_POLICIES.attestationEmail }]).catch(() => null);
  if (!limit) return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  if (!limit.allowed) return fail(429, "Trop d'envois : réessaie dans un moment.");

  // Signée dans l'appli par les deux personnes (dit par la page) : change seulement les mots du mail et le nom du fichier.
  const signed = request.nextUrl.searchParams.get("signee") === "1";
  try {
    await sendEmail(user.email, attestationEmail(siteOrigin(request.nextUrl.origin), { signed }), {
      attachments: [{ filename: signed ? "attestation-hebergement-signee.pdf" : "attestation-hebergement.pdf", content: pdf, contentType: "application/pdf" }],
    });
    return NextResponse.json({ to: user.email }, { headers: NO_STORE });
  } catch (error) {
    console.error("[attestation] Envoi impossible", error instanceof Error ? error.message : "inconnue");
    return fail(502, "Le mail n'est pas parti. Réessaie ou télécharge le PDF.");
  }
}
