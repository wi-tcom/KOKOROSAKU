// conformance_expectations locator-resolution gate (Owner instruction 2026-09-21).
//
// Four individually generated Characters (江戸編集部) shipped with their
// hard_invariants locators swapped: `requirement_id` named one invariant, the
// JSON Pointer beside it landed on the other. `admit()` accepted them because
// nothing resolved the pointer. The schema had already said what should happen
// ("Resolution or locator mismatch fails closed"); this gate proves the Builder
// now does it, on both import routes, without refusing anything that is right.
//
//   A. resolver semantics (RFC 6901: ~0/~1, "" = root, index rules, misses)
//   B. in-repo fixtures: 8 negatives refused with CONFORMANCE_LOCATOR_MISMATCH
//      and the exact mismatch count; 2 positives accepted
//   C. false positives: every Character this repository ships or tests with,
//      and — when the sibling corpora are present — the 64 catalogue, the sold
//      packs (ZIP, nested ZIP), the subscriber pack, the candidates and the
//      superseded packs: mismatches must be 0 (統制卓 re-run: 0)
//   D. falsification 20/20: the 江戸 4 with their recorded fix inverted in
//      memory must yield exactly 5 mismatches each and be refused; the fixed
//      files must be accepted 4/4
//   E. the code on main (before this change) accepts every negative — the gap
//      was real and this gate would have caught it
//   F. both import routes and the recovery path reach admit()
//   G. browser end to end: the desktop page refuses a mismatched Character on
//      the pack route (signed, digest-exact pack, one bad locator) and on the
//      file route, with the Japanese refusal text; a correct file still imports
//   H. the Builder's authoring validator (save/export, public tooling) refuses
//      the same shapes
//
// Optional corpora: SAKU_LOCATOR_CORPUS (directory; default
// ../../ClaudeCode/codex-handoff-20260911) and SAKU_PACK_FIXTURES (default
// ../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures). Absent
// corpora are reported as SKIPPED, never as PASS.
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

const Schema = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/character-schema.mjs")).href);
const Unified = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/unified-schema-v1.mjs")).href);
// admit() asks the adopted schema too (2026-09-23): every call here passes the
// one the application loads, so "admitted" means what it means on the desktop.
const { loadAdoptedSchemaFromRepository } = await import(pathToFileURL(path.join(ROOT, "tools/v1/adopted-schema-node.mjs")).href);
const ADOPTED = loadAdoptedSchemaFromRepository();
const admit = doc => Schema.admit(doc, { schema: ADOPTED });
const { resolveJsonPointer, conformanceLocatorMismatches, describeLocatorMismatch, LOCATOR_MISMATCH_CODE } = Unified;

const readJson = file => JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const charactersOf = doc => Array.isArray(doc) ? doc : doc && Array.isArray(doc.characters) ? doc.characters : doc && typeof doc === "object" ? [doc] : [];
const isCharacter = doc => doc && typeof doc === "object" && !Array.isArray(doc) && doc.conformance_expectations && typeof doc.conformance_expectations === "object";
const locatorCount = doc => Object.values(doc.conformance_expectations || {}).reduce((sum, refs) => sum + (Array.isArray(refs) ? refs.filter(ref => ref && typeof ref === "object" && "locator" in ref).length : 0), 0);

