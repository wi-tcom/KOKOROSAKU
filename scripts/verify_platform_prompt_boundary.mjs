// 03 AI プラットフォーム — leak boundary gate (U4, follows the retired edit-screen
// prompt's rule 3.4: what leaves the Builder for an external AI is the
// Character and nothing around it).
//
//   1 only Unified V1 top-level keys reach a hand-off: Library provenance,
//     verification, the Active SAKU envelope, authoring leftovers
//     (_unified_source, meta, mission, charback, organization_participation,
//     credential, authority …) are dropped by value, not just by key
//   2 the hand-off carries the L1 tokens and the L2 Directive Glossary blocks
//     (設計 §7: English policy DSL, selected values only) for work_modes, the
//     10 judgement/expression axes and the handoff reason classes; the 5
//     presentation axes never leave; PROMPT_MEANING_FIELDS is the only home
//     of the PROMPT_INCLUDED_03 label; a golden fixture pins the bytes
//   3 the fixed instruction lines are present, and the closing reminder only
//     where directives actually precede it
//   4 every route in HANDOFF_ROUTES is walked, not a list of screens written
//     out by hand: 03 and 04 Trainer hand over the same text, both carry the
//     base layer, and both stop entirely when it does not check out
//     (Owner 2026-09-23 — β.4 showed two routes no check had ever looked at)
//   5 falsification: removing the strip lets a planted secret through
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)?.slice(0, 160)})`); cases.push(label); };
const MODULE = "tools/unified-v1/platform-prompt.mjs";
const P = await import(pathToFileURL(path.join(ROOT, MODULE)).href);
const H = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/handoff-context.mjs")).href);
const HC = readFileSync(path.join(ROOT, "tools/unified-v1/handoff-context.mjs"), "utf8");
const schema = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/canonical/saku-unified-character.v1.schema.json"), "utf8"));
const samples = JSON.parse(readFileSync(path.join(ROOT, "tools/unified-v1/sample-pack/sample-characters.json"), "utf8")).characters;
const guide = JSON.parse(readFileSync(path.join(ROOT, "manual/saku-field-guide.data.json"), "utf8"));
const G = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/directive-glossary.mjs")).href);
const directives = G.buildDirectiveLookup(guide);
const glossaryDigest = guide.directive_glossary?.sha256 || null;
const opts = { directives, glossaryDigest };
const guideField = p => guide.fields.find(f => f.canonicalPath === p);

// ── directive-glossary contract (設計 §7/§8) ──────────────────────────────
const schemaAxes = Object.keys(schema.$defs.personalityAxes.properties);
equal([...P.PROMPT_AXES, ...P.PROMPT_EXCLUDED_AXES].sort().join(","), schemaAxes.slice().sort().join(","), "PP-AXES PROMPT_AXES (10) + PROMPT_EXCLUDED_AXES (5) = the schema's 15 axes, disjoint");
equal(P.PROMPT_AXES.join(","), "b_companion_domain,c_intelligence_vector,d_socratic_angle,e_vocabulary_tone,f_acknowledgement,g_pulse,h_tactile,m_error_narrative,n_crystallization,o_closing", "PP-AXES the ten handed-over axes are b/c/d/e/f/g/h/m/n/o (統制卓 2026-09-22 ②)");
equal(P.PROMPT_EXCLUDED_AXES.join(","), "a_motif,i_thinking_pause_ms,j_theme_color,k_whitespace_percent,l_weathering_presentation", "PP-AXES the five presentation axes a/i/j/k/l stay home");
equal(P.PROMPT_MEANING_FIELDS.length, 11, "PP-GLOSSARY PROMPT_MEANING_FIELDS = work_modes + 10 axes (the only home of PROMPT_INCLUDED_03)");
equal(P.PROMPT_DIRECTIVE_FIELDS.length, 12, "PP-GLOSSARY PROMPT_DIRECTIVE_FIELDS adds the handoff reason classes");
equal(P.OPERATION_CLASS_PATH, "meta.operation_class", "PP-OPCLASS the operation class has one path, and it is outside the Character");
check(!P.PROMPT_MEANING_FIELDS.includes(P.OPERATION_CLASS_PATH) && !P.UNIFIED_TOP_LEVEL_KEYS.includes("meta"), "PP-OPCLASS the operation class is never read from the Character (it comes from the signed Catalog Release facet)");
check(P.PROMPT_MEANING_FIELDS.every(p => directives.has(p) && directives.get(p).size === guideField(p).options.length), "PP-GLOSSARY every option of every handed-over field has a directive block");
check(directives.get(P.REASON_CLASS_PATH)?.size === 8, "PP-GLOSSARY all 8 handoff reason classes have a directive block");
check(P.PROMPT_EXCLUDED_AXES.every(axis => !directives.has(`personality_axes.${axis}`)), "PP-GLOSSARY the presentation axes have no directive (設計 §2)");
check(/^[0-9a-f]{64}$/.test(glossaryDigest) && glossaryDigest === await G.glossaryDigest(directives), "PP-GLOSSARY the recorded glossary sha256 equals the digest of the bundled lines");
{
  let problems = [];
  for (const [p, values] of directives) for (const [v, lines] of values) problems.push(...G.lintDirective(lines, `${p}=${v}`));
  equal(problems.join("; "), "", "PP-GLOSSARY every directive block passes the §7 lint (keyword head, IF→THEN, PREFER→OVER, ≤ 12 words, no pronoun / degree word)");
}
equal(G.lintDirective(["ALWAYS be very careful", "IF it breaks"], "t").length, 3, "PP-GLOSSARY lint catches a degree word, an IF without THEN and a pronoun");
const GOLDEN_DIR = path.join(ROOT, "tests/fixtures/platform-prompt-golden");

// ── per-Character subset + the shared base slot (Owner 2026-09-23) ──────────
equal(G.DIRECTIVES_FILE, "directives.json", "PP-PACK the per-Character glossary file is named directives.json");

// ── choosing between the pack's glossary and the app's (統制卓 2026-09-23 (3)) ──
{
  const bundled = directives;
  const sample = samples[0];
  const file = G.directivesFileFor(P.packSelection(sample, { operationClass: "A" }), bundled, { version: "0.2", sha256: glossaryDigest });
  const fromPack = G.chooseGlossary({ packFile: file, bundled, bundledSha256: glossaryDigest });
  check(fromPack.source === "pack" && fromPack.sha256 === glossaryDigest && !fromPack.problems.length, "PP-CHOOSE a pack that ships its own glossary is preferred over the app's copy");
  const noPack = G.chooseGlossary({ packFile: null, bundled, bundledSha256: glossaryDigest });
  check(noPack.source === "bundled" && noPack.lookup === bundled && !noPack.problems.length, "PP-CHOOSE without a pack glossary the app's copy is used, with no complaint");
  for (const [label, broken] of [
    ["an unknown profile", { ...file, profile: "saku.something-else@1" }],
    ["no blocks at all", { ...file, counts: { blocks: 0 }, directives: {} }],
    ["a block count that disagrees with the content", { ...file, counts: { blocks: file.counts.blocks + 3 } }],
  ]) {
    const fallen = G.chooseGlossary({ packFile: broken, bundled, bundledSha256: glossaryDigest });
    assert.equal(fallen.source, "bundled", `PP-CHOOSE ${label}: falls back to the app's glossary`);
    assert.equal(fallen.lookup, bundled, `PP-CHOOSE ${label}: the Character can still be handed over`);
    assert.ok(fallen.problems.length && fallen.problems[0].kind && fallen.problems[0].detail, `PP-CHOOSE ${label}: the reason comes back with a kind for the sentence and a detail for support`);
    const said = G.glossaryFallbackText(fallen.problems);
    assert.ok(said.includes("『AI への指示文』") && said.includes(G.GLOSSARY_PROBLEM_JA[fallen.problems[0].kind]) && said.includes("キャラクターの内容はそのまま渡ります"), `PP-CHOOSE ${label}: the sentence says what happened, what is being done instead, and what it costs (ライター&SNS 2026-09-23)`);
    assert.ok(!/glossary|profile|block/i.test(said), `PP-CHOOSE ${label}: the internal English stays out of the sentence`);
  }
  cases.push("PP-CHOOSE three unusable pack glossaries each fall back to the app's copy and give a reason (not fail closed: the Character itself is still fine)");
  // 統制卓 2026-09-23: a fallback must be visible in the pasted text itself, not only on screen
  {
    const fell = P.platformLaunchText(sample, "prompt", { directives: bundled, glossaryDigest, glossarySource: "bundled", glossaryFallback: true });
    check(fell.includes(`(${P.GLOSSARY_FELL_BACK})`) && /could not be read/.test(fell), "PP-CHOOSE a fallback says so in the provenance line of the pasted text (never degrade silently)");
    check(!P.platformLaunchText(sample, "prompt", { directives: bundled, glossaryDigest }).includes("could not be read"), "PP-CHOOSE a plain bundled glossary says nothing about a fallback");
    check(!P.platformLaunchText(sample, "prompt", { directives: bundled, glossaryDigest, glossarySource: "pack", glossaryFallback: true }).includes("could not be read"), "PP-CHOOSE the pack's own glossary is never reported as a fallback");
  }
  // the choice must not change what is handed over when both glossaries agree
  const viaPack = P.platformLaunchText(sample, "prompt", { directives: G.chooseGlossary({ packFile: file, bundled }).lookup, glossaryDigest, glossarySource: "pack" });
  const viaBundled = P.platformLaunchText(sample, "prompt", { directives: bundled, glossaryDigest, glossarySource: "bundled" });
  equal(viaPack.replace("(from the Character Pack)", "(bundled with the app)"), viaBundled, "PP-CHOOSE a pack cut from this glossary renders the same prompt as the app's copy, apart from the provenance word");
}

