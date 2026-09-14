import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTERS, FIELDS, EDITABLE_DENOMINATOR, EFFECT_STATES, MANUAL_HOME_BY_SEMANTIC, READ_ONLY_SEMANTICS } from "../tools/v1/semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(ROOT, file), "utf8");
const guide = JSON.parse(await read("manual/saku-field-guide.data.json"));
const html = await read("manual/saku-field-guide.html");

assert.equal(CHAPTERS.length, 5, "the active manual must use exactly five chapters");
assert.equal(FIELDS.length, EDITABLE_DENOMINATOR);
assert.equal(guide.manual_profile, "saku.unified-v1.manual@1");
assert.equal(guide.registry_id, "saku.builder.semantic-registry@1");
assert.equal(guide.editable_denominator, EDITABLE_DENOMINATOR);
assert.deepEqual(guide.fields.map(item => item.canonicalPath), FIELDS.map(item => item.canonicalPath), "the generated guide must preserve the shared registry field order");
for (let index = 0; index < FIELDS.length; index += 1) {
  const source = FIELDS[index]; const generated = guide.fields[index];
  for (const key of ["id", "chapter", "canonicalPath", "kind", "requiredness", "editability", "classification", "effectState", "evidence", "singleHome"])
    assert.deepEqual(generated[key], source[key], `${source.canonicalPath}: shared registry property changed: ${key}`);
}
assert.equal(guide.legacy_taxonomy_active, false);
assert.equal(guide.runtime_configuration_fields, 0);

const paths = new Set();
let complete = 0;
for (const item of guide.fields) {
  assert.ok(!paths.has(item.canonicalPath), `duplicate authoring home: ${item.canonicalPath}`);
  paths.add(item.canonicalPath);
  assert.ok(CHAPTERS.some(chapter => chapter.id === item.chapter), `unknown chapter: ${item.canonicalPath}`);
  assert.ok(Object.prototype.hasOwnProperty.call(EFFECT_STATES, item.effectState), `unknown effect state: ${item.canonicalPath}`);
  for (const part of ["about", "why", "what", "example", "caution", "relatedAiBehavior", "relatedItems", "usedAt", "persistence"])
    assert.ok(item.help?.[part]?.ja?.trim() && item.help?.[part]?.en?.trim(), `${item.canonicalPath} missing ${part} ja/en`);
  assert.ok(["REQUIRED", "OPTIONAL"].includes(item.requiredness), `${item.canonicalPath} requiredness invalid`);
  assert.equal(item.editability, "USER_EDITABLE", `${item.canonicalPath} editability invalid`);
  assert.equal(item.singleHome, "P08", `${item.canonicalPath} does not have exactly one authoritative field home`);
  if (["text", "textarea"].includes(item.kind)) assert.equal(item.help.examples.length, 3, `${item.canonicalPath} must teach three writing patterns`);
  if (["enum", "enum-list"].includes(item.kind)) {
    assert.equal(item.help.optionDetails.length, item.options.length, `${item.canonicalPath} must explain every option`);
    assert.deepEqual(item.help.optionDetails.map(option => String(option.value)), item.options.map(String), `${item.canonicalPath} option help differs from selectable values`);
  }
  if (!["text", "textarea", "enum", "enum-list"].includes(item.kind)) {
    assert.ok(item.help.structuredGuide, `${item.canonicalPath} must explain repeating entries`);
    assert.ok(item.help.structuredGuide.examples.length >= 3, `${item.canonicalPath} needs multiple realistic examples`);
  }
  complete += 1;
}
for (const marker of ["data-mode=\"route\"", "data-mode=\"lookup\"", "data-mode=\"behavior\"", "PROMPT_INCLUDED_CAUTION"])
  assert.ok(html.includes(marker), `manual mode/contract missing: ${marker}`);
assert.doesNotMatch(html, /v1 60|Unified V1 22|全82|all 82/i, "retired dual taxonomy must not be active");
assert.deepEqual(guide.single_home, MANUAL_HOME_BY_SEMANTIC);
assert.deepEqual(guide.read_only_semantics, READ_ONLY_SEMANTICS);
assert.equal(guide.pages.length, 13);
assert.equal(guide.contextual_views.length, 3);

console.log(`EDITABLE_FIELD_COUNT ${EDITABLE_DENOMINATOR}`);
console.log(`FIELD_HELP_COMPLETE_COUNT ${complete}`);
console.log("FIELD_HELP_COVERAGE_PERCENT 100.0");
console.log("MANUAL_MODES 3");
console.log("FIELD_HELP PASS");
