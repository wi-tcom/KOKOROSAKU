import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankUnifiedExtras, toUnifiedCharacter } from "../tools/v1/unified-authoring.mjs";
import { validateCompleteAdoptedCharacter } from "../tools/v1/adopted-schema-validator.mjs";
import { CHAPTERS, EDITABLE_DENOMINATOR, FIELDS, TUNING_ITEMS, WORK_MODE_OPTIONS } from "../tools/v1/semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const read = file => readFile(path.join(ROOT, file), "utf8");
const checks = [];
const check = (condition, name) => { assert.ok(condition, name); checks.push(name); };

const schemaSource = await read("tests/fixtures/canonical/saku-unified-character.v1.schema.json");
const schema = JSON.parse(schemaSource);
const form = {
  meta: { name: "Frozen IA確認", slug: "frozen-ia-probe", version: "1.0.0", field: "Evidence reviewer" },
  identity: { value: "根拠と不確実性を分ける", target_users: ["Author"], out_of_scope: ["Final approval"], first_person: "私", address_style: "calm", age_expression: "neutral", voice: "brief" },
  persona_rationale: { core_thesis: "根拠を整理して次の確認点を示す" },
  persona_rules: { values: ["Evidence first"], preferred_questions: ["何が確認済みですか？"], uncertainty_expression: "UNKNOWNをUNKNOWNのまま示す", error_apology: "誤りと訂正を明示する", close_style: "次の一歩を確認する" },
  unified: blankUnifiedExtras(),
};
Object.assign(form.unified, {
  work_modes: ["REVIEW"], allowed_variation: ["説明の長さ"], prohibited_drift: ["Authorityの推測"],
  hard_invariants: [{ id: "INV-EVIDENCE", statement: "未確認情報を事実として扱わない" }],
  human_handoff_conditions: [{ id: "HANDOFF-AUTH", reason_class: "AUTHORITY_REQUIRED", trigger: "最終決定が必要", boundary_statement: "人が決定する", seat8_required: true }],
  seat8_expected_human_contribution: ["判断と最終確認"], seat8_handoff_question_requirements: ["どの選択肢を採用しますか？"], seat8_handoff_material_requirements: ["根拠と不確実性"],
  must_preserve_refs: [{ requirement_id: "INV-INPUT-INTEGRITY" }], prohibited_drift_refs: [{ requirement_id: "INV-EVIDENCE" }], continuity_refs: [{ requirement_id: "HANDOFF-AUTH" }],
});
Object.assign(form.unified.axes, { a_motif:"STUDY_LAMP",b_companion_domain:"THOUGHT_SPARRING",c_intelligence_vector:"STRUCTURAL_LOGIC",d_socratic_angle:"PARADOX",e_vocabulary_tone:"WARM_EMBRACING",f_acknowledgement:"CURIOSITY",g_pulse:"WAVE",h_tactile:"WASHI",i_thinking_pause_ms:"2000",j_theme_color:"EVERGREEN_MIRUCHA",k_whitespace_percent:"50",l_weathering_presentation:"REDUCED_CONTRAST",m_error_narrative:"SCHOLAR",n_crystallization:"GROWTH_AND_CONFLICT",o_closing:"BOOK_CLOSE" });
const handed = toUnifiedCharacter(form);
handed.assistant_composition.deliberation.full_chain_of_thought_persistence_required = false;
const nodeVerdict = validateCompleteAdoptedCharacter(handed, schema);
check(nodeVerdict.ok, `SCHEMA-01 NEW direct validation: ${nodeVerdict.errors.map(error => error.path).join(",")}`);
const unknownFieldProbe = structuredClone(handed); unknownFieldProbe.runtime_configuration = { enabled: true };
check(!validateCompleteAdoptedCharacter(unknownFieldProbe, schema).ok, "EXT-01 unknown runtime field fails closed");
check(!validateCompleteAdoptedCharacter({ meta: { name: "legacy" } }, schema).ok, "LEGACY-01 legacy shape is not silently migrated");
check(handed.purpose.primary_value !== handed.character_core.values[0], "VALUE-01 purpose and decision values remain distinct");
check(handed.assistant_composition.seat8.human_required_condition_refs.map(item => item.requirement_id).join(",") === "HANDOFF-AUTH", "REF-01 Seat 8 uses explicit handoff references only");

