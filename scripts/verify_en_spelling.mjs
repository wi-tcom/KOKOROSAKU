// en:spelling:verify (ライター&SNS 2026-09-23): the English the product shows is
// en-US. A British spelling that slips back into a generator would carry into
// every regenerated page, so the sources that write the manual's English are
// checked as well as the generated files.
//
// Two scopes, deliberately different:
//   1 `behaviour` / `behavioural` — the words the sweep covered. Checked in the
//     EN-writing sources and in everything they generate.
//   2 a wider list of British forms — checked only in the EN *strings* of the
//     manual data, where every value is prose meant for a reader.
// The wider list is not run over source code, because there it matches things
// that must not change: the protocol value `CANCELLED` the host returns, local
// variables named `cancelled`, and quotations. `dialogue` is not on the list at
// all: it is ordinary American English for a conversation (`dialog` is the
// UI-window sense), and the translation team used it that way.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };

/** Scope 1: the swept words, everywhere the product's English is written or generated. */
const SWEPT = /\b(behaviour|behavioural)(s|al|ly)?\b/gi;
/** The files that write the manual's English, plus what they produce. */
const EN_SOURCES = Object.freeze([
  "tools/v1/help-tree.mjs", "tools/v1/semantic-registry.mjs", "tools/v1/frozen-ia-ui.mjs",
  "tools/v1/field-guide-extension.mjs", "tools/unified-v1/tuning/tuning-projection.mjs",
  "scripts/manual_content_rebaseline.mjs", "scripts/generate_frozen_ia_manual.mjs",
  "manual/saku-field-guide.data.json", "manual/saku-field-guide.html", "manual/saku-field-guide.extension.json",
  "manual/platform-guide.data.json", "manual/trainer-guide.data.json",
  "desktop/help/index.html", "desktop/help/getting-started.html", "desktop/help/tuning-faq.html",
  "desktop/i18n.mjs",   // the shell's own JA→EN table: every value here is shown to a reader
  "tools/unified-v1/trainer-ui.mjs", "tools/unified-v1/trainer-ux3-ui.mjs", "tools/unified-v1/speed-test-ui.mjs",
]);

/** Scope 2: British forms that would be wrong in a sentence a reader sees. */
export const BRITISH_IN_PROSE = (await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/directive-glossary.mjs")).href)).BRITISH_SPELLINGS;
const PROSE = new RegExp(`\\b(${Object.keys(BRITISH_IN_PROSE).join("|")})(s|d|ing)?\\b`, "gi");

// ── scope 1 ────────────────────────────────────────────────────────────────
{
  const hits = [];
  for (const rel of EN_SOURCES) {
    const full = path.join(ROOT, rel);
    try { statSync(full); } catch { continue; }
    const text = readFileSync(full, "utf8");
    for (const match of text.matchAll(SWEPT)) hits.push(`${rel}:${text.slice(0, match.index).split("\n").length}: ${match[0]}`);
  }
  assert.equal(hits.join("\n"), "", `EN-SPELLING 'behaviour' is back in the English path (the sweep of 2026-09-23 covered these files):\n${hits.join("\n")}`);
  cases.push(`EN-SPELLING no 'behaviour' in the ${EN_SOURCES.length} files that write or carry the product's English`);
}

// ── scope 2: the EN strings of the manual data ─────────────────────────────
{
  const hits = [];
  const walk = (value, at) => {
    if (typeof value === "string") { for (const match of value.matchAll(PROSE)) hits.push(`${at}: ${match[0]} → ${BRITISH_IN_PROSE[match[0].toLowerCase().replace(/(s|d|ing)$/, "")] || "(en-US form)"}`); return; }
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${at}[${index}]`)); return; }
    if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
      // EN strings only: `en`, `*_en`, and the objects that hold them
      if (typeof item === "string" && !(key === "en" || key.endsWith("_en"))) continue;
      walk(item, `${at}.${key}`);
    }
  };
  for (const rel of ["manual/saku-field-guide.data.json", "manual/platform-guide.data.json", "manual/trainer-guide.data.json", "manual/saku-field-guide.extension.json"]) {
    const full = path.join(ROOT, rel);
    try { statSync(full); } catch { continue; }
    walk(JSON.parse(readFileSync(full, "utf8")), rel);
  }
  assert.equal(hits.join("\n"), "", `EN-SPELLING British spellings in the manual's English:\n${hits.join("\n")}`);
  cases.push(`EN-SPELLING the manual's EN strings use the en-US form of ${Object.keys(BRITISH_IN_PROSE).length} checked words`);
}

// the words that started this
{
  const helpTree = readFileSync(path.join(ROOT, "tools/v1/help-tree.mjs"), "utf8");
  check(helpTree.includes('"Related AI behavior"'), "EN-SPELLING the help tree's 「関連する AI の動き」 row reads 'Related AI behavior'");
}

// falsification: a re-introduced spelling must be caught in both scopes
{
  SWEPT.lastIndex = 0; PROSE.lastIndex = 0;
  check(SWEPT.test('const label = "Related AI behaviour";'), "EN-SPELLING falsification: scope 1 catches the spelling put back into a generator");
  PROSE.lastIndex = 0;
  check(PROSE.test("Uses its own judgement about colour"), "EN-SPELLING falsification: scope 2 catches a British spelling in a sentence");
  check(!PROSE.test("Dialogue style") && !PROSE.test('result.status === "CANCELLED"'), "EN-SPELLING the check leaves 'dialogue' (ordinary American English) and the CANCELLED protocol value alone");
}

console.log(`EN_SPELLING PASS ${cases.length}/${cases.length}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("EN = en-US in the product's English and in the generators that write it");
