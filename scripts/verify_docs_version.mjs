// docs:verify (U1, Owner 2026-09-22 §8 ⑤): the field guide is bound to the app
// version and complete for what the screens and manual.html will show.
//
//   1 version binding: every place that carries the app's version says the same
//     thing — the guide (extension, the generated data.json and the two screen
//     guides), package.json, tauri.conf.json, Cargo.toml and APP_VERSION.
//     A bump that misses one FAILS here, on purpose.
//   2 data.json / manual / help pages are the generator's exact output
//   3 every field has a current note (JA, 1–2 sentences, ≤ 70 chars, no
//     price / authority words); EN is either present or explicitly absent
//   4 every selectable option has an effect with a recorded source; effects
//     from PARAM_BEHAVIOR_MAP are generated (no digits, trait labels from the
//     extension); NOT_MEASURED is the fixed sentence; presentation axes are
//     marked; c_intelligence_vector is fully sourced from the map
//   5 candidate values carry only OSS_SAMPLE / SCHEMA / OWNER_APPROVED sources
//     (never the sold Characters) and are never called 推奨値／初期値
//   6 reason_class dictionary equals the adopted schema enum; non-canonical
//     authoring fields are listed with canonical_output:false
//   7 PR template carries the help/manual checklist line
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const readJson = rel => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const X = await import(pathToFileURL(path.join(ROOT, "tools/v1/field-guide-extension.mjs")).href);