check(CHAPTERS.length === 5, "IA-01 registry has exactly five chapters");
check(new Set(FIELDS.map(item => item.canonicalPath)).size === EDITABLE_DENOMINATOR, "HOME-01 one visible authoring home per registry semantic");
check(TUNING_ITEMS.length === 20, "TUNE-01 twenty human-symptom entries");
check(FIELDS.every(item => ["CHARACTER_DEFINED", "PROMPT_INCLUDED", "RUNTIME_CONTROLLED", "UNKNOWN"].includes(item.effectState)), "HELPER-02 effect terminology controlled");
const manualData = JSON.parse(await read("manual/saku-field-guide.data.json"));
check(manualData.registry_id === "saku.builder.semantic-registry@1" && manualData.fields.length === EDITABLE_DENOMINATOR && manualData.chapters.length === 5, "ALIGN-01 Manual uses the shared five-chapter registry");
check(!WORK_MODE_OPTIONS.includes("DRAFT"), "WORKMODE-01 DRAFT is not an accepted work mode");
const builderSource = await read("tools/saku-builder.html");
const builderLocaleSource = await read("tools/v1/builder-golden-ui.mjs");
check(!/REVIEW[／\s]+DRAFT[／\s]+ANALYSIS/.test(builderSource + builderLocaleSource), "MANUAL-SOURCE-01 no invalid DRAFT work-mode example remains in shared UI sources");
check(builderSource.includes('invoke("save_workspace_character"') && builderSource.includes('invoke("save_builder_file"'), "SAVE-03 Workspace Save and file Download/Export use separate commands");
check(builderSource.indexOf('document.getElementById("downloadBtn")') !== builderSource.indexOf('document.getElementById("saveUnifiedCharacter")'), "SAVE-03 Save and Download remain separate explicit actions");
const trainerSource = await read("tools/unified-v1/trainer-ui.mjs");
const trainerContractSource = await read("tools/v1/trainer-frozen-ia.mjs");
check(/trainer-frozen-ia\.mjs/.test(trainerSource) && /semantic-registry\.mjs/.test(trainerContractSource) && /FORM_PATH_BY_CANONICAL/.test(trainerContractSource), "ALIGN-01 Trainer uses the shared registry through the Frozen IA contract");
const publicProfile = JSON.parse(await read("desktop/resources/profiles/public-oss.json"));
check(publicProfile.internal_content_count === 0 && !publicProfile.resources.some(item => /fixed64|commercial-preview|erabazu5|wit3/i.test(item.id || "") && item.bundled), "CATALOG-64 public profile remains closed");

const candidates = [process.env.SAKU_CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean);
let chrome = ""; for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } } catch {} }
if (!chrome) { console.error("FROZEN_IA NOT_AVAILABLE / CHROME_NOT_FOUND"); process.exit(2); }

