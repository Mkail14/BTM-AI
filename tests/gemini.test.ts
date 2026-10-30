import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createProvider } from "@/lib/ai";
import type { AIConfig } from "@/lib/ai/config";
import { listModels } from "@/lib/ai/key-check";

const config: AIConfig = {
  provider: "openai-compatible",
  apiKey: "AQ.cle-de-test",
  model: "gemini-3.6-flash",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  maxOutputTokens: 256,
  timeoutMs: 10_000,
  effort: "low",
  disableReasoning: true,
};

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });

afterEach(() => mock.restoreAll());

describe("Gemini (API native)", () => {
  it("envoie la clé dans x-goog-api-key et lit le flux de generateContent", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      sse([
        { candidates: [{ content: { parts: [{ text: "Kwezi", thought: false }, { text: "(pensée)", thought: true }] } }] },
        { candidates: [{ content: { parts: [{ text: " !" }] }, finishReason: "STOP" }] },
      ]),
    );
    const chunks = [];
    for await (const chunk of createProvider(config).stream({
      system: "Tu es Awa.",
      messages: [{ role: "user", content: "Salut" }],
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, [
      { type: "text", text: "Kwezi" },
      { type: "text", text: " !" },
      { type: "finish", reason: "stop" },
    ]);
    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["x-goog-api-key"], "AQ.cle-de-test");
    assert.equal(headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(init.body as string).systemInstruction, { parts: [{ text: "Tu es Awa." }] });
  });

  it("réduit la réflexion, et retire le réglage si le modèle le refuse", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      const { thinkingConfig } = JSON.parse(init.body as string).generationConfig;
      return thinkingConfig?.thinkingLevel === "minimal"
        ? Response.json({ error: { message: "thinking_level MINIMAL is not supported for this model" } }, { status: 400 })
        : sse([{ candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }] }]);
    });
    const chunks = [];
    for await (const chunk of createProvider(config).stream({
      system: "",
      messages: [{ role: "user", content: "Salut" }],
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, [{ type: "text", text: "OK" }, { type: "finish", reason: "stop" }]);
    const sent = fetchMock.mock.calls.map((c) => JSON.parse((c.arguments[1] as RequestInit).body as string).generationConfig.thinkingConfig);
    assert.deepEqual(sent, [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }]);
  });

  it("modèle sans quota : passe tout seul à un autre modèle de la clé", async () => {
    const asked: string[] = [];
    mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("/models?")) {
        return Response.json({
          models: [
            { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.8-pro", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      }
      const model = url.match(/models\/([^:]+):/)![1];
      asked.push(model);
      return model === "gemini-3.5-flash"
        ? sse([{ candidates: [{ content: { parts: [{ text: "Kwezi" }] }, finishReason: "STOP" }] }])
        : Response.json({ error: { message: "You exceeded your current quota. limit: 0" } }, { status: 429 });
    });
    const chunks = [];
    for await (const chunk of createProvider({ ...config, apiKey: "AQ.cle-sans-quota", model: "gemini-3.8-flash", disableReasoning: false }).stream({
      system: "",
      messages: [{ role: "user", content: "Salut" }],
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, [{ type: "text", text: "Kwezi" }, { type: "finish", reason: "stop" }]);
    // Le pro n'est jamais essayé ; flash avant flash-lite, du plus récent au plus ancien.
    assert.deepEqual(asked, ["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.5-flash"]);
  });

  it("modèle surchargé (503) : passe tout seul au modèle suivant", async () => {
    const asked: string[] = [];
    mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("/models?")) {
        return Response.json({
          models: [
            { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      }
      const model = url.match(/models\/([^:]+):/)![1];
      asked.push(model);
      return model === "gemini-3.8-flash-lite"
        ? sse([{ candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }] }])
        : Response.json({ error: { message: "The model is overloaded. Please try again later." } }, { status: 503 });
    });
    const chunks = [];
    for await (const chunk of createProvider({ ...config, apiKey: "AQ.cle-surchargee", model: "gemini-3.8-flash", disableReasoning: false }).stream({
      system: "",
      messages: [{ role: "user", content: "Salut" }],
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, [{ type: "text", text: "OK" }, { type: "finish", reason: "stop" }]);
    assert.deepEqual(asked, ["gemini-3.8-flash", "gemini-3.8-flash-lite"]);
  });

  it("liste seulement les modèles qui savent discuter, sans « models/ »", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({
        models: [
          { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
          { name: "models/text-embedding-005", supportedGenerationMethods: ["embedContent"] },
          { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
        ],
      }),
    );
    assert.deepEqual(await listModels(config), { ok: true, models: ["gemini-3.5-flash-lite", "gemini-3.6-flash"] });
  });

  it("explique le refus de Google depuis Mayotte", async () => {
    mock.method(globalThis, "fetch", async () =>
      Response.json({ error: { code: 400, message: "User location is not supported for the API use." } }, { status: 400 }),
    );
    const result = await listModels(config);
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.message : "", /Mayotte/);
  });
});
