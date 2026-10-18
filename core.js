export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
// Public lists; neither needs the API key.
export const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_ZDR_ENDPOINT = "https://openrouter.ai/api/v1/endpoints/zdr";
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

// Checked against real images with this extension's system prompt. "note" is
// shown in settings; keep it to what the test actually showed.
// Tested 2026-10-11 on three Unsplash images (portrait, aerial city, product
// render) with these instructions. Order is the recommendation: the default is
// the first entry OpenRouter currently offers, so reordering this list changes
// the default and a retired model hands over to the next one.
export const TESTED_MODELS = Object.freeze([
  { id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5", note: "Recommended · accurate · about $0.0004 per image · often 220–240 words" },
  { id: "openai/gpt-5.4-mini", name: "OpenAI: GPT-5.4 Mini", note: "Accurate · about $0.002 per image" },
  { id: "google/gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", note: "Accurate · shorter prompts (150–175 words)" },
  { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5", note: "Most vivid · about $0.008 per image · runs 230–250 words" },
  { id: "openai/gpt-6-luna", name: "OpenAI: GPT-6 Luna", note: "Cheapest, but often calls real photos 3D renders" },
  { id: "openai/gpt-6.1-sol", name: "OpenAI: GPT-6.1 Sol", note: "Thorough but slow (8–10 s); once returned nothing" },
]);

// The recommended default, resolved at run time instead of fixed in code.
export function resolveDefaultModel(availableModels = [], tested = TESTED_MODELS) {
  const available = new Set(availableModels.map((model) => model.id));
  return (tested.find((model) => available.has(model.id)) || tested[0]).id;
}


const MAX_DATA_URL_LENGTH = 20 * 1024 * 1024;

const SYSTEM_PROMPT = `You are an expert visual prompt writer. Study only what is visible in the supplied image and return exactly one image-generation prompt that any text-to-image model can use as written. Your entire response must be a single paragraph between 120 and 220 words.

Write the paragraph in this order, skipping anything the image does not show:
1. Form and crop: the medium (photograph, illustration, painting, 3D render, graphic design), orientation and approximate aspect ratio written as a ratio such as 3:2 (never pixel sizes), and how much of the subject the frame contains. Call it a photograph when it shows a real-world capture; name another medium only when there are clear signs of it, such as visible strokes, flat shading, or impossible geometry.
2. Subject: count, pose, action, expression, clothing or defining details, and where it sits in the frame.
3. Setting: foreground, middle ground, and background, and how they relate.
4. Camera: viewpoint height and direction, distance to the subject, perspective, which plane is in focus and how quickly focus falls off, and any motion.
5. Light: where it comes from, how hard or soft it is, contrast, and how highlights and shadows fall.
6. Color and surfaces: palette, materials, textures, and how surfaces respond to the light.
7. Finish: grain or noise, sharpness, retouching, print or screen character, and the resulting mood.

Rules:
- Describe visible effects, not equipment. Write "camera just below eye level, background dissolved into soft blur" instead of focal lengths, apertures, camera bodies, lenses, film stocks, or render engines.
- Use plain descriptive sentences that any image model understands. No model-specific syntax: no parameters, weights, tags, keyword lists, brackets, or double colons.
- Start directly with the image; do not use labels, preambles, quotation marks, markdown, JSON, lists, or a negative prompt.
- Express mood through what causes it (light, color, posture, space) rather than adjectives alone. Prefer precise visual language over interpretation or story.
- Do not identify real people or infer identity, ethnicity, health, personality, or other sensitive traits. Describe visible appearance neutrally.
- Do not name an artist, brand, or image model unless its name is plainly visible and materially relevant.
- Reproduce visible text only when it is clearly legible; otherwise describe its placement and treatment.
- When a detail is uncertain, use broader accurate language instead of inventing it.
- Write between 120 and 220 words. A simple image still needs 120; a detailed image must stay under 220, so keep the details that most change the picture and drop the rest. Before responding, silently confirm the length and that the order above is followed.`;

export function validateImageSource(source) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("The selected image does not have a usable source.");
  }

  if (source.startsWith("data:")) {
    if (!/^data:image\/[a-z0-9.+-]+[;,]/i.test(source)) {
      throw new Error("The selected data URL is not an image.");
    }

    if (source.length > MAX_DATA_URL_LENGTH) {
      throw new Error("This embedded image is too large for v0.");
    }

    return source;
  }

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error("The selected image URL is invalid.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      "v0 supports public web images and image data URLs. Blob and local images are not supported yet.",
    );
  }

  return parsed.href;
}