const harness = `<!doctype html><meta charset="utf-8"><pre id="r" data-status="RUNNING"></pre><script type="module">
const r=document.getElementById("r"),out=[];addEventListener("message",event=>{if(event.data?.sakuError){r.textContent="INNER "+event.data.sakuError;r.dataset.status="FAIL"}});const check=(c,n)=>{if(!c)throw new Error(n);out.push(n)};const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
try{localStorage.clear();const initialCharacter=${JSON.stringify(handed)};const initialPayload=JSON.stringify(initialCharacter);let handoffHash=0x811c9dc5;for(let index=0;index<initialPayload.length;index+=1){handoffHash^=initialPayload.charCodeAt(index);handoffHash=Math.imul(handoffHash,0x01000193)}localStorage.setItem("saku.desktop.pendingCharacter",initialPayload);localStorage.setItem("saku.desktop.pendingCharacterBinding",JSON.stringify({character_id:initialCharacter.identity.character_id,character_revision:String(initialCharacter.identity.character_revision),content_digest:(handoffHash>>>0).toString(16).padStart(8,"0")}));localStorage.setItem("saku.desktop.pendingOccupation",JSON.stringify({source_path:"occupation.csv",record:{role:"Research operator",license:"NOT_A_CREDENTIAL"},mapped:[{column:"role",path:"character_core.character_role",value:"Research operator"}],unmapped:[{column:"license",classification:"NOT_MAPPABLE"}]}));const f=document.createElement("iframe");f.style="width:1280px;height:820px";f.src="/tools/saku-builder.html";document.body.append(f);await new Promise(ok=>f.addEventListener("load",ok,{once:true}));await wait(1200);let d=f.contentDocument,w=f.contentWindow;w.confirm=()=>true;
check(d.documentElement.dataset.frozenIa==="five-chapter-v1","Frozen IA module active (ready="+d.readyState+", unified="+Boolean(w.SAKU_UNIFIED)+", frozen="+Boolean(w.SAKU_FROZEN_IA)+", scripts="+[...d.scripts].map(s=>s.src).join("|")+")");
const chapters=[...d.querySelectorAll("main.form section.frozen-chapter")];check(chapters.length===5,"IA-01 exact five-chapter surface");
check(chapters.map(x=>x.dataset.frozenChapter).join(",")==="identity,purpose,work,persona,boundary","IA-01 chapter order");
check(chapters.every(x=>x.querySelector(".chapter-question")),"IA-01 every chapter has a human question");
const homes=[...d.querySelectorAll("[data-canonical-path]")].map(x=>x.dataset.canonicalPath);check(new Set(homes).size===${EDITABLE_DENOMINATOR}&&homes.length===${EDITABLE_DENOMINATOR},"HOME-01 single authoring home "+homes.length);
const productSurfaces=[d.getElementById("authoringTop"),...chapters,d.querySelector(".fixed-system-info"),d.querySelector(".tuning-entry"),d.querySelector(".advanced-settings"),d.querySelector("aside.preview")].filter(Boolean);check(productSurfaces.length===10,"ALIGN-01 ten visible product surfaces classify as one authoring header, five chapters, read-only 1+7, tuning helper, collapsed Advanced, and Preview");
check(d.querySelectorAll(".fixed-seat-list li").length===8&&!d.querySelector(".fixed-seat-list input,.fixed-seat-list select"),"FIXED-01 1+7 informational read-only");
check(!d.querySelector('[data-path*="organization_participation"],[data-path*="charback"],[data-path*="runtime"],[data-path*="credential"],[data-path*="authority"]'),"EXT-01 runtime/external controls absent");
check(!d.querySelector('[data-path*="archetype"],[data-path*="intensity"],[data-path*="front_control"],[data-path*="professional_reasoning"]'),"CLASS-80 obsolete controls absent");
const outside47=[...d.querySelectorAll("main.form input,main.form textarea,main.form select")].filter(control=>!control.closest("[data-canonical-path]"));check(outside47.length===0,"ALIGN-02 no editable form control exists outside the authorized 47 groups");
const approval=d.getElementById("exportApproval");const approvalBefore=JSON.stringify(w.__saku_data());approval.click();check(JSON.stringify(w.__saku_data())===approvalBefore,"ALIGN-04 Preview approval checkbox is non-Canonical contextual state");
check(d.querySelectorAll(".tuning-symptom-grid button").length===20,"TUNE-01 twenty symptoms rendered");
check(d.querySelectorAll(".registry-help").length>=${EDITABLE_DENOMINATOR},"HELP coverage rendered");
check(d.querySelector(".definition-inspector")&&!d.querySelector(".definition-inspector input,.definition-inspector textarea,.definition-inspector select"),"definition data read-only");
const occupation=d.getElementById("occupationHandoffNotice");check(occupation&&/Preview/.test(occupation.textContent)&&/NON_CANONICAL_CONTEXT/.test(occupation.textContent),"HELPER-01 occupation preview and side effects visible");check(w.__saku_data().meta.field!=="Research operator","HELPER-02 occupation does not auto-map");occupation.querySelector("#occupationApply").click();await wait(50);check(w.__saku_data().meta.field==="Research operator","HELPER-02 explicit occupation apply maps role only");check(!JSON.stringify(w.__saku_data()).includes("NOT_A_CREDENTIAL"),"HELPER-02 unmapped occupation data is not serialized");
const name=d.querySelector('[data-path="meta.name"]');name.value="Frozen IA確認（編集）";name.dispatchEvent(new w.Event("input",{bubbles:true}));await wait(100);
const edited=JSON.parse(w.toSakuJson(w.__saku_data()));let verdict=await w.SAKU_ADOPTED_VALIDATE(edited);check(verdict.ok,"SCHEMA-01 EDITED full adopted validation "+verdict.errors.map(error=>error.path+":"+error.code).join(","));
check(edited.identity.display_name==="Frozen IA確認（編集）","edit reaches current Character");check(edited.assistant_composition.one_voice.external_speaker==="FRONT_CHARACTER_ONLY","ROUNDTRIP-01 unexposed one_voice preserved");
const yaml=w.toYaml(w.__saku_data());check(yaml.includes("schema:")&&!yaml.includes("organization_participation:"),"EXT-01 YAML is Unified V1 only");const importedYaml=w.parseBuilderYaml(yaml);verdict=await w.SAKU_ADOPTED_VALIDATE(importedYaml);check(verdict.ok,"SCHEMA-01 EXPORTED YAML full adopted validation "+verdict.errors.map(error=>error.path+":"+error.code).join(","));
const json=w.toSakuJson(w.__saku_data());verdict=await w.SAKU_ADOPTED_VALIDATE(JSON.parse(json));check(verdict.ok,"SCHEMA-01 EXPORTED JSON full adopted validation");
const durable=[];w.__TAURI__={core:{invoke:async(name,args)=>{if(name!=="save_workspace_character")throw new Error("UNEXPECTED_"+name);durable.push(args);return "C:/Selected Workspace/characters/frozen-ia-probe/character.json";}}};
const save=d.getElementById("saveUnifiedCharacter");save.click();await wait(700);const entries=JSON.parse(localStorage.getItem("saku.workspace.library")).entries;const saved=entries.at(-1).character;verdict=await w.SAKU_ADOPTED_VALIDATE(saved);check(verdict.ok,"SCHEMA-01 SAVED full adopted validation");check(saved.identity.character_revision!==initialCharacter.identity.character_revision,"save creates a new revision");check(durable.length===1&&durable[0].characterId==="frozen-ia-probe","SAVE-01 current Character saved to the selected Workspace");check(JSON.parse(durable[0].characterJson).identity.display_name==="Frozen IA確認（編集）","SAVE-01 durable bytes contain the latest value");check(w.SAKU_ACTIVE.summary().identity.character_revision===saved.identity.character_revision&&!w.SAKU_ACTIVE.summary().dirty,"SAVE-02 the saved revision is the clean Active SAKU");
const imported=await w.importCharacterYaml(yaml);await wait(200);check(imported===true,"Unified V1 YAML re-imported");const round=JSON.parse(w.toSakuJson(w.__saku_data()));verdict=await w.SAKU_ADOPTED_VALIDATE(round);check(verdict.ok,"SCHEMA-01 RE-IMPORTED full adopted validation");check(round.assistant_composition.deliberation.max_rounds===3,"ROUNDTRIP-01 deliberation preserved");
check(!JSON.stringify(round).includes("AMU Parameter")&&!JSON.stringify(round).includes("Reserved"),"CLASS-80 sentinel values absent");
const before=JSON.stringify(w.__saku_data());d.querySelector('[data-tuning-symptom="T01"]').click();await wait(50);check(JSON.stringify(w.__saku_data())===before,"HELPER-01 symptom navigation does not auto-mutate");
w.SAKU_GOLDEN_UI.setLocale("en-US");await wait(400);check(d.documentElement.lang==="en"&&d.querySelectorAll("main.form section.frozen-chapter").length===5,"JA_EN Frozen IA rerenders in English");
window.__durableCharacter=durable[0].characterJson;for(const key of ["saku.workspace.library","saku.workspace.active","saku.workspace.draft","saku.desktop.pendingCharacter"])localStorage.removeItem(key);const desktopLoaded=new Promise(ok=>f.addEventListener("load",ok,{once:true}));f.src="/index.html?stay=1&open=select";await desktopLoaded;await wait(1600);d=f.contentDocument;w=f.contentWindow;check(d.getElementById("viewer-results").textContent.includes("Frozen IA確認（編集）"),"SAVE-02 restart rebuilds the Library from the selected Workspace");const reopen=d.querySelector("[data-open-id]");check(Boolean(reopen),"SAVE-02 latest saved Character is selectable after restart");reopen.click();const builderLoaded=new Promise(ok=>f.addEventListener("load",ok,{once:true}));d.querySelector('[data-character-action="edit"]').click();await builderLoaded;await wait(1600);d=f.contentDocument;w=f.contentWindow;const reopenedName=d.querySelector('[data-path="meta.name"]');check(reopenedName&&reopenedName.value==="Frozen IA確認（編集）","SAVE-02 reopen retrieves the latest saved value");reopenedName.value="Frozen IA確認（継続編集）";reopenedName.dispatchEvent(new w.Event("input",{bubbles:true}));await wait(100);check(JSON.parse(w.toSakuJson(w.__saku_data())).identity.display_name==="Frozen IA確認（継続編集）","SAVE-02 editing can continue after reopen");
r.textContent=out.join("\\n");r.dataset.status="PASS"}catch(e){r.textContent=out.join("\\n")+"\\nFAIL "+e.message;r.dataset.status="FAIL"}</script>`;

