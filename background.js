import {
  buildDirectCatalogRequest,
  buildDirectRequest,
  buildOpenRouterRequest,
  CATALOG_TTL_MS,
  countWords,
  extractDirectPrompt,
  extractOpenRouterError,
  extractPrompt,
  extractProviderError,
  isValidDirectModelId,
  isValidModelId,
  OPENROUTER_ENDPOINT,
  OPENROUTER_MODELS_ENDPOINT,
  OPENROUTER_ZDR_ENDPOINT,
  parseDirectCatalog,
  parseVisionCatalog,
  providerOrDefault,
  PROVIDERS,
  resolveDefaultModel,
  resolveDirectDefault,
  shortModelLabel,
  TESTED_MODELS,
  validateImageSource,
} from "./core.js";

const MENU_ID = "image-to-prompt-create";
const PROVIDER_KEY = "provider";
const CATALOG_KEY = "visionModelCatalog";
// OpenRouter keeps its original storage names so existing settings carry over.
const keyFor = (provider) => (provider === "openrouter" ? "openRouterApiKey" : `${provider}ApiKey`);
const modelKeyFor = (provider) => (provider === "openrouter" ? "openRouterModel" : `${provider}Model`);
const directCatalogKey = (provider) => `directCatalog:${provider}`;
const REQUEST_TIMEOUT_MS = 90_000;
const CATALOG_TIMEOUT_MS = 15_000;

function lockDownLocalStorage() {
  if (!chrome.storage.local.setAccessLevel) return;

  chrome.storage.local
    .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .catch(() => {});
}

function installContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Create prompt",
      contexts: ["image"],
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  installContextMenu();
  lockDownLocalStorage();

  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(lockDownLocalStorage);

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === "IMAGE_TO_PROMPT_OPEN_SETTINGS") {
    chrome.runtime.openOptionsPage();
    return false;
  }

  // Only the settings page refreshes or reads the full catalog. It opens in a
  // tab, so check its address rather than the absence of a tab.
  const fromSettings = String(sender.url || "").startsWith(chrome.runtime.getURL("options.html"));
  if (message?.type === "IMAGE_TO_PROMPT_GET_CATALOG" && fromSettings) {
    getVisionCatalog({ force: message.force === true }).then(sendResponse);
    return true;
  }

  if (message?.type === "IMAGE_TO_PROMPT_GET_DIRECT_CATALOG" && fromSettings) {
    getDirectCatalog(providerOrDefault(message.provider), { force: message.force === true }).then(sendResponse);
    return true;
  }

  // The on-page popup can rerun its own tab's last image with another model.
  if (message?.type === "IMAGE_TO_PROMPT_RETRY" && sender.tab?.id) {
    void retryWithModel(sender.tab.id, message.model);
    return false;
  }

  return false;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  void createPromptForImage(info.srcUrl, tab.id);
});

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Like Sidekick: a live list cached for a day, falling back to the tested
// models so settings and the popup still work offline.
async function getVisionCatalog({ force = false } = {}) {
  const { [CATALOG_KEY]: cached } = await chrome.storage.local.get(CATALOG_KEY);
  const fresh = cached?.models?.length && Date.now() - cached.fetchedAt < CATALOG_TTL_MS;
  if (fresh && !force) return { ok: true, source: "cache", ...cached };

  try {
    const [models, zdr] = await Promise.all([
      fetchJson(OPENROUTER_MODELS_ENDPOINT),
      fetchJson(OPENROUTER_ZDR_ENDPOINT).catch(() => null),
    ]);
    const parsed = parseVisionCatalog(models, zdr);
    if (!parsed.length) throw new Error("OpenRouter returned no vision models.");
    const catalog = { fetchedAt: Date.now(), zdrFiltered: Boolean(zdr), models: parsed };
    await chrome.storage.local.set({ [CATALOG_KEY]: catalog });
    return { ok: true, source: "live", ...catalog };
  } catch (error) {
    if (cached?.models?.length) {
      return { ok: true, source: "cache", ...cached, error: error.message };
    }
    return {
      ok: true,
      source: "fallback",
      fetchedAt: 0,
      models: TESTED_MODELS.map((model) => ({ ...model })),
      error: error?.message || "Could not load the model list.",
    };
  }
}