export function isValidModelId(value) {
  return typeof value === "string" && value.length <= 120 &&
    /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(value);
}

function perMillion(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 1e6 * 1000) / 1000 : null;
}

// Vision models that return text, minus batch-only variants and routers with
// no fixed price. When the zero-data-retention list is available, keep only
// models it covers, because every request requires ZDR routing.
export function parseVisionCatalog(modelsPayload, zdrPayload) {
  const zdrIds = Array.isArray(zdrPayload?.data)
    ? new Set(zdrPayload.data.map((endpoint) => endpoint?.model_id).filter(Boolean))
    : null;
  const models = [];
  for (const model of Array.isArray(modelsPayload?.data) ? modelsPayload.data : []) {
    const architecture = model?.architecture || {};
    const inputs = architecture.input_modalities || [];
    const outputs = architecture.output_modalities || [];
    const price = perMillion(model?.pricing?.prompt);
    if (!isValidModelId(model?.id) || model.id.endsWith(":batch")) continue;
    if (!inputs.includes("image") || outputs.length !== 1 || outputs[0] !== "text") continue;
    if (price === null) continue;
    if (zdrIds && !zdrIds.has(model.id)) continue;
    models.push({
      id: model.id,
      name: String(model.name || model.id).slice(0, 120),
      created: Number(model.created) || 0,
      inputPricePerMillion: price,
      outputPricePerMillion: perMillion(model?.pricing?.completion),
    });
  }
  return models.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
}

export function providerLabel(model) {
  const [prefix] = String(model?.name || "").split(": ");
  return prefix && prefix !== model?.name ? prefix : String(model?.id || "").split("/")[0];
}

export function shortModelLabel(model) {
  const name = String(model?.name || model?.id || "");
  return name.includes(": ") ? name.split(": ").slice(1).join(": ") : name;
}

// Tested models first, then makers with the most models, newest first within.
export function groupCatalog(models, tested = TESTED_MODELS) {
  const byId = new Map(models.map((model) => [model.id, model]));
  const testedIds = new Set(tested.map((model) => model.id));
  const groups = [{ label: "Tested", models: tested.map((model) => ({ ...byId.get(model.id), ...model })) }];
  const byProvider = new Map();
  for (const model of models) {
    if (testedIds.has(model.id)) continue;
    const label = providerLabel(model);
    if (!byProvider.has(label)) byProvider.set(label, []);
    byProvider.get(label).push(model);
  }
  return groups.concat(
    [...byProvider.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([label, list]) => ({ label, models: list })),
  );
}

export function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

const USER_TEXT =
  "Study this image closely, then write the single 120–220 word reconstruction prompt. Return only that one paragraph.";

export function buildOpenRouterRequest(imageSource, modelId) {
  const imageUrl = validateImageSource(imageSource);
  if (!isValidModelId(modelId)) {
    throw new Error("Choose a valid model in settings.");
  }

  return {
    model: modelId,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: USER_TEXT,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
    provider: {
      zdr: true,
      data_collection: "deny",
    },
    temperature: 0.2,
    // Thinking models spend output tokens on reasoning first; keep it short
    // and leave room for the paragraph. Other models ignore this field.
    reasoning: { effort: "low", exclude: true },
    max_tokens: 1500,
  };
}

export function cleanPrompt(value) {
  if (typeof value !== "string") {
    return "";
  }

  let prompt = value.trim();
  prompt = prompt.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "");
  prompt = prompt.replace(/^(?:image\s+)?prompt\s*:\s*/i, "");

  if (
    prompt.length > 1 &&
    ((prompt.startsWith('"') && prompt.endsWith('"')) ||
      (prompt.startsWith("“") && prompt.endsWith("”")))
  ) {
    prompt = prompt.slice(1, -1);
  }

  return prompt.replace(/\s+/g, " ").trim();
}