const mime = new Map([[".html","text/html; charset=utf-8"],[".mjs","text/javascript; charset=utf-8"],[".json","application/json; charset=utf-8"],[".css","text/css; charset=utf-8"]]);
const server=createServer(async(req,res)=>{const url=new URL(req.url,"http://127.0.0.1");if(url.pathname==="/__frozen"){res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(harness);return}try{const file=path.join(DIST,url.pathname.slice(1));let body=await readFile(file);if(url.pathname==="/tools/saku-builder.html"){body=Buffer.from(body.toString("utf8").replace("<head>",`<head><script>addEventListener("error",e=>parent.postMessage({sakuError:e.message+" @ "+e.filename+":"+e.lineno},"*"));addEventListener("unhandledrejection",e=>parent.postMessage({sakuError:String(e.reason?.stack||e.reason)},"*"));<\/script>`),"utf8")}if(url.pathname==="/index.html"){const injected=`<script>window.__TAURI__={core:{invoke:async(name,args)=>{if(name==="get_startup_route")return "DEFAULT";if(name==="get_runtime_state")return {app_version:"0.1.0",install_dir:"C:/App",config_dir:"C:/Config",log_dir:"C:/Logs",cache_dir:"C:/Cache",workspace:"C:/Selected Workspace",first_run:false,code_signing:"UNSIGNED"};if(name==="list_workspace_characters")return {status:"OK",workspace:"C:/Selected Workspace",artifacts:parent.__durableCharacter?[{origin:"AUTHORED",path:"C:/Selected Workspace/characters/frozen-ia-probe",payload_json:parent.__durableCharacter,schema_id:"",schema_version:""}]:[],unreadable:[]};throw new Error("UNEXPECTED_"+name);}},event:{listen:async()=>()=>{}}};<\/script>`;body=Buffer.from(body.toString("utf8").replace('<script type="module" src="./i18n.mjs"></script>',injected+'<script type="module" src="./i18n.mjs"></script>'),"utf8")}res.writeHead(200,{"content-type":mime.get(path.extname(file))||"application/octet-stream"});res.end(body)}catch{res.writeHead(404);res.end("not found")}});await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const profile=await mkdtemp(path.join(tmpdir(),"saku-frozen-"));const child=spawn(chrome,["--headless=new","--disable-gpu","--disable-background-networking","--no-first-run","--no-default-browser-check",`--user-data-dir=${profile}`,"--virtual-time-budget=30000","--dump-dom",`http://127.0.0.1:${server.address().port}/__frozen`],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let dom="",stderr="";child.stdout.on("data",x=>dom+=x);child.stderr.on("data",x=>stderr+=x);await new Promise(ok=>child.on("close",ok));server.close();await rm(profile,{recursive:true,force:true});
const status=/data-status="([A-Z]+)"/.exec(dom)?.[1]||"UNKNOWN";const body=/<pre[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1]?.replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")||"";
for(const line of body.split("\n").filter(Boolean)){if(line.startsWith("FAIL")){console.error(line)}else{checks.push(line)}}
for(const name of checks)console.log(`  PASS ${name}`);if(status!=="PASS"){console.error(`FROZEN_IA FAIL (${status})`);console.error(body||dom.slice(-3000));if(stderr)console.error(stderr.slice(-3000));process.exit(1)}
console.log(`FROZEN_IA PASS ${checks.length}/${checks.length}`);
console.log(`HELP_COVERAGE ${EDITABLE_DENOMINATOR}/${EDITABLE_DENOMINATOR}`);
console.log("FULL_SCHEMA_LIFECYCLE NEW EDITED IMPORTED SAVED EXPORTED RE_IMPORTED PASS");