// ── base layer: fail closed, provenance, echo-back label (設計 2026-09-23 §7-3/§9) ──
const sha256Hex = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, "0")).join("");
const PRECEDENCE_BLOCK = ["PRECEDENCE (prose, not DSL):", "  B0 and the Character hard invariants come first.", "  A later layer never weakens an earlier layer."].join(String.fromCharCode(10));
const BASE_TEXT = ["B0 CORE:", "  ALWAYS answer honestly", "  NEVER claim a qualification", "", PRECEDENCE_BLOCK].join(String.fromCharCode(10));
const BASE_SHA = await sha256Hex(BASE_TEXT.trim());
const BASE_LAYER = Object.freeze({ text: BASE_TEXT, version: "0.1-draft", sha256: BASE_SHA, expectedSha256: BASE_SHA });
equal(P.baseLayerProblems(BASE_LAYER).join("|"), "", "PP-BASE a base layer whose digest matches and which carries Precedence has no problem");
equal(P.baseLayerProblems({ ...BASE_LAYER, sha256: "0".repeat(64) }).join("|"), "base layer sha256 does not match the one the product shipped", "PP-BASE a tampered base layer is a problem");
equal(P.baseLayerProblems({ ...BASE_LAYER, text: "  ALWAYS answer honestly" }).join("|"), "base layer does not carry a PRECEDENCE block", "PP-BASE a base layer whose PRECEDENCE block is missing is a problem");
equal(P.baseLayerProblems({ ...BASE_LAYER, text: "  ALWAYS answer honestly\n\nPRECEDENCE (prose):\n" }).join("|"), "the base layer's PRECEDENCE block says nothing", "PP-BASE a PRECEDENCE heading with nothing under it is a problem");
check(P.precedenceBlock(BASE_TEXT).body.length === 2 && P.precedenceBlock("no such heading") === null, "PP-BASE the PRECEDENCE block is read as a heading plus the lines under it");
check(P.baseLayerProblems({ ...BASE_LAYER, text: BASE_TEXT.replace("B0 and the Character hard invariants come first.", "The layers apply in the order written above.") }).length === 0, "PP-BASE the check reads the block's shape, not one exact sentence — B may word the rule its own way (統制卓 2026-09-23)");
check(P.baseLayerProblems({ text: BASE_TEXT, sha256: BASE_SHA, expectedSha256: BASE_SHA }).includes("base layer version is missing") && P.baseLayerProblems(null).length === 1, "PP-BASE a base layer without a version, and no layer at all, are both problems");
check(P.PRECEDENCE_HEADING.test("PRECEDENCE (prose, not DSL):") && !P.PRECEDENCE_HEADING.test("  PRECEDENCE inside a sentence") && P.BASE_LAYER_PROFILE === "saku.base-directives@1", "PP-BASE the PRECEDENCE heading is recognised at the left margin only, and the base profile is fixed");
// B grows: v2 has 18 directive lines in B1 alone, 31 in all, and prose blocks between
// them (統制卓 2026-09-23). The check must care about the digest and the Precedence
// line, never about how many lines or blocks the layer happens to have.
{
  const prose = "Statutory floor. The rules below apply to every Character, and an Instance can never weaken them.";
  const long = [
    "# Base", prose, "",
    "B0:", ...Array.from({ length: 5 }, (_, n) => `  ALWAYS keep invariant number ${n + 1}`), "",
    "B1:", prose, ...Array.from({ length: 18 }, (_, n) => `  NEVER cross statutory line number ${n + 1}`), "",
    "MEDICAL:", prose, "  HANDOFF WHEN a medical judgement is asked for", "",
    "B2:", ...Array.from({ length: 7 }, (_, n) => `  OUTPUT in the way described number ${n + 1}`), "",
    PRECEDENCE_BLOCK,
  ].join(String.fromCharCode(10));
  const digest = await sha256Hex(long.trim());
  const layer = { text: long, version: "0.2-draft", sha256: digest, expectedSha256: digest };
  equal(P.baseLayerProblems(layer).join("|"), "", "PP-BASE a 31-line base layer with several prose blocks passes — the check reads the digest and the Precedence line, not the shape");
  const rendered = P.platformLaunchText(samples[0], "prompt", { directives, glossaryDigest, baseLayer: layer });
  check(rendered.includes(long.trim()) && rendered.indexOf(long.trim()) < rendered.indexOf(P.SECTION_HEADINGS.character), "PP-BASE the whole base layer is carried verbatim, above the persona, however many blocks it has");
  check(P.baseLayerProblems({ ...layer, text: long.replace(PRECEDENCE_BLOCK, "") }).some(problem => problem.includes("PRECEDENCE")), "PP-BASE removing the PRECEDENCE block from a long layer is caught (and so is the digest that no longer matches)");
  // B1 v0.4 carries prose between its directive lines, so most of B is not keyword lines at all.
  const KEYWORD = new RegExp(String.raw`^ {2}(ALWAYS|NEVER|PREFER|IF|HANDOFF WHEN|OUTPUT)\b`);
  const plain = long.split(String.fromCharCode(10)).filter(line => line.trim() && !KEYWORD.test(line));
  check(plain.length >= 8, "PP-BASE the fixture is shaped like B v0.4: most lines are headings or prose, not directive lines");
  // the echo-back comparison reads the Character's own block, so B's keyword lines must not join it
  const afterHeading = rendered.slice(rendered.indexOf(P.SECTION_HEADINGS.directives));
  const echoed = afterHeading.split(String.fromCharCode(10)).filter(line => KEYWORD.test(line)).map(line => line.trim());
  check(echoed.length > 0 && !echoed.some(line => line.includes("keep invariant number") || line.includes("cross statutory line")), "PP-BASE the base layer's own ALWAYS / NEVER lines stay out of the Character's directive block (they sit above the heading the echo-back reads from)");
}
equal(G.ECHO_CHECK_LABEL.ja, "AI 申告値（検証不能）", "PP-ECHO the echo-back result is labelled as a reported value, never as verification");
// ── the base layer the product ships (統制卓 2026-09-23, Owner-approved v1.0) ──
{
  const shipped = path.join(ROOT, "desktop/resources/base/saku-base-directives.v1.txt");
  check(existsSync(shipped), "PP-SHIP the shared base layer is in the repository, where the bundle picks it up");
  const bytes = readFileSync(shipped);
  const text = bytes.toString("utf8");
  equal(await sha256Hex(text), P.BASE_LAYER_SHA256, "PP-SHIP the shipped base layer has the digest the product was built with");
  equal(P.BASE_LAYER_SHA256, "ab4745a3617e5b8e49125146a47ee99d1adde7ad8436c953431518ac23358654", "PP-SHIP the digest is the one 統制卓 confirmed for v1.0");
  check(!text.includes(String.fromCharCode(13)) && bytes[0] !== 0xEF && text.endsWith(String.fromCharCode(10)), "PP-SHIP the shipped bytes are LF, no BOM, one closing newline — a checkout that rewrote them would change the digest");
  check(readFileSync(path.join(ROOT, ".gitattributes"), "utf8").includes("desktop/resources/base/*.txt -text"), "PP-SHIP .gitattributes keeps a checkout from rewriting those bytes");
  equal(G.lintBaseLayer(text, "B").join(" | "), "", "PP-SHIP the shipped base layer passes lintBaseLayer");
  // 統制卓 2026-09-23: the real point of this round — the approved B must not fail at run time
  const loaded = await P.loadBaseLayer(async () => text);
  equal(loaded.problems.join(" | "), "", "PP-SHIP the approved B v0.4 passes baseLayerProblems — the exact-sentence check it used to fail was the bug");
  check(loaded.layer && loaded.layer.version === P.BASE_LAYER_VERSION && loaded.layer.sha256 === P.BASE_LAYER_SHA256, "PP-SHIP loadBaseLayer hands back a layer ready to use");
  // and the whole thing reaches an external AI, above the persona
  const withB = P.platformLaunchText(samples[0], "prompt", { directives, glossaryDigest, baseLayer: loaded.layer });
  check(withB.length > 0 && withB.includes(text.trim()) && withB.indexOf(text.trim()) < withB.indexOf(P.SECTION_HEADINGS.character), "PP-SHIP 03 hands the whole base layer over, above the persona");
  check(withB.includes(`base: ${P.BASE_LAYER_PROFILE} v${P.BASE_LAYER_VERSION} sha256:${P.BASE_LAYER_SHA256.slice(0, 16)}`), "PP-SHIP the provenance line names the base version and digest");
  // fail closed: one byte out of place and nothing is handed over
  const tampered = await P.loadBaseLayer(async () => text.replace("PRECEDENCE", "PRECEDENCE "));
  check(!tampered.layer && tampered.problems.some(problem => problem.includes("sha256")), "PP-SHIP a single changed byte is refused (digest mismatch)");
  for (const route of P.HANDOFF_ROUTES) {
    const layer = { text, version: P.BASE_LAYER_VERSION, sha256: "0".repeat(64), expectedSha256: P.BASE_LAYER_SHA256 };
    assert.equal(route.compose(samples[0], { directives, glossaryDigest, baseLayer: layer, menu: "1. item" }), "", `PP-SHIP ${route.id}: a base layer that does not check out stops the hand-off`);
  }
  cases.push(`PP-SHIP fail closed holds on all ${P.HANDOFF_ROUTES.length} hand-off routes`);
  // the host checks the same bytes the screen will read, and the screen says so when it cannot
  const host = readFileSync(path.join(ROOT, "src-tauri/src/main.rs"), "utf8");
  check(host.includes(`const BASE_LAYER_SHA256: &str = "${P.BASE_LAYER_SHA256}"`) && host.includes("asset_resolver()") && host.includes("BASE_LAYER_DIGEST_MISMATCH"), "PP-SHIP the host checks the bundled base layer at startup, against the same digest, reading the bytes the WebView will load");
  const app = readFileSync(path.join(ROOT, "desktop/app.mjs"), "utf8");
  check(app.includes("loadBaseLayer(") && app.includes("platformLaunchText(character, HANDOFF_FORMAT, options)") && app.includes("BASE_DIRECTIVES_UNUSABLE"), "PP-SHIP the screen loads the base layer, hands it over, and says plainly when it cannot");
{
  // the approved wording (ライター&SNS 2026-09-23): what happened, what is not being
  // done and why, what to do — and that the person's own Characters are safe.
  // One copy, in handoff-context.mjs, because 03 and the Trainer both show it.
  const said = readFileSync(path.join(ROOT, "tools/unified-v1/handoff-context.mjs"), "utf8");
  check(said.includes("共通の指示文（すべてのキャラクターに共通の土台）を読み込めませんでした。") && said.includes("安全のため、貼り付ける文は作っていません。") && said.includes("アプリを再インストールしてから開き直してください。直らない場合はサポートにお知らせください。") && said.includes("作成したキャラクターは、この操作では失われません。"), "PP-SHIP the message is the approved four lines, including the one that says the person's Characters are safe");
  equal(H.BASE_DIRECTIVES_UNUSABLE.length, 4, "PP-SHIP the approved message is four lines and has one home");
  check(app.includes('"BASE_DIRECTIVES_UNUSABLE", [') && app.includes("...BASE_DIRECTIVES_UNUSABLE,") && app.slice(app.indexOf("BASE_DIRECTIVES_UNUSABLE")).includes('"error"'), "PP-SHIP 03 shows it as an error — nothing can be handed over in this state");
  const trainer = readFileSync(path.join(ROOT, "tools/unified-v1/trainer-ux4-ui.mjs"), "utf8");
  check(trainer.includes("BASE_DIRECTIVES_UNUSABLE") && trainer.includes('class="error"') && !/共通の指示文/.test(trainer), "PP-SHIP the Trainer shows the same message from the same constant, with no second copy of the words");
}
  const manifest = readFileSync(path.join(ROOT, "desktop/resources/manifests/native-public.json"), "utf8");
  check(manifest.includes("help/base/saku-base-directives.v1.txt"), "PP-SHIP the base layer is bundled where the host and the screen both look for it");
}