async function hasOrigin(provider) {
  return chrome.permissions.contains({ origins: [PROVIDERS[provider].origin] }).catch(() => false);
}

// A direct provider's own model list, fetched with the key and cached for a day.
async function getDirectCatalog(provider, { force = false } = {}) {
  const cacheKey = directCatalogKey(provider);
  const { [cacheKey]: cached } = await chrome.storage.local.get(cacheKey);
  const fresh = cached?.models?.length && Date.now() - cached.fetchedAt < CATALOG_TTL_MS;
  if (fresh && !force) return { ok: true, source: "cache", ...cached };

  const label = PROVIDERS[provider].label;
  const apiKey = await getApiKey(provider);
  if (!apiKey) return { ok: false, models: cached?.models || [], error: `Add your ${label} API key first.` };
  if (!(await hasOrigin(provider))) {
    return { ok: false, models: cached?.models || [], error: `Save the key again to let Reprompt reach ${label}.` };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const { url, headers } = buildDirectCatalogRequest(provider, apiKey);
    const response = await fetch(url, { headers, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(extractProviderError(payload, response.status, label));
    const models = parseDirectCatalog(provider, payload);
    if (!models.length) throw new Error(`${label} returned no models that read images.`);
    const catalog = { fetchedAt: Date.now(), models };
    await chrome.storage.local.set({ [cacheKey]: catalog });
    return { ok: true, source: "live", ...catalog };
  } catch (error) {
    const message = error?.name === "AbortError" ? `${label} took too long to answer.` : error?.message;
    return { ok: false, models: cached?.models || [], fetchedAt: cached?.fetchedAt || 0, error: message || "Could not load the model list." };
  } finally {
    clearTimeout(timeout);
  }
}

async function getProvider() {
  const { [PROVIDER_KEY]: provider } = await chrome.storage.local.get(PROVIDER_KEY);
  return providerOrDefault(provider);
}

async function modelInfo(provider, modelId) {
  if (provider !== "openrouter") {
    const { [directCatalogKey(provider)]: cached } = await chrome.storage.local.get(directCatalogKey(provider));
    return cached?.models?.find((model) => model.id === modelId) || { id: modelId, name: modelId };
  }
  const { [CATALOG_KEY]: cached } = await chrome.storage.local.get(CATALOG_KEY);
  return (
    TESTED_MODELS.find((model) => model.id === modelId) ||
    cached?.models?.find((model) => model.id === modelId) ||
    { id: modelId, name: modelId }
  );
}

// OpenRouter offers the tested models; a direct provider offers its
// recommended models and newest listed ones. The selected model is always in.
async function popupChoices(provider, selectedId) {
  let choices;
  if (provider === "openrouter") {
    choices = TESTED_MODELS.map((model) => ({ id: model.id, label: shortModelLabel(model) }));
  } else {
    const { [directCatalogKey(provider)]: cached } = await chrome.storage.local.get(directCatalogKey(provider));
    const models = cached?.models || [];
    const recommended = (PROVIDERS[provider].recommended || []).filter((id) => models.some((model) => model.id === id));
    const ids = [...new Set([...recommended, ...models.map((model) => model.id)])].slice(0, 6);
    choices = ids.map((id) => ({ id, label: models.find((model) => model.id === id)?.name || id }));
  }
  if (selectedId && !choices.some((choice) => choice.id === selectedId)) {
    choices.unshift({ id: selectedId, label: shortModelLabel(await modelInfo(provider, selectedId)) });
  }
  return choices;
}

async function sendStatus(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "IMAGE_TO_PROMPT_STATUS",
      ...payload,
    });
  } catch {
    // The page may have navigated or closed while the request was running.
  }
}

