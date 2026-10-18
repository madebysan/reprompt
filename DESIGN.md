# Reprompt design

## Intent

Reprompt should feel like a quiet native utility, not an AI dashboard.
The interface appears only after an explicit image action, stays out of the
way, and gives the prompt maximum visual priority.

## Principles

- **Invoked, not ambient.** No badges, overlays, hover affordances, or persistent
  page UI.
- **One job per surface.** The on-page popup handles progress, copying, and
  rerunning with another model; settings handles the API key and default model.
- **Trust through restraint.** Plain privacy language, the model named under
  every result, and no engagement mechanics.
- **Readable before decorative.** A compact 14px prompt with generous line
  height and selectable text.

## Visual system

- Warm neutral canvas and surfaces, near-black text, muted gray metadata.
- One restrained blue accent for primary actions.
- Rounded 18–20px surfaces with a light border and soft depth.
- System sans-serif for UI; system monospace only for the model identifier.
- Light and dark appearances follow the operating-system preference.
- Motion is limited to a short popup entrance and loading spinner, with reduced
  motion respected.

## Popup anatomy

- Fixed to the top-right with a safe 18px viewport inset.
- Header: name and close button.
- Body: a small thumbnail of the image that was sent (like a chat attachment,
  up to 128 × 96 px, hidden if it fails to load), then the loading state,
  selectable prompt, or concise error.
- Footer: Try another model and Copy, right-aligned. Try another model opens a
  list of model buttons above the footer (the current one marked); clicking one
  reruns the image. A list of buttons replaced a native dropdown, which some
  pages prevented from opening.
- The prompt area scrolls with a thin scrollbar in the popup's own colors.
- After a second model runs, small tabs above the prompt switch between
  results; repeats of one model are numbered. The model and word count sit
  under the prompt.
- Maximum width 420px and maximum height constrained to the viewport.

## Settings anatomy

- Purpose and usage first.
- One connection card containing the key, visibility toggle, and save action.
- One model card: a grouped select starting with **Recommended (currently …)**,
  then Tested, then makers by size; the model ID with its tested note and price;
  list freshness; and Refresh list.
- A separate privacy note explains exactly what leaves Chrome.

## Accessibility

- Dialog semantics and a live region for asynchronous states.
- Real buttons with visible keyboard focus.
- Escape closes the popup.
- Text and borders maintain legibility in both color schemes.
- No interaction depends on color alone.
