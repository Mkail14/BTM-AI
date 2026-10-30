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