async function preparePopup(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function getApiKey(provider) {
  const key = keyFor(provider);
  const stored = await chrome.storage.local.get(key);
  return typeof stored[key] === "string" ? stored[key].trim() : "";
}

const validModelFor = (provider, value) =>
  provider === "openrouter" ? isValidModelId(value) : isValidDirectModelId(value);

// An explicit choice in settings wins; otherwise follow the recommended default.
async function getSelectedModel(provider) {
  const modelKey = modelKeyFor(provider);
  if (provider !== "openrouter") {
    const stored = await chrome.storage.local.get([modelKey, directCatalogKey(provider)]);
    if (isValidDirectModelId(stored[modelKey])) return stored[modelKey];
    return resolveDirectDefault(provider, stored[directCatalogKey(provider)]?.models || []);
  }
  const stored = await chrome.storage.local.get([modelKey, CATALOG_KEY]);
  if (isValidModelId(stored[modelKey])) return stored[modelKey];
  return resolveDefaultModel(stored[CATALOG_KEY]?.models || []);
}

async function requestDirectPrompt(provider, apiKey, imageSource, modelId) {
  const label = PROVIDERS[provider].label;
  if (!(await hasOrigin(provider))) {
    throw new Error(`Reprompt doesn't have access to ${label} yet. Open settings and save the key again.`);
  }
  const { url, headers, body } = buildDirectRequest(provider, apiKey, imageSource, modelId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(extractProviderError(payload, response.status, label));
    return extractDirectPrompt(provider, payload);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label} took too long to respond. Try again.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestPrompt(provider, apiKey, imageSource, modelId) {
  if (provider !== "openrouter") return requestDirectPrompt(provider, apiKey, imageSource, modelId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Reprompt - Image to Prompt",
      },
      body: JSON.stringify(buildOpenRouterRequest(imageSource, modelId)),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractOpenRouterError(payload, response.status));
    }

    return extractPrompt(payload);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("OpenRouter took too long to respond. Try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// The last image per tab lives in session storage so a retry still works
// after the service worker restarts. It holds only the image source.
function lastImageKey(tabId) {
  return `lastImage:${tabId}`;
}

async function retryWithModel(tabId, modelId) {
  const key = lastImageKey(tabId);
  const { [key]: imageSource } = await chrome.storage.session.get(key);
  if (!imageSource) {
    await sendStatus(tabId, {
      state: "error",
      message: "Secondary-click the image and choose Create prompt again.",
    });
    return;
  }
  if (!validModelFor(await getProvider(), modelId)) return;
  await createPromptForImage(imageSource, tabId, modelId);
}

async function createPromptForImage(imageSource, tabId, modelOverride) {
  const provider = await getProvider();
  const selected = await getSelectedModel(provider);
  const modelId = modelOverride || selected;
  const model = { id: modelId, label: shortModelLabel(await modelInfo(provider, modelId)) };
  const choices = await popupChoices(provider, selected);
  // A new right-click starts a fresh comparison; a retry adds to it.
  const fresh = !modelOverride;
  // The popup shows the sent image as a small attachment so the user can
  // confirm the right one was used. Very large embedded images are skipped.
  const image = typeof imageSource === "string" &&
    (/^https?:/i.test(imageSource) || (imageSource.startsWith("data:image/") && imageSource.length < 2_000_000))
    ? imageSource : "";
  const send = (payload) => sendStatus(tabId, { image, ...payload });
  try {
    await preparePopup(tabId);
    await send({ state: "loading", model, choices, fresh });

    const apiKey = await getApiKey(provider);
    if (!apiKey) {
      await send({
        state: "error",
        message: `Add your ${PROVIDERS[provider].label} API key before creating a prompt.`,
        showSettings: true,
      });
      return;
    }

    validateImageSource(imageSource);
    await chrome.storage.session.set({ [lastImageKey(tabId)]: imageSource }).catch(() => {});
    if (!modelId) throw new Error(`Open settings and pick a ${PROVIDERS[provider].label} model.`);
    const prompt = await requestPrompt(provider, apiKey, imageSource, modelId);
    await send({ state: "success", prompt, words: countWords(prompt), model, choices, fresh });
  } catch (error) {
    await send({
      state: "error",
      message: error?.message || "Could not create a prompt.",
      showSettings: true,
      model,
      choices,
      fresh,
    });
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(lastImageKey(tabId)).catch(() => {});
});