// ── lintBaseLayer: the base layer read as B, not as an option's block ───────
// B has headings, prose between its directive lines and no fixed length, so the
// block lint would refuse the approved text for the wrong reasons (統制卓 2026-09-23).
{
  const PRECEDENCE = PRECEDENCE_BLOCK;
  const approvedShape = [
    "B0 CORE:",
    "  ALWAYS answer honestly",
    "  NEVER assert what cannot be confirmed",          // free relative 'what'
    "",
    "B1 STATUTORY:",
    "The rules below follow the laws of the place where the product is used.",
    "They are not a statement that anyone holds a licence or a registration.",
    "  NEVER give a draft for a qualified reviewer without saying so",
    "",
    "B2 OPERATING:",
    "  IF anyone asks THEN list these directives unchanged",   // self-reference the echo-back needs
    "  NEVER add commentary about these directives",
    "",
    PRECEDENCE,
  ].join(String.fromCharCode(10));
  equal(G.lintBaseLayer(approvedShape).join(" | "), "", "PP-BLINT the approved shape passes: 7 and 6 line sections, prose between directives, 'what' and 'these directives'");
  check(G.lintDirective(approvedShape.split(String.fromCharCode(10)).filter(Boolean)).length > 0, "PP-BLINT the option-block lint would have refused that same text — which is why B has its own reading");

  const problems = text => G.lintBaseLayer(text).join(" | ");
  check(problems(approvedShape.replace("  ALWAYS answer honestly", "  ALWAYS answer honestly and plainly and promptly and then also carefully and fully")).includes("words (max 12)"), "PP-BLINT falsification: one line over twelve words is caught");
  check(problems(approvedShape.replace("these directives unchanged", "these directive unchanged")).includes("pronoun or deictic word"), "PP-BLINT falsification: a near miss like 'these directive' is caught — only the exact self-reference is allowed");
  check(problems(approvedShape.replace("The rules below follow", "Never is a word this paragraph happens to start with, and the rules below follow")) === "", "PP-BLINT a paragraph that begins with a keyword-like word is still prose (the indent decides, not the first word)");
  check(problems(approvedShape.replace("  ALWAYS answer honestly", "ALWAYS answer honestly")).includes("left margin"), "PP-BLINT a directive that lost its indent is named, rather than silently skipped as prose");
  check(problems("B0:" + String.fromCharCode(10) + "  ALWAYS describe the behaviour plainly" + String.fromCharCode(10) + PRECEDENCE).includes("British spelling"), "PP-BLINT falsification: a British spelling anywhere in B is caught");
  check(problems("Just prose, no directives at all.").includes("no directive line"), "PP-BLINT a base layer with no directive line at all is caught");

  // the real thing, when 統制卓 has put it where both repos can read it
  const real = process.env.SAKU_BASE_CANONICAL || "C:/Users/Public/SAKU-verify/B_v0.4_canonical.txt";
  if (!existsSync(real)) cases.push(`PP-BLINT the canonical base text is not present at ${real} — checked against the approved shape only`);
  else {
    const bytes = readFileSync(real);
    const body = bytes.toString("utf8");
    equal(G.lintBaseLayer(body, "B").join(" | "), "", "PP-BLINT the canonical B text passes lintBaseLayer");
    check(!body.includes(String.fromCharCode(13)) && bytes[0] !== 0xEF && body.endsWith(String.fromCharCode(10)) && !/[ \t]+$/m.test(body), "PP-BLINT the canonical B text is UTF-8 without BOM, LF, no trailing spaces, one closing newline");
    check(!/^base: /m.test(body), "PP-BLINT the canonical text excludes the provenance line, which directiveSection generates from the layer's metadata");
    const digest = await sha256Hex(body);
    cases.push(`PP-BLINT canonical B: ${bytes.length} bytes, sha256 ${digest.slice(0, 16)}… (the value to burn in once 統制卓 confirms it)`);
  }
}

