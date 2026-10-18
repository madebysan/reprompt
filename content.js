if (!globalThis.__imageToPromptInjected) {
  globalThis.__imageToPromptInjected = true;

  const host = document.createElement("div");
  host.id = "image-to-prompt-root";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "2147483647";
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      color-scheme: light dark;
      --itp-bg: rgba(249, 249, 247, 0.97);
      --itp-surface: rgba(255, 255, 255, 0.8);
      --itp-text: #181817;
      --itp-muted: #6a6964;
      --itp-border: rgba(24, 24, 23, 0.12);
      --itp-accent: #2f63e9;
      --itp-accent-hover: #2455cd;
      --itp-danger: #a23d3d;
      --itp-scroll: rgba(24, 24, 23, 0.22);
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    .panel {
      position: fixed;
      top: 18px;
      right: 18px;
      width: min(420px, calc(100vw - 36px));
      max-height: min(560px, calc(100vh - 36px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--itp-text);
      background: var(--itp-bg);
      border: 1px solid var(--itp-border);
      border-radius: 18px;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow:
        0 24px 70px rgba(18, 18, 16, 0.19),
        0 3px 10px rgba(18, 18, 16, 0.08);
      backdrop-filter: blur(18px) saturate(1.25);
      -webkit-backdrop-filter: blur(18px) saturate(1.25);
      pointer-events: auto;
      animation: enter 160ms ease-out;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 52px;
      padding: 10px 10px 10px 16px;
      border-bottom: 1px solid var(--itp-border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 13px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }

    button {
      appearance: none;
      border: 0;
      font: inherit;
      cursor: pointer;
    }

    .close {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 9px;
      color: var(--itp-muted);
      background: transparent;
      font-size: 20px;
      line-height: 1;
    }

    .close:hover {
      color: var(--itp-text);
      background: var(--itp-border);
    }

    .body {
      flex: 1 1 auto;
      min-height: 96px;
      padding: 18px;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--itp-scroll) transparent;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--itp-muted);
      font-size: 14px;
    }

    .spinner {
      width: 17px;
      height: 17px;
      flex: 0 0 auto;
      border: 2px solid rgba(47, 99, 233, 0.2);
      border-top-color: var(--itp-accent);
      border-radius: 50%;
      animation: spin 760ms linear infinite;
    }

    .prompt {
      margin: 0;
      color: var(--itp-text);
      font-size: 14px;
      line-height: 1.58;
      white-space: pre-wrap;
      user-select: text;
    }

    .error-title {
      margin: 0 0 7px;
      color: var(--itp-danger);
      font-size: 14px;
      font-weight: 650;
    }

    .error-copy {
      margin: 0;
      color: var(--itp-muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 10px;
      border-top: 1px solid var(--itp-border);
    }

    .action {
      min-height: 34px;
      padding: 0 14px;
      border-radius: 10px;
      color: white;
      background: var(--itp-accent);
      font-size: 12px;
      font-weight: 650;
    }

    .action:hover {
      background: var(--itp-accent-hover);
    }

    .secondary {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 10px;
      color: var(--itp-text);
      background: transparent;
      border: 1px solid var(--itp-border);
      font-size: 12px;
      font-weight: 600;
    }

    .secondary:hover {
      background: var(--itp-border);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .meta {
      margin: 12px 0 0;
      color: var(--itp-muted);
      font-size: 11px;
    }

    .attachment {
      display: block;
      max-width: 128px;
      max-height: 96px;
      margin: 0 0 14px;
      border: 1px solid var(--itp-border);
      border-radius: 10px;
      object-fit: cover;
      background: var(--itp-surface);
    }

    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0 0 12px;
    }

    .tab {
      min-height: 26px;
      padding: 0 10px;
      border-radius: 8px;
      color: var(--itp-muted);
      background: transparent;
      border: 1px solid var(--itp-border);
      font-size: 11px;
      font-weight: 600;
    }

    .tab[aria-pressed="true"] {
      color: var(--itp-text);
      border-color: var(--itp-accent);
      background: rgba(47, 99, 233, 0.1);
    }

    .menu {
      flex: none;
      display: grid;
      gap: 2px;
      padding: 8px;
      border-top: 1px solid var(--itp-border);
      max-height: 220px;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--itp-scroll) transparent;
    }

    .menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 34px;
      padding: 0 10px;
      border-radius: 9px;
      color: var(--itp-text);
      background: transparent;
      font-size: 13px;
      font-weight: 550;
      text-align: left;
    }

    .menu-item:hover {
      background: var(--itp-border);
    }

    .menu-item .current {
      color: var(--itp-muted);
      font-size: 11px;
      font-weight: 500;
    }

    .menu-hint {
      margin-right: auto;
      padding-left: 6px;
      color: var(--itp-muted);
      font-size: 12px;
    }

    .action:focus-visible,
    .secondary:focus-visible,
    .tab:focus-visible,
    .menu-item:focus-visible,
    .close:focus-visible {
      outline: 2px solid var(--itp-accent);
      outline-offset: 2px;
    }

    @keyframes enter {
      from {
        opacity: 0;
        transform: translateY(-5px) scale(0.985);
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --itp-bg: rgba(27, 27, 25, 0.96);
        --itp-surface: rgba(255, 255, 255, 0.06);
        --itp-text: #f3f2ed;
        --itp-muted: #aaa8a0;
        --itp-border: rgba(255, 255, 255, 0.11);
        --itp-danger: #f08a8a;
        --itp-scroll: rgba(255, 255, 255, 0.22);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
      .spinner {
        animation-duration: 1.5s;
      }
    }
  `;
  shadow.append(style);

  let panel;
  let currentPrompt = "";
  // Results from this image, one per model run, so models can be compared.
  let results = [];
  let shownIndex = 0;
  let lastStatus = null;

  function removePanel() {
    panel?.remove();
    panel = undefined;
    currentPrompt = "";
  }

  function closePopup() {
    removePanel();
    results = [];
    lastStatus = null;
  }

  function copyFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    shadow.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy failed");
  }

  async function copyPrompt(button) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentPrompt);
      } else {
        copyFallback(currentPrompt);
      }
      button.textContent = "Copied";
      setTimeout(() => {
        if (button.isConnected) button.textContent = "Copy";
      }, 1400);
    } catch {
      button.textContent = "Select text to copy";
    }
  }

  function makeButton(className, label, action) {
    const button = document.createElement("button");
    button.className = className;
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  // A list of buttons instead of a native <select>: some pages swallow the
  // mouse events a native dropdown needs, and buttons match the popup.
  function modelPicker(footer, status) {
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "Choose a model to rerun this image");
    for (const choice of status.choices || []) {
      const item = makeButton("menu-item", "", () => {
        chrome.runtime.sendMessage({ type: "IMAGE_TO_PROMPT_RETRY", model: choice.id });
      });
      const name = document.createElement("span");
      name.textContent = choice.label;
      item.append(name);
      if (choice.id === status.model?.id) {
        const current = document.createElement("span");
        current.className = "current";
        current.textContent = "Current";
        item.append(current);
        item.setAttribute("aria-current", "true");
      }
      menu.append(item);
    }
    footer.before(menu);

    footer.replaceChildren();
    const hint = document.createElement("span");
    hint.className = "menu-hint";
    hint.textContent = "Rerun this image with…";
    // "shown" redraws the current results without recording a new one.
    const cancel = makeButton("secondary", "Cancel", () =>
      render({ ...lastStatus, state: lastStatus.state === "success" ? "shown" : lastStatus.state }));
    footer.append(hint, cancel);
    menu.querySelector(".menu-item")?.focus();
  }

  function render(status) {
    if (status.fresh && status.state === "loading") results = [];
    if (status.state === "success") {
      const base = status.model?.label || "Model";
      const repeats = results.filter((result) => result.base === base).length;
      results.push({ base, label: repeats ? `${base} (${repeats + 1})` : base, prompt: status.prompt, words: status.words });
      shownIndex = results.length - 1;
    }
    lastStatus = status;
    removePanel();

    panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Reprompt");

    const header = document.createElement("header");
    header.className = "header";

    const brand = document.createElement("div");
    brand.className = "brand";
    const title = document.createElement("span");
    title.textContent = "Reprompt";
    brand.append(title);

    const close = makeButton("close", "×", closePopup);
    close.setAttribute("aria-label", "Close");
    header.append(brand, close);

    const body = document.createElement("div");
    body.className = "body";
    body.setAttribute("aria-live", "polite");

    // The image that was sent, shown like a chat attachment.
    if (typeof status.image === "string" && /^(https?:|data:image\/)/i.test(status.image)) {
      const attachment = document.createElement("img");
      attachment.className = "attachment";
      attachment.src = status.image;
      attachment.alt = "Image sent for this prompt";
      attachment.decoding = "async";
      attachment.addEventListener("error", () => attachment.remove());
      body.append(attachment);
    }

    const footer = document.createElement("footer");
    footer.className = "footer";

    if (status.state === "loading") {
      const loading = document.createElement("div");
      loading.className = "loading";
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      spinner.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.textContent = status.model?.label ? `Reading the image with ${status.model.label}…` : "Reading the image…";
      loading.append(spinner, copy);
      body.append(loading);
    } else if (status.state === "success" || status.state === "shown") {
      const shown = results[shownIndex];
      currentPrompt = shown.prompt;
      if (results.length > 1) {
        const tabs = document.createElement("div");
        tabs.className = "tabs";
        tabs.setAttribute("aria-label", "Results by model");
        results.forEach((result, index) => {
          const tab = makeButton("tab", result.label, () => {
            shownIndex = index;
            render({ ...lastStatus, state: "shown" });
          });
          tab.setAttribute("aria-pressed", String(index === shownIndex));
          tabs.append(tab);
        });
        body.append(tabs);
      }
      const prompt = document.createElement("p");
      prompt.className = "prompt";
      prompt.textContent = currentPrompt;
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${shown.label} · ${shown.words} words`;
      body.append(prompt, meta);
      const actions = document.createElement("div");
      actions.className = "actions";
      if (status.choices?.length) {
        actions.append(makeButton("secondary", "Try another model", () => modelPicker(footer, status)));
      }
      actions.append(makeButton("action", "Copy", (event) => copyPrompt(event.currentTarget)));
      footer.append(actions);
    } else {
      const errorTitle = document.createElement("p");
      errorTitle.className = "error-title";
      errorTitle.textContent = "Couldn’t create a prompt";
      const errorCopy = document.createElement("p");
      errorCopy.className = "error-copy";
      errorCopy.textContent = status.message || "Try another image.";
      body.append(errorTitle, errorCopy);
      if (status.model?.label) {
        const meta = document.createElement("p");
        meta.className = "meta";
        meta.textContent = status.model.label;
        body.append(meta);
      }

      const actions = document.createElement("div");
      actions.className = "actions";
      if (status.choices?.length) {
        actions.append(makeButton("secondary", "Try another model", () => modelPicker(footer, status)));
      }
      if (status.showSettings) {
        actions.append(
          makeButton("action", "Open settings", () => {
            chrome.runtime.sendMessage({ type: "IMAGE_TO_PROMPT_OPEN_SETTINGS" });
          }),
        );
      }
      footer.append(actions);
    }

    // Loading has no actions; skip the empty footer strip.
    panel.append(header, body);
    if (footer.childElementCount) panel.append(footer);
    shadow.append(panel);
    close.focus();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "IMAGE_TO_PROMPT_STATUS") {
      render(message);
    }
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && panel) closePopup();
    },
    true,
  );
}
