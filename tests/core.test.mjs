import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectCatalogRequest,
  buildDirectRequest,
  extractDirectPrompt,
  extractProviderError,
  isValidDirectModelId,
  parseDirectCatalog,
  providerOrDefault,
  resolveDirectDefault,
  buildOpenRouterRequest,
  cleanPrompt,
  extractOpenRouterError,
  extractPrompt,
  resolveDefaultModel,
  groupCatalog,
  isValidModelId,
  parseVisionCatalog,
  shortModelLabel,
  TESTED_MODELS,
  validateImageSource,
} from "../core.js";

test("accepts public web images and image data URLs", () => {
  assert.equal(
    validateImageSource("https://images.example.com/photo.jpg"),
    "https://images.example.com/photo.jpg",
  );
  assert.equal(
    validateImageSource("data:image/png;base64,AA=="),
    "data:image/png;base64,AA==",
  );
});

test("rejects unsupported or invalid image sources", () => {
  assert.throws(() => validateImageSource("blob:https://example.com/id"), /not supported/);
  assert.throws(() => validateImageSource("file:///tmp/image.png"), /not supported/);
  assert.throws(() => validateImageSource("data:text/plain,hello"), /not an image/);
  assert.throws(() => validateImageSource(""), /usable source/);
});

test("builds a privacy-preserving OpenRouter request for the chosen model", () => {
  const request = buildOpenRouterRequest("https://images.example.com/photo.jpg", "anthropic/claude-haiku-5.5");

  assert.equal(request.model, "anthropic/claude-haiku-5.5");
  assert.deepEqual(request.reasoning, { effort: "low", exclude: true });
  assert.equal(request.provider.zdr, true);
  assert.equal(request.provider.data_collection, "deny");
  assert.equal(request.messages[1].content[1].type, "image_url");
  assert.equal(
    request.messages[1].content[1].image_url.url,
    "https://images.example.com/photo.jpg",
  );
  assert.match(request.messages[0].content, /any text-to-image model can use/);
  assert.match(request.messages[0].content, /Describe visible effects, not equipment/);
  assert.match(request.messages[0].content, /Call it a photograph/);
  assert.match(request.messages[0].content, /between 120 and 220 words/);
});

test("cleans wrappers and collapses prompt whitespace", () => {
  assert.equal(
    cleanPrompt(`\`\`\`text
Prompt: "A bright room
with blue walls."
\`\`\``),
    "A bright room with blue walls.",
  );
});

test("extracts string and multipart text responses", () => {
  assert.equal(
    extractPrompt({
      choices: [{ message: { content: "Prompt: A quiet coastal scene." } }],
    }),
    "A quiet coastal scene.",
  );

  assert.equal(
    extractPrompt({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "A soft portrait" },
              { type: "text", text: "with window light." },
            ],
          },
        },
      ],
    }),
    "A soft portrait with window light.",
  );
});

test("rejects empty responses and exposes useful API errors", () => {
  assert.throws(() => extractPrompt({ choices: [] }), /no usable prompt/);
  assert.throws(
    () => extractPrompt({ choices: [{ finish_reason: "length", message: { content: null } }] }),
    /ran out of room/,
  );
  assert.equal(
    extractOpenRouterError({ error: { message: "Invalid API key" } }, 401),
    "Invalid API key",
  );
  assert.equal(extractOpenRouterError(null, 500), "OpenRouter request failed (500).");
});

test("uses a chosen model and rejects malformed model IDs", () => {
  const request = buildOpenRouterRequest("https://images.example.com/a.jpg", "openai/gpt-6-luna");
  assert.equal(request.model, "openai/gpt-6-luna");
  assert.equal(request.provider.zdr, true);
  for (const bad of ["", "gpt", "openai/", "../x", "openai/gpt 6", "a/b\nc"]) {
    assert.equal(isValidModelId(bad), false, bad);
    assert.throws(() => buildOpenRouterRequest("https://images.example.com/a.jpg", bad), /valid model/);
  }
  assert.equal(isValidModelId("anthropic/claude-haiku-5.5"), true);
  assert.equal(isValidModelId("qwen/qwen3.8-max:free"), true);
});

const model = (id, name, input, output, extra = {}) => ({
  id, name, created: extra.created || 1,
  architecture: { input_modalities: input, output_modalities: output },
  pricing: { prompt: extra.price ?? "0.000001", completion: "0.000002" },
});

