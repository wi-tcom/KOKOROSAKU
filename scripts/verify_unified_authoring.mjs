// Unified V1 authoring in the V1-baseline Builder.
//
// The gap this gate exists for: the Builder kept its V1 screen but authored a
// different Character model, so a Unified V1 Character opened as an empty form
// and nothing the Owner typed could produce a Unified V1 Character. Checking the
// translation table in isolation would not have caught that — the screen has to
// be driven.
//
// So this runs the real page: fill fields, read the Canonical output, hand a
// Character in, confirm the fields carry it, edit, and confirm the round trip
// preserves Canonical content the screen never shows.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankUnifiedExtras, toUnifiedCharacter } from "../tools/v1/unified-authoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const read = async file => readFile(path.join(ROOT, file), "utf8");
const checks = [];
const check = (condition, name) => { assert.ok(condition, name); checks.push(name); };

// ── the translation contract is declared, not scattered ─────────────────────
const contract = await read("tools/v1/unified-authoring.mjs");
check(contract.includes("AUTHORITATIVE_FIELD_MAP"), "the Builder-to-Canonical pairing is declared in one table");
check(contract.includes("NON_CANONICAL_FORM_PATHS"), "fields that must never reach the Character are listed");
for (const path of ["organization_participation", "charback", "role_source", "mission", "layer0"]) {
  check(contract.includes(`"${path}"`), `non-Canonical area is named: ${path}`);
}
const basisCount = (contract.match(/basis:/g) || []).length;
const mapCount = (contract.match(/\{ form: "/g) || []).length;
check(mapCount > 0 && basisCount === mapCount, `every pairing states why it is permitted (${basisCount}/${mapCount})`);

// The old model must not be what leaves the Builder.
const builder = await read("tools/saku-builder.html");
check(/function toSakuJson\([\s\S]{0,600}?toUnifiedCharacter/.test(builder), "Canonical JSON is the Unified V1 Character");
check(!/function toPrompt\(/.test(builder) && !/function toGuildJson\(/.test(builder), "no prompt / Guild output leaves the Builder (03 owns the platform prompt since 2026-09-22)");
check(!/schema:"SAKU-CHARACTER"/.test(builder), "the old SAKU-CHARACTER export shape is gone");
check(builder.includes("_unified_source"), "the Character an edit started from is retained so unshown Canonical content survives");
check(!/saku-builder-unified-v1\.html\?desktop=/.test(builder), "no legacy-schema authoring route from the Builder");

// ── the authored Character must satisfy the Canonical schema's own shape ────
//
// The local validator checks required fields, not closed objects. Every seat
// body in the Canonical schema is additionalProperties:false, and only seats 1
// and 7 may carry responsibilities - so an empty responsibilities array on every
// seat passed the local checks while making the Character invalid. Compare the
// authored shape against the schema file itself.
{
  const schema = JSON.parse(await read("tests/fixtures/canonical/saku-unified-character.v1.schema.json"));
  const defs = schema.$defs;
  const { blankUnifiedCharacter } = await import("../tools/unified-v1/unified-schema-v1.mjs");
  const authored = blankUnifiedCharacter();
  for (let seat = 1; seat <= 8; seat += 1) {
    const body = defs[`seat${seat}Body`];
    const allowed = Object.keys(body.properties || {});
    const emitted = Object.keys(authored.assistant_composition[`seat${seat}`] || {});
    check(body.additionalProperties === false, `the Canonical seat${seat} body is closed`);
    const extra = emitted.filter(key => !allowed.includes(key));
    check(extra.length === 0, `seat${seat} emits no field the Canonical body forbids (extra: ${extra.join(",") || "none"})`);
    for (const [key, spec] of Object.entries(body.properties || {})) {
      if (!("const" in spec)) continue;
      if (!emitted.includes(key)) continue;
      const value = authored.assistant_composition[`seat${seat}`][key];
      check(JSON.stringify(value) === JSON.stringify(spec.const), `seat${seat}.${key} equals the Canonical const`);
    }
    const missing = (body.required || []).filter(key => !emitted.includes(key));
    check(missing.length === 0, `seat${seat} carries every required field (missing: ${missing.join(",") || "none"})`);
  }
}

const candidates = [process.env.SAKU_CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].filter(Boolean);
let chrome = "";
for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } } catch { /* next */ } }
if (!chrome) { console.error("UNIFIED_AUTHORING NOT_AVAILABLE / CHROME_NOT_FOUND"); process.exit(2); }

// A fully adopted Character carrying Canonical content the Builder screen never
// displays, so Save can be exercised and the round trip has something to lose.
const handedForm = {
  meta: { name: "受け渡し確認用", slug: "handed-probe", version: "2.0.0", field: "確認担当" },
  identity: { value: "確かめる", target_users: ["確認者"], out_of_scope: ["実運用"], first_person: "私", address_style: "敬体", age_expression: "20代後半", voice: "低め" },
  persona_rationale: { core_thesis: "受け渡しの確認" },
  persona_rules: { values: ["確かめる"], preferred_questions: ["何が確認済みですか？"], uncertainty_expression: "UNKNOWNを保持する", error_apology: "訂正を明示する", close_style: "次の確認点を示す" },
  unified: blankUnifiedExtras(),
};
Object.assign(handedForm.unified, {
  work_modes: ["REVIEW"], allowed_variation: ["語調"], prohibited_drift: ["断定"],
  hard_invariants: [{ id: "INV-EXTRA", statement: "根拠のない断定をしない" }],
  human_handoff_conditions: [{ id: "HANDOFF-1", reason_class: "AUTHORITY_REQUIRED", trigger: "不可逆な決定", boundary_statement: "人間が決める", seat8_required: true }],
  seat8_expected_human_contribution: ["判断と承認"], seat8_handoff_question_requirements: ["論点"], seat8_handoff_material_requirements: ["根拠"],
  must_preserve_refs: [{ requirement_id: "INV-INPUT-INTEGRITY" }], prohibited_drift_refs: [{ requirement_id: "INV-EXTRA" }], continuity_refs: [{ requirement_id: "HANDOFF-1" }],
});
Object.assign(handedForm.unified.axes, { a_motif: "STUDY_LAMP", b_companion_domain: "THOUGHT_SPARRING", c_intelligence_vector: "STRUCTURAL_LOGIC", d_socratic_angle: "PARADOX", e_vocabulary_tone: "WARM_EMBRACING", f_acknowledgement: "CURIOSITY", g_pulse: "WAVE", h_tactile: "WASHI", i_thinking_pause_ms: "2000", j_theme_color: "EVERGREEN_MIRUCHA", k_whitespace_percent: "50", l_weathering_presentation: "REDUCED_CONTRAST", m_error_narrative: "SCHOLAR", n_crystallization: "GROWTH_AND_CONFLICT", o_closing: "BOOK_CLOSE" });
const handed = toUnifiedCharacter(handedForm);

const mime = new Map([[".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"]]);

const harness = [
  '<!doctype html><meta charset="utf-8"><title>AUTHOR</title>',
  '<pre id="r" data-status="RUNNING"></pre>',
  '<script type="module">',
  'const r=document.getElementById("r");const out=[];',
  'const check=(c,n)=>{ if(!c) throw new Error(n); out.push(n); };',
  'const wait=ms=>new Promise(x=>setTimeout(x,ms));',
  `const HANDED=${JSON.stringify(handed)};`,
  'try{',
  '  localStorage.clear();',
  '  const f=document.createElement("iframe");',
  '  f.style.cssText="width:1400px;height:1000px;border:0";',
  '  f.src="/tools/saku-builder.html";',
  '  document.body.append(f);',
  '  await new Promise(res=>f.addEventListener("load",res,{once:true}));',
  '  await wait(1200);',
  '  const alerts=[]; let d=f.contentDocument,w=f.contentWindow; w.alert=message=>alerts.push(String(message));',
  '  const api=()=>w.SAKU_UNIFIED;',
  '  check(Boolean(api()),"the Unified V1 authoring module loaded into the Builder");',
  '',
  '  // ── the frozen five-chapter screen preserves the Owner-visible surface ─',
  '  const visibleChapters=[...d.querySelectorAll("main.form section.frozen-chapter")];',
  '  check(visibleChapters.length===5,"V1_VISUAL_BASELINE_PRESERVED: five primary authoring chapters (saw "+visibleChapters.length+")");',
  '  check(visibleChapters.map(c=>c.dataset.frozenChapter).join(",")==="identity,purpose,work,persona,boundary","V1_VISUAL_BASELINE_PRESERVED: exact frozen chapter order");',
  '  for(const id of ["heroName","resetAll","downloadBtn","copyBtn","pvTabs","loadExample"])',
  '    check(d.getElementById(id)!==null,"V1 control still present: "+id);',
  '  check(d.getElementById("pvTabs").textContent.includes("character.yaml"),"the V1 preview tabs are still there");',
  '',
  '',
  '  // ── source management lives on screen 01, not here ─────────────────────',
  '  const top=d.getElementById("authoringTop");',
  '  check(top!==null,"AUTHORING_TOP_ACCORDION: the authoring header is present");',
  '  check(top.closest(".form")!==null,"the authoring box sits inside the form, not in the two-column grid");',
  '  const topActions=[...top.querySelectorAll("button")].map(b=>b.textContent.trim());',
  '  check(topActions.includes("キャラクターを選択")&&topActions.includes("記入例から新規作成")&&topActions.includes("入力内容のクリア"),"the three authoring actions are present (saw "+topActions.join("|")+")");',
  '  for(const label of ["この内容で保存する","すべて畳む","すべて広げる"]) check(topActions.includes(label),"moved into the authoring box: "+label);',
  '  // The old toolbar copies are gone, not duplicated.',
  '  const toolbar=d.querySelector(".toolbar");',
  '  check(!/記入例（星野ルカ）を読み込む/.test(toolbar.textContent),"the toolbar no longer repeats the example button");',
  '  check(!/最初から/.test(toolbar.textContent),"the toolbar no longer repeats the reset button");',
  '  const nav=d.getElementById("builderTopNav");',
  '  check(nav!==null,"GLOBAL navigation bar is present");',
  '  check(nav.querySelector("[data-builder-locale]")!==null,"language lives in the one top row");',
  '  check(nav.querySelector("#openDesktopHome")!==null&&nav.querySelector("#openDesktopHome").hidden===false,"ホーム lives in the one top row");',
  '  check(nav.querySelector("#builderHelpLink")!==null,"ヘルプ lives in the one top row");',
  '  // Owner 2026-09-23: one row, in this order, and it stays at the top of the window.',
  '  check(nav.querySelector("#runOnPlatform")!==null&&nav.querySelector("#trainCharacter")!==null,"the two hand-off buttons moved into that row");',
  '  const rowOrder=[...nav.querySelectorAll("#runOnPlatform,#trainCharacter,[data-builder-locale],#builderHelpLink,#openDesktopHome")].map(x=>x.textContent.trim());',
  '  check(rowOrder.join("|")==="AIプラットフォームで動作確認|トレーニングする|日本語|English|ヘルプ|ホーム","the row reads in the order Owner gave (saw "+rowOrder.join("|")+")");',
  '  check(d.querySelector(".toolbar #runOnPlatform")===null&&d.querySelector(".toolbar #trainCharacter")===null,"and the toolbar no longer holds a second copy of them");',
  '  check(nav===d.body.firstElementChild,"the row is first in the document, so sticky holds it at the top of the window");',
  '  check(d.getElementById("authoringMessages")!==null,"messages are inside the authoring box");',
  '  for(const id of ["loadRoleCsv","roleCsvFile","importYamlBtn","importYamlFile","loadTpl","tplSelect"]){',
  '    check(d.getElementById(id)===null,"IMPORT_CONTROLS_DUPLICATED_IN_BUILDER = 0: "+id+" is gone from the authoring screen");',
  '  }',
  '  const chapters=[...d.querySelectorAll("main.form section.frozen-chapter")];',
  '  check(chapters.length===5,"the normal authoring model has five chapters (saw "+chapters.length+")");',
  '  const chapterTitles=chapters.map(c=>c.querySelector("h2").textContent.trim());',
  '  check(chapterTitles.join("|")==="一基本情報|二目的と役割|三仕事と使いどころ|四人格・価値観と話し方|五守ることと人に任せる条件","the five Japanese chapter titles are exact: "+chapterTitles.join("|"));',
  '  check(!chapterTitles.some(t=>t.includes("ペルソナ試験")),"PERSONA_TEST_STANDALONE_ACTIVE = NO");',
  '  check(!chapterTitles.some(t=>t.includes("組織参加")),"AMU_MACHI_EDITABLE_FIELDS_IN_SAKU_BUILDER = 0");',
  '  const humanChapter=chapters[4];',
  '  const humanHomes=[...humanChapter.querySelectorAll("[data-canonical-path]")].map(el=>el.dataset.canonicalPath);',
  '  for(const path of ["character_core.human_handoff_conditions","assistant_composition.seat8.expected_human_contribution","assistant_composition.seat8.handoff_question_requirements","assistant_composition.seat8.handoff_material_requirements"]){',
  '    check(humanHomes.includes(path),"HUMAN_UI_CANONICAL_MAPPING: the group writes to "+path);',
  '  }',
  '  check(!/organization_participation/.test(humanChapter.innerHTML),"AMU_RUNTIME_FIELDS_CREATED = 0: the group adds no runtime field");',
  '  check(d.querySelectorAll(".fixed-seat-list li").length===8&&!d.querySelector(".fixed-system-info input,.fixed-system-info textarea,.fixed-system-info select"),"1+7 is one read-only informational surface, not a sixth chapter");',
  '  check(d.querySelectorAll(".tuning-symptom-grid button").length===20&&!d.querySelector(".tuning-entry input,.tuning-entry textarea,.tuning-entry select"),"20-item tuning is a contextual helper, not another chapter");',
  '  check(d.querySelector(".advanced-settings")&&!d.querySelector(".advanced-settings input,.advanced-settings textarea,.advanced-settings select"),"Expert/Advanced is collapsed and has no extra Character editor");',
  '  const authoringHomes=[...d.querySelectorAll("main.form [data-canonical-path]")];',
  '  check(authoringHomes.length===47&&new Set(authoringHomes.map(el=>el.dataset.canonicalPath)).size===47,"47/47 frozen authoring denominator has one Home per group");',
  '  const outside47=[...d.querySelectorAll("main.form input,main.form textarea,main.form select")].filter(el=>!el.closest("[data-canonical-path]"));',
  '  check(outside47.length===0,"UNAUTHORIZED_NORMAL_EDITABLE_CONTROLS = 0");',
  '  const visibleProductSurfaces=[top,...chapters,d.querySelector(".fixed-system-info"),d.querySelector(".tuning-entry"),d.querySelector(".advanced-settings"),d.querySelector("aside.preview")].filter(Boolean);',
  '  check(visibleProductSurfaces.length===10,"VISIBLE_SECTION_COUNT = 10, of which exactly five are primary authoring chapters");',
  '',
  '  // ── create from scratch produces a Unified V1 Character ──────────────',
  '  const set=(path,value)=>{ const el=d.querySelector(`[data-path="${path}"]`); if(!el) throw new Error("missing field: "+path); el.value=value; el.dispatchEvent(new w.Event(el.tagName==="SELECT"?"change":"input",{bubbles:true})); };',
  '  // U3: a closed enum with several answers is a checkbox group (nothing typed, nothing to add).',
  '  const add=(path,value)=>{ const box=d.querySelector(`[data-list="${path}"]`)||d.querySelector(`[data-enum-list="${path}"]`); if(!box) throw new Error("missing list: "+path); const tick=box.querySelector(`input[data-enum-option="${value}"]`); if(tick){ tick.checked=true; tick.dispatchEvent(new Event("change",{bubbles:true})); return; } const control=box.querySelector(".add input,.add select"),btn=box.querySelector(".add button"); control.value=value; btn.click(); };',
  '  set("meta.name","新規作成テスト"); set("meta.slug","new-character-probe"); set("meta.field","確認担当");',
  '  set("persona_rationale.core_thesis","目的の記述"); set("identity.value","確認");',
  '  set("identity.first_person","私"); set("identity.voice","低め");',
  '  add("persona_rules.values","確かめる"); add("identity.out_of_scope","実運用"); add("unified.work_modes","REVIEW");',
  '  add("unified.seat8_expected_human_contribution","判断と承認");',
  '  const AX={a_motif:"STUDY_LAMP",b_companion_domain:"THOUGHT_SPARRING",c_intelligence_vector:"STRUCTURAL_LOGIC",d_socratic_angle:"PARADOX",e_vocabulary_tone:"WARM_EMBRACING",f_acknowledgement:"CURIOSITY",g_pulse:"WAVE",h_tactile:"WASHI",i_thinking_pause_ms:"2000",j_theme_color:"EVERGREEN_MIRUCHA",k_whitespace_percent:"50",l_weathering_presentation:"REDUCED_CONTRAST",m_error_narrative:"SCHOLAR",n_crystallization:"GROWTH_AND_CONFLICT",o_closing:"BOOK_CLOSE"};',
  '  for(const [k,v] of Object.entries(AX)) set("unified.axes."+k,v);',
  '  await wait(400);',
  '  const created=JSON.parse(w.toSakuJson(w.__saku_data?w.__saku_data():null)||"null");',
  '  check(created!==null,"the Builder produced Canonical JSON");',
  '  check(created.schema.schema_id==="SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE","a new Character is authored as Unified V1");',
  '  check(created.identity.display_name==="新規作成テスト","the name typed on screen reached identity.display_name");',
  '  check(created.character_core.character_role==="確認担当","the role typed on screen reached character_core");',
  '  check(created.expression_semantics.first_person==="私","expression semantics carry the V1 話法 fields");',
  '  check(Object.keys(created.personality_axes).length===15,"15 axes are authored ("+Object.keys(created.personality_axes).length+")");',
  '  check(created.character_core.hard_invariants.some(i=>i.id==="INV-INPUT-INTEGRITY"),"Input Integrity is always carried");',
  '  check(created.assistant_composition.seat8.function==="LOGICAL_HUMAN_ASSISTANT","Seat 8 stays the logical human");',
  '  const v=api().validateUnifiedV1(created);',
  '  check(v.ok,"the new Character validates: "+v.errors.join(" | "));',
  '  check(created.organization_participation===undefined&&created.charback===undefined&&created.role_source===undefined,"non-Canonical screen data did not reach the Character");',
  '',
  '  // ── editing an existing Unified V1 Character populates the form ──────',
  '  const {storeHandoff}=await import("/tools/unified-v1/handoff-binding.mjs");',
  '  storeHandoff(localStorage,"character",HANDED);',
  '  f.src="/tools/saku-builder.html";',
  '  await new Promise(res=>f.addEventListener("load",res,{once:true}));',
  '  await wait(1400);',
  '  d=f.contentDocument; w=f.contentWindow; w.alert=message=>alerts.push(String(message));',
  '  const val=p=>{const el=d.querySelector(`[data-path="${p}"]`);return el?el.value:null;};',
  '  check(val("meta.name")==="受け渡し確認用","edit shows the Character name, not a blank form (saw: "+val("meta.name")+")");',
  '  check(val("meta.slug")==="handed-probe","edit shows the Character id");',
  '  check(val("meta.field")==="確認担当","edit shows the role");',
  '  check(val("identity.first_person")==="私","edit shows the expression semantics");',
  '  check(val("unified.axes.a_motif")==="STUDY_LAMP","edit shows the 15 axes");',
  '  const listText=p=>{const b=d.querySelector(`[data-list="${p}"]`)||d.querySelector(`[data-enum-list="${p}"]`);if(!b)return "";const values=[...b.querySelectorAll(".items input")].map(i=>i.value);for(const chip of b.querySelectorAll(".enum-chip"))values.push(chip.firstChild?.textContent||"");for(const tick of b.querySelectorAll("input[data-enum-option]:checked"))values.push(tick.dataset.enumOption);return values.join("|");};',
  '  check(listText("persona_rules.values").includes("確かめる"),"edit shows the Character values");',
  '  check(listText("unified.work_modes").includes("REVIEW"),"edit shows the work modes");',
  '',
  '  // ── explicit edit, then round trip ───────────────────────────────────',
  '  const set2=(path,value)=>{ const el=d.querySelector(`[data-path="${path}"]`); el.value=value; el.dispatchEvent(new w.Event(el.tagName==="SELECT"?"change":"input",{bubbles:true})); };',
  '  set2("meta.name","受け渡し確認用（改）");',
  '  await wait(400);',
  '  const edited=JSON.parse(w.toSakuJson(w.__saku_data()));',
  '  check(edited.identity.display_name==="受け渡し確認用（改）","the explicit edit is in the Canonical output");',
  '  check(edited.identity.character_id==="handed-probe","the Character keeps its identity across an edit");',
  '  check(api().validateUnifiedV1(edited).ok,"the edited Character still validates");',
  '  // Canonical content the screen never shows must not be dropped.',
  '  check(edited.assistant_composition.one_voice&&edited.assistant_composition.one_voice.external_speaker==="FRONT_CHARACTER_ONLY","one_voice survived a round trip through a screen that never shows it");',
  '  check(edited.assistant_composition.deliberation&&edited.assistant_composition.deliberation.max_rounds===3,"the deliberation contract survived the round trip");',
  '  check((edited.assistant_composition.seat1.responsibilities||[]).includes("QUESTION_FRAMING"),"seat responsibilities survived the round trip");',
  '  check(edited.character_core.hard_invariants.some(i=>i.id==="INV-EXTRA"),"an invariant the screen does not list survived");',
  '  check(JSON.stringify(HANDED.identity.display_name)==="\\"受け渡し確認用\\"","the source Character object was not mutated in place");',
  '',
  '  // ── explicit Save writes a new revision into the Library ─────────────',
  '  const libEntries=()=>{ try{ return JSON.parse(localStorage.getItem("saku.workspace.library")).entries||[]; }catch{ return []; } };',
  '  const before=libEntries().length;',
  '  const save=d.getElementById("saveUnifiedCharacter");',
  '  check(Boolean(save)&&save.hidden===false,"an explicit Save action is offered");',
  '  const durable=[]; w.__TAURI__={core:{invoke:async(name,args)=>{if(name!=="save_workspace_character")throw new Error("UNEXPECTED_"+name);durable.push(args);return "C:/Selected Workspace/characters/handed-probe/character.json";}}};',
  '  save.click(); for(let attempt=0;attempt<30&&libEntries().length===before;attempt++)await wait(100);',
  '  const entries=libEntries();',
  '  check(entries.length===before+1,"Save added exactly one Character to the Library ("+before+"->"+entries.length+"; alerts="+alerts.join(" | ")+")");',
  '  const saved=entries[entries.length-1];',
  '  check(durable.length===1,"SAVE-01 Save wrote exactly once to the selected Workspace");',
  '  check(durable[0].characterId==="handed-probe","SAVE-01 Workspace write used the current Character identity");',
  '  check(JSON.parse(durable[0].characterJson).identity.display_name==="受け渡し確認用（改）","SAVE-01 Workspace bytes carry the latest edit");',
  '  check(saved.schema.kind==="UNIFIED_V1_CHARACTER","the saved entry is recorded as Unified V1");',
  '  check(saved.character.identity.character_revision!=="2.0.0","Save produced a new revision, not an overwrite (saw "+saved.character.identity.character_revision+")");',
  '  check(saved.character.identity.display_name==="受け渡し確認用（改）","the saved Character carries the edit");',
  '  check(api().validateUnifiedV1(saved.character).ok,"the saved Character validates");',
  '  check(HANDED.identity.character_revision==="2.0.0","the source Character revision was not changed");',
  '  check(w.SAKU_ACTIVE.summary().identity.character_revision===saved.character.identity.character_revision&&!w.SAKU_ACTIVE.summary().dirty,"SAVE-02 the latest saved revision becomes the clean Active SAKU");',
  '',
  '  // ── no prompt / Guild output from this screen (03 owns the platform prompt) ──',
  '  check(typeof w.toPrompt==="undefined"&&typeof w.toGuildJson==="undefined","no prompt / Guild generator on the Builder page");',
  '  check([...d.querySelectorAll("#pvTabs .pv-tab")].map(b=>b.textContent.trim()).join(",")==="character.yaml,Character File,試験記録,Help","preview tabs = character.yaml / Character File / 試験記録 / Help");',
  '',
  '  r.textContent=out.join("\\n"); r.dataset.status="PASS";',
  '}catch(error){ r.textContent=(out.join("\\n")+"\\nFAIL "+error.message).trim(); r.dataset.status="FAIL"; }',
  '</script>',
].join("\n");

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/__harness") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(harness); return; }
  try {
    const file = path.join(DIST, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
    const body = await readFile(file);
    response.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream" });
    response.end(body);
  } catch { response.writeHead(404); response.end("not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const profile = await mkdtemp(path.join(tmpdir(), "saku-author-"));
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--enable-logging=stderr", `--user-data-dir=${profile}`, "--virtual-time-budget=20000", "--dump-dom", `http://127.0.0.1:${port}/__harness`], { stdio: ["ignore", "pipe", "pipe"] });
let dom = "";
let browserLog = "";
child.stdout.on("data", chunk => { dom += chunk; });
child.stderr.on("data", chunk => { browserLog += chunk; });
await new Promise(resolve => child.on("close", resolve));
server.close();
await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));

const status = /data-status="([A-Z]+)"/.exec(dom)?.[1] || "UNKNOWN";
const body = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
let failure = "";
for (const line of body.split("\n").filter(Boolean)) { if (line.startsWith("FAIL")) failure = line; else checks.push(line); }
for (const name of checks) console.log(`  PASS ${name}`);
if (status !== "PASS") {
  console.error(`  ${failure}`);
  const relevantLog = browserLog.split(/\r?\n/).filter(line => /error|fail|404|unhandled|uncaught/i.test(line)).slice(-20);
  if (relevantLog.length) console.error(relevantLog.join("\n"));
  console.error(`UNIFIED_AUTHORING FAIL (${status})`);
  process.exit(1);
}

console.log(`UNIFIED_AUTHORING PASS ${checks.length}/${checks.length}`);
console.log("ACTIVE_AUTHORING_SCHEMA SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE");
console.log("OLD_V1_AUTHORITATIVE_OUTPUT NO");
