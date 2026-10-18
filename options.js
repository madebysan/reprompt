import {
  groupCatalog,
  isValidDirectModelId,
  isValidModelId,
  providerOrDefault,
  PROVIDERS,
  resolveDefaultModel,
  resolveDirectDefault,
  shortModelLabel,
  TESTED_MODELS,
} from "./core.js";

// OpenRouter keeps its original storage names so existing settings carry over.
const PROVIDER_KEY = "provider";
const keyFor = (provider) => (provider === "openrouter" ? "openRouterApiKey" : `${provider}ApiKey`);
const modelKeyFor = (provider) => (provider === "openrouter" ? "openRouterModel" : `${provider}Model`);
const validModelFor = (provider, value) =>
  provider === "openrouter" ? isValidModelId(value) : isValidDirectModelId(value);

const form = document.querySelector("#settings-form");
const providerSelect = document.querySelector("#provider");
const providerHelp = document.querySelector("#provider-help");
const apiKeyLabel = document.querySelector("#api-key-label");
const apiKeyInput = document.querySelector("#api-key");
const keysLink = document.querySelector("#keys-link");
const toggleKeyButton = document.querySelector("#toggle-key");
const saveStatus = document.querySelector("#save-status");
const connectionStatus = document.querySelector("#connection-status");
const modelSelect = document.querySelector("#model");
const modelNote = document.querySelector("#model-note");
const modelHelp = document.querySelector("#model-help");
const catalogStatus = document.querySelector("#catalog-status");
const refreshButton = document.querySelector("#refresh-models");
const privacyText = document.querySelector("#privacy-text");

const AUTO = "auto";
const COPY = {
  openrouter: {
    provider: "One key reaches models from OpenAI, Anthropic, Google and others.",
    model: "The list comes from OpenRouter and refreshes daily. It shows only vision models that offer zero-data-retention routing. Tested models are checked with this extension’s instructions; others may write shorter or longer prompts. The prompt popup can rerun the same image with another model.",
    privacy: "Each request includes only the image you explicitly select. OpenRouter is instructed to use zero-data-retention providers and deny provider data collection.",
  },
  direct: {
    provider: (label) => `Uses your own ${label} key and account. Saving the key asks Chrome to let Reprompt reach ${label}.`,
    model: (label) => `The list comes from ${label} for your key and refreshes daily. Recommended follows the model tested with this extension’s instructions when your key can use it. The prompt popup can rerun the same image with another model.`,
    privacy: (label) => `Each request includes only the image you explicitly select. It goes straight to ${label} and follows your ${label} account’s data settings.`,
  },
};

let provider = "openrouter";
let catalog = [];
let selectedModel = AUTO;

async function loadProviderState() {
  const keys = [keyFor(provider), modelKeyFor(provider)];
  const stored = await chrome.storage.local.get(keys);
  const key = typeof stored[keys[0]] === "string" ? stored[keys[0]] : "";
  apiKeyInput.value = key;
  connectionStatus.classList.toggle("is-connected", Boolean(key.trim()));
  selectedModel = validModelFor(provider, stored[keys[1]]) ? stored[keys[1]] : AUTO;
}

function renderCopy() {
  const { label, placeholder, keysUrl } = PROVIDERS[provider];
  const direct = provider !== "openrouter";
  providerHelp.textContent = direct ? COPY.direct.provider(label) : COPY.openrouter.provider;
  apiKeyLabel.textContent = `${label} API key`;
  apiKeyInput.placeholder = placeholder;
  keysLink.href = keysUrl;
  keysLink.textContent = `Get a key from ${label}`;
  modelHelp.textContent = direct ? COPY.direct.model(label) : COPY.openrouter.model;
  privacyText.textContent = direct ? COPY.direct.privacy(label) : COPY.openrouter.privacy;
}

function price(model) {
  return Number.isFinite(model?.inputPricePerMillion)
    ? `$${model.inputPricePerMillion} / $${model.outputPricePerMillion ?? "?"} per 1M tokens in / out`
    : "";
}

function describe(modelId) {
  if (!modelId) {
    modelNote.textContent = "";
    return;
  }
  if (provider !== "openrouter") {
    modelNote.textContent = modelId;
    return;
  }
  const tested = TESTED_MODELS.find((model) => model.id === modelId);
  const live = catalog.find((model) => model.id === modelId);
  const parts = [modelId];
  if (tested) parts.push(`Tested: ${tested.note}`);
  else parts.push("Not tested with this extension yet.");
  if (price(live)) parts.push(price(live));
  modelNote.textContent = parts.join(" · ");
}

function recommendedModel() {
  return provider === "openrouter" ? resolveDefaultModel(catalog) : resolveDirectDefault(provider, catalog);
}

function addOption(parent, value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  parent.append(option);
}

