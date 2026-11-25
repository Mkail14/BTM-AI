import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createProvider } from "../src/server/services/ai";
import type { AIConfig } from "@/lib/ai/config";
import { pageText, parseDuckDuckGo } from "../src/server/services/search/web";

const DDG_HTML = `
<div class="result results_links results_links_deep result--ad"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Annonce</a></div>
<div class="result results_links results_links_deep web-result">
  <a rel="nofollow" class="result__a" href="https://gouv.nc/le-president">Le <b>président</b> du gouvernement</a>
  <a class="result__snippet" href="https://gouv.nc/le-president">Il dirige l&#x27;administration de la <b>Nouvelle-Calédonie</b>.</a>
</div>
<div class="result results_links results_links_deep web-result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexemple.fr%2Fpage&amp;rut=x">Exemple</a>
</div>`;

describe("Recherche sans Google", () => {
  it("lit les résultats de DuckDuckGo, sans les annonces", () => {
    assert.deepEqual(parseDuckDuckGo(DDG_HTML), [
      { title: "Le président du gouvernement", url: "https://gouv.nc/le-president", snippet: "Il dirige l'administration de la Nouvelle-Calédonie." },
      { title: "Exemple", url: "https://exemple.fr/page", snippet: "" },
    ]);
  });

  it("garde le texte de l'article, sans scripts ni menus", () => {
    const text = pageText("<html><body><nav>Menu</nav><script>x()</script><article><h1>Titre</h1><p>Le texte &amp; la suite.</p></article><footer>Pied</footer></body></html>");
    assert.equal(text, "Titre Le texte & la suite.");
  });
});

const config: AIConfig = {
  provider: "openai-compatible",
  apiKey: "AQ.cle-sans-facturation",
  model: "gemini-3.6-flash",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  maxOutputTokens: 256,
  timeoutMs: 10_000,
  effort: "low",
  disableReasoning: false,
};

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });

afterEach(() => mock.restoreAll());

describe("NVIDIA (API compatible OpenAI) : Tamilya cherche avec l'outil", () => {
  it("assemble l'appel reçu en morceaux, cherche, puis répond avec les sources", async () => {
    const bodies: { tools?: unknown[]; tool_choice?: string; messages: Record<string, unknown>[] }[] = [];
    mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("html.duckduckgo.com")) return new Response(DDG_HTML);
      if (url.includes("wikipedia.org")) return Response.json({ query: { search: [] } });
      if (url.startsWith("https://gouv.nc")) return new Response(`<article><p>${"Le président est Jean Exemple, élu en juillet 2026. ".repeat(10)}</p></article>`, { headers: { "content-type": "text/html" } });
      if (url.startsWith("https://exemple.fr")) return new Response("introuvable", { status: 404 });
      const body = JSON.parse(init!.body as string);
      bodies.push(body);
      const events =
        bodies.length === 1
          ? [
              { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "chercher_sur_internet", arguments: '{"requete":"président ' } }] } }] },
              { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'Nouvelle-Calédonie"}' } }] }, finish_reason: "tool_calls" }] },
            ]
          : [{ choices: [{ delta: { content: "C'est Jean Exemple." }, finish_reason: "stop" }] }];
      return new Response(`${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    });

    const chunks = [];
    for await (const chunk of createProvider({ ...config, apiKey: "nvapi-test", model: "nvidia/nemotron-test", baseUrl: "https://integrate.api.nvidia.com/v1" }).stream({
      system: "",
      messages: [{ role: "user", content: "Qui est le président du gouvernement ?" }],
      maxOutputTokens: 256,
      signal: new AbortController().signal,
      search: true,
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, [
      { type: "searching", query: "président Nouvelle-Calédonie" },
      { type: "text", text: "C'est Jean Exemple." },
      { type: "sources", sources: [{ url: "https://gouv.nc/le-president", title: "Le président du gouvernement" }] },
      { type: "finish", reason: "stop" },
    ]);
    assert.equal(bodies.length, 2);
    const [call, result] = bodies[1].messages.slice(-2);
    assert.deepEqual(call.tool_calls, [{ id: "c1", type: "function", function: { name: "chercher_sur_internet", arguments: '{"requete":"président Nouvelle-Calédonie"}' } }]);
    assert.equal(result.role, "tool");
    assert.match(String(result.content), /Jean Exemple/);
  });

  it("sans recherche demandée, aucun outil n'est envoyé", async () => {
    const bodies: Record<string, unknown>[] = [];
    mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Salut" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
    });
    for await (const _ of createProvider({ ...config, apiKey: "nvapi-test", model: "nvidia/nemotron-test", baseUrl: "https://integrate.api.nvidia.com/v1" }).stream({
      system: "",
      messages: [{ role: "user", content: "salut" }],
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    }));
    assert.equal(bodies[0].tools, undefined);
  });
});

describe("Gemini : recherche Google refusée, Tamilya cherche elle-même", () => {
  it("appelle l'outil, le serveur cherche, puis elle répond avec les sources", async () => {
    const bodies: { tools?: unknown[]; contents: unknown[] }[] = [];
    mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("html.duckduckgo.com")) return new Response(DDG_HTML);
      if (url.includes("wikipedia.org")) return Response.json({ query: { search: [] } });
      if (url.startsWith("https://gouv.nc")) return new Response(`<article><p>${"Le président est Jean Exemple, élu en juillet 2026. ".repeat(10)}</p></article>`, { headers: { "content-type": "text/html" } });
      if (url.startsWith("https://exemple.fr")) return new Response("introuvable", { status: 404 });
      const body = JSON.parse(init!.body as string);
      bodies.push(body);
      if (body.tools?.[0]?.googleSearch) return Response.json({ error: { message: "Search grounding is not available" } }, { status: 429 });
      if (bodies.filter((b) => !(b.tools?.[0] as { googleSearch?: unknown })?.googleSearch).length === 1) {
        return sse([{ candidates: [{ content: { parts: [{ functionCall: { name: "chercher_sur_internet", args: { requete: "président gouvernement Nouvelle-Calédonie" } }, thoughtSignature: "sig" }] }, finishReason: "STOP" }] }]);
      }
      return sse([{ candidates: [{ content: { parts: [{ text: "C'est Jean Exemple." }] }, finishReason: "STOP" }] }]);
    });

    const chunks = [];
    for await (const chunk of createProvider(config).stream({
      system: "",
      messages: [{ role: "user", content: "Qui est le président du gouvernement ?" }],
      maxOutputTokens: 256,
      signal: new AbortController().signal,
      search: true,
      persona: true,
    })) {
      if (chunk.type !== "usage") chunks.push(chunk);
    }

    assert.deepEqual(chunks, [
      { type: "searching", query: "président gouvernement Nouvelle-Calédonie" },
      { type: "text", text: "C'est Jean Exemple." },
      { type: "sources", sources: [{ url: "https://gouv.nc/le-president", title: "Le président du gouvernement" }] },
      { type: "finish", reason: "stop" },
    ]);
    // Dernier envoi : l'appel de l'outil (avec sa signature) puis les résultats, lus dans la page.
    const last = bodies.at(-1)!;
    const [call, answer] = last.contents.slice(-2) as { role: string; parts: Record<string, unknown>[] }[];
    assert.equal(call.role, "model");
    assert.equal(call.parts[0].thoughtSignature, "sig");
    assert.equal(answer.role, "user");
    assert.match(JSON.stringify(answer.parts[0].functionResponse), /Jean Exemple/);
  });
});