test("keeps only zero-retention vision models that answer in text", () => {
  const catalog = parseVisionCatalog(
    { data: [
      model("openai/gpt-6-luna", "OpenAI: GPT-6 Luna", ["text", "image"], ["text"], { created: 5 }),
      model("openai/gpt-6-luna:batch", "OpenAI: GPT-6 Luna (batch)", ["text", "image"], ["text"]),
      model("google/nano-banana", "Google: Nano Banana", ["text", "image"], ["text", "image"]),
      model("text/only", "Text: Only", ["text"], ["text"]),
      model("router/auto", "Router: Auto", ["text", "image"], ["text"], { price: "-1" }),
      model("noretention/x", "No: Retention", ["image"], ["text"]),
      model("anthropic/claude-haiku-5.5", "Anthropic: Claude Haiku 5.5", ["image"], ["text"], { created: 9 }),
    ] },
    { data: [{ model_id: "openai/gpt-6-luna" }, { model_id: "anthropic/claude-haiku-5.5" }, { model_id: "router/auto" }] },
  );
  assert.deepEqual(catalog.map((item) => item.id), ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"]);
  assert.equal(catalog[0].inputPricePerMillion, 1);
  assert.equal(catalog[0].outputPricePerMillion, 2);
  // Without the ZDR list, nothing is excluded for retention.
  assert.equal(parseVisionCatalog({ data: [model("noretention/x", "No: Retention", ["image"], ["text"])] }, null).length, 1);
});

test("groups tested models first, then makers by size", () => {
  const groups = groupCatalog([
    { id: "openai/gpt-6-luna", name: "OpenAI: GPT-6 Luna" },
    { id: "openai/gpt-7", name: "OpenAI: GPT-7" },
    { id: "openai/gpt-8", name: "OpenAI: GPT-8" },
    { id: "mistralai/m", name: "Mistral: M" },
  ], [{ id: "openai/gpt-6-luna", name: "OpenAI: GPT-6 Luna", note: "Cheapest" }]);
  assert.deepEqual(groups.map((group) => group.label), ["Tested", "OpenAI", "Mistral"]);
  assert.equal(groups[0].models[0].note, "Cheapest");
  assert.deepEqual(groups[1].models.map((item) => item.id), ["openai/gpt-7", "openai/gpt-8"]);
  assert.equal(shortModelLabel({ name: "OpenAI: GPT-6 Luna" }), "GPT-6 Luna");
});

test("the default is the first tested model OpenRouter still offers", () => {
  const tested = [{ id: "a/first" }, { id: "b/second" }, { id: "c/third" }];
  assert.equal(resolveDefaultModel([{ id: "b/second" }, { id: "a/first" }], tested), "a/first");
  assert.equal(resolveDefaultModel([{ id: "c/third" }, { id: "b/second" }], tested), "b/second");
  // Offline or unknown catalog: fall back to the first recommendation.
  assert.equal(resolveDefaultModel([], tested), "a/first");
  assert.equal(resolveDefaultModel([]), TESTED_MODELS[0].id);
});

test("builds direct requests in each provider's own format", () => {
  const url = "https://images.example.com/photo.webp";

  const openai = buildDirectRequest("openai", "sk-test", url, "gpt-5.4-mini");
  assert.equal(openai.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(openai.headers.Authorization, "Bearer sk-test");
  assert.equal(openai.body.messages[1].content[1].image_url.url, url);
  assert.equal(openai.body.reasoning_effort, "low");
  assert.equal("temperature" in openai.body, false);
  assert.equal("reasoning_effort" in buildDirectRequest("openai", "k", url, "gpt-4o-mini").body, false);

  const anthropic = buildDirectRequest("anthropic", "sk-ant", url, "claude-haiku-5-5");
  assert.equal(anthropic.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropic.headers["x-api-key"], "sk-ant");
  assert.equal(anthropic.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.deepEqual(anthropic.body.messages[0].content[0], { type: "image", source: { type: "url", url } });
  assert.match(anthropic.body.system, /between 120 and 220 words/);

  const google = buildDirectRequest("google", "AIza", url, "gemini-3.8-flash");
  assert.equal(google.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.equal(google.headers["x-goog-api-key"], "AIza");
  assert.deepEqual(google.body.contents[0].parts[0], { fileData: { mimeType: "image/webp", fileUri: url } });
});

test("sends embedded images as data to direct providers", () => {
  const dataUrl = "data:image/png;base64,AA==";
  assert.deepEqual(
    buildDirectRequest("anthropic", "k", dataUrl, "claude-haiku-5-5").body.messages[0].content[0].source,
    { type: "base64", media_type: "image/png", data: "AA==" },
  );
  assert.deepEqual(
    buildDirectRequest("google", "k", dataUrl, "gemini-3.8-flash").body.contents[0].parts[0],
    { inlineData: { mimeType: "image/png", data: "AA==" } },
  );
  assert.equal(buildDirectRequest("openai", "k", dataUrl, "gpt-5.4-mini").body.messages[1].content[1].image_url.url, dataUrl);
});

test("rejects bad direct model IDs and providers", () => {
  for (const bad of ["", "../x", "a/b", "gpt 5", "-x"]) {
    assert.equal(isValidDirectModelId(bad), false, bad);
    assert.throws(() => buildDirectRequest("openai", "k", "https://e.com/a.jpg", bad), /valid model/);
  }
  assert.equal(isValidDirectModelId("claude-haiku-5-5"), true);
  assert.equal(isValidDirectModelId("gemini-3.8-flash"), true);
  assert.equal(providerOrDefault("anthropic"), "anthropic");
  assert.equal(providerOrDefault("__proto__"), "openrouter");
  assert.equal(providerOrDefault(undefined), "openrouter");
  assert.throws(() => buildDirectCatalogRequest("nope", "k"), /provider/);
});

test("keeps each provider's models that read images", () => {
  assert.deepEqual(
    parseDirectCatalog("openai", { data: [
      { id: "gpt-5.4-mini", created: 3 }, { id: "gpt-4o-audio-preview", created: 9 },
      { id: "o4-mini", created: 2 }, { id: "text-embedding-3-large", created: 9 }, { id: "dall-e-3", created: 9 },
    ] }).map((model) => model.id),
    ["gpt-5.4-mini", "o4-mini"],
  );
  const claude = parseDirectCatalog("anthropic", { data: [
    { id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5", created_at: "2026-09-01T00:00:00Z" },
    { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2026-09-02T00:00:00Z" },
  ] });
  assert.deepEqual(claude.map((model) => model.id), ["claude-sonnet-5-5", "claude-haiku-5-5"]);
  assert.equal(claude[0].name, "Claude Sonnet 5.5");
  assert.deepEqual(
    parseDirectCatalog("google", { models: [
      { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
      { name: "models/gemini-3.8-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/imagen-4", supportedGenerationMethods: ["predict"] },
    ] }).map((model) => model.id),
    ["gemini-3.8-flash"],
  );
});

test("the direct default follows the tested model when the key can use it", () => {
  assert.equal(resolveDirectDefault("anthropic", [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }]), "claude-haiku-5-5");
  assert.equal(resolveDirectDefault("openai", [{ id: "gpt-9" }]), "gpt-9");
  assert.equal(resolveDirectDefault("google", []), "gemini-3.8-flash");
});

test("reads prompts and errors from each provider", () => {
  assert.equal(
    extractDirectPrompt("anthropic", { content: [{ type: "text", text: "Prompt: A red door." }] }),
    "A red door.",
  );
  assert.throws(() => extractDirectPrompt("anthropic", { content: [], stop_reason: "max_tokens" }), /ran out of room/);
  assert.equal(
    extractDirectPrompt("google", { candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "A quiet harbor." }] } }] }),
    "A quiet harbor.",
  );
  assert.throws(() => extractDirectPrompt("google", { promptFeedback: { blockReason: "SAFETY" } }), /declined this image \(SAFETY\)/);
  assert.equal(extractDirectPrompt("openai", { choices: [{ message: { content: "A blue cup." } }] }), "A blue cup.");
  assert.throws(() => extractDirectPrompt("openai", { choices: [] }), /OpenAI returned no usable prompt/);
  assert.equal(extractProviderError([{ error: { message: "API key not valid" } }], 400, "Google"), "API key not valid");
  assert.equal(extractProviderError(null, 529, "Anthropic"), "Anthropic request failed (529).");
});
