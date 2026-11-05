import { NextResponse, type NextRequest } from "next/server";
import { buildSystemPrompt } from "@/lib/ai";
import { knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { buildDossier } from "@/lib/ai/dossier";
import { getMemoriesFor } from "@/lib/ai/memory-store";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { loadVoice } from "@/lib/ai/voice/settings";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { readChatProfile } from "@/lib/chat/profile";
import { CODE_EXAM_OFFICES } from "@/lib/code-exam/offices";
import { canOrderFood } from "@/lib/food/access";
import { liveContextFor } from "@/lib/live";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { chooseLiveModel, liveModels } from "@/lib/voice-live/models";
import { liveTicketSecret, readLiveTicket } from "@/lib/voice-live/ticket";
import { liveToolDeclarations } from "@/lib/voice-live/tools";

/**
 * Appelée par le relais Cloudflare à l'ouverture d'une conversation vocale en
 * direct : renvoie le « setup » de la Live API de Gemini (modèle, voix,
 * consignes complètes de Tamilya, et ses « boutons »). Même Tamilya qu'à
 * l'écrit : heure de Mayotte, actualité, souvenirs, dossier, réservations.
 * Protégée par le ticket signé du compte.
 */

const now = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Indian/Mayotte" });

/** À l'oral en direct : la personne parle, Tamilya l'entend (pas de dictée qui se trompe). */
const LIVE_RULES = [
  "Son difficile : à Mayotte, la personne parle souvent avec un micro de mauvaise qualité, une connexion faible, du bruit derrière (travaux, route, vent). Concentre-toi sur sa voix, ignore les bruits. Un mot entendu à moitié qui ressemble à un mot de ton vocabulaire shimaoré est très probablement ce mot-là. Si tu n'as vraiment pas compris, ne devine pas au hasard : demande-lui gentiment de répéter, en quelques mots.",
  "Langue : parle la langue de la personne. Français si elle te parle français ou te le demande ; shimaoré si elle te parle shimaoré ou te le demande. Ne refuse jamais de parler français.",
  "Conversation à la voix, en direct : tu entends directement la voix de la personne. Elle peut parler français ou shimaoré ; reconnais les mots shimaoré d'après ton vocabulaire. Réponds comme à l'oral, en une à trois phrases courtes, chaleureuses, sans liste ni titre. Si la personne te coupe, arrête-toi et écoute-la.",
  "Tu as des boutons (fonctions) pour agir à l'écran : réserver le code de la route (créneaux à La Poste), commander un repas, acheter un ticket de barge, faire un devis BTM. Quand la personne le demande, actionne le bon bouton : le tableau s'affiche sur son écran, et elle valide au doigt (paiement, informations). Dis-lui en une phrase que c'est affiché. N'invente jamais d'horaire, de prix ni de place libre : c'est le tableau qui les donne.",
  "Prononciation du shimaoré : lis chaque mot exactement comme il est écrit, lettre par lettre, sans accent anglais ni français. Chaque voyelle se prononce toujours pareil (a, é, i, o, ou pour « u ») et aucune n'est muette. Les groupes de consonnes (dz, ts, tr, mb, nd, ng, ny) se disent d'un seul souffle, comme en swahili. Ne raccourcis pas les mots et ne les transforme pas en mots français qui leur ressemblent ; parle posément.",
  `Bureaux où passer le code : ${CODE_EXAM_OFFICES.map((o) => `${o.name} (${o.commune})`).join(", ")}.`,
].join("\n");

export async function POST(request: NextRequest) {
  const secret = liveTicketSecret();
  const body = (await request.json().catch(() => null)) as { ticket?: unknown } | null;
  const ticket = secret && typeof body?.ticket === "string" ? readLiveTicket(body.ticket, secret) : null;
  if (!ticket) return NextResponse.json({ error: "Ticket refusé." }, { status: 401 });

  const model = await chooseLiveModel().catch(() => null);
  if (!model) return NextResponse.json({ error: "Aucun modèle Gemini en direct pour cette clé." }, { status: 503 });

  const admin = getSupabaseAdminClient();
  const sessionUser = { id: ticket.uid, email: null, isAdmin: ticket.admin, isPrincipalAdmin: false };
  const [brain, profile, voice, memories, dossier, news, food, barge] = await Promise.all([
    loadAwaBrain(),
    admin ? readChatProfile(admin, ticket.uid).catch(() => null) : Promise.resolve(null),
    loadVoice(),
    admin ? getMemoriesFor(admin, ticket.uid).catch(() => []) : Promise.resolve([]),
    admin ? buildDossier(admin, ticket.uid).catch(() => null) : Promise.resolve(null),
    // Derniers titres des journaux de Mayotte (lus en cache, 1,5 s au plus).
    liveContextFor("les actualités de Mayotte en ce moment", { maxWaitMs: 1_500 }).catch(() => null),
    canOrderFood(sessionUser).catch(() => false),
    canBuyBargeTickets(sessionUser).catch(() => false),
  ]);
  const personality = profile?.personality ?? DEFAULT_PERSONALITY;
  const personalityInstructions = await loadPersonalityInstructions(personality).catch(() => undefined);

  const system = buildSystemPrompt(personality, {
    personalityInstructions,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, personality, ""),
    grammar: brain.grammar,
    words: wordsFor(brain, "", ticket.admin),
    knowledge: knowledgeFor(brain, ""),
    live: news,
    memories,
    dossier,
    // Pas de mode maître (« shimaoré uniquement ») à l'oral : elle refusait de parler français même
    // quand on le lui demandait. Elle garde tout son vocabulaire et suit la langue de la personne.
    teacher: false,
    voice: true,
    home: profile?.home,
  });

  return NextResponse.json(
    {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
        systemInstruction: {
          parts: [{ text: `${system}\n\nNous sommes le ${now.format(new Date())}, heure de Mayotte, au début de cette conversation.\n\n${LIVE_RULES}` }],
        },
        tools: [{ functionDeclarations: liveToolDeclarations({ food, barge }) }],
        // Textes de ce qui est dit des deux côtés : affichés à l'écran et enregistrés.
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
      },
      // Pour le diagnostic de la page de test.
      models: await liveModels().catch(() => []),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