// ── A. resolver ─────────────────────────────────────────────────────────────
{
  const doc = { a: { "b/c": [{ id: "X" }, { id: "Y" }], "t~u": { id: "Z" } }, s: "str", n: null };
  equal(resolveJsonPointer(doc, "").value, doc, "A: \"\" resolves to the document");
  equal(resolveJsonPointer(doc, "/a/b~1c/1").value.id, "Y", "A: ~1 unescapes to / and array index resolves");
  equal(resolveJsonPointer(doc, "/a/t~0u").value.id, "Z", "A: ~0 unescapes to ~");
  equal(resolveJsonPointer(doc, "/a/b~1c/01").ok, false, "A: leading-zero index is refused");
  equal(resolveJsonPointer(doc, "/a/b~1c/2").ok, false, "A: out-of-range index is unresolvable");
  equal(resolveJsonPointer(doc, "/a/b~1c/-").ok, false, "A: \"-\" (append position) is unresolvable");
  equal(resolveJsonPointer(doc, "/a/zz").ok, false, "A: missing key is unresolvable");
  equal(resolveJsonPointer(doc, "/s/0").ok, false, "A: cannot descend into a string");
  equal(resolveJsonPointer(doc, "/n/x").ok, false, "A: cannot descend into null");
  equal(resolveJsonPointer(doc, "a/b").ok, false, "A: pointer without leading / is unresolvable");
  equal(resolveJsonPointer(doc, 7).ok, false, "A: non-string locator is unresolvable");
  equal(resolveJsonPointer(doc, "/a/__proto__").ok, false, "A: inherited keys are not own properties (no prototype walk)");
  equal(conformanceLocatorMismatches({}).length, 0, "A: no conformance_expectations → nothing to check");
  equal(conformanceLocatorMismatches({ conformance_expectations: { must_preserve_refs: [{ requirement_id: "R" }] } }).length, 0, "A: ref without locator is not checked");
  equal(conformanceLocatorMismatches({ conformance_expectations: { must_preserve_refs: [{ requirement_id: "R", locator: "" }] } }).length, 1, "A: ref to the root (no id) is a mismatch");
  equal(conformanceLocatorMismatches({ conformance_expectations: { x: "not-a-list", y: [null, 3, { locator: "/y/2" }] } }).length, 1, "A: non-list groups are skipped, non-object entries skipped, object entry checked");
}

// ── B. in-repo fixtures ─────────────────────────────────────────────────────
const FIXTURES = path.join(ROOT, "tests/fixtures/conformance-locators");
const index = readJson(path.join(FIXTURES, "INDEX.json"));
equal(index.cases.length, 10, "B: INDEX lists 10 fixtures");
for (const item of index.cases) {
  const doc = readJson(path.join(FIXTURES, item.file));
  const verdict = admit(doc);
  const mismatches = conformanceLocatorMismatches(doc);
  equal(mismatches.length, item.expected_mismatches, `B: ${item.file} → ${item.expected_mismatches} mismatch(es)`);
  if (item.expected_mismatches) {
    equal(verdict.accepted, false, `B: ${item.file} is refused`);
    equal(verdict.code, LOCATOR_MISMATCH_CODE, `B: ${item.file} code = ${LOCATOR_MISMATCH_CODE}`);
    equal(verdict.errors.length, item.expected_mismatches, `B: ${item.file} carries one Japanese line per mismatch`);
    for (const [k, mismatch] of mismatches.entries()) {
      check(verdict.errors[k].startsWith(`conformance_expectations.${mismatch.group}[${mismatch.index}]:`), `B: ${item.file} error ${k} names group[index]`);
      check(verdict.errors[k].includes(mismatch.resolvable ? "を指しています" : "解決できません"), `B: ${item.file} error ${k} says resolved-elsewhere or unresolvable`);
    }
    check(verdict.reason.includes(`${item.expected_mismatches} 件`), `B: ${item.file} reason carries the count`);
  } else {
    equal(verdict.accepted, true, `B: ${item.file} is accepted`);
    equal(verdict.code, "SCHEMA_RECOGNISED", `B: ${item.file} code = SCHEMA_RECOGNISED`);
  }
}
{
  const swapped = readJson(path.join(FIXTURES, "swapped-hard-invariants.json"));
  const m = conformanceLocatorMismatches(swapped);
  check(m.every(item => item.resolvable && item.resolved_id && item.resolved_id !== item.requirement_id), "B: swapped fixture — every mismatch resolves to the other invariant's id");
  equal(describeLocatorMismatch(m[0], "en").includes("points at id"), true, "B: English description available");
}