export function extractPrompt(payload, label = "OpenRouter") {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    const prompt = cleanPrompt(content);
    if (prompt) return prompt;
  }

  if (Array.isArray(content)) {
    const prompt = cleanPrompt(
      content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join(" "),
    );
    if (prompt) return prompt;
  }

  if (payload?.choices?.[0]?.finish_reason === "length") {
    throw new Error("This model ran out of room before writing a prompt. Try another model.");
  }
  throw new Error(`${label} returned no usable prompt. Try another model.`);
}

export function extractOpenRouterError(payload, status) {
  return extractProviderError(payload, status, "OpenRouter");
}

export function extractProviderError(payload, status, label) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const message =
    first?.error?.message ||
    first?.message ||
    (typeof first?.error === "string" ? first.error : "");

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return `${label} request failed (${status}).`;
}

// Direct providers use the person's own key instead of OpenRouter. Each is
// reachable only after the person grants its API origin in settings, so the
// manifest lists them as optional host permissions.
export const PROVIDERS = Object.freeze({
  openrouter: { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-v1-…", keysUrl: "https://openrouter.ai/settings/keys", origin: "https://openrouter.ai/*" },
  openai: { id: "openai", label: "OpenAI", placeholder: "sk-…", keysUrl: "https://platform.openai.com/api-keys", origin: "https://api.openai.com/*", recommended: ["gpt-5.4-mini", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"] },
  anthropic: { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…", keysUrl: "https://console.anthropic.com/settings/keys", origin: "https://api.anthropic.com/*", recommended: ["claude-haiku-5-5", "claude-sonnet-5-5"] },
  google: { id: "google", label: "Google", placeholder: "AIza…", keysUrl: "https://aistudio.google.com/apikey", origin: "https://generativelanguage.googleapis.com/*", recommended: ["gemini-3.8-flash", "gemini-2.5-flash"] },
});
export const DIRECT_PROVIDERS = Object.freeze(["openai", "anthropic", "google"]);

export function providerOrDefault(value) {
  return Object.hasOwn(PROVIDERS, value) ? value : "openrouter";
}

export function isValidDirectModelId(value) {
  return typeof value === "string" && value.length <= 120 &&
    /^[a-z0-9][a-z0-9._:-]*$/i.test(value);
}

// The first recommended model the provider lists for this key, else its newest.
export function resolveDirectDefault(provider, models = []) {
  const ids = new Set(models.map((model) => model.id));
  const recommended = PROVIDERS[provider]?.recommended || [];
  return recommended.find((id) => ids.has(id)) || models[0]?.id || recommended[0] || "";
}

const OPENAI_SKIP = /(audio|realtime|transcribe|tts|search|image|embedding|instruct|moderation|codex|dall-e|whisper|babbage|davinci)/i;
const GOOGLE_SKIP = /(embedding|tts|image|live|audio|aqa)/i;

// Each provider's own model list, trimmed to models that read images and write text.
export function parseDirectCatalog(provider, payload) {
  const models = [];
  if (provider === "openai") {
    for (const model of Array.isArray(payload?.data) ? payload.data : []) {
      const id = model?.id;
      if (!isValidDirectModelId(id) || !/^(gpt-|o\d|chatgpt-)/i.test(id) || OPENAI_SKIP.test(id)) continue;
      models.push({ id, name: id, created: Number(model.created) || 0 });
    }
  } else if (provider === "anthropic") {
    for (const model of Array.isArray(payload?.data) ? payload.data : []) {
      const id = model?.id;
      if (!isValidDirectModelId(id) || !id.startsWith("claude-")) continue;
      models.push({ id, name: String(model.display_name || id).slice(0, 120), created: Date.parse(model.created_at) || 0 });
    }
  } else if (provider === "google") {
    for (const model of Array.isArray(payload?.models) ? payload.models : []) {
      const id = String(model?.name || "").replace(/^models\//, "");
      const methods = model?.supportedGenerationMethods || [];
      if (!isValidDirectModelId(id) || !id.startsWith("gemini") || GOOGLE_SKIP.test(id) || !methods.includes("generateContent")) continue;
      models.push({ id, name: String(model.displayName || id).slice(0, 120), created: 0 });
    }
  }
  const seen = new Set();
  return models
    .filter((model) => !seen.has(model.id) && seen.add(model.id))
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
}

export function mimeTypeFor(url) {
  const extension = (/\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1] || "").toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", heic: "image/heic", heif: "image/heif" }[extension] || "image/jpeg";
}

function dataUrlParts(url) {
  const match = /^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/is.exec(url);
  if (!match) throw new Error("The selected data URL is not an image.");
  if (match[2]) return { mimeType: match[1], data: match[3] };
  const bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { mimeType: match[1], data: btoa(binary) };
}

// URL, headers and body for one prompt request to a direct provider.
export function buildDirectRequest(provider, apiKey, imageSource, modelId) {
  const image = validateImageSource(imageSource);
  if (!isValidDirectModelId(modelId)) {
    throw new Error("Choose a valid model in settings.");
  }
  const isData = image.startsWith("data:");

  if (provider === "openai") {
    // Reasoning models reject a custom temperature and spend output tokens on
    // thinking, so leave the default temperature and room for the paragraph.
    const body = {
      model: modelId,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [{ type: "text", text: USER_TEXT }, { type: "image_url", image_url: { url: image } }] },
      ],
      max_completion_tokens: 4000,
    };
    if (/^(o\d|gpt-5|gpt-6)/i.test(modelId)) body.reasoning_effort = "low";
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    };
  }

  if (provider === "anthropic") {
    const source = isData
      ? { type: "base64", media_type: dataUrlParts(image).mimeType, data: dataUrlParts(image).data }
      : { type: "url", url: image };
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "Content-Type": "application/json",
      },
      body: {
        model: modelId,
        max_tokens: 1500,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "image", source }, { type: "text", text: USER_TEXT }] }],
      },
    };
  }

  if (provider === "google") {
    const imagePart = isData
      ? { inlineData: dataUrlParts(image) }
      : { fileData: { mimeType: mimeTypeFor(image), fileUri: image } };
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [imagePart, { text: USER_TEXT }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
      },
    };
  }

  throw new Error("Choose a provider in settings.");
}

