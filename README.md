<p><img src="icons/icon128.png" width="128" height="128" alt="Reprompt icon"></p>

<h1>Reprompt - Image to Prompt</h1>

<p>Private image-to-prompt Chrome extension.<br>
Right-click any image and get one copy-ready prompt to recreate it, with your own key and no server.</p>

<p>
  <img src="https://img.shields.io/badge/Chrome-4285f4" alt="Chrome">
  <img src="https://img.shields.io/badge/Manifest%20V3-4285f4" alt="Manifest V3">
  <img src="https://img.shields.io/badge/JavaScript-f7df1e" alt="JavaScript">
</p>

<p><a href="#install">Install from source</a></p>

Reprompt turns an image you find on the web into a prompt you can paste into any image model.

- Right-click an image and get one prompt, ready to copy.
- Prompts describe what you see, not camera gear, so they work in any model as written.
- Only the image you pick leaves the page.

## How it works

Secondary-click an image on a public page, choose **Create prompt**, and click **Copy** when the popup shows the prompt. **Try another model** reruns the same image and keeps each result in its own tab for comparison. Prompts follow one order: form and crop, subject, setting, camera, light, color, finish. By default Reprompt uses the first tested model your provider offers (Claude Haiku 5.5 as of October 2026); the model logic and test results are in [docs/models-and-prompts.md](docs/models-and-prompts.md).

## Privacy

Bring a key from OpenRouter (one key for many models), OpenAI, Anthropic or Google. Keys stay in the extension's local storage, out of the page's reach. Reprompt sends only the image you picked to the provider you chose, never page text, cookies, history or the page URL. OpenRouter requests ask for zero-data-retention routing; with the other three, your account's data settings apply.

## Limits

The provider downloads the image from its address, so images behind a login, `blob:` URLs and sites that block those downloads fail (Wikimedia Commons did in testing).

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. In settings, pick a provider, paste its key and click **Save key**. OpenAI, Anthropic and Google ask once for permission to reach the provider.

The toolbar button reopens settings. Run `npm test` and `npm run check` after a change. Interface decisions are in [DESIGN.md](DESIGN.md).

---

[MIT](LICENSE)

Made by [santiagoalonso.com](https://santiagoalonso.com)