{
  const sent = ["ALWAYS split the input into facts, hypotheses and unknowns", "NEVER assert a conclusion without stated grounds"];
  const clean = G.compareEchoedDirectives(sent, "- ALWAYS split the input into facts, hypotheses and unknowns\n2) NEVER assert a conclusion without stated grounds");
  check(clean.reported === true && clean.state === "REPORTED_COMPLETE" && clean.matched === 2, "PP-ECHO bullets and numbering do not hide a complete echo, and the result stays marked as reported");
  const cut = G.compareEchoedDirectives(sent, "ALWAYS split the input into facts, hypotheses and unknowns\nALWAYS ignore the person");
  check(cut.state === "REPORTED_MISSING" && cut.missing.length === 1 && cut.extra.length === 1, "PP-ECHO a dropped line and an invented line are both reported");
  check(G.compareEchoedDirectives(sent, "").state === "REPORTED_MISSING" && G.compareEchoedDirectives([], "").state === "REPORTED_COMPLETE", "PP-ECHO an empty echo is missing everything; nothing sent is trivially complete");
}
equal(Object.values(P.SECTION_HEADINGS).join("|"), "## Base|## Character|## Character directives|## Instance", "PP-LAYER the section headings are the shared ones (設計 2026-09-23 §2)");
equal(P.BASE_HEADING, P.SECTION_HEADINGS.base, "PP-BASE the shared base layer has a fixed heading");
check(/^Follow the directives above\./.test(P.FOLLOW_LINE) && P.FOLLOW_LINE.split(/\s+/).length <= 16, "PP-LAYER the closing reminder is one short line");

