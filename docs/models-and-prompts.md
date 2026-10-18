# Models and prompt instructions

How Reprompt picks a model, what the prompt instructions ask for, and the model tests. The short version is the [README](../README.md).

## Model choice

Settings defaults to **Recommended**: the first model in the tested list that
OpenRouter currently offers (today Claude Haiku 5.5). The default is not fixed in
code; reordering `TESTED_MODELS` in `core.js` changes it, and a retired model
hands over to the next one. Picking a specific model overrides it. The list shows
every OpenRouter vision model that offers zero-data-retention routing, refreshed
daily from OpenRouter's public model list. In the prompt popup, **Try another
model** reruns the same image and keeps each result as a tab for comparison.

With OpenAI, Anthropic or Google, the model list comes from that provider for
your key, and **Recommended** picks the model tested here (GPT-5.4 Mini, Claude
Haiku 5.5 or Gemini 3.8 Flash) when your key can use it.

Each request asks OpenRouter for zero-data-retention routing, denies provider
data collection, and asks thinking models for low reasoning effort so they
spend their output on the prompt.

## Prompt instructions

Prompts must work in any image model as written. The instructions follow the
image-deconstruction order from the Midjourney skill: form and crop, subject,
setting, camera, light, color and surfaces, finish. They ask for visible effects
instead of equipment (no focal lengths, apertures, camera bodies, or film
stocks), no model-specific syntax, and "photograph" unless there are clear signs
of another medium.

## Tested models (2026-10-11)

Three Unsplash images (portrait photo, aerial city photo, product render), two
runs each with the current instructions:

| Model | Medium right | Words | Cost per image | Note |
| --- | --- | --- | --- | --- |
| Claude Haiku 5.5 (recommended) | 6 of 6 | 172–239 | ~$0.0004 | Often runs past 220 words |
| GPT-5.4 Mini | 6 of 6 | 186–204 | ~$0.002 | |
| Gemini 3.8 Flash | 6 of 6 | 148–175 | ~$0.002 | About 20 words before the low-reasoning setting |
| Claude Sonnet 5.5 | 6 of 6 | 231–250 | ~$0.008 | Most vivid; runs long |
| GPT-6 Luna | 2 of 6 | 194–219 | ~$0.0004 | Calls real photos 3D renders |
| GPT-6.1 Sol | not rerun | 183–200 | ~$0.005 | Slow; once returned nothing |

In a render-and-compare smoke test on a real photo, the current setup scored
41/60 against 34/60 for the previous one.

Compared with the previous instructions, lens and camera terms dropped from
several per run to none (Gemini still says "bokeh"), and every prompt now opens
with the medium and crop. Mistral Large 4 spends its whole budget thinking and
returns nothing; the popup says so and offers another model.
