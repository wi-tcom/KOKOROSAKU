// Adopted-schema validator coverage gate (2026-09-23 overall check; Owner
// 「進めてください」).
//
// The Builder validates Characters with a hand-written engine
// (tools/v1/adopted-schema-validator.mjs). The overall check found it silently
// skipping two keywords the adopted schemas use (maxLength, propertyNames),
// comparing objects by their key order (uniqueItems, const, enum), and leaving
// out rules the schemas state in x-wit-semantic-validation. Each of those
// accepted a Character the schema refuses.
//
//   K. every keyword the two adopted schemas use is one the engine evaluates or
//      a known annotation — walked over the schemas, so a keyword added to the
//      schema without support fails here instead of being skipped
//   N. each gap, as a Character: refused now, with the keyword and the path;
//      the code on main accepted it (the gap was real)
//   S. the stated semantic rules the engine now enforces: map key = entry
//      extension_id, unknown CRITICAL extension fails closed, one
//      requirement_id per reference list; a NONCRITICAL extension is kept
//   R. no false refusals: every Character this repository ships or tests with,
//      and the sold packs when present
//   A. the import gate (admit) refuses the same shapes
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const readJson = rel => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const mod = rel => import(pathToFileURL(path.join(ROOT, rel)).href);

const V = await mod("tools/v1/adopted-schema-validator.mjs");
const S = await mod("tools/unified-v1/character-schema.mjs");
const { loadAdoptedSchemaFromRepository } = await mod("tools/v1/adopted-schema-node.mjs");
const schema = loadAdoptedSchemaFromRepository();
const SCHEMA_FILES = ["tests/fixtures/canonical/saku-unified-character.v1.schema.json", "tests/fixtures/canonical/character-extension.v1.schema.json"];

// ── K. keyword coverage ─────────────────────────────────────────────────────
{
  check(Array.isArray(V.SUPPORTED_KEYWORDS) && V.SUPPORTED_KEYWORDS.length > 10, "K: the engine declares the keywords it evaluates");
  check(Array.isArray(V.ANNOTATION_KEYWORDS), "K: …and the ones it deliberately ignores (annotations)");
  const MAPS = new Set(["properties", "$defs", "definitions", "patternProperties", "dependentSchemas"]);
  const used = new Map();
  const walk = (node, where) => {
    if (Array.isArray(node)) { node.forEach((child, i) => walk(child, `${where}/${i}`)); return; }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (!used.has(key)) used.set(key, where);
      if (key.startsWith("x-")) continue;                    // x-wit-* documents; rules it states are enforced in S
      if (MAPS.has(key)) { for (const [name, child] of Object.entries(value || {})) walk(child, `${where}/${key}/${name}`); }
      else if (key === "enum" || key === "const") continue;  // values, not schemas
      else if (value && typeof value === "object") walk(value, `${where}/${key}`);
    }
  };
  for (const file of SCHEMA_FILES) walk(readJson(file), path.basename(file));
  const unknown = [...used].filter(([key]) => !key.startsWith("x-") && !V.SUPPORTED_KEYWORDS.includes(key) && !V.ANNOTATION_KEYWORDS.includes(key));
  equal(unknown.map(([key, where]) => `${key} (${where})`).join(", "), "", "K: every keyword the adopted schemas use is evaluated or a known annotation");
  for (const key of ["maxLength", "propertyNames"]) check(used.has(key) && V.SUPPORTED_KEYWORDS.includes(key), `K: ${key} is used by the schemas and evaluated by the engine`);
}

// ── fixtures ────────────────────────────────────────────────────────────────
const sample = readJson("tools/unified-v1/sample-pack/sample-characters.json").characters[0];
const entry = (id, criticality = "NONCRITICAL") => ({ extension_id: id, version: "1.0.0", criticality, semantic_scope: "CHARACTER_SEMANTICS_ONLY", value: { note: true } });
const withExtensions = map => { const c = structuredClone(sample); c.extensions = map; return c; };
const ref0 = () => structuredClone(sample.conformance_expectations.must_preserve_refs[0]);
const NEGATIVES = [
  ["an extension key longer than 255 characters", () => { const key = `a.${"b".repeat(298)}`; return withExtensions({ [key]: entry(key) }); }, "maxLength"],
  ["an extension key that is not a namespaced id ('BAD KEY'), entry id valid", () => withExtensions({ "BAD KEY": entry("com.example.valid") }), "pattern", "/extensions"],
  ["an extension key without a dot ('solo')", () => withExtensions({ solo: entry("com.example.valid") }), "pattern", "/extensions"],
  ["an upper-case extension key", () => withExtensions({ "UPPER.CASE": entry("com.example.valid") }), "pattern", "/extensions"],
  ["an extension map key that differs from its entry's extension_id", () => withExtensions({ "com.example.a": entry("com.example.b") }), "extensionKeyMismatch"],
  ["an unknown CRITICAL extension", () => withExtensions({ "com.unknown.critical": entry("com.unknown.critical", "CRITICAL") }), "unknownCriticalExtension"],
  ["the same reference twice, keys in another order", () => { const c = structuredClone(sample); const r = ref0(); c.conformance_expectations.must_preserve_refs = [r, Object.fromEntries(Object.entries(r).reverse())]; return c; }, "uniqueItems"],
  ["the same requirement_id twice in one list, locators differing", () => { const c = structuredClone(sample); const r = ref0(); const other = { ...r }; delete other.locator; c.conformance_expectations.must_preserve_refs = [r, other]; return c; }, "duplicateReferenceRequirementId"],
];

