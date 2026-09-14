import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async relative => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const nativeManifest = await readJson("desktop/resources/manifests/native-public.json");
const staticManifest = await readJson("desktop/resources/manifests/static-public.json");
const manifests = [nativeManifest, staticManifest];
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };

check(nativeManifest.features.character_selection === true, "Native manifest exposes Character selection");
check(staticManifest.features.character_selection === false, "Static manifest hides unavailable Character selection");
for (const manifest of manifests) {
  const sources = new Set(manifest.files.map(([source]) => source));
  for (const source of [
    "tools/saku-builder.html",
    "tools/saku-trainer.html",
    "tools/unified-v1/active-saku.mjs",
    "tools/unified-v1/handoff-binding.mjs",
    "tools/unified-v1/character-library.mjs",
  ]) check(sources.has(source), `${manifest.target} maps shared source ${source}`);
}

const expectedNamespaces = Object.freeze([
  "saku.workspace.active",
  "saku.workspace.draft",
  "saku.workspace.library",
  "saku.desktop.pendingCharacter",
  "saku.desktop.pendingCharacterBinding",
  "saku.desktop.pendingTrainerCharacter",
  "saku.desktop.pendingTrainerCharacterBinding",
  "saku.trainer.ux3",
  "saku.trainer.sessions.index",
  "saku.trainer.sessions.current",
  "saku.trainer.sessions.item.",
  "saku.trainer.pendingChangeCandidates",
  "saku.trainer.pendingChangeCandidateBinding",
  "saku.trainer.builderHandoffContext",
]);
const namespaceSources = [
  "tools/unified-v1/active-saku.mjs",
  "tools/unified-v1/character-library.mjs",
  "tools/unified-v1/handoff-binding.mjs",
  "tools/v1/trainer-ux3.mjs",
  "tools/v1/trainer-frozen-ia.mjs",
];
const namespaceText = (await Promise.all(namespaceSources.map(relative => readFile(path.join(ROOT, relative), "utf8")))).join("\n");
for (const namespace of expectedNamespaces) check(namespaceText.includes(namespace), `storage/handoff namespace unchanged: ${namespace}`);

for (const manifest of manifests) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  const query = `?manifest=${encodeURIComponent(manifest.target)}`;
  const active = await import(`${pathToFileURL(path.join(ROOT, "tools/unified-v1/active-saku.mjs")).href}${query}`);
  const handoff = await import(`${pathToFileURL(path.join(ROOT, "tools/unified-v1/handoff-binding.mjs")).href}${query}`);
  const character = { identity: { character_id: `contract-${manifest.target}`, character_revision: "1" }, purpose: { summary: "before" } };
  check(Boolean(active.setActive(character, { source: manifest.target })), `${manifest.target} active Character set`);
  const edited = structuredClone(character); edited.purpose.summary = "after";
  check(active.updateDraft(edited) && active.isDirty(), `${manifest.target} draft persists`);
  check(active.markSaved() && !active.isDirty(), `${manifest.target} save/reload contract persists`);
  check(Boolean(handoff.storeHandoff(localStorage, "trainer", edited).binding), `${manifest.target} Trainer handoff stored`);
  const first = handoff.consumeHandoff(localStorage, "trainer", edited.identity);
  const second = handoff.consumeHandoff(localStorage, "trainer", edited.identity);
  check(first.status === "ACCEPTED" && second.status === "EMPTY", `${manifest.target} handoff consumes exactly once`);
}

console.log(`DELIVERY_MANIFEST_CONTRACTS PASS ${cases.length}/${cases.length}`);
for (const label of cases) console.log(`  PASS ${label}`);
console.log("STORAGE_SESSION_HANDOFF_NAMESPACE_MUTATION 0");
