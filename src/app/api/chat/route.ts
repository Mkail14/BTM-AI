import { randomUUID } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { AIProviderError, buildSystemPrompt, getAIProvider } from "@/lib/ai";
import { getAuthContext } from "@/lib/auth/session";
import { chatErrorBody } from "@/lib/chat/errors";
import { buildModelHistory, deriveTitle } from "@/lib/chat/history";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { encodeStreamEvent } from "@/lib/chat/stream-protocol";
import type { ChatErrorCode, ChatStreamEvent, ChatTurn, FinishReason, MessageStatus } from "@/lib/chat/types";
import { chatRequestSchema } from "@/lib/chat/validation";
import {
  countMessages,
  createConversation,
  getConversation,
  getProfile,
  getRecentMessages,
  insertMessage,
} from "@/lib/conversations/repository";
import { invalidateAwaBrain, knownTranslations, knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { ALL_APIS_CUT, flowCutStop, loadFlowCuts } from "@/lib/ai/flow-cuts";
import { extractMemories, type MemoryFact } from "@/lib/ai/memory";
import { getMemories, learnFromMessage, saveMemories } from "@/lib/ai/memory-store";
import { learnWordsFromMessage, teachWords } from "@/lib/ai/words-store";
import { parseTeaching, type WordList } from "@/lib/language/teaching";
import { enforceShimaore, fillKnownWords } from "@/lib/language/unknown-words";
import { DEFAULT_PERSONALITY, type PersonalityId } from "@/lib/ai/personalities";
import { loadPersonalityInstructions } from "@/lib/ai/personality-store";
import { consumeRateLimits, type RateLimitSubject } from "@/lib/rate-limit";
import { loadRateLimitPolicies } from "@/lib/rate-limit/settings";
import { getClientIp, hashIdentifier, isSameOrigin } from "@/lib/security/request";

export const maxDuration = 120;

const DEVICE_COOKIE = "btm_device";
const MAX_BODY_BYTES = 128 * 1024;

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

/** Réponse d'Awa à une leçon de shimaoré : ce qu'elle a retenu, et les lignes qu'elle n'a pas comprises. */
function lessonReply({ words, rejected }: WordList): string {
  const lines = [
    words.length === 1 ? "C'est noté ✅ J'ai appris ce mot :" : `C'est noté ✅ J'ai appris ces ${words.length} mots :`,
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
  // Trajet du message, affiché en direct sur /admin/modele-ia.
  const flow = startFlowTrace();

  // 1. Lien coupé sur le schéma de /admin/modele-ia : le message s'arrête là, Awa ne répond pas.
  const cuts = await loadFlowCuts();
  const cutAt = flowCutStop(cuts);
  if (cutAt) {
    flow.step(cutAt, false, "lien coupé");
    return errorResponse(503, "flow_cut");
  }

  // Fournisseur d'IA configuré ? Aucune réponse simulée sinon. Les API coupées sont sautées.
  const ai = await getAIProvider(cuts);
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
  const { supabase, user } = await getAuthContext();
  let deviceId = request.cookies.get(DEVICE_COOKIE)?.value;
  const newDeviceId = !user && (!deviceId || !/^[0-9a-f-]{36}$/.test(deviceId));
  if (newDeviceId) deviceId = randomUUID();

  // Le maître d'Awa (administrateur) lui parle sans quota.
  if (!user?.isAdmin) {
    try {
      const policies = await loadRateLimitPolicies();
      const subjects: RateLimitSubject[] = user
        ? [{ key: user.id, rules: policies.user }]
        : [
            { key: hashIdentifier(`device:${deviceId}`), rules: policies.anonymousDevice },
            { key: hashIdentifier(`ip:${getClientIp(request.headers)}`), rules: policies.anonymousIp },
          ];
      const decision = await consumeRateLimits(subjects);
      if (!decision.allowed) {
        flow.step("guard", false, "quota de messages atteint");
        return errorResponse(429, "rate_limited", {
          "Retry-After": String(decision.retryAfterSeconds),
        });
      }
    } catch (error) {
      console.error("[chat] Limitation de débit indisponible", error);
      flow.step("guard", false, "limitation de débit indisponible");
      return errorResponse(503, "service_unavailable");
    }
  }
  flow.step("guard", true);

  // 4. Construction du contexte.
  // Chaque requête Supabase coûte un aller-retour réseau : les lectures
  // indépendantes partent en même temps pour que la réponse démarre plus vite.
  let history: ChatTurn[];
  let conversationId: string | null = null;
  let personality: PersonalityId | null | undefined;
  let memories: MemoryFact[] = [];

  // Cerveau d'Awa (Supabase, en cache) : nom, caractère, règles, connaissances, lexique.
  const brainTask = loadAwaBrain();

  if (user && supabase) {
    // Personnalité d'Awa : relue en base, jamais fournie par le client.
    const personalityTask = getProfile(supabase, user.id).then(
      (profile) => profile.personality,
      (error: unknown) => {
        console.error("[chat] Personnalité indisponible, valeur par défaut", error);
        return undefined;
      },
    );
    // Mémoire d'Awa : ce que la personne dit d'elle (prénom, lieu…) est retenu
    // avant de relire la mémoire, pour être utilisé dès cette réponse.
    const memoriesTask = (async () => {
      await saveMemories(supabase, user.id, extractMemories(body.message));
      return getMemories(supabase);
    })().catch((error: unknown) => {
      console.error("[chat] Mémoire indisponible (migration awa_brain appliquée ?)", error);
      return [] as MemoryFact[];
    });

    try {
      if (body.conversationId) {
        // RLS : une conversation d'un autre utilisateur est simplement introuvable
        // (le comptage et l'historique sont alors vides).
        const [conversation, count, recent] = await Promise.all([
          getConversation(supabase, body.conversationId),
          countMessages(supabase, body.conversationId),
          getRecentMessages(supabase, body.conversationId, CHAT_LIMITS.historyFetchLimit),
        ]);
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
          deriveTitle(body.message, CHAT_LIMITS.maxTitleChars),
        );
        conversationId = created.id;
        history = [];
      }
      await insertMessage(supabase, {
        conversationId,
        userId: user.id,
        role: "user",
        content: body.message,
      });
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
        reply = "Je n'ai pas réussi à enregistrer ces mots 😕 Vérifie que la migration du dictionnaire (awa_words) est appliquée, puis réessaie.";
        flow.step("prompt", false, "leçon non enregistrée");
      }
      try {
        await insertMessage(supabase, { conversationId, userId: user.id, role: "assistant", content: reply });
      } catch (error) {
        console.error("[chat] Impossible d'enregistrer la réponse", error);
      }
      return fixedReply(conversationId, reply);
    }

    [personality, memories] = await Promise.all([personalityTask, memoriesTask]);
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

  // Comportement de la personnalité réécrit depuis /admin (sinon texte du code), en cache.
  const [brain, personalityInstructions] = await Promise.all([
    brainTask,
    loadPersonalityInstructions(personality ?? DEFAULT_PERSONALITY),
  ]);

  // Mode maître (administrateur) : Awa ne parle que shimaoré. Ses anciennes
  // réponses sont nettoyées elles aussi, pour que le modèle ne recopie pas son
  // français, et les [[mots]] traduits depuis sont remplacés par le shimaoré appris.
  const master = Boolean(user?.isAdmin);
  const known = master ? knownTranslations(brain) : new Map<string, string>();
  const toShimaore = (reply: string) => fillKnownWords(enforceShimaore(reply), known);
  const messages: ChatTurn[] = [
    ...buildModelHistory(
      master ? history.map((turn) => (turn.role === "assistant" ? { ...turn, content: toShimaore(turn.content) } : turn)) : history,
      CHAT_LIMITS.modelContextMaxChars,
    ),
    { role: "user", content: body.message },
  ];
  const system = buildSystemPrompt(personality ?? undefined, {
    personalityInstructions,
    name: brain.name,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, personality ?? DEFAULT_PERSONALITY),
    words: wordsFor(brain, body.message, master),
    knowledge: knowledgeFor(brain, body.message),
    memories,
    teacher: master,
    voice: body.voice,
  });
  flow.step("prompt", true);

  // Mémoire à long terme : une fois la réponse envoyée, le modèle dit ce qu'il
  // faut retenir de ce message, et c'est Supabase qui le garde. Avec un
  // administrateur, il relève aussi le shimaoré enseigné dans la conversation.
  if (user && supabase) {
    const previousReply = [...history].reverse().find((turn) => turn.role === "assistant")?.content ?? null;
    // Un seul appel de fond par message : les API gratuites ont des quotas très bas.
    // Avec le maître, c'est le relevé du shimaoré (sa mémoire passe par extractMemories, sans appel).
    after(() =>
      (user.isAdmin
        ? learnWordsFromMessage(supabase, user.id, ai.provider, { message: body.message, previousReply })
        : learnFromMessage(supabase, user.id, ai.provider, { message: body.message, previousReply, memories })
      ).catch((error: unknown) => console.error("[chat] Apprentissage de fond non enregistré", error)),
    );
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
      let status: MessageStatus = "complete";
      let finish: FinishReason = "other";
      // API qui a pris le message : la réponse part d'elle vers la sortie.
      let answeredBy: string | null = null;

      if (conversationId) send({ type: "meta", conversationId });

      // Mode maître : la réponse est corrigée en entier (enforceShimaore) avant
      // d'être envoyée d'un bloc, puis enregistrée telle qu'elle a été montrée.
      let flushed = false;
      const flush = () => {
        if (!master || flushed || !text) return;
        flushed = true;
        text = toShimaore(text);
        send({ type: "delta", text });
      };

      try {
        for await (const chunk of ai.provider.stream({
          system,
          messages,
          maxOutputTokens: ai.config.maxOutputTokens,
          signal,
          onAttempt: (slotId, error) => {
            if (!error) answeredBy = slotId;
            flow.step(`model-${slotId}`, !error, error ? (AI_ERROR_LABELS[error] ?? error) : undefined);
          },
        })) {
          if (chunk.type === "text") {
            text += chunk.text;
            if (!master) send({ type: "delta", text: chunk.text });
          } else {
            finish = chunk.reason;
          }
        }

        flush();
        if (finish === "refusal" && !text) {
          status = "error";
          flow.step("output", false, "refus du modèle");
          send({ type: "error", code: "refusal", message: chatErrorBody("refusal").error.message });
        } else {
          if (finish === "length") status = "interrupted";
          flow.step("output", true);
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
          status = text ? "interrupted" : "error";
          send({ type: "error", code, message: chatErrorBody(code).error.message });
        }
      } finally {
        if (master && !flushed) text = toShimaore(text);
        if (user && supabase && conversationId) {
          try {
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