// ── C. false positives: in-repo Characters ──────────────────────────────────
const corpusReport = [];
function scanDocs(label, docs) {
  let refs = 0, files = 0, mismatched = 0, accepted = 0;
  const problems = [];
  for (const [name, doc] of docs) {
    if (!isCharacter(doc)) continue;
    files += 1; refs += locatorCount(doc);
    const m = conformanceLocatorMismatches(doc);
    if (m.length) { mismatched += 1; problems.push(`${name}: ${m.map(item => describeLocatorMismatch(item, "en")).join(" / ")}`); }
    if (admit(doc).accepted) accepted += 1;
  }
  corpusReport.push({ label, files, refs, mismatched, accepted });
  return { files, refs, mismatched, accepted, problems };
}
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
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== ".git") yield* walk(full); }
    else yield full;
  }
}
function* jsonDocs(label, bytes) {
  let doc; try { doc = JSON.parse(bytes.toString("utf8").replace(/^﻿/, "")); } catch { return; }
  const list = charactersOf(doc);
  for (const [k, c] of list.entries()) yield [`${label}${list.length > 1 ? `#${k}` : ""}`, c];
}
function* docsUnder(dir, { zips = true } = {}) {
  for (const file of walk(dir)) {
    const lower = file.toLowerCase();
    if (lower.endsWith(".json")) {
      let doc; try { doc = readJson(file); } catch { continue; }
      for (const [k, c] of charactersOf(doc).entries()) yield [`${path.relative(dir, file)}${charactersOf(doc).length > 1 ? `#${k}` : ""}`, c];
    } else if (zips && lower.endsWith(".zip")) {
      let outer; try { outer = unzip(readFileSync(file)); } catch { continue; }
      for (const [name, bytes] of outer) {
        if (name.toLowerCase().endsWith(".zip")) {
          let inner; try { inner = unzip(bytes); } catch { continue; }
          for (const [n2, b2] of inner) if (n2.toLowerCase().endsWith(".json")) yield* jsonDocs(`${path.relative(dir, file)}!${name}!${n2}`, b2);
        } else if (name.toLowerCase().endsWith(".json")) {
          yield* jsonDocs(`${path.relative(dir, file)}!${name}`, bytes);
        }
      }
    }
  }
}
{
  const inRepo = [
    ["tools/unified-v1/sample-pack/sample-characters.json", 3],
    ["desktop/resources/source/oss-sample-characters.json", 3],
  ];
  for (const [rel, expectCount] of inRepo) {
    const docs = charactersOf(readJson(path.join(ROOT, rel))).map((c, k) => [`${rel}#${k}`, c]);
    const r = scanDocs(rel, docs);
    equal(r.files, expectCount, `C: ${rel} carries ${expectCount} Characters`);
    equal(r.mismatched, 0, `C: ${rel} — 0 locator mismatches (${r.refs} locators)`);
    equal(r.accepted, expectCount, `C: ${rel} — all admitted`);
  }
  // Test packages (local-only ZIPs, gitignored) and any other tracked Character JSON.
  const pkgDir = path.join(ROOT, "tests/fixtures/packages");
  if (existsSync(pkgDir) && readdirSync(pkgDir).some(f => f.endsWith(".zip"))) {
    const docs = [...docsUnder(pkgDir)];
    const r = scanDocs("tests/fixtures/packages/*.zip", docs);
    check(docs.length > 0, `C: test packages read (${docs.length} JSON documents, ${r.files} with conformance_expectations)`);
    equal(r.mismatched, 0, `C: test packages — 0 locator mismatches (${r.refs} locators)`);
  } else skipped.push("C: tests/fixtures/packages ZIPs absent (local-only)");
  const others = [...docsUnder(path.join(ROOT, "tests/fixtures"), { zips: false })].filter(([name]) => !name.startsWith("conformance-locators"));
  const r = scanDocs("tests/fixtures/** (json, excluding conformance-locators)", others);
  equal(r.mismatched, 0, `C: other fixture Characters — 0 locator mismatches (${r.files} files, ${r.refs} locators)`);
}

// ── C'. false positives: sibling corpora ────────────────────────────────────
const CORPUS = process.env.SAKU_LOCATOR_CORPUS || path.resolve(ROOT, "../../ClaudeCode/codex-handoff-20260911");
const PACKS = process.env.SAKU_PACK_FIXTURES || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
const CORPUS_PARTS = [
  ["catalog64-unified-v1", "catalog64-unified-v1"],
  ["catalog64-pack/packs-3way-production", "packs-3way-production (json + zip)"],
  ["catalog64-pack/subscriber-pack-production", "subscriber-pack-production"],
  ["catalog64-pack/saku-character-catalog-1.0.0-unified-v1-candidate", "unified-v1 candidate"],
  ["catalog64-pack/saku-character-catalog-1.0.0-ab54-candidate", "ab54 candidate"],
  ["catalog64-pack/superseded-devkey-packs-3way", "superseded devkey packs"],
];
let corpusChecked = 0;
if (existsSync(CORPUS)) {
  for (const [rel, label] of CORPUS_PARTS) {
    const dir = path.join(CORPUS, rel);
    if (!existsSync(dir)) { skipped.push(`C': ${rel} absent`); continue; }
    const r = scanDocs(label, [...docsUnder(dir)]);
    check(r.files > 0, `C': ${label} — ${r.files} Characters read`);
    equal(r.mismatched, 0, `C': ${label} — 0 locator mismatches over ${r.refs} locators${r.problems.length ? `\n${r.problems.join("\n")}` : ""}`);
    corpusChecked += r.files;
  }
} else skipped.push(`C': corpus ${CORPUS} absent`);
if (existsSync(PACKS)) {
  const r = scanDocs("KOKOROAMU-STUDIO pack fixtures (sold packs)", [...docsUnder(PACKS)]);
  check(r.files >= 54, `C': sold-pack fixtures — ${r.files} Characters read (≥ 54)`);
  equal(r.mismatched, 0, `C': sold-pack fixtures — 0 locator mismatches over ${r.refs} locators`);
  equal(r.accepted, r.files, `C': sold-pack fixtures — all ${r.files} admitted`);
  corpusChecked += r.files;
} else skipped.push(`C': pack fixtures ${PACKS} absent`);

// ── D. falsification 20/20 — the 江戸 4 with the recorded fix inverted ───────
const EDO = path.join(CORPUS, "catalog64-pack/packs-3way-production/edo");
let edoDetected = null;
if (existsSync(EDO)) {
  const files = readdirSync(EDO).filter(f => f.endsWith(".saku-character.json")).sort();
  equal(files.length, 4, "D: four 江戸編集部 Characters present");
  let detected = 0, refsTotal = 0;
  for (const file of files) {
    const fixed = readJson(path.join(EDO, file));
    equal(conformanceLocatorMismatches(fixed).length, 0, `D: ${file} (fixed) — 0 mismatches`);
    equal(admit(fixed).accepted, true, `D: ${file} (fixed) — admitted`);
    // FIX_2026-09-21_conformance_locators.md: only the five hard_invariants
    // locators were swapped (0 ↔ 1); requirement_id, order, other keys unchanged.
    const before = structuredClone(fixed);
    let swappedCount = 0;
    for (const refs of Object.values(before.conformance_expectations)) for (const ref of refs) {
      if (ref.locator === "/character_core/hard_invariants/0") { ref.locator = "/character_core/hard_invariants/1"; swappedCount += 1; }
      else if (ref.locator === "/character_core/hard_invariants/1") { ref.locator = "/character_core/hard_invariants/0"; swappedCount += 1; }
    }
    equal(swappedCount, 5, `D: ${file} — recorded fix inverted at exactly 5 locators`);
    refsTotal += locatorCount(before);
    const m = conformanceLocatorMismatches(before);
    equal(m.length, 5, `D: ${file} (pre-fix shape) — 5 mismatches detected`);
    check(m.every(item => item.resolvable && item.resolved_id !== item.requirement_id && ["INV-INPUT-INTEGRITY"].concat(fixed.character_core.hard_invariants.map(x => x.id)).includes(item.resolved_id)), `D: ${file} — each mismatch resolves to the other invariant`);
    const verdict = admit(before);
    equal(verdict.accepted, false, `D: ${file} (pre-fix shape) — refused`);
    equal(verdict.code, LOCATOR_MISMATCH_CODE, `D: ${file} (pre-fix shape) — CONFORMANCE_LOCATOR_MISMATCH`);
    detected += m.length;
  }
  equal(detected, 20, "D: 20/20 swapped locators detected across the four Characters");
  equal(refsTotal, 25, "D: 25 locators in the four Characters (as recorded: 25 refs, 20 mismatched)");
  edoDetected = detected;
} else skipped.push(`D: 江戸 corpus ${EDO} absent — 20/20 falsification not run`);

// ── E. the code on main accepts every negative (the gap was real) ───────────
{
  const tmp = mkdtempSync(path.join(tmpdir(), "saku-locator-main-"));
  try {
    for (const rel of ["tools/unified-v1/character-schema.mjs", "tools/unified-v1/unified-schema-v1.mjs"]) {
      const bytes = execFileSync("git", ["show", `main:${rel}`], { cwd: ROOT, maxBuffer: 1 << 24 });
      writeFileSync(path.join(tmp, path.basename(rel)), bytes);
    }
    const mainText = readFileSync(path.join(tmp, "character-schema.mjs"), "utf8") + readFileSync(path.join(tmp, "unified-schema-v1.mjs"), "utf8");
    if (mainText.includes("conformanceLocatorMismatches")) {
      skipped.push("E: main already carries the locator check (this branch is merged) — before/after comparison not applicable");
    } else {
      const Main = await import(pathToFileURL(path.join(tmp, "character-schema.mjs")).href);
      let acceptedByMain = 0;
      for (const item of index.cases.filter(c => c.expected_mismatches)) {
        if (Main.admit(readJson(path.join(FIXTURES, item.file))).accepted) acceptedByMain += 1;
      }
      equal(acceptedByMain, 8, "E: main's admit() accepts all 8 negatives — the gap this change closes");
      if (existsSync(EDO)) {
        const file = readdirSync(EDO).filter(f => f.endsWith(".saku-character.json")).sort()[0];
        const before = readJson(path.join(EDO, file));
        for (const refs of Object.values(before.conformance_expectations)) for (const ref of refs) {
          if (ref.locator === "/character_core/hard_invariants/0") ref.locator = "/character_core/hard_invariants/1";
          else if (ref.locator === "/character_core/hard_invariants/1") ref.locator = "/character_core/hard_invariants/0";
        }
        equal(Main.admit(before).accepted, true, `E: main's admit() accepts the pre-fix 江戸 shape (${file})`);
      }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ── F. both import routes reach admit(), and the recovery text exists ───────
{
  const app = readFileSync(path.join(ROOT, "desktop/app.mjs"), "utf8");
  const body = (name) => { const m = app.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n`)); assert.ok(m, `F: ${name} found`); return m[0]; };
  check(body("handOffCharacterPack").includes("addToLibrary("), "F: pack route (handOffCharacterPack) → addToLibrary");
  check(body("importCharacterFiles").includes("addToLibrary("), "F: file route (importCharacterFiles) → addToLibrary");
  check(body("addToLibrary").includes("admitCharacters("), "F: addToLibrary → admitCharacters");
  check(body("admitCharacters").includes("admit(character, { schema"), "F: admitCharacters → admit(character, { schema }) — the one gate for every route, with the adopted schema");
  check(body("reconstructFromWorkspace").includes("admitCharacters("), "F: workspace recovery → admitCharacters (fail closed on stored mismatches too)");
  check(!/admit\s*\(/.test(app.replace(body("admitCharacters"), "")), "F: no other admit() call bypasses admitCharacters in app.mjs");
  check(app.includes('code === "CONFORMANCE_LOCATOR_MISMATCH"'), "F: importRecovery carries a Japanese recovery text for CONFORMANCE_LOCATOR_MISMATCH");
  check(app.includes("fail closed"), "F: recovery text states the fail-closed rule");
  const schemaText = readFileSync(path.join(ROOT, "tests/fixtures/canonical/saku-unified-character.v1.schema.json"), "utf8");
  check(schemaText.includes("Resolution or locator mismatch fails closed"), "F: the Canonical schema states the rule this gate enforces");
}

// ── G. browser: both import routes refuse a mismatched Character ────────────
//
// The desktop page is served with a host stub injected before app.mjs. The
// pack route receives the real sold support pack's host result (digests
// verified, signatures PASS) with ONE Character's hard_invariants locators
// swapped inside payload_json — the 江戸 shape: a signed, digest-exact pack
// carrying a wrong locator. The file route receives the swapped fixture and
// then the positive fixture through the same entry the file picker uses.
{
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const supportZip = path.join(PACKS, "saku-pack-support-1.0.0-beta.zip");
  const distReady = existsSync(path.join(ROOT, ".desktop-dist/index.html"));
  if (!existsSync(chrome)) skipped.push("G: Chrome not found — browser end-to-end skipped");
  else if (!distReady) skipped.push("G: .desktop-dist not prepared — browser end-to-end skipped (run desktop:prepare first)");
  else if (!existsSync(supportZip)) skipped.push("G: sold support pack fixture absent — browser end-to-end skipped");
  else {
    const { createServer } = await import("node:http");
    const { spawn } = await import("node:child_process");
    const { readFile, rm } = await import("node:fs/promises");
    const { createHash } = await import("node:crypto");
    const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
    const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    const unsignedDigest = manifest => { const copy = structuredClone(manifest); delete copy.package.digest; delete copy.package.signature; return `sha-256:${sha256(canonical(copy))}`; };
    // Host result the way main.rs builds it (same construction as verify_pack_import.mjs).
    const archive = unzip(readFileSync(supportZip));
    const prefix = `${[...archive.keys()][0].split("/")[0]}/`;
    const pack = JSON.parse(archive.get(`${prefix}character-pack.json`).toString());
    const catalog = JSON.parse(archive.get(`${prefix}catalog-release.v1.json`).toString());
    const entries = []; const characters = [];
    for (const entry of pack.entries) {
      const inner = unzip(archive.get(`${prefix}${entry.file}`));
      const manifest = JSON.parse(inner.get("portable-manifest.json").toString());
      characters.push(JSON.parse(inner.get("character.json").toString()));
      entries.push({ slug: entry.slug, character_id: entry.characterId, display_name: entry.displayName, source_version: entry.sourceVersion, operation_class: entry.operationClass, file: entry.file, archive_digest: entry.archiveDigest, package_digest: entry.packageDigest, character_digest: entry.characterDigest, publisher_key_id: manifest.package.publisherKeyId, signature: manifest.package.signature, manifest_digest_recomputed: unsignedDigest(manifest) === manifest.package.digest, schema_id: manifest.source.schema.schemaId, schema_version: manifest.source.schema.schemaVersion });
    }
    // Swap the first Character's hard_invariants locators 0 ↔ 1 (pre-fix 江戸 shape).
    const victim = characters[0];
    let swapped = 0;
    for (const refs of Object.values(victim.conformance_expectations)) for (const ref of refs) {
      if (ref.locator === "/character_core/hard_invariants/0") { ref.locator = "/character_core/hard_invariants/1"; swapped += 1; }
      else if (ref.locator === "/character_core/hard_invariants/1") { ref.locator = "/character_core/hard_invariants/0"; swapped += 1; }
    }
    check(swapped >= 2, `G: stub pack — ${swapped} locators swapped in ${victim.identity.character_id}`);
    equal(admit(victim).code, LOCATOR_MISMATCH_CODE, "G: stub pack — the swapped Character is refused by admit() in Node too");
    const payload_json = JSON.stringify({ characters });
    const hostResult = {
      status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", reason: "gate stub", source_path: "saku-pack-support-1.0.0-beta.zip", imported_path: "<workspace>/imports/saku-pack-support", payload_json,
      manifest: { package_type: "kokorosaku-character-pack", product: pack.pack.id, package_version: pack.pack.version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, minimum_app_version: "0.1.0-beta.1", content_type: "CHARACTER_PACK", distribution_channel: "STORE", license_state: "BUNDLED_LICENSE_MD", payload_hash: sha256(payload_json) },
      pack: { format: "kokorosaku-character-pack", pack_id: pack.pack.id, pack_version: pack.pack.version, created_at: pack.pack.createdAt, character_count: entries.length, catalog_id: catalog.catalog_id, catalog_release_version: catalog.release_version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, pack_publisher_key_id: pack.package.publisherKeyId, pack_manifest_digest: pack.package.digest, pack_signature: pack.package.signature, pack_manifest_digest_recomputed: unsignedDigest(pack) === pack.package.digest, sha256sums_verified: archive.size - 1, digest_state: "SHA256_BINDINGS_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", entries },
    };
    const swappedFixture = readFileSync(path.join(FIXTURES, "swapped-hard-invariants.json"), "utf8");
    const positiveFixture = readFileSync(path.join(FIXTURES, "positive-sample.json"), "utf8");
    const total = characters.length, victimId = victim.identity.character_id;
    const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
const SWAPPED=${JSON.stringify(swappedFixture)},POSITIVE=${JSON.stringify(positiveFixture)},TOTAL=${total},VICTIM=${JSON.stringify(victimId)};
let frame,doc,win;
const entries=()=>((JSON.parse(win.localStorage.getItem('saku.workspace.library')||'{}').entries)||[]).filter(e=>!e.deleted);
try{
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/__desktop_stub__/index.html?stay=1&open=select';
 document.body.append(frame);
 await new Promise(resolve=>frame.onload=resolve);doc=frame.contentDocument;win=frame.contentWindow;
 check(win.__TAURI__&&win.__TAURI__.__stub===true,'LOC-UI host stub installed before app.mjs');
 await until(()=>doc.getElementById('viewer-import-package'));
 // pack route
 doc.getElementById('viewer-import-package').click();
 await until(()=>doc.body.innerText.includes('取り込めませんでした')||doc.body.innerText.includes('件を一覧に追加しました'));
 const status=doc.getElementById('viewer-status').innerText;
 check(status.includes('CONFORMANCE_LOCATOR_MISMATCH'),'LOC-UI pack route: viewer status names CONFORMANCE_LOCATOR_MISMATCH');
 check(status.includes('1件は取り込めませんでした'),'LOC-UI pack route: exactly one Character refused');
 check(status.includes('locator')&&status.includes('を指しています'),'LOC-UI pack route: the refusal says which locator points where (Japanese)');
 check(status.includes('fail closed'),'LOC-UI pack route: recovery text states the fail-closed rule');
 const stored=entries();
 check(stored.length===TOTAL-1,'LOC-UI pack route: '+(TOTAL-1)+' of '+TOTAL+' stored ('+stored.length+')');
 check(!stored.some(e=>e.character_id===VICTIM||(e.identity&&e.identity.character_id===VICTIM)||JSON.stringify(e).includes('"'+VICTIM+'"')),'LOC-UI pack route: the mismatched Character is not in the Library');
 // file route: negative
 const before=entries().length;
 await win.__saku_home.importCharacterFiles([new File([SWAPPED],'swapped-hard-invariants.json',{type:'application/json'})]);
 await wait(200);
 const fileStatus=doc.getElementById('viewer-status').innerText;
 check(fileStatus.includes('CONFORMANCE_LOCATOR_MISMATCH'),'LOC-UI file route: viewer status names CONFORMANCE_LOCATOR_MISMATCH');
 check(fileStatus.includes('1件は取り込めませんでした'),'LOC-UI file route: the swapped fixture is refused');
 check(entries().length===before,'LOC-UI file route: Library unchanged after the refusal');
 // file route: positive
 await win.__saku_home.importCharacterFiles([new File([POSITIVE],'positive-sample.json',{type:'application/json'})]);
 await wait(200);
 check(doc.getElementById('viewer-status').innerText.includes('1件を一覧に追加しました'),'LOC-UI file route: the positive fixture is added');
 check(entries().length===before+1,'LOC-UI file route: Library grew by one');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__loc__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
        if (url.pathname === "/__desktop_stub__/index.html") {
          const html = await readFile(path.join(ROOT, ".desktop-dist/index.html"), "utf8");
          const stubScript = [
            "<script>",
            `window.__LOC_RESULT__=${JSON.stringify(hostResult)};`,
            "window.__TAURI__={__stub:true,core:{invoke:async(command)=>{",
            "if(command==='choose_and_import_package'||command==='import_package_path')return structuredClone(window.__LOC_RESULT__);",
            "if(command==='save_workspace_character')return{status:'SAVED'};",
            "if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};",
            "if(command==='runtime_state')return{workspace:'C:/ws',app_version:'0.1.0-beta.2',first_run:false};",
            "return null;}}};window.confirm=()=>true;try{localStorage.clear();}catch{}",
            "</script>",
          ].join("");
          response.setHeader("Content-Type", "text/html;charset=utf-8");
          response.end(html.replace("<script>", `${stubScript}<script>`).replace(/(href|src)="\.\//g, '$1="/.desktop-dist/'));
          return;
        }
        const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
        if (!file.startsWith(ROOT + path.sep)) throw new Error("outside root");
        response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`);
        response.end(await readFile(file));
      } catch { response.statusCode = 404; response.end("not found"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const profile = mkdtempSync(path.join(tmpdir(), "saku-loc-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let stderr = ""; let socket;
    child.stderr.on("data", chunk => stderr += chunk);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let port = 0;
      for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__loc__`)}`, { method: "PUT" })).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise(resolve => socket.onopen = resolve);
      let sequence = 0; const pending = new Map();
      socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } };
      const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
      for (let i = 0; i < 900; i++) {
        const result = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true });
        if (result.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value; break; }
        await pause(100);
      }
      if (!output) output = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value;
    } finally {
      socket?.close(); child.kill();
      await new Promise(resolve => child.exitCode !== null ? resolve() : child.once("exit", resolve));
      server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
    }
    const match = output.match(/<pre id="report" data-status="(PASS|FAIL)">([\s\S]*?)<\/pre>/);
    if (!match) { console.error(output.slice(0, 2000), stderr.slice(-1000)); process.exit(1); }
    const report = JSON.parse(match[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
    for (const label of report.checks) cases.push(label);
  }
}

// ── H. the Builder's own authoring validator refuses the same shapes ────────
//
// The Builder validates its output with tools/v1/adopted-schema-validator.mjs
// (also the public tooling's validator) before save/export. The same rule is
// applied there, so a mismatched locator cannot be authored, not only imported.
{
  const Adopted = await import(pathToFileURL(path.join(ROOT, "tools/v1/adopted-schema-validator.mjs")).href);
  const schema = readJson(path.join(ROOT, "tests/fixtures/canonical/saku-unified-character.v1.schema.json"));
  for (const item of index.cases) {
    const doc = readJson(path.join(FIXTURES, item.file));
    const result = Adopted.validateCompleteAdoptedCharacter(doc, schema);
    const locatorIssues = result.errors.filter(e => e.keyword === "locatorMismatch");
    equal(locatorIssues.length, item.expected_mismatches, `H: authoring validator — ${item.file} → ${item.expected_mismatches} locatorMismatch issue(s)`);
    if (item.expected_mismatches) {
      equal(result.ok, false, `H: authoring validator refuses ${item.file}`);
      check(locatorIssues.every(e => /^\/conformance_expectations\/[a-z_]+\/\d+\/locator$/.test(e.path)), `H: ${item.file} issues point at the locator field`);
      check(/（locatorMismatch）$/.test(Adopted.formatValidationIssue(locatorIssues[0])), `H: ${item.file} issue formats as a Japanese Builder message`);
    } else equal(result.ok, true, `H: authoring validator accepts ${item.file}`);
  }
  for (const rel of ["tools/unified-v1/sample-pack/sample-characters.json"]) {
    for (const [k, c] of charactersOf(readJson(path.join(ROOT, rel))).entries()) equal(Adopted.validateCompleteAdoptedCharacter(c, schema).ok, true, `H: authoring validator accepts ${rel}#${k}`);
  }
  const publicCopy = path.join(ROOT, "tooling/builder/lib/adopted-schema-validator.mjs");
  check(readFileSync(publicCopy, "utf8").includes("conformanceLocatorMismatches"), "H: public tooling projection carries the same rule");
  check(readFileSync(path.join(ROOT, "tooling/builder/lib/unified-schema.mjs"), "utf8").includes("export function conformanceLocatorMismatches"), "H: public tooling unified-schema.mjs exports the resolver");
}

const summary = { cases: cases.length, skipped, corpus: corpusReport, edo_detected: edoDetected, corpus_characters_checked: corpusChecked };
console.log(JSON.stringify(summary, null, 2));
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`CONFORMANCE_LOCATORS PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped)` : ""}`);
console.log(`FALSE_POSITIVES 0/${corpusReport.reduce((s, r) => s + r.files, 0)} Characters (${corpusReport.reduce((s, r) => s + r.refs, 0)} locators) / EDO_PREFIX_DETECTED ${edoDetected === null ? "NOT_RUN" : `${edoDetected}/20`} / ROUTES pack+file+authoring`);