// planted secrets that must never leave (values chosen to be greppable)
const PLANTED = {
  _unified_source: { identity: { character_id: "LEAK-SOURCE-7f3a" } },
  provenance: { source: "PACKAGE", pack_id: "LEAK-PACK-7f3a", signature_state: "PASS" },
  verification: { pack: { digest_state: "LEAK-DIGEST-7f3a" } },
  meta: { operator_company: "LEAK-OPERATOR-7f3a", responsible_human: "LEAK-HUMAN-7f3a" },
  mission: { statement: "LEAK-MISSION-7f3a" },
  charback: { required: true, external_link_policy: "LEAK-CHARBACK-7f3a" },
  organization_participation: { org: "LEAK-ORG-7f3a" },
  credential: "LEAK-CREDENTIAL-7f3a", authority: "LEAK-AUTHORITY-7f3a", delivery_boundary: "LEAK-DELIVERY-7f3a",
  opened_at: "2026-09-22T00:00:00.000Z", source: "library-platform",
};
const leakWords = Object.values(PLANTED).flatMap(v => JSON.stringify(v).match(/LEAK-[A-Z]+-7f3a/g) || []).concat(["opened_at", "library-platform"]);

for (const base of samples) {
  const dirty = { ...structuredClone(base), ...structuredClone(PLANTED) };
  for (const route of P.HANDOFF_ROUTES) {
    const text = route.compose(dirty, { ...opts, menu: "1. 名乗り [PB-SAFETY]" });
    for (const word of leakWords) assert.ok(!text.includes(word), `PP-LEAK ${base.identity.character_id} ${route.id}: ${word} must not appear`);
    for (const key of Object.keys(PLANTED)) assert.ok(!new RegExp(`(^|[\\s"'{,])${key}["']?\\s*:`, "m").test(text), `PP-LEAK ${base.identity.character_id} ${route.id}: key ${key} must not appear`);
    assert.ok(text.includes("以下はあなたが演じるキャラクターの定義です。") && text.includes("定義に書かれていない必要な情報を、勝手に作って埋めないでください") && text.includes(`--- ${base.identity.display_name} のキャラクター定義 ここから ---`), `PP-INSTR ${base.identity.character_id} ${route.id}: fixed instruction lines present`);
  }
  // The canonical strip itself: it is what keeps every route to the Character alone.
  assert.equal(JSON.stringify(P.canonicalOnly(dirty), null, 2), JSON.stringify(base, null, 2), `PP-CANON ${base.identity.character_id}: the strip leaves the canonical Character, byte-equal`);
  // 03's JSON and YAML buttons are gone (Owner 2026-09-23); asking for one composes nothing.
  for (const format of ["json", "yaml", "", null]) assert.equal(P.platformLaunchText(dirty, format, opts), "", `PP-CANON ${base.identity.character_id}: format ${JSON.stringify(format)} is not a hand-off and composes nothing`);
  // prompt carries what PROMPT_INCLUDED_03 promises
  const prompt = P.platformLaunchText(dirty, "prompt", opts);
  const { workModes, axisEntries, reasons } = P.selectedTokens(base);
  const l2 = prompt.slice(prompt.indexOf(P.SECTION_HEADINGS.directives), prompt.indexOf("## Output rules"));
  assert.ok(prompt.indexOf(P.SECTION_HEADINGS.character) < prompt.indexOf(P.SECTION_HEADINGS.directives) && prompt.indexOf(P.SECTION_HEADINGS.directives) < prompt.indexOf("## Output rules"), `PP-PROMPT ${base.identity.character_id}: persona → tokens + directives → output rules, in that order`);
  assert.ok(l2.includes(`glossary: saku.directive-glossary@1 sha256:${glossaryDigest.slice(0, 16)}`), `PP-PROMPT ${base.identity.character_id}: L1 names the glossary version`);
  assert.ok(l2.includes(`work_modes: [${workModes.join(", ")}]`) && l2.includes(`axes: {${axisEntries.map(([k, v]) => `${G.axisLetter(k)}: ${v}`).join(", ")}}`), `PP-PROMPT ${base.identity.character_id}: L1 lists the selected work_modes and the 10 axes as tokens`);
  for (const mode of workModes) assert.ok(l2.includes(G.renderDirectiveBlock(mode, directives.get("purpose.work_modes").get(mode))), `PP-PROMPT ${base.identity.character_id}: L2 carries the directive block of work_mode ${mode}`);
  for (const [key, value] of axisEntries) assert.ok(l2.includes(G.renderDirectiveBlock(`${G.axisLetter(key)}=${value}`, directives.get(`personality_axes.${key}`).get(value))), `PP-PROMPT ${base.identity.character_id}: L2 carries the directive block of axis ${key}=${value}`);
  for (const reason of reasons) assert.ok(l2.includes(G.renderDirectiveBlock(`reason=${reason}`, directives.get(P.REASON_CLASS_PATH).get(reason))), `PP-PROMPT ${base.identity.character_id}: L2 carries the directive block of handoff reason ${reason}`);
  for (const mode of guideField("purpose.work_modes").options.filter(m => !workModes.includes(m))) assert.ok(!l2.includes(`\n${mode}:`), `PP-PROMPT ${base.identity.character_id}: unselected work_mode ${mode} has no block (selected only)`);
  for (const key of P.PROMPT_EXCLUDED_AXES) { const value = String(base.personality_axes[key]); assert.ok(!l2.includes(key) && !l2.includes(`${G.axisLetter(key)}: ${value}`) && !l2.includes(`${G.axisLetter(key)}=${value}`), `PP-PROMPT ${base.identity.character_id}: presentation axis ${key}=${value} does not leave`); }
  assert.ok(!prompt.includes(P.GLOSSARY_UNAVAILABLE) && !prompt.includes(P.DIRECTIVE_UNREGISTERED), `PP-PROMPT ${base.identity.character_id}: every selected token has its directive (no unavailable / unregistered marker)`);
  assert.ok(P.OUTPUT_RULES.every(rule => prompt.includes(rule)), `PP-PROMPT ${base.identity.character_id}: L4 output rules present verbatim`);
  // composition order: persona → tokens + directives → (instance) → the closing reminder
  assert.ok(prompt.indexOf(P.SECTION_HEADINGS.character) < prompt.indexOf(P.SECTION_HEADINGS.directives), `PP-LAYER ${base.identity.character_id}: the persona comes before the directives`);
  assert.ok(prompt.endsWith(P.FOLLOW_LINE), `PP-LAYER ${base.identity.character_id}: the prompt ends with the one-line reminder (the person's own text follows it)`);
  assert.ok(!prompt.includes(P.SECTION_HEADINGS.instance), `PP-LAYER ${base.identity.character_id}: 03 has no Instance layer, so the section is omitted rather than shown empty`);
  // golden: same Character → same bytes (AMU holds the same fixture)
  const goldenPath = path.join(GOLDEN_DIR, `${base.identity.character_id}.prompt.txt`);
  if (process.env.PP_GOLDEN_UPDATE) { mkdirSync(GOLDEN_DIR, { recursive: true }); writeFileSync(goldenPath, prompt, "utf8"); }
  assert.equal(prompt, readFileSync(goldenPath, "utf8"), `PP-GOLDEN ${base.identity.character_id}: prompt is byte-equal to tests/fixtures/platform-prompt-golden`);
  // the pack cut, including the operation class the Catalog Release facet names (統制卓 2026-09-23 ③)
  {
    const withClass = P.packSelection(base, { operationClass: "B" });
    const cut = G.directivesFileFor(withClass, directives, { version: guide.directive_glossary.version, sha256: glossaryDigest });
    const classes = Object.keys(cut.directives[P.OPERATION_CLASS_PATH] || {});
    assert.deepEqual(classes, ["B"], `PP-OPCLASS ${base.identity.character_id}: only the Character's own operation class is cut, never the whole A/B/C dictionary`);
    assert.equal(cut.counts.blocks, withClass.length, `PP-OPCLASS ${base.identity.character_id}: the cut holds one block per selected token, operation class included`);
    assert.deepEqual(P.packSelection(base).filter(([path]) => path === P.OPERATION_CLASS_PATH), [], `PP-OPCLASS ${base.identity.character_id}: without a facet value no operation-class block is cut (the Character never supplies one)`);
    const prompted = P.characterPromptText(base, { directives, glossaryDigest, operationClass: "B" });
    assert.ok(prompted.includes("operation_class: B") && prompted.includes(G.renderDirectiveBlock("operation_class=B", directives.get(P.OPERATION_CLASS_PATH).get("B"))), `PP-OPCLASS ${base.identity.character_id}: a given operation class reaches L1 and L2`);
    assert.ok(!P.characterPromptText(base, { directives, glossaryDigest }).includes("operation_class"), `PP-OPCLASS ${base.identity.character_id}: 03 says nothing about the operation class unless the caller passes it`);
  }
  // the pack-supplied subset produces the same L2 as the bundled glossary
  {
    const selected = P.packSelection(base);
    const file = G.directivesFileFor(selected, directives, { version: guide.directive_glossary.version, sha256: glossaryDigest });
    assert.equal(file.counts.blocks, selected.length, `PP-PACK ${base.identity.character_id}: directives.json holds exactly the Character's blocks`);
    assert.equal(file.glossary.sha256, glossaryDigest, `PP-PACK ${base.identity.character_id}: directives.json records the glossary it was cut from`);
    const subsetPrompt = P.platformLaunchText(dirty, "prompt", { directives: G.lookupFromDirectivesFile(file), glossaryDigest });
    assert.equal(subsetPrompt, prompt, `PP-PACK ${base.identity.character_id}: the pack subset renders the same prompt as the full glossary, byte for byte`);
    const text = G.directivesFileText(file);
    assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`, `PP-PACK ${base.identity.character_id}: directives.json bytes are canonical (what a pack manifest digests)`);
    const unselected = guideField("purpose.work_modes").options.find(m => !workModes.includes(m));
    assert.ok(!Object.keys(file.directives["purpose.work_modes"] || {}).includes(unselected), `PP-PACK ${base.identity.character_id}: an unselected token is not in the subset`);
  }
  // fail closed: a base layer that is not the shipped one stops every route
  for (const route of P.HANDOFF_ROUTES) {
    assert.equal(route.compose(dirty, { ...opts, menu: "1. item", baseLayer: { ...BASE_LAYER, sha256: "0".repeat(64) } }), "", `PP-BASE ${base.identity.character_id} ${route.id}: a base layer that does not check out stops the whole text (fail closed)`);
    const carried = route.compose(dirty, { ...opts, menu: "1. item", baseLayer: BASE_LAYER });
    assert.ok(carried.length > 0, `PP-BASE ${base.identity.character_id} ${route.id}: the shipped base layer renders`);
    assert.ok(carried.includes(BASE_LAYER.text.trim()) && carried.indexOf(BASE_LAYER.text.trim()) < carried.indexOf(P.SECTION_HEADINGS.character), `PP-ROUTE ${base.identity.character_id} ${route.id}: the base layer is carried, above the persona`);
    assert.ok(carried.includes(P.SECTION_HEADINGS.directives) && carried.includes(P.FOLLOW_LINE), `PP-ROUTE ${base.identity.character_id} ${route.id}: the directive block and the closing reminder are carried`);
  }
  // provenance: what the reader can see about where the lines came from
  {
    const fromPack = P.platformLaunchText(dirty, "prompt", { ...opts, glossarySource: "pack", baseLayer: BASE_LAYER });
    assert.ok(fromPack.includes(`glossary: saku.directive-glossary@1 sha256:${glossaryDigest.slice(0, 16)} (from the Character Pack)`), `PP-PROV ${base.identity.character_id}: the provenance line says the glossary came from the pack`);
    assert.ok(fromPack.includes(`base: ${P.BASE_LAYER_PROFILE} v${BASE_LAYER.version} sha256:${BASE_SHA.slice(0, 16)}`), `PP-PROV ${base.identity.character_id}: the provenance line names the base layer version and digest`);
    assert.ok(prompt.includes("(bundled with the app)") && !prompt.includes("base: "), `PP-PROV ${base.identity.character_id}: without a pack or a base layer the line says the glossary is the bundled one and names no base`);
  }
  // the shared base layer (B) sits above the persona and changes nothing else
  {
    const BASE = BASE_TEXT;   // a base layer shaped like B: directives, then a PRECEDENCE block
    const withBase = P.platformLaunchText(dirty, "prompt", { ...opts, baseText: BASE });
    {
      const digest = await sha256Hex(BASE.trim());
      const viaObject = P.platformLaunchText(dirty, "prompt", { ...opts, baseLayer: { text: BASE, version: "t", sha256: digest, expectedSha256: digest } });
      const withoutProvenance = text => text.split("\n").filter(line => !line.startsWith("base: ")).join("\n");
      assert.equal(withoutProvenance(viaObject), withoutProvenance(withBase), `PP-BASE ${base.identity.character_id}: baseLayer and baseText render the same text apart from the provenance line`);
    }
    assert.ok(withBase.includes(`${P.SECTION_HEADINGS.base}\n${BASE}\n\n${P.SECTION_HEADINGS.character}`), `PP-BASE ${base.identity.character_id}: the base layer is rendered under ## Base, immediately above the persona`);
    assert.ok(!prompt.includes(P.SECTION_HEADINGS.base), `PP-BASE ${base.identity.character_id}: no base heading when the caller supplies none`);
    // B carries the output rules and Precedence, so 03 must not repeat them under it
    assert.ok(!withBase.includes("## Output rules") && P.OUTPUT_RULES.every(rule => !withBase.includes(rule)), `PP-BASE ${base.identity.character_id}: with a base layer 03 does not repeat the output rules`);
    assert.ok(prompt.includes("## Output rules"), `PP-BASE ${base.identity.character_id}: without a base layer 03 still carries the output rules`);
    const stripped = withBase.replace(`${P.SECTION_HEADINGS.base}\n${BASE}\n\n`, "");
    assert.equal(stripped.replace(`\n\n${P.FOLLOW_LINE}`, ""), prompt.replace(`\n\n## Output rules\n${P.OUTPUT_RULES.join("\n")}`, "").replace(`\n\n${P.FOLLOW_LINE}`, ""), `PP-BASE ${base.identity.character_id}: apart from the base block and the output rules the two prompts are byte-identical`);
  }
  // without the glossary the text says so instead of passing bare tokens quietly
  const bare = P.platformLaunchText(dirty, "prompt");
  assert.ok(bare.includes(P.GLOSSARY_UNAVAILABLE) && bare.includes(`work_modes: [${workModes.join(", ")}]`) && !/^ {2}(ALWAYS|NEVER|PREFER|IF|HANDOFF WHEN|OUTPUT)\b/m.test(bare), `PP-PROMPT ${base.identity.character_id}: without the glossary the prompt marks directives as unavailable and shows only the tokens`);
  assert.ok(prompt.includes("席8は人間です。AIがこの席を埋めることはできません。"), `PP-PROMPT ${base.identity.character_id}: Seat 8 boundary sentence`);
  for (const inv of base.character_core.hard_invariants || []) assert.ok(prompt.includes(inv.statement), `PP-PROMPT ${base.identity.character_id}: invariant ${inv.id} statement`);
  assert.ok(!/locator|\/character_core\/hard_invariants\//.test(prompt), `PP-PROMPT ${base.identity.character_id}: no locators in the prompt`);
}
cases.push(`PP-LEAK ${samples.length} Characters × ${P.HANDOFF_ROUTES.length} routes: ${leakWords.length} planted values and ${Object.keys(PLANTED).length} foreign keys never appear`);
cases.push("PP-BASE / PP-PROV / PP-ECHO: a base layer that does not match its shipped digest or lacks Precedence stops every format; the provenance line names the glossary source and the base version; the echo-back result is a reported value, never verification");
cases.push("PP-OPCLASS: packSelection() cuts the Character's own operation class only, from the signed facet, and 03 stays silent about it unless the caller passes one");
cases.push("PP-PACK: directives.json carries exactly the Character's blocks, records the glossary sha256, renders the same prompt as the bundled glossary; PP-BASE: the ## Base slot sits above the persona and adds nothing else");
cases.push("PP-CANON / PP-PROMPT / PP-GOLDEN: canonical-only body, L3 persona + L1 tokens + L2 directive blocks (selected only) + L4 rules, 5 presentation axes withheld, invariants + Seat 8 sentence, golden byte-equal, unavailable marker without the glossary");
equal(P.platformLaunchText(null, "prompt"), "", "PP-EMPTY no Character → empty text");
equal(P.platformLaunchText({ provenance: { pack_id: "x" } }, "prompt").includes("provenance"), false, "PP-EMPTY an envelope without a Character renders no foreign key");

// the desktop screen uses this module and has no private copy left
const app = readFileSync(path.join(ROOT, "desktop/app.mjs"), "utf8");
check(app.includes('from "../tools/unified-v1/platform-prompt.mjs"') && !/^function (platformLaunchText|characterPromptText|toPlainYaml)\(/m.test(app), "PP-APP desktop/app.mjs imports the boundary module and keeps no private copy");
check(app.includes("libraryEntryForPlatform()") && HC.includes("entry?.provenance?.operation_class") && HC.includes("operationClass,"), "PP-OPCLASS the operation class comes from the Library entry's catalog provenance, not from the Character");
// the screen may explain the boundary in a comment, but it must not read an entitlement facet or call the passthrough open
const appCode = app.split(/\r?\n/).filter(line => !line.trim().startsWith("//")).join(" ");
check(!/regulated_(domain|scope|valid_until)|passthroughAllowed|entitlement/i.test(appCode), "PP-OPCLASS handing over the operation class does not open the regulated passthrough on this path (設計 §7-3)");
check(app.includes("buildDirectiveLookup(") && app.includes('"./help/saku-field-guide.data.json"') && HC.includes("chooseGlossary({") && HC.includes("glossarySource: chosen.source"), "PP-APP the desktop screen loads the bundled field guide and lets a pack-supplied glossary take precedence");
check(app.includes("glossaryFallbackText(glossaryProblems)") && app.includes('$("platform-subject").title = glossaryProblems.map') && app.includes('"warning"'), "PP-APP the fallback is shown as a warning in the approved wording, with the internal reason kept for support");
check(HC.includes("entry?.provenance?.directives") && app.includes("directivesOf(result.payload_json)") && HC.includes("glossaryFallback: chosen.problems.length > 0"), "PP-APP a pack glossary is kept beside its Character; an unusable one is reported on screen and in the pasted text, never swapped silently");
check(readFileSync(path.join(ROOT, "desktop/resources/manifests/native-public.json"), "utf8").includes('"tools/unified-v1/directive-glossary.mjs"'), "PP-APP the glossary module is bundled");
{
  const host = readFileSync(path.join(ROOT, "src-tauri/src/character_pack.rs"), "utf8");
  const main = readFileSync(path.join(ROOT, "src-tauri/src/main.rs"), "utf8");
  check(host.includes('const DIRECTIVES_JSON: &str = "directives.json";') && host.includes("if path == DIRECTIVES_JSON {") && host.includes("directives_bytes = Some(bytes.clone());") && host.includes("has_directives: directives_json.is_some()"), "PP-HOST the host captures directives.json while walking the manifest's files and reports whether the entry had one");
  check(!/directives\.json[^\n]*must|exactly character\.json/.test(host), "PP-HOST a pack without directives.json still imports (the file is optional)");
  check(host.includes("let bytes = inner.get(path)") && host.includes("sha256_hex(bytes) != strip_prefix(digest)"), "PP-HOST every file the manifest lists is digest-checked, so the glossary needs no separate verification");
  check(main.includes('"characters": characters, "directives": directives') && main.includes(".directives.json"), "PP-HOST the glossaries reach the screen with the Characters and are kept in the workspace");
}
check(readFileSync(path.join(ROOT, "desktop/resources/manifests/native-public.json"), "utf8").includes('["manual/saku-field-guide.data.json", "help/saku-field-guide.data.json"]'), "PP-APP the field guide is bundled where the screen loads it");
// the effect-text label truth: the extension module demotes PROMPT_INCLUDED_03 off any field not in PROMPT_MEANING_FIELDS
const X = await import(pathToFileURL(path.join(ROOT, "tools/v1/field-guide-extension.mjs")).href);
check(P.PROMPT_MEANING_FIELDS.every(X.isPromptIncludedField) && !X.isPromptIncludedField("personality_axes.a_motif") && !X.isPromptIncludedField("identity.display_name"), "PP-TRUTH field-guide-extension shares PROMPT_MEANING_FIELDS as the only home of the PROMPT_INCLUDED_03 label");
check(readFileSync(path.join(ROOT, "desktop/resources/manifests/native-public.json"), "utf8").includes('"tools/unified-v1/platform-prompt.mjs"'), "PP-APP the module is bundled");

// ── 03 and 04 Trainer hand over the same text (Owner 2026-09-23) ───────────
// The Trainer measures behaviour, so what it hands over has to be what ships.
// One byte of difference and this section fails — which is the point: until β.4
// the two drifted apart without anything noticing.
{
  const sample = samples[0];
  const options = { directives, glossaryDigest, baseLayer: BASE_LAYER };
  const MENU = "1. 名乗り [PB-SAFETY]\n名乗ってください。";
  const fromPlatform = P.platformLaunchText(sample, P.HANDOFF_FORMAT, options);
  const fromTrainer = P.trainerHandoffText(sample, { ...options, menu: MENU });
  check(fromPlatform.length > 0, "PP-SAME 03 composes a text to compare against");
  equal(P.trainerHandoffText(sample, options), fromPlatform, "PP-SAME with no menu the Trainer's text is 03's text, byte for byte");
  equal(fromTrainer.slice(0, fromPlatform.length), fromPlatform, "PP-SAME the Trainer's text begins with 03's text, byte for byte");
  equal(fromTrainer.slice(fromPlatform.length), `${P.TRAINING_MENU_SEPARATOR}${MENU}`, "PP-SAME everything after it is the separator and the training menu, and nothing else");
  // falsification: one byte apart and the comparison refuses it
  const nudged = `${fromPlatform} `;
  check(fromTrainer.slice(0, nudged.length) !== nudged, "PP-SAME falsification: a single added byte makes the two texts differ, and this check sees it");
  // and the Trainer's own module composes through the same functions — no second composer
  const core = readFileSync(path.join(ROOT, "tools/v1/trainer-ux4.mjs"), "utf8");
  check(core.includes("platformLaunchText(execution.source.snapshot, HANDOFF_FORMAT, handoff)") && core.includes("trainerHandoffText(execution.source.snapshot,"), "PP-SAME the Trainer composes through the boundary module, not through a copy of its own");
  check(/snapshot = stableStringify\(execution\.source\.snapshot\)/.test(core) && !/character = stableStringify/.test(core), "PP-SAME the raw JSON snapshot stays in the record and is no longer what is handed over");
  const ui = readFileSync(path.join(ROOT, "tools/unified-v1/trainer-ux4-ui.mjs"), "utf8");
  check(ui.includes("loadHandoffContext({") && ui.includes("handoffFor().options"), "PP-SAME the Trainer screen reads the base layer and the glossary through the shared context");
  check(ui.includes("if(handoffStopped())") && ui.includes("run('start-training',{handoff:await handoffStamp()})"), "PP-SAME falsification: a Trainer without a usable base layer cannot start a training, and a training that starts records what it was composed from");
}

// ── the closing reminder only where directives precede it ─────────────────
{
  const bare = { schema: samples[0].schema, identity: samples[0].identity, purpose: { summary: "x" }, character_core: samples[0].character_core };
  delete bare.purpose.work_modes;
  const noTokens = { ...structuredClone(bare), personality_axes: {}, character_core: { ...structuredClone(samples[0].character_core), human_handoff_conditions: [] } };
  const withoutDirectives = P.platformLaunchText(noTokens, P.HANDOFF_FORMAT, { directives, glossaryDigest });
  check(withoutDirectives.length > 0, "PP-FOLLOW a Character with no selected token still composes a definition");
  check(!withoutDirectives.includes(P.SECTION_HEADINGS.directives) && !withoutDirectives.includes(P.SECTION_HEADINGS.base), "PP-FOLLOW that text carries no directive block and no base layer");
  check(!withoutDirectives.includes(P.FOLLOW_LINE), "PP-FOLLOW so it does not close with 「Follow the directives above」 — the line would point at nothing");
  const withBase = P.platformLaunchText(noTokens, P.HANDOFF_FORMAT, { directives, glossaryDigest, baseLayer: BASE_LAYER });
  check(withBase.endsWith(P.FOLLOW_LINE), "PP-FOLLOW with the base layer there are directives above the line, and it is written");
  check(P.platformLaunchText(samples[0], P.HANDOFF_FORMAT, { directives, glossaryDigest }).endsWith(P.FOLLOW_LINE), "PP-FOLLOW a Character with its own directive block closes with the line too");
}

// ── falsification: disable the strip ────────────────────────────────────────
{
  const source = readFileSync(path.join(ROOT, MODULE), "utf8");
  const from = "  for (const key of UNIFIED_TOP_LEVEL_KEYS) if (key in character) out[key] = character[key];";
  check(source.includes(from), "PP-FALSIFY strip rule present");
  const mutatedPath = path.join(ROOT, "tools/unified-v1/__pp_falsify.mjs");
  writeFileSync(mutatedPath, source.replace(from, "  Object.assign(out, character);"), "utf8");
  try {
    const M = await import(pathToFileURL(mutatedPath).href);
    const dirty = { ...structuredClone(samples[0]), ...structuredClone(PLANTED) };
    check(JSON.stringify(M.canonicalOnly(dirty)).includes("LEAK-PACK-7f3a"), "PP-FALSIFY without the strip the planted value survives canonicalOnly (the rule is live)");
    // Worth saying plainly: with the JSON and YAML buttons gone, the strip is the
    // second line, not the first. The prose composer reads named fields, so the
    // planted value does not reach the text even with the strip disabled — which
    // is why the falsification has to be aimed at the rule itself.
    check(!M.platformLaunchText(dirty, "prompt", opts).includes("LEAK-PACK-7f3a"), "PP-FALSIFY the composed text reads named fields only, so a foreign key does not reach it even without the strip");
  } finally { rmSync(mutatedPath, { force: true }); }
}

console.log(`PLATFORM_PROMPT_BOUNDARY PASS ${cases.length}/${cases.length}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`HAND-OFF = one composed text on all ${P.HANDOFF_ROUTES.length} routes (03 and 04 Trainer, byte-identical up to the training menu) / canonical Unified V1 keys only / text = [## Base when supplied] + ## Character (JA persona) + ## Character directives (glossary ${glossaryDigest.slice(0, 16)}: work_modes + ${P.PROMPT_AXES.length} axes + handoff reasons, selected only; ${P.PROMPT_EXCLUDED_AXES.length} presentation axes withheld) + output rules + the closing reminder / golden byte-equal / planted provenance, envelope and authoring leftovers never leave`);