// ── N. each gap: refused now, accepted by main ──────────────────────────────
{
  const tmp = mkdtempSync(path.join(tmpdir(), "saku-keywords-main-"));
  let Main = null;
  try {
    const dirV1 = path.join(tmp, "tools", "v1"), dirU = path.join(tmp, "tools", "unified-v1");
    for (const dir of [dirV1, dirU]) execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(dir)},{recursive:true})`]);
    writeFileSync(path.join(dirV1, "adopted-schema-validator.mjs"), execFileSync("git", ["show", "origin/main:tools/v1/adopted-schema-validator.mjs"], { cwd: ROOT, maxBuffer: 1 << 24 }));
    writeFileSync(path.join(dirU, "unified-schema-v1.mjs"), execFileSync("git", ["show", "origin/main:tools/unified-v1/unified-schema-v1.mjs"], { cwd: ROOT, maxBuffer: 1 << 24 }));
    const mainText = readFileSync(path.join(dirV1, "adopted-schema-validator.mjs"), "utf8");
    if (mainText.includes("SUPPORTED_KEYWORDS")) skipped.push("N: main already carries this change — before/after comparison not applicable");
    else Main = await import(pathToFileURL(path.join(dirV1, "adopted-schema-validator.mjs")).href);
    for (const [what, make, keyword, pathStart] of NEGATIVES) {
      const character = make();
      const now = V.validateCompleteAdoptedCharacter(character, schema);
      equal(now.ok, false, `N: refused — ${what}`);
      const hit = now.errors.find(e => e.keyword === keyword && (!pathStart || e.path.startsWith(pathStart)));
      check(Boolean(hit), `N: …by ${keyword}${pathStart ? ` at ${pathStart}` : ""} (${now.errors.map(e => `${e.keyword}@${e.path}`).slice(0, 4).join(", ")})`);
      if (Main) equal(Main.validateCompleteAdoptedCharacter(character, schema).ok, true, `N: main's validator accepted it — ${what}`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ── S. what the stated rules still allow ────────────────────────────────────
{
  const kept = withExtensions({ "com.example.note": entry("com.example.note") });
  const verdict = V.validateCompleteAdoptedCharacter(kept, schema);
  check(verdict.ok, `S: a well-formed NONCRITICAL extension is kept (unknown_confirmed_noncritical: preserve) (${verdict.errors.map(e => e.keyword).join(",")})`);
  const same = structuredClone(sample);
  same.conformance_expectations.must_preserve_refs = [ref0()];
  same.conformance_expectations.prohibited_drift_refs = [ref0()];
  check(V.validateCompleteAdoptedCharacter(same, schema).ok, "S: the same requirement_id in two different lists is allowed (the rule is one per list)");
  const length255 = `a.${"b".repeat(253)}`;
  check(V.validateCompleteAdoptedCharacter(withExtensions({ [length255]: entry(length255) }), schema).ok, "S: a key of exactly 255 characters is allowed (maxLength is inclusive)");
  const astral = `a.${"𝒜".repeat(253)}`;
  const astralResult = V.validateCompleteAdoptedCharacter(withExtensions({ [astral]: entry(astral) }), schema);
  check(!astralResult.errors.some(e => e.keyword === "maxLength"), "S: maxLength counts characters, not UTF-16 units (253 astral characters + 2 = 255)");
}

// ── R. no false refusals ────────────────────────────────────────────────────
{
  function unzip(buffer) {
    const out = new Map();
    const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) return out;
    const count = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i += 1) {
      const method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20);
      const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
      const local = buffer.readUInt32LE(offset + 42);
      const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
      const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + compressed);
      out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return out;
  }
  const corpus = readJson("tools/unified-v1/sample-pack/sample-characters.json").characters.map((c, i) => [`sample#${i}`, c]);
  const LOCATORS = "tests/fixtures/conformance-locators";
  for (const item of readJson(`${LOCATORS}/INDEX.json`).cases.filter(c => !c.expected_mismatches)) corpus.push([item.file, readJson(`${LOCATORS}/${item.file}`)]);
  const PACKS = process.env.SAKU_PACK_FIXTURES || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
  if (existsSync(PACKS)) {
    for (const file of readdirSync(PACKS).filter(f => f.endsWith(".zip") && !f.startsWith("devkey-"))) {
      const walk = archive => { for (const [name, bytes] of archive) { if (name.endsWith(".zip")) walk(unzip(bytes)); else if (name.endsWith("character.json")) corpus.push([`${file}:${name}`, JSON.parse(bytes.toString("utf8"))]); } };
      walk(unzip(readFileSync(path.join(PACKS, file))));
    }
  } else skipped.push(`R: sold pack fixtures absent at ${PACKS}`);
  const refused = corpus.filter(([, c]) => !V.validateCompleteAdoptedCharacter(c, schema).ok).map(([label]) => label);
  equal(refused.join(", "), "", `R: every shipped and tested Character is still accepted (${corpus.length})`);
  check(corpus.length >= 5, `R: the corpus is not empty (${corpus.length})`);
}

// ── A. the import gate refuses them too ─────────────────────────────────────
for (const [what, make] of NEGATIVES) {
  const verdict = S.admit(make(), { schema });
  equal(verdict.code, S.ADOPTED_SCHEMA_VALIDATION_FAILED, `A: the import gate refuses — ${what}`);
}

console.log(JSON.stringify({ cases: cases.length, skipped }, null, 2));
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`SCHEMA_KEYWORDS PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped)` : ""}`);
