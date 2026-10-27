import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
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
import { knowledgeFor, lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { AI_ERROR_LABELS } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { extractMemories, type MemoryFact } from "@/lib/ai/memory";
import { getMemories, saveMemories } from "@/lib/ai/memory-store";
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

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return errorResponse(403, "invalid_request");
  // Trajet du message, affiché en direct sur /admin/modele-ia.
  const flow = startFlowTrace();

  // 1. Fournisseur d'IA configuré ? Aucune réponse simulée sinon.
  const ai = await getAIProvider();
  if (!ai.ok) {
    console.error(`[chat] Fournisseur d'IA non configuré : ${ai.reason}`);
    flow.step("input", false, "aucune API configurée");
    return errorResponse(503, "ai_not_configured");
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
        if (count >= CHAT_LIMITS.conversationMaxMessages) {
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

  const messages: ChatTurn[] = [
    ...buildModelHistory(history, CHAT_LIMITS.modelContextMaxChars),
    { role: "user", content: body.message },
  ];

  // Comportement de la personnalité réécrit depuis /admin (sinon texte du code), en cache.
  const [brain, personalityInstructions] = await Promise.all([
    brainTask,
    loadPersonalityInstructions(personality ?? DEFAULT_PERSONALITY),
  ]);
  const system = buildSystemPrompt(personality ?? undefined, {
    personalityInstructions,
    name: brain.name,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, personality ?? DEFAULT_PERSONALITY),
    words: wordsFor(brain, body.message),
    knowledge: knowledgeFor(brain, body.message),
    memories,
  });
  flow.step("prompt", true);

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
            send({ type: "delta", text: chunk.text });
          } else {
            finish = chunk.reason;
          }
        }

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
          status = text ? "interrupted" : "error";
          send({ type: "error", code, message: chatErrorBody(code).error.message });
        }
      } finally {
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