// Model list request for a direct provider; it needs the key.
export function buildDirectCatalogRequest(provider, apiKey) {
  if (provider === "openai") {
    return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${apiKey}` } };
  }
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models?limit=100",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    };
  }
  if (provider === "google") {
    return { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers: { "x-goog-api-key": apiKey } };
  }
  throw new Error("Choose a provider in settings.");
}

export function extractDirectPrompt(provider, payload) {
  const label = PROVIDERS[provider]?.label || "The provider";
  if (provider === "openai") return extractPrompt(payload, label);

  if (provider === "anthropic") {
    const text = (Array.isArray(payload?.content) ? payload.content : [])
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join(" ");
    const prompt = cleanPrompt(text);
    if (prompt) return prompt;
    if (payload?.stop_reason === "max_tokens") {
      throw new Error("This model ran out of room before writing a prompt. Try another model.");
    }
    throw new Error(`${label} returned no usable prompt. Try another model.`);
  }

  if (provider === "google") {
    const candidate = payload?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .filter((part) => typeof part?.text === "string" && !part.thought)
      .map((part) => part.text)
      .join(" ");
    const prompt = cleanPrompt(text);
    if (prompt) return prompt;
    if (payload?.promptFeedback?.blockReason) {
      throw new Error(`Google declined this image (${payload.promptFeedback.blockReason}).`);
    }
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error("This model ran out of room before writing a prompt. Try another model.");
    }
    throw new Error(`${label} returned no usable prompt. Try another model.`);
  }

  throw new Error("Choose a provider in settings.");
}
