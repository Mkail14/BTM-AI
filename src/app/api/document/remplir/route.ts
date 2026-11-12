import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { completeText } from "@/lib/ai/complete";
import { readAccountInfo } from "@/lib/attestation/account";
import { todayMayotte } from "@/lib/attestation/fields";
import { getAuthContext } from "@/lib/auth/session";
import { frenchDate, guessValue, parseFillValues, type PersonInfo } from "@/lib/document-signe/blanks";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Document à remplir : Tamilya propose une valeur pour chaque case. Seuls les libellés des
 * cases (« Nom », « Né(e) le ») et le titre arrivent ici, jamais le document. La personne
 * relit et corrige chaque valeur avant qu'elle soit écrite.
 */

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

const bodySchema = z.object({
  request: z.string().max(1_000).default(""),
  title: z.string().max(200).default(""),
  blanks: z.array(z.object({ label: z.string().max(80), context: z.string().max(240) })).min(1).max(80),
});

const SYSTEM = [
  "Tu remplis les cases vides d'un document administratif pour la personne qui te le demande.",
  "On te donne ce que son compte sait d'elle, ce qu'elle a demandé, la date du jour, puis les cases dans l'ordre (libellé et ligne où elle se trouve).",
  "Réponds UNIQUEMENT par un tableau JSON de chaînes, une par case, dans le même ordre et en même nombre. Rien d'autre.",
  "- Mets seulement ce que tu sais vraiment : les informations du compte, ce qu'elle a écrit dans sa demande, la date du jour pour « Le » ou « Date ».",
  "- Si sa demande parle d'une autre personne (son enfant, son employeur…), remplis les cases de cette personne avec ce qu'elle a dit, et pas avec son compte.",
  "- Si tu ne sais pas, chaîne vide. N'invente jamais un nom, une date, un numéro, une adresse ou un montant.",
  "- Les dates au format JJ/MM/AAAA.",
].join("\n");

function describe(info: PersonInfo) {
  const lines = [
    ["Civilité", info.civility],
    ["Prénom", info.firstName],
    ["Nom", info.lastName],
    ["Date de naissance", info.birthDate ? frenchDate(info.birthDate) : undefined],
    ["Adresse", info.address],
    ["Code postal", info.postalCode],
    ["Commune", info.city],
    ["Téléphone", info.phone],
    ["E-mail", info.email],
  ].filter(([, value]) => value);
  return lines.length ? lines.map(([k, v]) => `${k} : ${v}`).join("\n") : "(le compte ne sait rien d'elle)";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour que je remplisse avec tes informations.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Je n'ai pas compris les cases de ce document.");
  const { blanks, title } = parsed.data;

  const limit = await consumeRateLimits([{ key: `document-fill:${user.id}`, rules: RATE_LIMIT_POLICIES.documentFill }]).catch(() => null);
  if (!limit) return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  if (!limit.allowed) return fail(429, "Beaucoup de documents d'un coup : réessaie dans un moment.");

  const info: PersonInfo = { ...(await readAccountInfo(supabase, user.id)), email: user.email ?? undefined };
  const today = todayMayotte();
  const guesses = blanks.map((b) => guessValue(b.label, info, today));

  const ai = await getAIProvider();
  let values: string[] | null = null;
  if (ai.ok) {
    const output = await completeText(ai.provider, {
      system: SYSTEM,
      content: [
        `Ce que son compte sait d'elle :\n${describe(info)}`,
        `Sa demande : ${parsed.data.request || "(rien de plus)"}`,
        `Date du jour : ${frenchDate(today)}`,
        title ? `Titre du document : ${title}` : "",
        `Cases (${blanks.length}) :\n${blanks.map((b, i) => `${i + 1}. ${b.label} — ligne : ${b.context}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxOutputTokens: 1_500,
      timeoutMs: 25_000,
    }).catch((error: unknown) => {
      console.error("[document] Cases non remplies par l'IA", error);
      return "";
    });
    values = parseFillValues(output, blanks.length);
  }
  // Sans réponse de l'IA : seulement les cases évidentes (nom, prénom, date du jour…).
  const merged = guesses.map((guess, i) => values?.[i] || guess);
  return NextResponse.json({ values: merged }, { headers: NO_STORE });
}
