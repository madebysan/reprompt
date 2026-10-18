import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
);

test("uses the narrow Manifest V3 permission boundary", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), [
    "activeTab",
    "contextMenus",
    "scripting",
    "storage",
  ]);
  assert.deepEqual(manifest.host_permissions, ["https://openrouter.ai/*"]);
  // Direct providers are requested only when someone saves that provider's key.
  assert.deepEqual(manifest.optional_host_permissions, [
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://generativelanguage.googleapis.com/*",
  ]);
  assert.equal("content_scripts" in manifest, false);
});

test("runs a module service worker and exposes settings", () => {
  assert.deepEqual(manifest.background, {
    service_worker: "background.js",
    type: "module",
  });
  assert.equal(manifest.options_page, "options.html");
});
