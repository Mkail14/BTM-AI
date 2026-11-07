import { randomUUID } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { AIProviderError, buildSystemPrompt, getAIProvider } from "@/lib/ai";
import { getAuthContext } from "@/lib/auth/session";
import { canOrderFood } from "@/lib/food/access";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { CYCLONE_BLOCK, cycloneBlock, detectCyclone } from "@/lib/cyclone/intent";
import { detectSong } from "@/lib/music/intent";
import { isReadingRequest, readingText, withReadingBlock } from "@/lib/lecture/intent";
import { BARGE_BLOCK, bargeBlockFor, bargeSpec, detectBargeTicket } from "@/lib/barge/intent";
import { ATTESTATION_BLOCK, attestationBlock, detectAttestation, wantsOwnInfo } from "@/lib/attestation/intent";
import { BTM_DEVIS_BLOCK, btmDevisBlockFor, btmDevisSpec, detectBtmDevis } from "@/lib/btm/intent";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { GROUP_BLOCK, groupBlock } from "@/lib/food/group-block";
import { detectFoodOrder, detectGroupOrder, foodBlock } from "@/lib/food/intent";
import { detectTrip, TRIP_BLOCK, tripBlock } from "@/lib/trip/intent";
import { addWhenToBlock, formatWhenDay, parseCodeExamWhen } from "@/lib/code-exam/when";
import { describeOrder, readLastOrder } from "@/lib/food/last-order";
import { chatErrorBody } from "@/lib/chat/errors";
import { mergeMemories } from "@/lib/chat/memories";
import { readChatProfile } from "@/lib/chat/profile";
import { buildModelHistory } from "@/lib/chat/history";
import { quickTitle } from "@/lib/chat/title";
import { nameConversation } from "@/lib/ai/title";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { createSentenceSplitter } from "@/lib/chat/sentences";
import { encodeStreamEvent } from "@/lib/chat/stream-protocol";
import type { ChatErrorCode, ChatStreamEvent, ChatTurn, FinishReason, MessageStatus } from "@/lib/chat/types";
import { chatRequestSchema } from "@/lib/chat/validation";
import {
  countMessages,
  createConversation,
  getConversation,
  getRecentMessages,
  insertMessage,
} from "@/lib/conversations/repository";
import { libraryContextFor } from "@/lib/library/store";
import { liveContextFor } from "@/lib/live";
import { glossFor, invalidateAwaBrain, knownTranslations, knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { ALL_APIS_CUT, flowCutStop, loadFlowCutsForMessage } from "@/lib/ai/flow-cuts";
import { buildDossier } from "@/lib/ai/dossier";
import { extractMemories, type MemoryFact } from "@/lib/ai/memory";
import { getMemories, learnFromMessage, saveMemories } from "@/lib/ai/memory-store";
import { collectUnknownWords } from "@/lib/ai/word-requests";
import { learnWordsFromMessage, teachWords } from "@/lib/ai/words-store";
import { createUnknownTagFilter } from "@/lib/language/unknown-tag";
import { parseTeaching, type TaughtWord, type WordList } from "@/lib/language/teaching";
import { enforceShimaore, fillKnownWords } from "@/lib/language/unknown-words";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { consumeRateLimits, type RateLimitSubject } from "@/lib/rate-limit";
import { usesDemoWallet } from "@/lib/wallet/demo";
import { loadRateLimitPolicies } from "@/lib/rate-limit/settings";
import { getClientIp, hashIdentifier, isSameOrigin } from "@/lib/security/request";
import { isChallenge, isComplexRequest, needsWebSearch } from "@/lib/ai/depth";

export const maxDuration = 120;

const DEVICE_COOKIE = "btm_device";
const MAX_BODY_BYTES = 128 * 1024;
/** Messages d'essai d'un visiteur sans compte (même compteur pour toutes ses conversations). */
const GUEST_TRIAL = [{ name: "anon-trial-30d", limit: CHAT_LIMITS.guestTrialMessages, windowSeconds: 30 * 86_400 }];
/**
 * Essai compté aussi par adresse IP : effacer le cookie ne redonne pas d'essai à l'infini.
 * Large (plusieurs personnes derrière la même box ou le même opérateur mobile).
 */
const GUEST_TRIAL_IP = [{ name: "anon-trial-ip-30d", limit: 30, windowSeconds: 30 * 86_400 }];
/** Attente maximale du relevé du shimaoré à la fin de la réponse, pour annoncer « ✓ Retenu ». */
const LEARN_WAIT_MS = 6_000;
/** Réponse dictée (mode vocal) : de quoi dire trois phrases, pas une page qui retarderait la voix. */
const VOICE_MAX_OUTPUT_TOKENS = 500;
/** Question complexe : de quoi réfléchir et développer la réponse. */
const DEEP_MAX_OUTPUT_TOKENS = 12_000;
/** À l'oral : attente maximale des journaux et offres d'emploi avant de répondre. */
const VOICE_LIVE_WAIT_MS = 1_200;

function errorResponse(status: number, code: ChatErrorCode, headers?: HeadersInit) {
  return NextResponse.json(chatErrorBody(code), { status, headers });
}

function providerErrorCode(error: unknown): ChatErrorCode {
  if (!(error instanceof AIProviderError)) return "internal";
  switch (error.code) {
    case "timeout":
      return "timeout";
    case "overloaded":
    case "rate_limited":
    case "quota":
      return "provider_overloaded";
    default:
      return "provider_error";
  }
}

/** Réponse de Tamilya à une leçon de shimaoré : ce qu'elle a retenu, et les lignes qu'elle n'a pas comprises. */
function lessonReply({ words, rejected }: WordList): string {
  const lines = [
    words.length === 1 ? "C'est noté. J'ai appris ce mot :" : `C'est noté. J'ai appris ces ${words.length} mots :`,
    ...words.slice(0, 30).map((w) => `- ${w.french} → **${w.shimaore}**`),
  ];
  if (words.length > 30) lines.push(`- … et ${words.length - 30} autres`);
  if (rejected.length > 0) {
    lines.push("", "Je n'ai pas compris ces lignes (écris `français = shimaoré`, 80 caractères maximum de chaque côté) :");
    lines.push(...rejected.slice(0, 10).map((line) => `- ${line}`));
  }
  return lines.join("\n");
}

/** Réponse complète envoyée d'un coup, au même format que le flux du modèle. */
function fixedReply(conversationId: string, text: string) {
  const events: ChatStreamEvent[] = [
    { type: "meta", conversationId },
    { type: "delta", text },
    { type: "done", finishReason: "stop" },
  ];
  return new NextResponse(events.map(encodeStreamEvent).join(""), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return errorResponse(403, "invalid_request");
  // Trajet du message, affiché en direct sur /admin/circuit.
  const flow = startFlowTrace();
  const startedAt = Date.now();

  // Liens coupés, session et chaîne d'API ne dépendent pas les uns des autres :
  // lus en même temps (chaque lecture est un aller-retour réseau).
  const authTask = getAuthContext();
  const cutsTask = loadFlowCutsForMessage();
  const aiTask = cutsTask.then((cuts) => getAIProvider(cuts));
  // Quotas en vigueur et cerveau de Tamilya (en cache) : lus pendant le reste.
  const policiesTask = loadRateLimitPolicies();
  const brainTask = loadAwaBrain();
  // Attendues plus bas : pas de rejet non géré si on répond avant.
  authTask.catch(() => {});
  aiTask.catch(() => {});
  policiesTask.catch(() => {});
  brainTask.catch(() => {});

  // 1. Lien coupé sur le schéma de /admin/circuit : le message s'arrête là, Tamilya ne répond pas.
  const cuts = await cutsTask;
  const cutAt = flowCutStop(cuts);
  if (cutAt) {
    flow.step(cutAt, false, "lien coupé");
    return errorResponse(503, "flow_cut");
  }

  // Fournisseur d'IA configuré ? Aucune réponse simulée sinon. Les API coupées sont sautées.
  const ai = await aiTask;
  if (!ai.ok) {
    console.error(`[chat] Fournisseur d'IA non configuré : ${ai.reason}`);
    flow.step("input", false, ai.reason === ALL_APIS_CUT ? "lien coupé" : "aucune API configurée");
    return errorResponse(503, ai.reason === ALL_APIS_CUT ? "flow_cut" : "ai_not_configured");
  }

  // 2. Lecture et validation du corps.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    flow.step("input", false, "message trop lourd");
    return errorResponse(413, "invalid_request");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    flow.step("input", false, "requête illisible");
    return errorResponse(400, "invalid_request");
  }
  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    flow.step("input", false, "message invalide");
    return NextResponse.json(
      chatErrorBody("invalid_request", parsed.error.issues[0]?.message),
      { status: 400 },
    );
  }
  const body = parsed.data;
  flow.step("input", true);

  // 3. Identité et quotas.
  const { supabase, user } = await authTask;
  let deviceId = request.cookies.get(DEVICE_COOKIE)?.value;
  const newDeviceId = !user && (!deviceId || !/^[0-9a-f-]{36}$/.test(deviceId));
  if (newDeviceId) deviceId = randomUUID();

  // Lectures du contexte : simples lectures (RLS), toutes lancées en même temps dès que la
  // personne est connue, pendant la vérification des quotas. Leurs résultats ne servent
  // qu'une fois le message accepté ; les écritures (conversation, message, mémoire) attendent les quotas.
  const conversationTask =
    user && supabase && body.conversationId
      ? Promise.all([
          getConversation(supabase, body.conversationId),
          countMessages(supabase, body.conversationId),
          getRecentMessages(supabase, body.conversationId, CHAT_LIMITS.historyFetchLimit),
        ])
      : null;
  conversationTask?.catch(() => {});
  // Profil lu une seule fois : personnalité de Tamilya (jamais fournie par le client) et adresse
  // du compte (« près de chez moi » : bureau du code le plus proche…).
  const noProfile: Awaited<ReturnType<typeof readChatProfile>> = { personality: undefined, home: null };
  const profileTask =
    user && supabase ? readChatProfile(supabase, user.id).catch(() => noProfile) : Promise.resolve(noProfile);
  // Une seule personnalité pour tout le monde (professionnelle), réglée depuis /admin, en cache.
  const personalityInstructionsTask = loadPersonalityInstructions(DEFAULT_PERSONALITY);
  personalityInstructionsTask.catch(() => {});
  // Mémoire de Tamilya déjà enregistrée (les faits de ce message s'y ajoutent plus bas).
  const storedMemoriesTask =
    user && supabase
      ? getMemories(supabase).catch((error: unknown) => {
          console.error("[chat] Mémoire indisponible (migration awa_brain appliquée ?)", error);
          return [] as MemoryFact[];
        })
      : Promise.resolve([] as MemoryFact[]);
  // Dossier : ce que la personne a fait sur le site (réservations du code…), pour que Tamilya le remarque d'elle-même.
  const dossierTask =
    user && supabase
      ? usesDemoWallet(user)
          .then((demo) => buildDossier(supabase, user.id, Date.now(), { demo }))
          .catch((error: unknown) => {
          console.error("[chat] Dossier indisponible", error);
          return null;
        })
      : Promise.resolve(null);
  // Offres d'emploi et actu de Mayotte, seulement si le message en parle (mode maître compris).
  const liveTask = liveContextFor(body.message, { maxWaitMs: body.voice ? VOICE_LIVE_WAIT_MS : undefined }).catch(() => null);
  // Bibliothèque Mayotte : passages proches du message (1,5 s au plus, jamais bloquant).
  const libraryTask = body.voice ? Promise.resolve(null) : libraryContextFor(body.message).catch(() => null);
  // Commande de repas et tickets de barge ouverts à ce compte ? Dernière commande (cookie signé).
  const foodTask = canOrderFood(user).catch(() => false);
  const bargeTask = canBuyBargeTickets(user).catch(() => false);
  const lastOrderTask = user
    ? readLastOrder(user.id)
        .then((order) => (order ? describeOrder(order) : null))
        .catch(() => null)
    : Promise.resolve(null);

  // Le maître de Tamilya (administrateur) lui parle sans quota.
  if (!user?.isAdmin) {
    try {
      const clientIp = getClientIp(request.headers);
      const policies = await policiesTask;
      const subjects: RateLimitSubject[] = user
        ? [{ key: user.id, rules: policies.user }]
        : [
            { key: hashIdentifier(`device:${deviceId}`), rules: policies.anonymousDevice },
            { key: hashIdentifier(`ip:${clientIp}`), rules: policies.anonymousIp },
          ];
      const decision = await consumeRateLimits(subjects);
      if (!decision.allowed) {
        flow.step("guard", false, "quota de messages atteint");
        return errorResponse(429, "rate_limited", {
          "Retry-After": String(decision.retryAfterSeconds),
        });
      }
      // Essai sans compte : 5 messages par appareil (30 jours), toutes conversations confondues, et
      // au plus 30 par adresse IP, puis compte obligatoire. Compté après les autres limites : un
      // message refusé pour « trop vite » ne coûte pas un message d'essai. (Pas en même temps : un
      // compteur consommé ne se rend pas, l'essai serait perdu sur un refus.)
      if (!user) {
        const trial = await consumeRateLimits([
          { key: hashIdentifier(`trial:${deviceId}`), rules: GUEST_TRIAL },
          { key: hashIdentifier(`trial-ip:${clientIp}`), rules: GUEST_TRIAL_IP },
        ]);
        if (!trial.allowed) {
          flow.step("guard", false, "essai sans compte terminé");
          return errorResponse(403, "signup_required");
        }
      }
    } catch (error) {
      console.error("[chat] Limitation de débit indisponible", error);
      flow.step("guard", false, "limitation de débit indisponible");
      return errorResponse(503, "service_unavailable");
    }
  }
  flow.step("guard", true);

  // 4. Construction du contexte.
  let history: ChatTurn[];
  let conversationId: string | null = null;
  // Nouvelle conversation : son titre (le sujet en quelques mots) est donné par l'IA après la première réponse.
  let newConversation = false;
  let memories: MemoryFact[] = [];
  // Message de la personne : enregistré pendant que le modèle répond (attendu
  // avant d'enregistrer la réponse, pour garder l'ordre).
  let userMessageSaved: Promise<unknown> = Promise.resolve();

  if (user && supabase) {
    // Mémoire de Tamilya : ce que la personne dit d'elle (prénom, lieu…) est enregistré sans
    // attendre, et ajouté tout de suite à la mémoire lue : il sert dès cette réponse.
    const facts = extractMemories(body.message);
    if (facts.length > 0) {
      const saved = saveMemories(supabase, user.id, facts).catch((error: unknown) =>
        console.error("[chat] Mémoire non enregistrée (migration awa_brain appliquée ?)", error),
      );
      after(() => saved);
    }

    try {
      if (body.conversationId) {
        // RLS : une conversation d'un autre utilisateur est simplement introuvable
        // (le comptage et l'historique sont alors vides).
        const [conversation, count, recent] = await conversationTask!;
        if (!conversation) {
          flow.step("prompt", false, "conversation introuvable");
          return errorResponse(404, "not_found");
        }
        if (count >= CHAT_LIMITS.conversationMaxMessages && !user.isAdmin) {
          flow.step("prompt", false, "conversation trop longue");
          return errorResponse(409, "conversation_too_long");
        }
        conversationId = conversation.id;
        history = recent;
      } else {
        const created = await createConversation(
          supabase,
          user.id,
          quickTitle(body.message),
        );
        conversationId = created.id;
        newConversation = true;
        history = [];
      }
      userMessageSaved = insertMessage(supabase, {
        conversationId,
        userId: user.id,
        role: "user",
        content: body.message,
      }).catch((error: unknown) => console.error("[chat] Message de la personne non enregistré", error));
    } catch (error) {
      console.error("[chat] Erreur base de données", error);
      flow.step("prompt", false, "base de données indisponible");
      return errorResponse(500, "internal");
    }

    // Leçon de shimaoré d'un administrateur (« apprends » + lignes « français = shimaoré ») :
    // enregistrée directement dans le dictionnaire, sans passer par le modèle.
    const lesson = user.isAdmin ? parseTeaching(body.message) : null;
    if (lesson && conversationId) {
      let reply: string;
      try {
        await teachWords(supabase, user.id, lesson.words);
        invalidateAwaBrain();
        reply = lessonReply(lesson);
        flow.step("prompt", true, "leçon de shimaoré");
        flow.step("output", true);
      } catch (error) {
        console.error("[chat] Leçon non enregistrée", error);
        reply = "Je n'ai pas réussi à enregistrer ces mots. Le dictionnaire est indisponible : réessaie plus tard.";
        flow.step("prompt", false, "leçon non enregistrée");
      }
      try {
        await userMessageSaved;
        await insertMessage(supabase, { conversationId, userId: user.id, role: "assistant", content: reply });
      } catch (error) {
        console.error("[chat] Impossible d'enregistrer la réponse", error);
      }
      return fixedReply(conversationId, reply);
    }

    memories = mergeMemories(facts, await storedMemoriesTask);
  } else {
    if (body.conversationId) {
      flow.step("prompt", false, "session expirée");
      return errorResponse(401, "unauthorized");
    }
    history = body.history ?? [];
    if (history.length >= CHAT_LIMITS.anonymousMaxMessages) {
      flow.step("prompt", false, "conversation trop longue");
      return errorResponse(409, "conversation_too_long");
    }
  }

  const [brain, { home }, personalityInstructions, live, library, dossier, foodOrdering, bargeTickets, foodOrder] =
    await Promise.all([
      brainTask,
      profileTask,
      personalityInstructionsTask,
      liveTask,
      libraryTask,
      dossierTask,
      foodTask,
      bargeTask,
      lastOrderTask,
    ]);

  // Mode maître (administrateur) : Tamilya ne parle que shimaoré. Ses anciennes
  // réponses sont nettoyées elles aussi, pour que le modèle ne recopie pas son
  // français, et les [[mots]] traduits depuis sont remplacés par le shimaoré appris.
  // Mode maître (shimaoré uniquement) seulement quand l'administrateur allume la leçon :
  // automatique, il bridait toutes ses conversations (elle refusait le français).
  const master = Boolean(user?.isAdmin) && body.shimaoreLesson === true;
  // Raisonnement adaptatif (règles, sans appel en plus) : réflexion profonde et recherche Google
  // seulement quand le message le mérite. Pas à l'oral, où la vitesse prime.
  // Réponse contestée : Tamilya vérifie (réflexion et recherche), même sur un message très court.
  const challenged = !master && history.length > 0 && isChallenge(body.message);
  const deep = !body.voice && (challenged || isComplexRequest(body.message));
  const search = !body.voice && (challenged || needsWebSearch(body.message));
  const known = master ? knownTranslations(brain) : new Map<string, string>();
  const toShimaore = (reply: string) => fillKnownWords(enforceShimaore(reply), known);
  const messages: ChatTurn[] = [
    ...buildModelHistory(
      master ? history.map((turn) => (turn.role === "assistant" ? { ...turn, content: toShimaore(turn.content) } : turn)) : history,
      CHAT_LIMITS.modelContextMaxChars,
    ),
    { role: "user", content: body.message },
  ];
  // Plusieurs articles d'un coup : Tamilya compose le panier, à la place de la commande simple.
  const foodGroup = foodOrdering && !body.voice ? detectGroupOrder(body.message) : null;
  // Demande de repas reconnue ici, sans attendre le modèle : la commande s'ouvre à coup sûr.
  const foodQuery =
    foodOrdering && !body.voice && !foodGroup
      ? detectFoodOrder(
          body.message,
          history.filter((turn) => turn.role === "user").map((turn) => turn.content).reverse(),
          FOOD_CATALOG,
        )
      : null;
  // Demande de ticket de barge reconnue ici : l'achat s'ouvre à coup sûr.
  const bargeIntent = bargeTickets && !body.voice ? detectBargeTicket(body.message) : null;
  // Demande de devis BTM (mur, dalle…) reconnue ici : le devis s'ouvre à coup sûr.
  const btmDevis = !body.voice && detectBtmDevis(body.message) ? btmDevisSpec(body.message) : null;
  // Trajet demandé (« combien de temps de chez moi à la CSSM ») : la carte du trajet s'ouvre à coup sûr (compte requis).
  const trip = user && !body.voice && !foodQuery && !foodGroup && !btmDevis ? detectTrip(body.message) : null;
  // Cyclones demandés (« il y a un cyclone ? ») : la carte des cyclones s'ouvre à coup sûr.
  const cyclone = !body.voice && detectCyclone(body.message);
  // Chanson demandée (« chante-moi quelque chose ») : Tamilya écrit une chanson, chantée sous son message.
  const song = !body.voice && detectSong(body.message);
  // Lecture en 3D demandée (« lis-moi cette page », ou demandée juste avant et le texte arrive) :
  // essai réservé aux administrateurs.
  // Ses deux derniers messages : « en vocal » peut suivre une histoire collée un peu plus haut.
  const previousAsks = [...history].reverse().filter((turn) => turn.role === "user").map((turn) => turn.content).slice(0, 2);
  const reading = Boolean(user?.isAdmin) && !body.voice && isReadingRequest(body.message, previousAsks);
  // Texte écrit ou collé (dans ce message ou les deux précédents) : lu tel quel, sans photo.
  const readingSource = reading ? readingText(body.message, previousAsks) : null;
  // Demande d'attestation d'hébergement reconnue ici : le formulaire s'ouvre à coup sûr.
  // « Mets mes infos » juste après l'ouverture : c'est la même attestation.
  const attestationOpen = history.slice(-4).some((turn) => turn.role === "assistant" && turn.content.includes(ATTESTATION_BLOCK));
  const attestation = !body.voice && (detectAttestation(body.message) || (attestationOpen && wantsOwnInfo(body.message)));
  // Jour voulu pour le code (« demain », « vendredi matin ») : calculé ici, les modèles se trompent de date.
  const codeWhen = parseCodeExamWhen(body.message);
  const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
    personalityInstructions,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, DEFAULT_PERSONALITY, body.message),
    grammar: brain.grammar,
    words: wordsFor(brain, body.message, master),
    gloss: glossFor(brain, body.message),
    knowledge: knowledgeFor(brain, body.message),
    live,
    library,
    memories,
    dossier,
    teacher: master,
    voice: body.voice,
    voiceCall: Boolean(user?.isAdmin),
    // Elle réfléchit plus, mais répond court : pas de longue réponse structurée à « c'est faux ».
    deep: deep && !challenged,
    challenged,
    search,
    reportUnknownWords: true,
    home,
    foodOrdering,
    foodQuery,
    foodGroup,
    bargeTickets,
    bargeIntent,
    bargeSpec: bargeIntent === "buy" ? bargeSpec(body.message) : undefined,
    btmDevisOffer: true,
    btmDevis,
    trip,
    cyclone,
    song,
    reading: reading ? (readingSource ? "texte" : "photo") : undefined,
    readingOffer: Boolean(user?.isAdmin),
    attestationOffer: true,
    attestation,
    codeExamDay: codeWhen.day ? formatWhenDay(codeWhen.day) : null,
    foodOrder,
  });
  flow.step("prompt", true);
  // Mesures de vitesse, écrites dans les journaux du serveur en fin de réponse.
  const contextMs = Date.now() - startedAt;
  let firstTextMs: number | null = null;

  // Mémoire à long terme : une fois la réponse envoyée, le modèle dit ce qu'il
  // faut retenir de ce message, et c'est Supabase qui le garde. Avec un
  // administrateur, il relève aussi le shimaoré enseigné dans la conversation.
  // Avec le maître, le relevé du shimaoré part tout de suite, en parallèle de la réponse :
  // les mots retenus s'affichent sous la réponse (« ✓ Retenu »), il sait que Tamilya a appris.
  let learning: Promise<TaughtWord[]> | null = null;
  if (user && supabase) {
    const previousReply = [...history].reverse().find((turn) => turn.role === "assistant")?.content ?? null;
    // Avec le maître, un seul appel de fond : le relevé du shimaoré (sa mémoire passe par extractMemories).
    if (user.isAdmin) {
      learning = learnWordsFromMessage(supabase, user.id, ai.provider, { message: body.message, previousReply }).catch((error: unknown) => {
        console.error("[chat] Leçon de shimaoré non enregistrée", error);
        return [];
      });
      const pending = learning;
      after(() => pending);
    }
    if (!master) {
      after(() =>
        learnFromMessage(supabase, user.id, ai.provider, { message: body.message, previousReply, memories }).catch((error: unknown) =>
          console.error("[chat] Apprentissage de fond non enregistré", error),
        ),
      );
    }
  }

  // 5. Génération en flux. L'arrêt côté client ou le délai maximal annulent l'appel.
  const abort = new AbortController();
  const timeout = AbortSignal.timeout(ai.config.timeoutMs);
  const signal = AbortSignal.any([abort.signal, request.signal, timeout]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
        } catch {
          // Flux déjà fermé (client parti).
        }
      };

      let text = "";
      let webSources: { title: string; url: string }[] = [];
      let status: MessageStatus = "complete";
      let finish: FinishReason = "other";
      // API qui a pris le message : la réponse part d'elle vers la sortie.
      let answeredBy: string | null = null;

      if (conversationId) send({ type: "meta", conversationId });

      // Hors mode maître : la balise des mots shimaoré inconnus (« <<inconnu: …>> »)
      // est retirée du flux ; les mots partent dans la liste « À traduire » de l'admin.
      const tagFilter = createUnknownTagFilter();
      // Mode vocal : chaque phrase terminée part à la voix sans attendre la fin
      // (en mode maître, déjà corrigée comme le sera la réponse enregistrée).
      const sentences = body.voice ? createSentenceSplitter() : null;
      const speakSentences = (list: string[]) => {
        for (const sentence of list) send({ type: "speech", text: master ? toShimaore(sentence) : sentence });
      };
      const speak = (piece: string) => {
        if (sentences && piece) speakSentences(sentences.push(piece));
      };
      let shown = "";
      let tagClosed = false;
      const closeTag = () => {
        if (master || tagClosed) return;
        tagClosed = true;
        const { rest, words } = tagFilter.end();
        if (rest) {
          shown += rest;
          send({ type: "delta", text: rest });
          speak(rest);
        }
        text = shown.trimEnd();
        const known = [...brain.lexicon, ...brain.words].map((entry) => entry.shimaore);
        after(() =>
          collectUnknownWords(ai.provider, { message: body.message, tagged: words, known }).catch((error: unknown) =>
            console.error("[chat] Mots inconnus non signalés", error),
          ),
        );
      };

      // Mode maître : la réponse s'affiche en direct, puis sa version corrigée en
      // entier (enforceShimaore) la remplace à la fin ; c'est elle qui est enregistrée.
      let flushed = false;
      const flush = () => {
        if (!master || flushed || !text) return;
        flushed = true;
        text = toShimaore(text);
        send({ type: "replace", text });
      };

      // Chronométrage du vocal (journaux du serveur) : préparation avant l'appel au modèle.
      const modelStartMs = Date.now() - startedAt;
      try {
        for await (const chunk of ai.provider.stream({
          system,
          messages,
          persona: true,
          fast: body.voice,
          deep,
          search,
          // Réflexion approfondie : les « pensées » comptent dans la limite, on la relève pour ne pas couper la réponse.
          maxOutputTokens: body.voice
            ? Math.min(ai.config.maxOutputTokens, VOICE_MAX_OUTPUT_TOKENS)
            : deep
              ? Math.max(ai.config.maxOutputTokens, DEEP_MAX_OUTPUT_TOKENS)
              : ai.config.maxOutputTokens,
          signal,
          onAttempt: (slotId, error) => {
            if (!error) answeredBy = slotId;
            flow.step(`model-${slotId}`, !error, error ? (AI_ERROR_LABELS[error] ?? error) : undefined);
          },
        })) {
          if (chunk.type === "text") {
            if (firstTextMs === null) {
              firstTextMs = Date.now() - startedAt;
              if (body.voice) {
                send({ type: "timing", firstTokenMs: firstTextMs });
                console.info(`[vocal] préparation ${modelStartMs} ms, premier mot ${firstTextMs} ms (modèle ${firstTextMs - modelStartMs} ms)`);
              }
            }
            text += chunk.text;
            if (!master) {
              const visible = tagFilter.push(chunk.text);
              shown += visible;
              if (visible) send({ type: "delta", text: visible });
              speak(visible);
            } else {
              send({ type: "delta", text: chunk.text });
              speak(chunk.text);
            }
          } else if (chunk.type === "sources") {
            webSources = chunk.sources;
          } else if (chunk.type === "finish") {
            finish = chunk.reason;
          }
        }

        flush();
        closeTag();
        if (sentences) speakSentences(sentences.end());
        // Sources de la recherche Google, sous la réponse (affichées et enregistrées avec elle).
        if (webSources.length && text) {
          const list = `\n\n**Sources** : ${webSources.map((s) => `[${s.title.replace(/[\[\]]/g, "")}](${s.url})`).join(" · ")}`;
          text += list;
          send({ type: "delta", text: list });
        }
        // Filet de sécurité : demande de repas reconnue mais pas de bloc dans la réponse (petit modèle, mode maître) : on l'ajoute.
        if (foodQuery && text && !text.includes("```commande-repas")) {
          const block = foodBlock(foodQuery);
          text += block;
          send({ type: "delta", text: block });
        }
        if (foodGroup && text && !text.includes("```" + GROUP_BLOCK)) {
          const block = groupBlock(foodGroup);
          text += block;
          send({ type: "delta", text: block });
        }
        // Ticket de barge demandé mais pas de bloc dans la réponse : on l'ajoute.
        if (bargeIntent === "buy" && text && !text.includes("```" + BARGE_BLOCK)) {
          const block = bargeBlockFor(body.message);
          text += block;
          send({ type: "delta", text: block });
        }
        // Devis BTM demandé mais pas de bloc dans la réponse : on l'ajoute.
        if (btmDevis && text && !text.includes("```" + BTM_DEVIS_BLOCK)) {
          const block = btmDevisBlockFor(body.message);
          text += block;
          send({ type: "delta", text: block });
        }
        // Trajet demandé mais pas de bloc dans la réponse : on l'ajoute.
        if (trip && text && !text.includes("```" + TRIP_BLOCK)) {
          const block = tripBlock(trip);
          text += block;
          send({ type: "delta", text: block });
        }
        // Cyclones demandés mais pas de bloc dans la réponse : on l'ajoute.
        if (cyclone && text && !text.includes("```" + CYCLONE_BLOCK)) {
          const block = cycloneBlock();
          text += block;
          send({ type: "delta", text: block });
        }
        // Attestation demandée mais pas de bloc dans la réponse : on l'ajoute.
        if (attestation && text && !text.includes("```" + ATTESTATION_BLOCK)) {
          text += attestationBlock;
          send({ type: "delta", text: attestationBlock });
        }
        // Lecture en 3D : le texte à lire est glissé dans le bloc par le serveur (Tamilya n'a pas à le recopier) ;
        // bloc ajouté s'il manque.
        if (reading && text) {
          const withBlock = withReadingBlock(text, readingSource);
          if (withBlock !== text) {
            text = withBlock;
            send({ type: "replace", text });
          }
        }
        // Jour et moment demandés (« demain matin ») : inscrits dans le bloc des créneaux, qui s'ouvre sur ce jour.
        if (codeWhen.day || codeWhen.moment) {
          const withWhen = addWhenToBlock(text, codeWhen);
          if (withWhen !== text) {
            text = withWhen;
            send({ type: "replace", text });
          }
        }
        if (finish === "refusal" && !text) {
          status = "error";
          flow.step("output", false, "refus du modèle");
          send({ type: "error", code: "refusal", message: chatErrorBody("refusal").error.message });
        } else {
          if (finish === "length") status = "interrupted";
          flow.step("output", true);
          // Mots appris dans ce message : attendus quelques secondes au plus (sinon, ils s'enregistrent quand même, sans l'annonce).
          if (learning) {
            const learned = await Promise.race([learning, new Promise<TaughtWord[]>((resolve) => setTimeout(() => resolve([]), LEARN_WAIT_MS))]);
            if (learned.length) send({ type: "learned", words: learned.slice(0, 20) });
          }
          send({ type: "done", finishReason: finish });
        }
      } catch (error) {
        const clientGone = abort.signal.aborted || request.signal.aborted;
        if (clientGone) {
          status = "interrupted";
          if (answeredBy) flow.step("output", false, "arrêtée par l'utilisateur");
        } else {
          const code = timeout.aborted ? "timeout" : providerErrorCode(error);
          console.error(`[chat] Erreur du fournisseur (${code})`, error);
          // Toutes les API en échec : le blocage est déjà montré sur chacune.
          if (answeredBy) flow.step("output", false, code === "timeout" ? "réponse trop lente" : "réponse interrompue");
          flush();
          closeTag();
          status = text ? "interrupted" : "error";
          send({ type: "error", code, message: chatErrorBody(code).error.message });
        }
      } finally {
        if (master && !flushed) text = toShimaore(text);
        closeTag();
        console.info(
          `[chat] vitesse : contexte ${contextMs} ms, premier mot ${firstTextMs ?? "—"} ms, total ${Date.now() - startedAt} ms (${answeredBy ?? "aucune API"})`,
        );
        if (user && supabase && conversationId) {
          try {
            await userMessageSaved;
            await insertMessage(supabase, {
              conversationId,
              userId: user.id,
              role: "assistant",
              content: text.slice(0, CHAT_LIMITS.maxStoredMessageChars),
              status,
            });
          } catch (error) {
            console.error("[chat] Impossible d'enregistrer la réponse", error);
          }
          if (newConversation && text && status !== "error") {
            const id = conversationId;
            after(() =>
              nameConversation(supabase, ai.provider, id, { message: body.message, reply: text }).catch((error: unknown) =>
                console.error("[chat] Titre de la conversation non généré", error),
              ),
            );
          }
        }
        try {
          controller.close();
        } catch {
          // Déjà fermé.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  const response = new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "Server-Timing": `context;dur=${contextMs}`,
    },
  });

  if (newDeviceId && deviceId) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
