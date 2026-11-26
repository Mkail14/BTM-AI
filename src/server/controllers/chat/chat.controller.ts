import { randomUUID } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { AIProviderError, buildSystemPrompt, getAIProvider } from "@/server/services/ai";
import { getAuthContext } from "@/server/middlewares/session";
import { canOrderFood } from "@/server/services/food/access";
import { canBuyBargeTickets } from "@/server/services/barge/access";
import { CYCLONE_BLOCK, cycloneBlock, cycloneZoneFor, detectCyclone } from "@/lib/cyclone/intent";
import { ISLAND_FACTS, PLACE_BLOCK, detectPlace, placeBlock } from "@/lib/mayotte/place-intent";
import { describeTown } from "@/lib/mayotte/towns";
import { communePopulation } from "@/server/services/live/communes";
import { WATER_BLOCK, detectWater, followsWater, waterBlock } from "@/lib/water/intent";
import { waterContext } from "@/server/services/water/context";
import { detectJobs, fixJobsSpec, JOBS_BLOCK, jobsBlock, jobsSpecOf, jobsTownFor, matchJobs } from "@/lib/emploi/intent";
import { getMayotteJobs, jobsSources } from "@/server/services/live/jobs";
import { detectEvents, detectIdle, EVENTS_BLOCK, eventLine, eventsBlock } from "@/lib/emploi/events";
import { eventsConfigured, getMayotteEvents } from "@/server/services/live/events";

/** Événements emploi : attente maximale (gardés 30 min, c'est presque toujours instantané) et nombre donné au prompt. */
const EVENTS_WAIT_MS = 3_000;
/** Habitants de la commune d'un lieu demandé (« c'est où Chiconi ? ») : attendus 2 s au plus, sinon la réponse part sans. */
const PLACE_INFO_WAIT_MS = 2_000;
const EVENTS_IN_PROMPT = 6;
/** Offres d'emploi données au prompt (celles de la commune demandée, sinon les plus récentes). */
const JOBS_IN_PROMPT = 40;
import { detectSong } from "@/lib/music/intent";
import { readingMode, withSceneBlock } from "@/lib/lecture/intent";
import { BARGE_BLOCK, bargeBlockFor, bargeSpec, detectBargeTicket } from "@/lib/barge/intent";
import { userFeatures } from "@/server/services/site/features";
import { ATTESTATION_BLOCK, attestationBlock, detectAttestation, wantsOwnInfo } from "@/lib/attestation/intent";
import { detectDocumentTask, DOCUMENT_BLOCK, documentBlock } from "@/lib/document-signe/intent";
import { BTM_DEVIS_BLOCK, btmDevisBlockFor, btmDevisSpec, detectBtmDevis } from "@/lib/btm/intent";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { GROUP_BLOCK, groupBlock } from "@/lib/food/group-block";
import { detectFoodOrder, detectGroupOrder, foodBlock } from "@/lib/food/intent";
import { detectTrip, TRIP_BLOCK, tripBlock } from "@/lib/trip/intent";
import { addWhenToBlock, formatWhenDay, parseCodeExamWhen } from "@/lib/code-exam/when";
import { describeOrder, readLastOrder } from "@/server/services/food/last-order";
import { chatErrorBody } from "@/lib/chat/errors";
import { mergeMemories } from "@/lib/chat/memories";
import { readChatProfile } from "@/server/services/chat/profile";
import { buildModelHistory } from "@/lib/chat/history";
import { quickTitle } from "@/lib/chat/title";
import { nameConversation } from "@/server/services/ai/title";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { createSentenceSplitter } from "@/lib/chat/sentences";
import { encodeStreamEvent } from "@/lib/chat/stream-protocol";
import type { ChatErrorCode, ChatStreamEvent, ChatTurn, FinishReason, MessageStatus } from "@/lib/chat/types";
import { CHAT_ATTACHMENT_MAX_BYTES, withAttachmentLabel } from "@/lib/chat/attachment";
import { chatRequestSchema } from "@/lib/chat/validation";
import {
  countMessages,
  createConversation,
  getConversation,
  getRecentMessages,
  insertMessage,
} from "@/server/models/conversations.model";
import { liveContextFor } from "@/server/services/live";
import { companyAsk } from "@/server/services/live/companies";
import { directoryFor } from "@/server/services/entreprises/listings";
import { glossFor, invalidateTamilyaBrain, knownTranslations, knowledgeFor, lexiconFor, loadTamilyaBrain, wordsFor } from "@/server/services/ai/brain";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { isSmallTalk } from "@/lib/ai/small-talk";
import { needsWebSearch } from "@/lib/ai/web-intent";
import { searchBlock, searchWeb } from "@/server/services/search/web";
import { startFlowTrace } from "@/server/services/ai/flow-trace";
import { ALL_APIS_CUT, flowCutStop, loadFlowCutsForMessage } from "@/server/services/ai/flow-cuts";
import { buildDossier } from "@/server/services/ai/dossier";
import { extractMemories, type MemoryFact } from "@/lib/ai/memory";
import { describeMemoryUpdates, getMemories, isMemoryOn, learnFromMessage, newMemoryUpdates, saveMemories } from "@/server/services/ai/memory-store";
import { getPastTalks } from "@/server/services/ai/past-talks-store";
import { withRecentReplies } from "@/lib/ai/past-talks";
import { collectUnknownWords, reportWordConflicts } from "@/server/services/ai/word-requests";
import { collectDoubts } from "@/server/services/ai/doubts";
import { reviewShimaore } from "@/server/services/ai/review";
import { learnWordsFromMessage, teachWords } from "@/server/services/ai/words-store";
import { createUnknownTagFilter } from "@/lib/language/unknown-tag";
import { parseTeaching, type TaughtWord, type WordList } from "@/lib/language/teaching";
import { enforceShimaore, fillKnownWords } from "@/lib/language/unknown-words";
import { isShimaoreTranslationRequest } from "@/lib/language/translate-request";
import { phraseToTranslate } from "@/lib/language/compose";
import { composeShimaore } from "@/server/services/ai/compose";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/server/services/ai/personality-store";
import { consumeRateLimits, type RateLimitSubject } from "@/server/middlewares/rate-limit";
import { usesDemoWallet } from "@/server/services/wallet/demo";
import { loadRateLimitPolicies } from "@/server/middlewares/rate-limit/settings";
import { getClientIp, hashIdentifier, isSameOrigin } from "@/server/middlewares/request";
import { isChallenge, isComplexRequest } from "@/lib/ai/depth";
import { planTeam } from "@/lib/ai/agents/plan";
import { AGENT_LABELS, runTeam, teamBlock, teamSummary } from "@/lib/ai/agents/team";
import { mayotteClock } from "@/lib/ai/clock";
import { understand } from "@/lib/ai/understanding";
import { getLandingDemo } from "@/server/services/site/landing-demo";
import { mentionsLanding } from "@/lib/site/landing-demo-script";
import { adminSelfReport } from "@/server/services/ai/self-report";