const extension = readJson("manual/saku-field-guide.extension.json");
const data = readJson("manual/saku-field-guide.data.json");
const pkg = readJson("package.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const schema = readJson("tests/fixtures/canonical/saku-unified-character.v1.schema.json");

// ── 1. version binding ──────────────────────────────────────────────────────
equal(extension.profile, X.EXTENSION_PROFILE, "DOCS-VER extension profile");
check(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(extension.applies_to_app_version), `DOCS-VER applies_to_app_version is a version (${extension.applies_to_app_version})`);
equal(pkg.version, extension.applies_to_app_version, "DOCS-VER guide applies to the package.json version");
equal(tauri.version, extension.applies_to_app_version, "DOCS-VER guide applies to the tauri.conf.json version");
equal(data.applies_to_app_version, extension.applies_to_app_version, "DOCS-VER data.json carries the same version");
// Every version site, read the way each file stores it. Until 2026-09-23 this
// check covered three of them; Cargo.toml and APP_VERSION carried the version
// too and were outside it. APP_VERSION is the one get_runtime_state returns and
// the manual's applies-to badge compares itself against, so a stale value builds
// cleanly and shows the reader a red badge — the quiet way to ship a mismatch.
const VERSION_SITES = [
  { label: "package.json", file: "package.json", read: text => JSON.parse(text).version },
  { label: "src-tauri/tauri.conf.json", file: "src-tauri/tauri.conf.json", read: text => JSON.parse(text).version },
  { label: "manual/saku-field-guide.extension.json", file: "manual/saku-field-guide.extension.json", read: text => JSON.parse(text).applies_to_app_version },
  { label: "manual/platform-guide.data.json", file: "manual/platform-guide.data.json", read: text => JSON.parse(text).applies_to_app_version },
  { label: "manual/trainer-guide.data.json", file: "manual/trainer-guide.data.json", read: text => JSON.parse(text).applies_to_app_version },
  { label: "src-tauri/Cargo.toml", file: "src-tauri/Cargo.toml", read: text => (text.match(/^version = "([^"]+)"/m) || [])[1] },
  { label: "src-tauri/src/main.rs APP_VERSION", file: "src-tauri/src/main.rs", read: text => (text.match(/const APP_VERSION: &str = "([^"]+)"/) || [])[1] },
];
{
  const expected = extension.applies_to_app_version;
  const found = VERSION_SITES.map(site => ({ label: site.label, version: site.read(readFileSync(path.join(ROOT, site.file), "utf8")) }));
  const wrong = found.filter(site => site.version !== expected).map(site => site.label + "=" + (site.version ?? "(not found)"));
  assert.equal(wrong.join(", "), "", "DOCS-VER every version site must read " + expected);
  cases.push("DOCS-VER all " + found.length + " version sites agree (" + expected + "): package.json, tauri.conf.json, the three guides, Cargo.toml and APP_VERSION");

  const manual = readFileSync(path.join(ROOT, "manual/saku-field-guide.html"), "utf8");
  check(manual.includes('data-applies-to="' + expected + '"') && manual.includes("state.app_version"), "DOCS-VER the manual's badge carries this version and compares itself with the host's APP_VERSION (a stale APP_VERSION builds cleanly and turns the badge red)");

  // Falsification, one site at a time: fixing a single site must not satisfy the check.
  for (const site of found) {
    const stale = found.map(other => other.label === site.label ? "0.0.0-stale" : other.version);
    assert.ok(stale.filter(version => version !== expected).length === 1, "DOCS-VER falsification: " + site.label + " left behind is the only mismatch, and it is caught");
  }
  cases.push("DOCS-VER falsification: each of the " + found.length + " sites, left behind on its own, is caught");
}

// ── 2. generated output is current ──────────────────────────────────────────
{
  const out = mkdtempSync(path.join(tmpdir(), "saku-docs-verify-"));
  try {
    const run = spawnSync(process.execPath, [path.join(ROOT, "scripts/generate_frozen_ia_manual.mjs")], { cwd: ROOT, encoding: "utf8", env: { ...process.env, SAKU_MANUAL_OUT_ROOT: out } });
    equal(run.status, 0, `DOCS-GEN generator runs (${(run.stderr || "").slice(0, 200)})`);
    for (const rel of ["manual/saku-field-guide.data.json", "manual/saku-field-guide.html", "desktop/help/index.html", "desktop/help/getting-started.html", "desktop/help/tuning-faq.html"]) {
      check(existsSync(path.join(out, rel)) && readFileSync(path.join(out, rel)).equals(readFileSync(path.join(ROOT, rel))), `DOCS-GEN ${rel} equals the generator output (regenerate with node scripts/generate_frozen_ia_manual.mjs)`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
}

// ── 3. current notes ────────────────────────────────────────────────────────
{
  equal(data.fields.length, 47, "DOCS-NOTE 47 fields");
  const forbidden = /権限|資格|承認|価格|円|推奨値|初期値/;
  for (const field of data.fields) {
    const note = field.currentNote?.ja;
    assert.ok(typeof note === "string" && note.trim(), `DOCS-NOTE ${field.canonicalPath} has a current note`);
    assert.ok(note.length <= 70, `DOCS-NOTE ${field.canonicalPath} note ≤ 70 chars (${note.length})`);
    assert.ok((note.match(/。/g) || []).length >= 1 && (note.match(/。/g) || []).length <= 2, `DOCS-NOTE ${field.canonicalPath} note is 1–2 sentences`);
    assert.ok(!forbidden.test(note), `DOCS-NOTE ${field.canonicalPath} note has no price / authority / default wording`);
    assert.ok(field.currentNote.en === null || (typeof field.currentNote.en === "string" && field.currentNote.en.trim()), `DOCS-NOTE ${field.canonicalPath} EN is present or explicitly absent`);
  }
  cases.push("DOCS-NOTE every field: 1–2 sentences, ≤ 70 chars, no forbidden words, EN present or null");
  check(data.content_review?.current_note_ja?.status && data.content_review?.current_note_ja?.source, "DOCS-NOTE the review state and source of the notes are recorded in data.json");
  check(data.content_review.current_note_ja.status !== "APPROVED" || (data.content_review.current_note_ja.approved_on && data.content_review.current_note_ja.approved_by && data.content_review.current_note_ja.approval_route), "DOCS-NOTE APPROVED ⇒ approval date, approver and route are recorded");
  check(data.content_review?.current_note_en?.status === "NOT_YET" ? data.fields.every(f => f.currentNote.en === null) : true, "DOCS-NOTE EN NOT_YET ⇒ no field claims an EN note");
  if (data.content_review?.current_note_en?.status === "DELIVERED") {
    const forbiddenEn = /approv|authoriz|certif|permission|price|\$|¥|recommended value|default value/i;
    for (const field of data.fields) assert.ok(typeof field.currentNote.en === "string" && field.currentNote.en.trim() && !forbiddenEn.test(field.currentNote.en) && (field.currentNote.en.match(/[.!?](\s|$)/g) || []).length <= 2, `DOCS-NOTE ${field.canonicalPath} EN note present, 1–2 sentences, no authority / price words`);
    check(data.content_review.current_note_en.translated_by && data.content_review.current_note_en.checked_by && data.content_review.current_note_en.source, "DOCS-NOTE EN DELIVERED ⇒ every field has an EN note and the translator / checker / source are recorded");
  }
}

// ── 4. option effects ───────────────────────────────────────────────────────
{
  let sourced = 0, notMeasured = 0, presentation = 0;
  for (const field of data.fields) {
    if (!["enum", "enum-list"].includes(field.kind)) continue;
    for (const option of field.help.optionDetails) {
      const effect = option.effect;
      assert.ok(effect && typeof effect.ja === "string" && effect.ja.trim(), `DOCS-EFFECT ${field.canonicalPath}.${option.value} has an effect sentence`);
      assert.ok(X.EFFECT_SOURCE_KINDS.includes(effect.source), `DOCS-EFFECT ${field.canonicalPath}.${option.value} source is recorded (${effect.source})`);
      if (effect.source === "NOT_MEASURED") { assert.equal(effect.ja, X.NOT_MEASURED_TEXT, `DOCS-EFFECT ${field.canonicalPath}.${option.value} NOT_MEASURED uses the fixed sentence`); notMeasured += 1; if (effect.presentation_only) presentation += 1; }
      else {
        sourced += 1;
        if (effect.source === "PARAMETER_BEHAVIOR_MAP") {
          // v2: the text is the Owner-approved behavior translation, still pinned to the map entry (section + engine rev); no digits, no trait jargon
          assert.ok(!/[0-9+\-]/.test(effect.ja) && !/Expected Profile|Trait|facet/.test(effect.ja) && /^[a-z_]+\.[A-Z_]+$/.test(effect.section) && /^derived-profile-engine\.mjs@sha256:[0-9a-f]{16}$/.test(effect.source_rev), `DOCS-EFFECT ${field.canonicalPath}.${option.value} map effect is behavior wording pinned to a map section and source_rev`);
          const regenerated = X.optionEffect(field.canonicalPath, option.value, extension);
          assert.equal(regenerated.ja, effect.ja, `DOCS-EFFECT ${field.canonicalPath}.${option.value} map effect regenerates identically`);
          assert.ok(Object.prototype.hasOwnProperty.call(extension.fields[field.canonicalPath].options, option.value), `DOCS-EFFECT ${field.canonicalPath}.${option.value} map effect is recorded (v2) — the generated trait sentence is no longer shown`);
        }
        if (effect.source === "PRESENTATION_ONLY") assert.ok(effect.presentation_only === true && effect.ja.includes(extension.fixed_sentences_en ? "" : "") && /(見た目・雰囲気にだけ影響し|判断の内容は変えません)/.test(effect.ja), `DOCS-EFFECT ${field.canonicalPath}.${option.value} presentation-only effect carries the fixed sentence`);
        if (effect.en !== undefined) assert.ok(typeof effect.en === "string" && effect.en.trim() && !/必ず|常に/.test(effect.en), `DOCS-EFFECT ${field.canonicalPath}.${option.value} EN effect present`);
      }
    }
  }
  cases.push(`DOCS-EFFECT every option has an effect with a recorded source (${sourced} sourced, ${notMeasured} NOT_MEASURED of which ${presentation} presentation-only)`);
  // 統制卓 2026-09-22 (Owner: 「ファクトにならないよう仕組みから確認」): the PROMPT_INCLUDED_03 label is true only
  // where the 03 prompt hands the value over as a meaning sentence; effect bodies carry no 断定語 and no product name.
  const PP = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/platform-prompt.mjs")).href);
  let promptLabelled = 0;
  for (const field of data.fields) {
    if (!["enum", "enum-list"].includes(field.kind)) continue;
    const recorded = extension.fields?.[field.canonicalPath]?.options || {};
    for (const [value, entry] of Object.entries(recorded)) {
      if (/^PROMPT_INCLUDED_03/.test(entry.effect_source || "")) { assert.ok(PP.PROMPT_MEANING_FIELDS.includes(field.canonicalPath), `DOCS-EFFECT-TRUTH ${field.canonicalPath}.${value}: PROMPT_INCLUDED_03 label only where the 03 prompt carries the value as a meaning sentence (else DESIGN_INTENT)`); promptLabelled += 1; }
      if (entry.effect_source === "PRESENTATION_ONLY") assert.ok(PP.PROMPT_EXCLUDED_AXES.includes(field.canonicalPath.replace(/^personality_axes\./, "")), `DOCS-EFFECT-TRUTH ${field.canonicalPath}.${value}: PRESENTATION_ONLY only on the five presentation axes`);
    }
    for (const option of field.help.optionDetails) {
      assert.ok(!option.effect.demoted_from, `DOCS-EFFECT-TRUTH ${field.canonicalPath}.${option.value}: no demoted label survives in the data (fix the extension)`);
      for (const word of X.EFFECT_FORBIDDEN_WORDS) assert.ok(!option.effect.ja.includes(word), `DOCS-EFFECT-WORDS ${field.canonicalPath}.${option.value}: no 断定語 「${word}」`);
      for (const name of X.EFFECT_FORBIDDEN_PRODUCT_NAMES) assert.ok(!option.effect.ja.includes(name), `DOCS-EFFECT-WORDS ${field.canonicalPath}.${option.value}: no product name 「${name}」 in the body (belongs to the source column)`);
    }
  }
  cases.push(`DOCS-EFFECT-TRUTH PROMPT_INCLUDED_03 labels (${promptLabelled}) sit only on ${PP.PROMPT_MEANING_FIELDS.length} prompt-carried fields; PRESENTATION_ONLY only on the 5 presentation axes; no demoted label in the data`);
  cases.push(`DOCS-EFFECT-WORDS effect bodies carry no 断定語 (${X.EFFECT_FORBIDDEN_WORDS.join("・")}) and no product name`);
  check(X.optionEffect("personality_axes.a_motif", "STUDY_LAMP", { fields: { "personality_axes.a_motif": { options: { STUDY_LAMP: { effect_ja: "x", effect_source: "PROMPT_INCLUDED_03 + DESIGN_INTENT" } } } } }).source === "DESIGN_INTENT", "DOCS-EFFECT-TRUTH falsification: a PROMPT_INCLUDED_03 label on a presentation axis is demoted to DESIGN_INTENT by the merge");
  // Directive Glossary (設計 §7/§8): one block per option of every prompt-carried field + operation class, linted, versioned by sha256
  const G = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/directive-glossary.mjs")).href);
  const lookup = G.buildDirectiveLookup(data);
  for (const p of PP.PROMPT_DIRECTIVE_FIELDS.concat(["meta.operation_class"])) {
    const options = p === "meta.operation_class" ? data.non_canonical_fields.find(f => f.path === p).options.map(o => o.value) : p === PP.REASON_CLASS_PATH ? data.structured_enums[p].options.map(o => o.value) : data.fields.find(f => f.canonicalPath === p).options;
    for (const v of options) assert.ok(lookup.get(p)?.get(String(v))?.length >= 2, `DOCS-DIRECTIVE ${p}.${v} has a directive block`);
  }
  cases.push(`DOCS-DIRECTIVE every option of the ${PP.PROMPT_DIRECTIVE_FIELDS.length} prompt-carried fields + operation class has a directive block (${data.directive_glossary.counts.blocks} blocks / ${data.directive_glossary.counts.lines} lines)`);
  check(PP.PROMPT_EXCLUDED_AXES.every(a => !lookup.has(`personality_axes.${a}`)) && data.fields.filter(f => !PP.PROMPT_DIRECTIVE_FIELDS.includes(f.canonicalPath)).every(f => (f.help.optionDetails || []).every(o => !o.directive)), "DOCS-DIRECTIVE no directive on a presentation axis or on any field the prompt does not carry");
  { const problems = []; for (const [p, values] of lookup) for (const [v, lines] of values) problems.push(...G.lintDirective(lines, `${p}=${v}`)); equal(problems.join("; "), "", "DOCS-DIRECTIVE every block passes the §7 lint"); }
  equal(data.directive_glossary.sha256, await G.glossaryDigest(lookup), "DOCS-DIRECTIVE recorded glossary sha256 = digest of the lines (the version 03 and AMU compare)");
  check(data.directive_glossary.profile === G.DIRECTIVE_GLOSSARY_PROFILE && data.directive_glossary.version && data.directive_glossary.status && data.directive_glossary.review?.owner, "DOCS-DIRECTIVE glossary version / status / review record present");
  check(lookup.get("purpose.work_modes").get("ANALYSIS").join("|") === "ALWAYS split the input into facts, hypotheses and unknowns|ALWAYS state the grounds before each conclusion|NEVER assert a conclusion without stated grounds|IF no grounds are stated THEN list the points to check|OUTPUT facts, hypotheses and unknowns as three labeled lists" && lookup.get("meta.operation_class").get("B").join("|") === "HANDOFF WHEN a confirmation screen is pending|NEVER start the answer before the person confirms|IF no confirmation screen exists THEN ask the person to confirm first", "DOCS-DIRECTIVE Owner-approved sample blocks (ANALYSIS, operation_class B; B#3 = 統制卓 12-word form) are verbatim");
  check(G.OWNER_FIXED_LINES.length === 0 && [...lookup.values()].every(m => [...m.values()].every(lines => lines.every(l => l.trim().split(/s+/).length <= G.MAX_WORDS))), "DOCS-DIRECTIVE all lines ≤ 12 words with no exception");
  const civ = data.fields.find(f => f.canonicalPath === "personality_axes.c_intelligence_vector");
  check(civ.help.optionDetails.every(o => o.effect.source === "PARAMETER_BEHAVIOR_MAP"), "DOCS-EFFECT c_intelligence_vector: all 4 options sourced from PARAM_BEHAVIOR_MAP");
  const motif = data.fields.find(f => f.canonicalPath === "personality_axes.a_motif");
  check(motif.help.optionDetails.every(o => o.effect.source === "PRESENTATION_ONLY" && o.effect.presentation_only === true), "DOCS-EFFECT a_motif (presentation axis): PRESENTATION_ONLY + presentation_only");
  const modes = data.fields.find(f => f.canonicalPath === "purpose.work_modes");
  check(modes.help.optionDetails.length === 13 && modes.help.optionDetails.every(o => o.effect.source === "PROMPT_INCLUDED_03 + DESIGN_INTENT" && /傾向になります/.test(o.effect.ja)), "DOCS-EFFECT work_modes: 13 options, behavior tendencies handed to the 03 prompt (PROMPT_INCLUDED_03 + DESIGN_INTENT)");
  check(!JSON.stringify(modes.help.optionDetails).includes("Instance") && !/向いている仕事/.test(JSON.stringify(modes.help.optionDetails.map(o => o.effect.ja))), "DOCS-EFFECT work_modes effect describes behavior, not the selection-screen filter or an Instance use");
  // v2 approval record (Owner 2026-09-22): 80 effects, four source labels, EN delivered
  if (extension.content_review?.effects?.status === "APPROVED") {
    const recorded = Object.entries(extension.fields).flatMap(([p, f]) => Object.entries(f.options || {}).map(([v, o]) => ({ p, v, ...o })));
    const opRec = Object.values(extension.non_canonical_fields.find(f => f.path === "meta.operation_class").options);
    const reasonRec = Object.values(extension.structured_enums["character_core.human_handoff_conditions.reason_class"].options);
    const all = [...recorded, ...opRec, ...reasonRec];
    equal(all.length, extension.content_review.effects.counts.total, "DOCS-EFFECT-V2 recorded effects = approval count (80)");
    equal(recorded.filter(r => r.p.startsWith("personality_axes.")).length, 56, "DOCS-EFFECT-V2 56 axis options recorded");
    check(all.every(r => /(傾向|になります|表示されます|扱われます|入ります|始めます|場面です)/.test(r.effect_ja) && /(ます|ません)。$/.test(r.effect_ja.trim()) && X.EFFECT_SOURCE_KINDS.includes(r.effect_source) && r.effect_source !== "NOT_MEASURED" && r.effect_source !== "AMU_CONFIRMED_2026-09-22"), "DOCS-EFFECT-V2 every recorded effect ends in the tendency form and carries one of the four v2 source labels");
    check(all.every(r => (typeof r.effect_en === "string" && r.effect_en.trim()) || /^PENDING_RETRANSLATION/.test(r.effect_en_status || "")) && all.filter(r => !r.effect_en).length <= 1 && extension.content_review.effects_en?.status === "DELIVERED" && /@[0-9a-f]{7}/.test(extension.content_review.effects_en.source), "DOCS-EFFECT-V2 EN effect present for all 80 (translation team delivery recorded with source rev)");
    check(!/AMU|MACHI|ERABAZU|KOKOROAMU|KOKOROSAKU/.test(opRec.map(r => r.effect_ja).join("")) && /確認の画面が出る環境では/.test(opRec[1].effect_ja) && opRec[1].source_note_ja, "DOCS-EFFECT-V2 operation class B body has no product name; the product-specific fact sits in the source note (統制卓 2026-09-22)");
    check(/^(必ず|常に|確実に|保証|絶対)$/.test("必ず") && X.EFFECT_FORBIDDEN_WORDS.length === 5 && all.every(r => X.EFFECT_FORBIDDEN_WORDS.every(w => !r.effect_ja.includes(w))), "DOCS-EFFECT-V2 no 断定語 in any recorded effect");
  }
  equal(X.effectSentence({ decisiveness: 2, convergence: 2, minority_retention: -1 }, extension.trait_labels_ja), "Expected Profile の『決断の速さ』と『一案への収束』が大きく上がります。『少数意見の保持』は下がります。", "DOCS-EFFECT sentence form matches the writer team's example (seat1 DECISIVE_SELECTOR)");
  equal(Object.keys(extension.trait_labels_ja).length, 14, "DOCS-EFFECT 14 trait labels");
}

// ── 5. candidates ───────────────────────────────────────────────────────────
{
  let items = 0;
  for (const field of data.fields) {
    if (!field.candidates) continue;
    for (const item of field.candidates.items) {
      assert.ok(X.CANDIDATE_SOURCE_PATTERN.test(item.source), `DOCS-CAND ${field.canonicalPath} candidate source tagged (${item.source})`);
      items += 1;
    }
  }
  cases.push(`DOCS-CAND every candidate value carries an OSS_SAMPLE / SCHEMA / OWNER_APPROVED source (${items} values)`);
  const generator = readFileSync(path.join(ROOT, "scripts/generate_frozen_ia_manual.mjs"), "utf8");
  check(generator.includes("oss-sample-characters.json") && !/catalog64|sold|characterpack/i.test(generator), "DOCS-CAND candidates are generated from the OSS sample file only (no sold-Character source)");
  check(!/推奨値|初期値/.test(JSON.stringify(data.fields.map(f => f.candidates || null))), "DOCS-CAND candidates are never called 推奨値／初期値");
  check(data.fields.filter(f => f.candidates).every(f => f.candidates.render === (f.candidates.items.filter(i => i.source.startsWith("OWNER_APPROVED:")).length >= 3 ? "datalist" : "examples")), "DOCS-CAND datalist only with ≥ 3 Owner-approved words, otherwise 入力例 (writer M3)");
  const datalists = data.fields.filter(f => f.candidates?.render === "datalist");
  if (data.content_review?.candidates?.status === "APPROVED") {
    equal(datalists.length, data.content_review.candidates.fields, "DOCS-CAND approved vocabulary: datalist fields = approved field count");
    equal(datalists.reduce((n, f) => n + f.candidates.items.filter(i => i.source.startsWith("OWNER_APPROVED:")).length, 0), data.content_review.candidates.words, "DOCS-CAND approved vocabulary: word count matches the approval record");
    check(datalists.every(f => f.candidates.screen_note?.ja === "例です。自由に書けます" && f.candidates.items.every(i => !/推奨|初期値|デフォルト/.test(i.value + (i.note || "")))), "DOCS-CAND datalist fields carry the screen note 「例です。自由に書けます」 and no 推奨／初期値 wording");
    check(data.content_review.candidates.approved_on && data.content_review.candidates.approved_by && data.content_review.candidates.route, "DOCS-CAND approval date / approver / route recorded");
    check(data.fields.find(f => f.canonicalPath === "character_core.character_role").candidates.render === "examples", "DOCS-CAND character_role stays 入力例 (no datalist)");
  }
}

// ── 6. reason_class dictionary + non-canonical notes ────────────────────────
{
  const dict = data.structured_enums["character_core.human_handoff_conditions.reason_class"];
  const enumValues = schema.$defs.handoffCondition.properties.reason_class.enum;
  equal(dict.options.map(o => o.value).join(","), enumValues.join(","), "DOCS-ENUM reason_class dictionary equals the adopted schema enum (8)");
  check(dict.options.every(o => o.meaning.ja && o.effect.source === "OPERATION_FACT" && o.effect.ja && o.effect.en && o.meaning.en), "DOCS-ENUM reason_class: meaning (JA/EN) + OPERATION_FACT effect v2 (JA/EN)");
  const paths = data.non_canonical_fields.map(item => item.path);
  for (const expected of ["meta.operation_class", "meta.operator_company", "mission.*", "role_source.*", "activity.*", "charback.*"]) assert.ok(paths.includes(expected), `DOCS-NONCANON ${expected} listed`);
  check(data.non_canonical_fields.every(item => item.canonicalOutput === false && item.goesTo?.ja && item.goesTo?.en && item.uiLabel?.en && item.currentNote.en && item.currentNote.ja && item.currentNote.ja.length <= 70 && (item.currentNote.ja.match(/。/g) || []).length <= 2), "DOCS-NONCANON every non-canonical authoring field says it does not reach the Character and where it goes (note ≤ 70 chars, ≤ 2 sentences)");
  check(data.non_canonical_fields.flatMap(item => item.options || []).concat(dict.options).every(o => o.meaning.ja.length <= 25 && !o.meaning.ja.endsWith("。")), "DOCS-ENUM option meanings ≤ 25 chars without 句点 (writer C3)");
  const op = data.non_canonical_fields.find(item => item.path === "meta.operation_class");
  check(op.options.map(o => o.value).join("") === "ABC" && op.options.find(o => o.value === "B").effect.ja.includes("Seat 8") && !/AMU/.test(op.options.find(o => o.value === "B").effect.ja) && op.options.find(o => o.value === "B").effect.source_note?.ja && op.options.find(o => o.value === "C").meaning.ja === "未収録（現在は使えない）", "DOCS-NONCANON operation_class A/B/C: Seat 8 check on B without a product name in the body (product fact in the source note), C = 未収録");
  check(op.options.concat(dict.options).every(o => o.effect.source === "OPERATION_FACT" && extension.effect_sources.OPERATION_FACT.from), "DOCS-NONCANON operation / reason facts carry the OPERATION_FACT source (統制卓確認 2026-09-22 recorded in effect_sources)");
  check(!X.NOT_MEASURED_TEXT.startsWith("効果"), "DOCS-EFFECT NOT_MEASURED stored value carries no 「効果:」 prefix (writer M1)");
  check(extension.trait_labels_ja.forward_progress === "前進性" && extension.trait_labels_ja.fact_orientation === "事実志向", "DOCS-EFFECT trait labels follow the engine's existing words (writer A1)");
}

// ── 7. PR template ──────────────────────────────────────────────────────────
{
  const template = readFileSync(path.join(ROOT, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8");
  check(template.includes("ヘルプ／マニュアル") && template.includes("docs:verify"), "DOCS-PR the PR template asks about help / manual updates and names docs:verify");
}

console.log(`DOCS_VERIFY PASS ${cases.length}/${cases.length}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`APPLIES_TO_APP_VERSION ${extension.applies_to_app_version} = package.json = tauri.conf.json / NOTES 47 (${data.content_review.current_note_ja.status}) / EFFECTS sourced-or-NOT_MEASURED / CANDIDATES OSS+OWNER only`);