function renderModels() {
  modelSelect.replaceChildren();
  const recommended = recommendedModel();
  const recommendedName = provider === "openrouter"
    ? shortModelLabel(TESTED_MODELS.find((model) => model.id === recommended))
    : catalog.find((model) => model.id === recommended)?.name || recommended;
  addOption(modelSelect, AUTO, recommended ? `Recommended (currently ${recommendedName})` : "Recommended");
  if (provider === "openrouter") {
    for (const group of groupCatalog(catalog)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      for (const model of group.models) {
        addOption(optgroup, model.id, group.label === "Tested" ? model.name : shortModelLabel(model));
      }
      modelSelect.append(optgroup);
    }
  } else {
    for (const model of catalog) addOption(modelSelect, model.id, model.name);
  }
  // Keep a saved model visible even if it left the provider's list.
  if (selectedModel !== AUTO && ![...modelSelect.options].some((option) => option.value === selectedModel)) {
    const option = document.createElement("option");
    option.value = selectedModel;
    option.textContent = `${selectedModel} (not in the current list)`;
    modelSelect.prepend(option);
  }
  modelSelect.value = selectedModel;
  describe(selectedModel === AUTO ? recommended : selectedModel);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function loadCatalog(force = false) {
  refreshButton.disabled = true;
  catalogStatus.textContent = force ? "Refreshing…" : "Loading models…";
  const requested = provider;
  try {
    if (requested === "openrouter") {
      const response = await chrome.runtime.sendMessage({ type: "IMAGE_TO_PROMPT_GET_CATALOG", force });
      if (requested !== provider) return;
      catalog = response?.models || [];
      catalogStatus.textContent = response?.source === "fallback"
        ? `Couldn’t reach OpenRouter; showing tested models only. ${response.error || ""}`.trim()
        : `${catalog.length} models · updated ${formatTime(response.fetchedAt)}${response?.error ? ` · refresh failed: ${response.error}` : ""}`;
    } else {
      const response = await chrome.runtime.sendMessage({ type: "IMAGE_TO_PROMPT_GET_DIRECT_CATALOG", provider: requested, force });
      if (requested !== provider) return;
      catalog = response?.models || [];
      catalogStatus.textContent = response?.ok
        ? `${catalog.length} models · updated ${formatTime(response.fetchedAt)}`
        : `${response?.error || "Couldn’t load the model list."}${catalog.length ? " Showing the last list." : ""}`;
    }
  } catch {
    if (requested !== provider) return;
    catalog = requested === "openrouter" ? TESTED_MODELS.map((model) => ({ ...model })) : [];
    catalogStatus.textContent = "Couldn’t load the model list.";
  } finally {
    if (requested === provider) {
      refreshButton.disabled = false;
      renderModels();
    }
  }
}

async function showProvider() {
  await loadProviderState();
  renderCopy();
  catalog = [];
  renderModels();
  await loadCatalog();
}

providerSelect.addEventListener("change", async () => {
  provider = providerOrDefault(providerSelect.value);
  await chrome.storage.local.set({ [PROVIDER_KEY]: provider });
  saveStatus.textContent = `New prompts use ${PROVIDERS[provider].label}.`;
  await showProvider();
});

modelSelect.addEventListener("change", async () => {
  selectedModel = modelSelect.value;
  if (selectedModel === AUTO) {
    await chrome.storage.local.remove(modelKeyFor(provider));
    describe(recommendedModel());
    catalogStatus.textContent = "Following the recommended model.";
  } else {
    await chrome.storage.local.set({ [modelKeyFor(provider)]: selectedModel });
    describe(selectedModel);
    catalogStatus.textContent = "Model saved. New prompts use it.";
  }
});

refreshButton.addEventListener("click", () => loadCatalog(true));

toggleKeyButton.addEventListener("click", () => {
  const isHidden = apiKeyInput.type === "password";
  apiKeyInput.type = isHidden ? "text" : "password";
  toggleKeyButton.textContent = isHidden ? "Hide" : "Show";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  const { label, origin } = PROVIDERS[provider];

  if (!apiKey) {
    saveStatus.textContent = "Enter an API key first.";
    apiKeyInput.focus();
    return;
  }

  // Direct providers need Chrome's permission to reach their API. The request
  // has to come straight from this click, before any other await.
  if (provider !== "openrouter") {
    const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) {
      saveStatus.textContent = `Reprompt needs permission to reach ${label} to use this key.`;
      return;
    }
  }

  await chrome.storage.local.set({ [keyFor(provider)]: apiKey, [PROVIDER_KEY]: provider });
  connectionStatus.classList.add("is-connected");
  saveStatus.textContent = "Saved locally.";
  if (provider !== "openrouter") await loadCatalog(true);

  setTimeout(() => {
    saveStatus.textContent = "";
  }, 2200);
});

const { [PROVIDER_KEY]: savedProvider } = await chrome.storage.local.get(PROVIDER_KEY);
provider = providerOrDefault(savedProvider);
providerSelect.value = provider;
await showProvider();