const DEVICE_COOKIE = "btm_device";
/** Texte et historique (128 Ko), plus une photo ou un PDF joint, en base64. */
const MAX_BODY_BYTES = 128 * 1024 + Math.ceil(CHAT_ATTACHMENT_MAX_BYTES / 3) * 4;
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
/** Recherche sur internet faite avant la réponse : au-delà, Tamilya répond sans (son outil reste là). */
const WEB_WAIT_MS = 4_500;

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
  const flow = startFlowTrace("platform");
  const startedAt = Date.now();

  // Liens coupés, session et chaîne d'API ne dépendent pas les uns des autres :
  // lus en même temps (chaque lecture est un aller-retour réseau).
  const authTask = getAuthContext();
  const cutsTask = loadFlowCutsForMessage();
  const aiTask = cutsTask.then((cuts) => getAIProvider(cuts));
  // Quotas en vigueur et cerveau de Tamilya (en cache) : lus pendant le reste.
  const policiesTask = loadRateLimitPolicies();
  const brainTask = loadTamilyaBrain();
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
  // Mémoire coupée dans les Paramètres : Tamilya ne lit ni n'ajoute de souvenirs.
  const memoryOnTask = user && supabase ? isMemoryOn(supabase) : Promise.resolve(false);
  // Mémoire de Tamilya déjà enregistrée (les faits de ce message s'y ajoutent plus bas).
  const storedMemoriesTask =
    user && supabase
      ? getMemories(supabase).catch((error: unknown) => {
          console.error("[chat] Mémoire indisponible (migration awa_brain appliquée ?)", error);
          return [] as MemoryFact[];
        })
      : Promise.resolve([] as MemoryFact[]);
  // Anciennes discussions : de quoi elle se souvient, et ses derniers débuts de réponse à ne pas redire.
  const pastTalksTask =
    user && supabase
      ? getPastTalks(supabase, user.id, { excludeId: body.conversationId }).catch((error: unknown) => {
          console.error("[chat] Anciennes discussions indisponibles", error);
          return null;
        })
      : Promise.resolve(null);
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
  // Demande d'information (qui, quel, prix, horaire…, voir web-intent.ts) : le serveur cherche sur internet tout de suite,
  // pendant que le reste se prépare, et donne les résultats à Tamilya (les petits modèles oublient leur outil de recherche).
  const webStartedAt = Date.now();
  const webTask =
    !body.voice && needsWebSearch(body.message)
      ? Promise.race([searchWeb(body.message, request.signal), new Promise<null>((resolve) => setTimeout(() => resolve(null), WEB_WAIT_MS))]).catch(() => null)
      : Promise.resolve(null);
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
  let memoryOn = false;
  // Ce que Tamilya retient de ce message (« Mémoire mise à jour » sous la réponse).
  let remembered: string[] = [];
  // Message de la personne : enregistré pendant que le modèle répond (attendu
  // avant d'enregistrer la réponse, pour garder l'ordre).
  let userMessageSaved: Promise<unknown> = Promise.resolve();

  if (user && supabase) {
    // Mémoire de Tamilya : ce que la personne dit d'elle (prénom, lieu…) est enregistré sans
    // attendre, et ajouté tout de suite à la mémoire lue : il sert dès cette réponse.
    const facts = extractMemories(body.message);
    if (facts.length > 0) {
      const saved = memoryOnTask
        .then((on) => (on ? saveMemories(supabase, user.id, facts) : undefined))
        .catch((error: unknown) => console.error("[chat] Mémoire non enregistrée (migration awa_brain appliquée ?)", error));
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
        // Photo ou PDF joint : son nom reste dans la conversation, pas son contenu.
        content: withAttachmentLabel(body.message, body.attachment?.name),
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
        invalidateTamilyaBrain();
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

    memoryOn = await memoryOnTask;
    if (memoryOn) {
      const stored = await storedMemoriesTask;
      remembered = describeMemoryUpdates(stored, newMemoryUpdates(stored, facts));
      memories = mergeMemories(facts, stored);
    }
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

  const [brain, { home }, personalityInstructions, live, dossier, foodOrdering, bargeTickets, foodOrder] =
    await Promise.all([
      brainTask,
      profileTask,
      personalityInstructionsTask,
      liveTask,
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
  // « Comment on dit … » : le moteur prépare la phrase et vérifie chaque mot, pendant que le reste se prépare.
  const howToSay = !master && !body.voice && !body.attachment ? phraseToTranslate(body.message) : null;
  const compositionTask = howToSay ? composeShimaore(ai.provider, brain, howToSay) : Promise.resolve(null);
  // Raisonnement adaptatif (règles, sans appel en plus) : réflexion profonde et recherche Google
  // seulement quand le message le mérite. Pas à l'oral, où la vitesse prime.
  // Réponse contestée : Tamilya vérifie (réflexion et recherche), même sur un message très court.
  const challenged = !master && history.length > 0 && isChallenge(body.message);
  // Compréhension (src/lib/ai/understanding.ts) : message remis au propre (fautes, abréviations, familier) et
  // suite rattachée à la demande précédente. Sert à choisir ce qu'on va chercher, pas à réécrire le message du modèle.
  const understood = master ? null : understand(body.message, history);
  const follows = understood?.followUp ? understood.previousAsks[0] : undefined;
  const asked = understood?.cleaned ?? body.message;
  const deep = !body.voice && (challenged || isComplexRequest(asked) || (follows !== undefined && isComplexRequest(follows)));
  // Internet toujours ouvert à l'écrit : c'est Tamilya qui décide de chercher (comme les autres IA), plus une liste de mots.
  // Fermé pendant la leçon de shimaoré, où elle n'a rien à chercher dehors.
  // Petit message de politesse (bonjour, merci, ça va…) : rien à chercher, la réponse part tout de suite.
  const search = !body.voice && !master && !isSmallTalk(body.message);
  // Suite (« et à Dembéni ? ») ou message à fautes : les infos du moment sont cherchées sur le texte remis au propre,
  // avec la demande précédente. Les messages clairs gardent la recherche lancée au départ.
  const liveContext =
    understood && understood.retrieval !== body.message
      ? await liveContextFor(understood.retrieval, { maxWaitMs: body.voice ? VOICE_LIVE_WAIT_MS : undefined })
          .then((found) => found ?? live)
          .catch(() => live)
      : live;
  const known = master ? knownTranslations(brain) : new Map<string, string>();
  const toShimaore = (reply: string) => fillKnownWords(enforceShimaore(reply), known);
  const messages: ChatTurn[] = [
    ...buildModelHistory(
      master ? history.map((turn) => (turn.role === "assistant" ? { ...turn, content: toShimaore(turn.content) } : turn)) : history,
      CHAT_LIMITS.modelContextMaxChars,
    ),
    // Photo ou PDF joint par le « + » (compte connecté) : lu par le modèle avec la question.
    { role: "user", content: body.message, ...(user && body.attachment ? { attachment: body.attachment } : {}) },
  ];
  // Traduction en shimaoré demandée par un administrateur : Tamilya essaie tout le texte, sans équipe d'agents.
  const composition = await compositionTask;
  // Phrase courte préparée par le moteur : elle prend la place de la traduction libre.
  const shimaoreTranslation = Boolean(user?.isAdmin) && !master && !body.voice && !composition && isShimaoreTranslationRequest(body.message);
  // Texte à traduire : aucune commande de repas, même si un mot ressemble à un restaurant.
  const foodDetect = foodOrdering && !body.voice && !shimaoreTranslation;
  // Plusieurs articles d'un coup : Tamilya compose le panier, à la place de la commande simple.
  const foodGroup = foodDetect ? detectGroupOrder(body.message) : null;
  // Demande de repas reconnue ici, sans attendre le modèle : la commande s'ouvre à coup sûr.
  const foodQuery =
    foodDetect && !foodGroup
      ? detectFoodOrder(
          body.message,
          history.filter((turn) => turn.role === "user").map((turn) => turn.content).reverse(),
          FOOD_CATALOG,
        )
      : null;
  // Fonctionnalités éteintes dans /admin/fonctionnalites : seulement pour les administrateurs.
  const features = await userFeatures(user);
  // Envoi de documents éteint pour ce compte : le fichier joint est ignoré.
  if (!features.includes("documents")) delete messages[messages.length - 1].attachment;
  // Annuaire Tamilya des entreprises (fiches vérifiées par GROUPE BTM) : en mémoire, lu en quelques millisecondes.
  // Le maître et l'équipe testent : leurs questions ne comptent pas dans les statistiques des entreprises.
  const directoryText = understood?.retrieval ?? body.message;
  const directory =
    !master && features.includes("entreprises")
      ? await directoryFor(directoryText, companyAsk(directoryText), { channel: body.voice ? "vocal" : "ecrit", count: !user?.isAdmin }).catch(() => null)
      : null;
  if (directory) after(() => directory.counted);
  const attached = Boolean(messages[messages.length - 1].attachment);
  // Demande de ticket de barge reconnue ici : l'achat s'ouvre à coup sûr.
  const bargeIntent = bargeTickets && !body.voice ? detectBargeTicket(body.message) : null;
  // Demande de devis BTM (mur, dalle…) reconnue ici : le devis s'ouvre à coup sûr.
  const btmDevis = !body.voice && features.includes("devis") && detectBtmDevis(body.message) ? btmDevisSpec(body.message) : null;
  // Trajet demandé (« combien de temps de chez moi à la CSSM ») : la carte du trajet s'ouvre à coup sûr (compte requis).
  const trip = user && !body.voice && features.includes("trajet") && !foodQuery && !foodGroup && !btmDevis ? detectTrip(body.message) : null;
  // Cyclones demandés (« il y a un cyclone ? ») : la carte des cyclones s'ouvre à coup sûr, sur le monde si la personne parle des autres.
  const cyclone = !body.voice && features.includes("cyclone") && detectCyclone(body.message) ? cycloneZoneFor(body.message) : null;
  // Eau courante demandée (« y a de l'eau à Koungou ? ») : la carte de l'eau s'ouvre à coup sûr (planning officiel de la SMAE).
  // Suite d'une question sur l'eau (« et à Trévani ? ») : même carte, sur le lieu de ce message.
  // 2026-11-26 : « et à trévani ? » juste après l'eau à Kawéni → « aucune information, regarde le Facebook de la SMAE ».
  const lastReply = [...history].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
  const water =
    !body.voice && features.includes("eau") && (detectWater(body.message) || followsWater(follows, lastReply))
      ? await waterContext(body.message)
          .then(async (found) => (found.place || !follows ? found : waterContext(`${body.message} ${follows}`)))
          .catch(() => null)
      : null;
  // Offres d'emploi demandées (« montre-moi les offres », « qui recrute à Koungou ? ») : la liste s'ouvre à coup sûr,
  // avec les sites lus (Emploi Territorial toujours, France Travail quand l'accès est accordé).
  // Les offres elles-mêmes (gardées 30 min, lues en 3 s au plus) : Tamilya sait ce qui existe vraiment, et le bloc
  // qu'elle écrit est corrigé après coup pour que la liste ne s'ouvre jamais vide (fixJobsSpec).
  const jobsAsked = !body.voice && features.includes("emploi") && detectJobs(body.message);
  const jobOffers = jobsAsked
    ? await Promise.race([getMayotteJobs(), new Promise<null>((resolve) => setTimeout(() => resolve(null), EVENTS_WAIT_MS))])
        .then((result) => (result?.configured ? result.offers : null))
        .catch(() => null)
    : null;
  const jobs = jobsAsked
    ? (() => {
        const ville = jobsTownFor(body.message);
        const inTown = ville && jobOffers ? matchJobs(jobOffers, { ville }) : [];
        const shown = (inTown.length ? inTown : (jobOffers ?? [])).slice(0, JOBS_IN_PROMPT);
        return {
          ville,
          sources: jobsSources(),
          inTown: jobOffers ? inTown.length : null,
          total: jobOffers?.length ?? null,
          lines: shown.map((o) => `- ${o.title}${o.job && o.job !== o.title ? ` (${o.job})` : ""}${o.company ? ` — ${o.company}` : ""}${o.place ? `, ${o.place}` : ""}`),
        };
      })()
    : null;
  // Événements emploi (job datings, réunions, ateliers) : demandés (la carte s'ouvre à coup sûr), ou la personne
  // ne sait pas quoi faire de ses journées (Tamilya peut en parler d'elle-même, si ça colle). Lus en 3 s au plus.
  const eventsWanted = !body.voice && features.includes("evenements") && eventsConfigured();
  const eventsAsked = eventsWanted && detectEvents(body.message);
  // Ses deux messages d'avant comptent aussi : Tamilya demande souvent d'abord ce qui lui ferait envie.
  const idle =
    eventsWanted &&
    !eventsAsked &&
    [body.message, ...history.filter((turn) => turn.role === "user").slice(-2).map((turn) => turn.content)].some(detectIdle);
  const jobEvents =
    eventsAsked || idle
      ? await Promise.race([getMayotteEvents(), new Promise<null>((resolve) => setTimeout(() => resolve(null), EVENTS_WAIT_MS))])
          .then((result) => (result?.configured ? { asked: eventsAsked, lines: result.events.slice(0, EVENTS_IN_PROMPT).map(eventLine) } : null))
          .catch(() => null)
      : null;
  // Chanson demandée (« chante-moi quelque chose ») : Tamilya écrit une chanson, chantée sous son message.
  const song = !body.voice && features.includes("chanson") && detectSong(body.message);
  // Lecture en 3D demandée (« lis-moi cette page », ou demandée juste avant et le texte arrive) :
  // essai réservé aux administrateurs.
  // Ses deux derniers messages : « en vocal » peut suivre une histoire collée un peu plus haut.
  const previousAsks = [...history].reverse().filter((turn) => turn.role === "user").map((turn) => turn.content).slice(0, 2);
  // Lieu de Mayotte demandé (« c'est où Chiconi ? », puis « montre », « la carte ») : la carte de l'île s'ouvre sur lui à coup sûr,
  // avec seulement des faits sûrs (sa commune, où il est sur l'île, les habitants de la commune lus en 2 s au plus).
  // « La carte de Mayotte » : l'île entière, sans repère.
  const placeAsked = !body.voice && !trip && !water && !jobsAsked && !cyclone && !foodQuery && !foodGroup && !bargeIntent && !btmDevis ? detectPlace(body.message, previousAsks) : null;
  const placeTown = placeAsked?.town;
  const place = placeAsked
    ? {
        name: placeAsked.name,
        facts: placeTown
          ? describeTown(
              placeTown,
              await Promise.race([communePopulation(placeTown.commune), new Promise<null>((resolve) => setTimeout(() => resolve(null), PLACE_INFO_WAIT_MS))]).catch(() => null),
            )
          : ISLAND_FACTS,
      }
    : null;
  // Texte écrit ou collé (dans ce message ou les deux précédents) : lu tel quel ; sinon « lis-moi une
  // histoire » : Tamilya l'invente et la joue en 3D ; une page en photo seulement s'il en parle.
  const reading = Boolean(user?.isAdmin) && !body.voice ? readingMode(body.message, previousAsks) : null;
  // Demande d'attestation d'hébergement reconnue ici : le formulaire s'ouvre à coup sûr.
  // « Mets mes infos » juste après l'ouverture : c'est la même attestation.
  const attestationOpen = history.slice(-4).some((turn) => turn.role === "assistant" && turn.content.includes(ATTESTATION_BLOCK));
  const attestation = !body.voice && features.includes("attestation") && (detectAttestation(body.message) || (attestationOpen && wantsOwnInfo(body.message)));
  // « Signe ce PDF », « remplis mon formulaire » : la carte pour choisir le document s'ouvre à coup sûr.
  const documentTask = !body.voice && !attestation && features.includes("signature") ? detectDocumentTask(body.message) : null;
  // Jour voulu pour le code (« demain », « vendredi matin ») : calculé ici, les modèles se trompent de date.
  const codeWhen = parseCodeExamWhen(body.message);
  const pastTalksRead = await pastTalksTask;
  const recentReplies = history.filter((turn) => turn.role === "assistant").slice(-4).map((turn) => turn.content);
  const pastTalks = withRecentReplies(pastTalksRead ?? { talks: [], openings: [] }, recentReplies);
  // Recherche lancée au début : ses résultats rejoignent les infos en direct, ses pages s'affichent en sources.
  const web = master ? null : await webTask;
  if (needsWebSearch(body.message) && !body.voice) {
    console.info(`[recherche] avant la réponse : ${web ? `${web.results.length} résultat(s), ${web.pages.length} page(s) lue(s)` : "rien à temps"}, ${Date.now() - webStartedAt} ms`);
  }
  const webFound = web?.results.length ? web : null;
  const searchedSources = webFound ? (webFound.pages.length ? webFound.pages : webFound.results.slice(0, 3)).map(({ title, url }) => ({ title, url })) : [];
  // Admin qui parle de la page d'accueil (ce message ou le précédent) : Tamilya a sous les yeux la conversation affichée.
  const aboutLanding = Boolean(user?.isAdmin) && !master && mentionsLanding([body.message, ...previousAsks.slice(0, 1)].join(" "));
  const landingDemo = aboutLanding
    ? await Promise.race([getLandingDemo(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))])
        .then((lines) => lines?.map((l) => `- ${l.from === "user" ? "Visiteur" : "Tamilya"} : ${l.shimaore ?? l.fr}${l.shimaore ? ` (${l.fr})` : ""}`).join("\n") ?? null)
        .catch(() => null)
    : null;
  // Admin : Tamilya connaît ses fonctions et ses chiffres du moment.
  const adminSystems = user?.isAdmin && !master ? await adminSelfReport(brain).catch(() => null) : null;
  const system = buildSystemPrompt(DEFAULT_PERSONALITY, {
    personalityInstructions,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, body.message),
    grammar: brain.grammar,
    words: wordsFor(brain, body.message, master),
    gloss: glossFor(brain, body.message),
    knowledge: knowledgeFor(brain, understood?.retrieval ?? body.message),
    live: webFound ? [liveContext, searchBlock(webFound)].filter(Boolean).join("\n\n") : liveContext,
    directory: directory?.block,
    understanding: understood?.block,
    memories,
    pastTalks,
    dossier,
    teacher: master,
    voice: body.voice,
    voiceCall: features.includes("vocal"),
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
    btmDevisOffer: features.includes("devis"),
    btmDevis,
    trip,
    place,
    cyclone,
    water,
    jobs,
    jobEvents,
    song,
    reading: reading ? (reading.kind === "page" ? "photo" : reading.kind) : undefined,
    readingOffer: Boolean(user?.isAdmin),
    attestationOffer: features.includes("attestation"),
    attestation,
    documentOffer: features.includes("signature"),
    documentTask: documentTask ?? undefined,
    shimaoreTranslation,
    shimaoreComposition: composition ?? undefined,
    teachesShimaore: Boolean(user?.isAdmin),
    admin: Boolean(user?.isAdmin),
    landingDemo,
    adminSystems,
    codeExamOffer: features.includes("code"),
    codeExamDay: codeWhen.day && features.includes("code") ? formatWhenDay(codeWhen.day) : null,
    youtubeOffer: features.includes("youtube"),
    foodOrder,
  });
  flow.step("prompt", true);
  // Équipe d'agents (src/lib/ai/agents) : seulement pour une question difficile, à l'écrit, avec un compte,
  // hors parcours dédiés. AI_AGENTS : « admin » (par défaut, essai réservé aux administrateurs), « all » ou « off ».
  // Réservé d'abord aux administrateurs : l'équipe ajoute environ 10 s avant le premier mot (mesuré le 2026-11-08).
  const agentsMode = process.env.AI_AGENTS?.trim() || "admin";
  const agentsAllowed = agentsMode === "all" || (agentsMode === "admin" && Boolean(user?.isAdmin));
  const dedicatedFlow = Boolean(foodQuery || foodGroup || bargeIntent || btmDevis || trip || place || cyclone || water || jobs || jobEvents?.asked || song || reading || attestation || documentTask || shimaoreTranslation || composition);
  // Fichier joint : seule Tamilya le reçoit, l'équipe d'agents ne le verrait pas.
  const teamPlan =
    !agentsAllowed || attached
      ? null
      : planTeam(body.message, { voice: Boolean(body.voice), master, dedicatedFlow, challenged, signedIn: Boolean(user) });
  // Mesures de vitesse, écrites dans les journaux du serveur en fin de réponse.
  const contextMs = Date.now() - startedAt;
  let firstTextMs: number | null = null;

  // Mémoire à long terme : une fois la réponse envoyée, le modèle dit ce qu'il
  // faut retenir de ce message, et c'est Supabase qui le garde. Avec un
  // administrateur, il relève aussi le shimaoré enseigné dans la conversation.
  // Avec le maître, le relevé du shimaoré part tout de suite, en parallèle de la réponse :
  // les mots retenus s'affichent sous la réponse (« ✓ Retenu »), il sait que Tamilya a appris.
  let learning: Promise<TaughtWord[]> | null = null;
  let remembering: Promise<string[]> | null = null;
  if (user && supabase) {
    const previousReply = [...history].reverse().find((turn) => turn.role === "assistant")?.content ?? null;
    // Sa demande d'avant : la phrase dont il corrige peut-être la traduction.
    const previousAsk = [...history].reverse().find((turn) => turn.role === "user")?.content ?? null;
    // Avec le maître, un seul appel de fond : le relevé du shimaoré (sa mémoire passe par extractMemories).
    if (user.isAdmin) {
      learning = learnWordsFromMessage(supabase, user.id, ai.provider, { message: body.message, previousReply, previousAsk }).catch((error: unknown) => {
        console.error("[chat] Leçon de shimaoré non enregistrée", error);
        return [];
      });
      const pending = learning;
      after(() => pending);
    }
    // Mémoire : lancée tout de suite, en parallèle de la réponse, pour annoncer « Mémoire mise à jour ».
    if (!master && memoryOn) {
      const known = memories;
      remembering = learnFromMessage(supabase, user.id, ai.provider, { message: body.message, previousReply, previousAsk, memories: known })
        .then((updates) => describeMemoryUpdates(known, updates))
        .catch((error: unknown) => {
          console.error("[chat] Apprentissage de fond non enregistré", error);
          return [];
        });
      const pending = remembering;
      after(() => pending);
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
        const reply = text;
        after(() =>
          collectUnknownWords(ai.provider, { message: body.message, tagged: words, known }).catch((error: unknown) =>
            console.error("[chat] Mots inconnus non signalés", error),
          ),
        );
        // Mot à deux traductions employé ici : Tamilya en fait la demande, l'administrateur tranchera.
        after(() =>
          reportWordConflicts(brain.words, { message: body.message, reply }).catch((error: unknown) =>
            console.error("[chat] Conflits de mots non signalés", error),
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

      // Équipe d'agents : notes préparées en parallèle, puis glissées dans les consignes de Tamilya,
      // qui répond elle-même. Un agent en retard ou en panne est laissé de côté.
      let finalSystem = system;
      let finalSearch = search;
      // Sources de secours sous la réponse : la recherche faite avant, remplacée par celle du chercheur s'il en a.
      let teamSources: { title: string; url: string }[] = searchedSources;
      if (teamPlan && teamPlan.specialists.length > 0) {
        send({ type: "team", agents: teamPlan.specialists.map((id) => AGENT_LABELS[id]) });
        try {
          const result = await runTeam({
            provider: ai.provider,
            message: body.message,
            history,
            plan: teamPlan,
            memories,
            words: [...brain.lexicon, ...brain.words],
            signal,
            today: mayotteClock(),
          });
          console.info(`[agents] ${teamPlan.reason} : ${teamSummary(result)}`);
          const block = teamBlock(result);
          if (block) {
            finalSystem = `${system}

${block}`;
            // Le chercheur a déjà cherché et trouvé ses sources : pas de seconde recherche, la réponse part plus vite.
            if (result.sources.length) {
              teamSources = result.sources;
              finalSearch = false;
            }
          }
        } catch (error) {
          console.error("[agents] Équipe indisponible, Tamilya répond seule", error);
        }
      }

      // Chronométrage du vocal (journaux du serveur) : préparation avant l'appel au modèle.
      const modelStartMs = Date.now() - startedAt;
      let thinkingSent = false;
      try {
        for await (const chunk of ai.provider.stream({
          system: finalSystem,
          messages,
          persona: true,
          fast: body.voice,
          deep,
          careful: Boolean(understood?.careful) && !deep,
          search: finalSearch,
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
          } else if (chunk.type === "thought") {
            // Tamilya réfléchit : signalé une fois pendant l'attente (écrit seulement). Le texte des pensées
            // n'est pas envoyé : Gemini le résume en anglais et il parle parfois des consignes.
            if (!body.voice && firstTextMs === null && !thinkingSent) {
              thinkingSent = true;
              send({ type: "thinking" });
            }
          } else if (chunk.type === "searching") {
            // Recherche sur internet par le serveur : « Je cherche sur internet… » pendant l'attente.
            if (!body.voice && firstTextMs === null) send({ type: "searching" });
          } else if (chunk.type === "sources") {
            webSources = chunk.sources;
          } else if (chunk.type === "finish") {
            finish = chunk.reason;
          }
        }

        // Relecture avant d'envoyer : en mode maître (écrit), un deuxième regard corrige le shimaoré
        // d'après les règles et le vocabulaire ; la version relue remplace l'affichage (flush).
        // Pas à la voix : chaque phrase est déjà partie, et la latence compte.
        if (master && !body.voice && text && !signal.aborted) {
          text = await reviewShimaore(ai.provider, {
            draft: text,
            grammar: brain.grammar,
            phrases: lexiconFor(brain, `${body.message} ${text}`) ?? [],
            words: wordsFor(brain, `${body.message} ${text}`, master),
          });
        }
        flush();
        closeTag();
        if (sentences) speakSentences(sentences.end());
        // Sources de la recherche Google (la sienne, sinon celle du chercheur), sous la réponse.
        if (!webSources.length) webSources = teamSources;
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
        // Lieu demandé mais pas de carte dans la réponse : on l'ajoute.
        if (place && text && !text.includes("```" + PLACE_BLOCK)) {
          const block = placeBlock(place.name);
          text += block;
          send({ type: "delta", text: block });
        }
        // Cyclones demandés mais pas de bloc dans la réponse : on l'ajoute.
        if (cyclone && text && !text.includes("```" + CYCLONE_BLOCK)) {
          const block = cycloneBlock(cyclone);
          text += block;
          send({ type: "delta", text: block });
        }
        // Eau demandée mais pas de carte dans la réponse : on l'ajoute.
        if (water && text && !text.includes("```" + WATER_BLOCK)) {
          const block = waterBlock(water.place);
          text += block;
          send({ type: "delta", text: block });
        }
        // Offres d'emploi demandées mais pas de bloc dans la réponse : on l'ajoute.
        if (jobs && text && !text.includes("```" + JOBS_BLOCK)) {
          const block = jobsBlock(jobs);
          text += block;
          send({ type: "delta", text: block });
        }
        // Filtres du bloc qui ne trouveraient aucune offre (« secrétaire » à Koungou) : corrigés, la liste ne s'ouvre jamais vide.
        if (jobs && jobOffers?.length && text.includes("```" + JOBS_BLOCK)) {
          const fixed = text.replace(new RegExp("```" + JOBS_BLOCK + "\\n([\\s\\S]*?)```"), (whole, inner: string) => {
            const spec = jobsSpecOf(inner);
            const next = fixJobsSpec(jobOffers, spec);
            return next.metier === spec.metier && next.ville === spec.ville ? whole : jobsBlock(next).trimStart();
          });
          if (fixed !== text) {
            text = fixed;
            send({ type: "replace", text });
          }
        }
        // Événements emploi demandés mais pas de bloc dans la réponse : on l'ajoute (pas quand elle en parle d'elle-même).
        if (jobEvents?.asked && text && !text.includes("```" + EVENTS_BLOCK)) {
          const block = eventsBlock();
          text += block;
          send({ type: "delta", text: block });
        }
        // Attestation demandée mais pas de bloc dans la réponse : on l'ajoute.
        if (attestation && text && !text.includes("```" + ATTESTATION_BLOCK)) {
          text += attestationBlock;
          send({ type: "delta", text: attestationBlock });
        }
        // Document à signer ou remplir demandé mais pas de bloc dans la réponse : on l'ajoute.
        if (documentTask && text && !text.includes("```" + DOCUMENT_BLOCK)) {
          const block = documentBlock(documentTask);
          text += block;
          send({ type: "delta", text: block });
        }
        // Lecture en 3D : le texte à lire (ou la demande d'histoire) est glissé dans le bloc par le serveur
        // (Tamilya n'a pas à le recopier) ; bloc ajouté s'il manque.
        if (reading && text) {
          const withBlock = withSceneBlock(text, reading);
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
          // Souvenirs de ce message : ceux repérés tout de suite, plus ceux du modèle s'il a fini à temps.
          const later = remembering
            ? await Promise.race([remembering, new Promise<string[]>((resolve) => setTimeout(() => resolve([]), LEARN_WAIT_MS))])
            : [];
          const items = [...new Set([...remembered, ...later])];
          if (items.length) send({ type: "remembered", items: items.slice(0, 10) });
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
          `[chat] vitesse : contexte ${contextMs} ms, premier mot ${firstTextMs ?? "—"} ms, total ${Date.now() - startedAt} ms (${answeredBy ?? "aucune API"}), recherche ${finalSearch ? "permise" : "non"}`,
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
          // Elle relit son shimaoré et envoie ses doutes à l'administrateur (même relecture qu'à la voix).
          if (user.isAdmin && text && status !== "error") {
            const reply = text;
            after(() =>
              collectDoubts(ai.provider, { reply, brain, source: "chat" }).catch((error: unknown) =>
                console.error("[chat] Doutes non signalés", error),
              ),
            );
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
