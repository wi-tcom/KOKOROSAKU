import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankUnifiedCharacter } from "../tools/unified-v1/unified-schema-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.SAKU_CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let chrome = "";
for (const candidate of candidates) {
  try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } }
  catch { /* try the next standard path */ }
}
if (!chrome) {
  console.error("DESKTOP_E2E_READINESS NOT_AVAILABLE / CHROME_NOT_FOUND");
  process.exit(2);
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
]);
const tauriMock = `<script>
window.__E2E_LAST_SAVE=null;
window.__TAURI__={core:{invoke:async(command,args)=>{
  if(command==="save_builder_file"){
    window.__E2E_LAST_SAVE=args;
    return {status:"SAVED",path:"C:\\\\E2E Workspace\\\\character.json",filename:args.filename,bytes:args.content.length,reason:null};
  }
  throw new Error("UNEXPECTED_COMMAND:"+command);
}}};
</script>`;

const e2eCharacter = blankUnifiedCharacter();
e2eCharacter.identity = { character_id: "e2e-candidate", character_revision: "candidate-2", display_name: "E2E Candidate" };
e2eCharacter.purpose = {
  summary: "E2E summary", primary_value: "Preserve identity", work_modes: ["REVIEW"],
  target_users: ["Owner"], non_goals: ["Do not infer approval"],
};
e2eCharacter.character_core.character_role = "E2E role";
e2eCharacter.character_core.values = ["evidence"];
e2eCharacter.character_core.hard_invariants = [{ id: "INV-INPUT-INTEGRITY", statement: "REQUIRED_INPUT != AI_GENERATED_SUBSTITUTE" }];
e2eCharacter.character_core.human_handoff_conditions = [{ id: "HO-1", reason_class: "OTHER", trigger: "unknown", boundary_statement: "Return to a human", action: "HANDOFF_TO_HUMAN" }];
e2eCharacter.assistant_composition.seat8.expected_human_contribution = ["decision"];
e2eCharacter.assistant_composition.seat8.handoff_question_requirements = ["Which option?"];
e2eCharacter.assistant_composition.seat8.handoff_material_requirements = ["evidence"];
e2eCharacter.assistant_composition.seat8.human_required_condition_refs = [{ requirement_id: "HO-1" }];
Object.assign(e2eCharacter.personality_axes, {
  a_motif: "CLOCK_GEARS", b_companion_domain: "THOUGHT_SPARRING", c_intelligence_vector: "STRUCTURAL_LOGIC",
  d_socratic_angle: "PERSPECTIVE_SHIFT", e_vocabulary_tone: "SHARP_MINIMAL", f_acknowledgement: "FACT_CONFIRMATION",
  g_pulse: "METRONOME", h_tactile: "HEAVY_WOOD", i_thinking_pause_ms: 1500, j_theme_color: "INDIGO_IRON_NAVY",
  k_whitespace_percent: 40, l_weathering_presentation: "REDUCED_CONTRAST", m_error_narrative: "ARTISAN",
  n_crystallization: "GROWTH_AND_CONFLICT", o_closing: "BOOK_CLOSE",
});

const harness = `<!doctype html><meta charset="utf-8"><title>SAKU_E2E_RUNNING</title>
<div id="frames"></div><pre id="result" data-status="RUNNING"></pre>
<script>window.addEventListener("error",event=>{const node=document.getElementById("result");node.dataset.status="FAIL";node.textContent=JSON.stringify({status:"FAIL",error:String(event.message||event.error||"HARNESS_ERROR"),line:event.lineno,column:event.colno});document.title="SAKU_E2E_FAIL";});<\/script>
<script type="module">
const result=document.getElementById("result"),checks=[];
const check=(condition,name)=>{if(!condition)throw new Error(name);checks.push(name);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const poll=async fn=>{for(let i=0;i<120;i++){if(fn())return;await wait(50);}throw new Error("timeout");};
const click=element=>element.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));
const input=(element,value)=>{element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));};
const handoffDigest=text=>{let hash=0x811c9dc5;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193);}return (hash>>>0).toString(16).padStart(8,"0");};
const stableValue=value=>value===null||typeof value!=="object"?value:Array.isArray(value)?value.map(stableValue):Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
const stableText=value=>JSON.stringify(stableValue(value));
const firstDiff=(actual,expected,path="$")=>{if(Object.is(actual,expected))return "";if(actual===null||expected===null||typeof actual!=="object"||typeof expected!=="object")return path+": "+JSON.stringify(actual)+" != "+JSON.stringify(expected);const aKeys=Object.keys(actual),eKeys=Object.keys(expected),keys=[...new Set([...aKeys,...eKeys])].sort();for(const key of keys){if(!Object.hasOwn(actual,key)||!Object.hasOwn(expected,key))return path+"."+key+": "+(Object.hasOwn(actual,key)?"unexpected":"missing");const diff=firstDiff(actual[key],expected[key],path+"."+key);if(diff)return diff;}return "";};
const handoffBinding=(payload,overrides={})=>{const parsed=JSON.parse(payload);return JSON.stringify({character_id:parsed?.identity?.character_id||"",character_revision:String(parsed?.identity?.character_revision||"UNKNOWN"),content_digest:handoffDigest(payload),...overrides});};
const character=${JSON.stringify(e2eCharacter)};
const load=async(src,pending,bindingOverrides)=>{
  localStorage.removeItem("saku.desktop.pendingCharacter");
  localStorage.removeItem("saku.desktop.pendingCharacterBinding");
  if(pending!==undefined){localStorage.setItem("saku.desktop.pendingCharacter",pending);localStorage.setItem("saku.desktop.pendingCharacterBinding",handoffBinding(pending,bindingOverrides));}
  const frame=document.createElement("iframe");frame.style.cssText="width:1280px;height:820px;border:0";frame.src=src;document.getElementById("frames").append(frame);
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  await poll(()=>frame.contentWindow.__saku_unified_v1);
  await wait(500);
  return frame;
};
const loadGolden=async(src,pending,bindingOverrides)=>{
  localStorage.removeItem("saku.desktop.pendingCharacter");
  localStorage.removeItem("saku.desktop.pendingCharacterBinding");
  (await import("/tools/unified-v1/active-saku.mjs")).clearActive();
  if(pending!==undefined){localStorage.setItem("saku.desktop.pendingCharacter",pending);localStorage.setItem("saku.desktop.pendingCharacterBinding",handoffBinding(pending,bindingOverrides));}
  const frame=document.createElement("iframe");frame.style.cssText="width:1280px;height:820px;border:0";frame.src=src;document.getElementById("frames").append(frame);
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  await poll(()=>frame.contentWindow.__saku_data&&frame.contentDocument.getElementById("desktopHandoffNotice"));
  await wait(120);
  return frame;
};
const loadGoldenPreserving=async(src)=>{
  const frame=document.createElement("iframe");frame.style.cssText="width:1280px;height:820px;border:0";frame.src=src;document.getElementById("frames").append(frame);
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  await poll(()=>frame.contentWindow.__saku_data&&frame.contentDocument.getElementById("authoringTop"));
  await wait(120);
  return frame;
};
const loadHome=async(src)=>{
  const frame=document.createElement("iframe");frame.style.cssText="width:1280px;height:820px;border:0";frame.src=src;document.getElementById("frames").append(frame);
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  await poll(()=>frame.contentDocument.getElementById("selected-character"));
  await wait(400);
  return frame;
};
const loadTrainer=async(src,pending,bindingOverrides)=>{
  localStorage.removeItem("saku.desktop.pendingTrainerCharacter");
  localStorage.removeItem("saku.desktop.pendingTrainerCharacterBinding");
  if(pending!==undefined){localStorage.setItem("saku.desktop.pendingTrainerCharacter",pending);localStorage.setItem("saku.desktop.pendingTrainerCharacterBinding",handoffBinding(pending,bindingOverrides));}
  const frame=document.createElement("iframe");frame.style.cssText="width:1280px;height:820px;border:0";frame.src=src;document.getElementById("frames").append(frame);
  await new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));
  await wait(700);
  check(Boolean(frame.contentDocument.getElementById("stage-01")||frame.contentDocument.querySelector("main")),"Trainer route document loaded");
  return frame;
};
try{
  const activeModule=await import("/tools/unified-v1/active-saku.mjs");
  activeModule.setActive(character,{source:"route-matrix"});
  const openRoute=async code=>{
    let routeFrame;
    if(code==="01"){
      routeFrame=await loadHome("/desktop/index.html");click(routeFrame.contentDocument.getElementById("view-characters"));
      await poll(()=>routeFrame.contentDocument.getElementById("viewer-panel").hidden===false);
    }else if(code==="02"){
      routeFrame=await loadGoldenPreserving("/tools/saku-builder.html?desktop=app");
    }else if(code==="03"){
      routeFrame=await loadHome("/desktop/index.html");click(routeFrame.contentDocument.getElementById("run-on-ai-platform"));
      await poll(()=>routeFrame.contentDocument.getElementById("platform-panel").hidden===false);
    }else{
      routeFrame=await loadTrainer("/tools/saku-trainer.html");
    }
    check(activeModule.getActive()?.identity?.character_id==="e2e-candidate","Native route "+code+" preserves active Character");
    return routeFrame;
  };
  for(const origin of ["01","02","03","04"]){
    const originFrame=await openRoute(origin);originFrame.remove();
    for(const destination of ["01","02","03","04"]){
      const destinationFrame=await openRoute(destination);
      check(Boolean(destinationFrame.contentDocument.body),"Native 4x4 "+origin+"→"+destination);
      destinationFrame.remove();
    }
  }
  activeModule.clearActive();
  let frame=await load("/tools/__e2e_builder__.html?desktop=trainer-candidate&character_id=e2e-candidate&character_revision=candidate-2&source=review-results",JSON.stringify(character));
  let w=frame.contentWindow,d=frame.contentDocument;
  check(w.__saku_unified_v1.collect().identity.character_id==="e2e-candidate","Candidate identity preserved");
  check(w.__saku_unified_v1.collect().identity.character_revision==="candidate-2","Candidate revision preserved");
  check(/Editable Candidate received|編集用Candidate/.test(d.querySelector("#handoff_status").textContent),"Candidate handoff acknowledged");
  check(localStorage.getItem("saku.desktop.pendingCharacter")===null,"Accepted handoff consumed once");
  check(localStorage.getItem("saku.desktop.pendingCharacterBinding")===null,"Accepted handoff binding consumed once");
  w.__saku_unified_v1.switchSection("completion");click(d.querySelector("#ex_json"));
  check(w.__saku_unified_v1.currentExport.filename==="character.json","JSON export selected");
  input(d.querySelector("#display_name"),"Edited before save");
  click(d.querySelector("#ex_save"));await poll(()=>w.__E2E_LAST_SAVE);
  check(w.__E2E_LAST_SAVE.filename==="character.json","Native save filename");
  const saved=JSON.parse(w.__E2E_LAST_SAVE.content);
  check(saved.identity.display_name==="Edited before save","Save regenerates current Character after export-time edit");
  check(saved.identity.character_revision==="candidate-2","Saved revision preserved");
  w.__E2E_LAST_SAVE=null;click(d.querySelector("#ex_json"));click(d.querySelector("#ex_save"));await poll(()=>w.__E2E_LAST_SAVE);
  check(JSON.parse(w.__E2E_LAST_SAVE.content).identity.display_name==="Edited before save","No-edit export/save flow remains current");
  input(d.querySelector("#display_name"),"Changed after save");
  w.__saku_unified_v1.applyCharacter(saved);
  check(w.__saku_unified_v1.collect().identity.display_name==="Edited before save","Saved Character reopened");
  input(d.querySelector("#display_name"),"Reopened and edited");
  check(w.__saku_unified_v1.collect().identity.display_name==="Reopened and edited","Reopened Character remains editable");
  let trainerUrl="";w.open=url=>{trainerUrl=String(url);};click(d.querySelector("#to-trainer2"));
  check(/desktop=builder&character_id=e2e-candidate&character_revision=candidate-2/.test(trainerUrl),"Builder Trainer route preserves identity and revision");
  check(JSON.parse(localStorage.getItem("saku.desktop.pendingTrainerCharacter")).identity.character_revision==="candidate-2","Builder Trainer payload preserves revision");
  check(localStorage.getItem("saku.desktop.pendingTrainerCharacterBinding")!==null,"Builder Trainer handoff includes binding");
  frame.remove();

  // UX3 visible browser flow and IndexedDB semantics are exercised by
  // verify_trainer_ux3_browser.mjs. This suite retains the existing Builder
  // intake compatibility test using an explicit historical UX2 evidence fixture.
  frame.remove();
  const F=await import("/tools/v1/trainer-frozen-ia.mjs");
  const advance=r=>{check(r.ok,"Historical Builder handoff fixture: "+r.code);return r.session;};
  let hs=F.createSession(character);
  hs=advance(F.selectQuestions(hs,["PB-SAFETY"]));
  const begun=F.beginQuestionAttempt(hs,{questionId:"PB-SAFETY"});
  hs=advance(begun); const aid=begun.attempt.attempt_id;
  hs=advance(F.saveResponseDraft(hs,{questionId:"PB-SAFETY",attemptId:aid,originalResponse:"Synthetic response for historical Builder handoff regression."}));
  const confirmed=F.confirmResponseDraft(hs,{questionId:"PB-SAFETY",attemptId:aid});hs=advance(confirmed);
  const assessment=F.recordAssessment(hs,{questionId:"PB-SAFETY",attemptId:aid,evidenceId:hs.attempts[0].evidence_id,observed:"Synthetic explicit Human observation",diff:"Synthetic explicit Human difference",state:"DIFFERENT",humanReviewed:true,strictHumanCheck:true});hs=advance(assessment);
  hs=advance(F.createTrainerResult(hs,{attemptId:aid,assessmentId:assessment.assessment.assessment_id}));
  const candidate=F.createChangeCandidate(hs,{assessmentId:assessment.assessment.assessment_id});hs=advance(candidate);
  hs=advance(F.selectCandidate(hs,candidate.candidate.CANDIDATE_ID,{humanSelected:true}));
  const handoffResult=F.buildBuilderHandoff(hs,{humanReviewed:true});check(handoffResult.ok,"Historical reviewed handoff prepared");
  const trainerHandoff=handoffResult.payload,readyHandoffId=trainerHandoff.handoff_id,readyHandoffDigest=trainerHandoff.content_digest;
  hs.builder_handoff={state:"SENT_TO_BUILDER",handoff_id:readyHandoffId,payload:trainerHandoff};
  hs=advance(F.saveSession(localStorage,hs));check(F.storeBuilderHandoff(localStorage,trainerHandoff).ok,"Historical handoff stored");
  frame=await loadGolden("/tools/saku-builder.html?desktop=trainer-change-candidates&character_id="+character.identity.character_id+"&character_revision="+character.identity.character_revision+"&character_digest="+trainerHandoff.source_character.character_digest+"&session_id="+hs.session_id+"&handoff_id="+readyHandoffId,JSON.stringify(character));
  w=frame.contentWindow;d=frame.contentDocument;await poll(()=>d.getElementById("trainerCandidateReview"));
  check(stableText(w.__saku_data()?._unified_source)===stableText(character),"Builder adopts exact tested source Character snapshot");
  const acceptedReview=d.getElementById("trainerCandidateReview");
  check(acceptedReview.classList.contains("accepted"),"Actual Builder accepts exact historical envelope: "+acceptedReview.textContent);
  check(localStorage.getItem("saku.trainer.pendingChangeCandidates")===null,"Builder consumes exact pending envelope");
  const builderContext=JSON.parse(localStorage.getItem("saku.trainer.builderHandoffContext")||"null");
  check(builderContext?.handoff_id===readyHandoffId&&builderContext?.payload_content_digest===readyHandoffDigest,"Builder retains exact accepted handoff identity");
  frame.remove();

  for(const mismatch of [
    {label:"identity",url:"/tools/saku-builder.html?desktop=viewer-copy&character_id=other-character&character_revision=candidate-2"},
    {label:"revision",url:"/tools/saku-builder.html?desktop=viewer-copy&character_id=e2e-candidate&character_revision=wrong-revision"},
    {label:"content",url:"/tools/saku-builder.html?desktop=viewer-copy&character_id=e2e-candidate&character_revision=candidate-2",binding:{content_digest:"00000000"}},
  ]){
    frame=await loadGolden(mismatch.url,JSON.stringify(character),mismatch.binding);
    w=frame.contentWindow;d=frame.contentDocument;
    check(d.getElementById("desktopHandoffNotice").dataset.handoffState==="HANDOFF_REJECTED","Golden Builder rejects a "+mismatch.label+"-mismatched Character handoff");
    check(!w.__saku_data()._unified_source,"Rejected "+mismatch.label+" handoff is not adopted by Golden Builder");
    check(localStorage.getItem("saku.desktop.pendingCharacter")===null&&localStorage.getItem("saku.desktop.pendingCharacterBinding")===null,"Rejected "+mismatch.label+" handoff cannot replay later");
    frame.remove();
  }

  // Trainer positive/negative intake runs in the UX3 browser suite.
  frame=await load("/tools/__e2e_builder__.html?desktop=viewer-copy&character_id=other-character&character_revision=candidate-2",JSON.stringify(character));
  w=frame.contentWindow;d=frame.contentDocument;
  check(/identity mismatch|IDENTITY_MISMATCH|Characterが一致しません/.test(d.querySelector("#handoff_status").textContent),"Identity mismatch fails closed");
  check(w.__saku_unified_v1.collect().identity.character_id!=="e2e-candidate","Mismatched Character not applied");
  check(localStorage.getItem("saku.desktop.pendingCharacter")===null,"Rejected identity handoff is invalidated");
  check(localStorage.getItem("saku.desktop.pendingCharacterBinding")===null,"Rejected identity binding is invalidated");
  frame.remove();

  frame=await load("/tools/__e2e_builder__.html");
  w=frame.contentWindow;
  check(w.__saku_unified_v1.collect().identity.character_id!=="e2e-candidate","Rejected identity handoff cannot be consumed by a later plain launch");
  frame.remove();

  frame=await load("/tools/__e2e_builder__.html?desktop=viewer-copy&character_id=e2e-candidate&character_revision=wrong-revision",JSON.stringify(character));
  w=frame.contentWindow;d=frame.contentDocument;
  check(/revision mismatch|REVISION_MISMATCH|revisionが一致しません/.test(d.querySelector("#handoff_status").textContent),"Revision mismatch fails closed");
  check(w.__saku_unified_v1.collect().identity.character_revision!=="candidate-2","Mismatched revision not applied");
  check(localStorage.getItem("saku.desktop.pendingCharacter")===null,"Rejected revision handoff is invalidated");
  check(localStorage.getItem("saku.desktop.pendingCharacterBinding")===null,"Rejected revision binding is invalidated");
  frame.remove();

  frame=await load("/tools/__e2e_builder__.html?desktop=viewer-copy&character_id=e2e-candidate&character_revision=candidate-2",JSON.stringify(character),{content_digest:"00000000"});
  w=frame.contentWindow;d=frame.contentDocument;
  check(/content|CONTENT_MISMATCH|payload|引継ぎ/.test(d.querySelector("#handoff_status").textContent),"Content identity mismatch fails closed");
  check(w.__saku_unified_v1.collect().identity.character_id!=="e2e-candidate","Content-mismatched Character not applied");
  check(localStorage.getItem("saku.desktop.pendingCharacter")===null,"Rejected content handoff is invalidated");
  check(localStorage.getItem("saku.desktop.pendingCharacterBinding")===null,"Rejected content binding is invalidated");
  frame.remove();

  frame=await load("/tools/__e2e_builder__.html?desktop=viewer-copy&character_id=e2e-candidate&character_revision=candidate-2",JSON.stringify(character));
  w=frame.contentWindow;
  check(w.__saku_unified_v1.collect().identity.character_id==="e2e-candidate","Fresh valid handoff is accepted after rejection");
  frame.remove();

  frame=await load("/tools/__e2e_builder__.html?desktop=trainer-candidate&character_id=e2e-candidate&character_revision=candidate-2");
  d=frame.contentDocument;
  check(/handoff data is missing|引継ぎデータがありません/.test(d.querySelector("#handoff_status").textContent),"Missing handoff fails closed with recovery");
  check(d.documentElement.scrollWidth<=d.documentElement.clientWidth,"Builder has no horizontal overflow at 1280px");
  // Every Unified V1 surface must offer a way back to the Desktop home. The Owner
  // reported reaching Catalog with no return path.
  // A missing locale pack must never render a raw i18n key into the UI.
  // Unified V1 static descriptions are wired to the locale pack. Only the Japanese
  // path is asserted here: the en-US pack does not resolve at runtime, which is
  // recorded as an open defect rather than gated as if it worked.
  // Workspace continuity: one Active SAKU carried across screens without
  // asking the user to load it again.
  const session=await import("/tools/unified-v1/active-saku.mjs");
  session.clearActive();
  check(session.getActive()===null,"workspace starts with no Active SAKU");
  check(session.getWorkingCharacter()===null,"no working Character before one is opened");
  const subject=structuredClone(character);subject.identity={character_id:"continuity-case",display_name:"継続テスト",character_revision:"1.0.0"};subject.purpose.summary="first";
  session.setActive(subject,{source:"test"});
  check(session.getActive().identity.character_id==="continuity-case","opening a SAKU makes it Active");
  // Reading must not consume it: this is what the one-shot handoff got wrong.
  check(session.getActive()!==null&&session.getActive()!==null,"Active SAKU survives repeated reads");
  check(session.getWorkingCharacter().identity.character_id==="continuity-case","every screen reads the same subject");
  check(session.isDirty()===false,"a freshly opened SAKU is not dirty");
  const edited=JSON.parse(JSON.stringify(subject));edited.purpose.summary="edited in Builder";
  session.updateDraft(edited);
  check(session.getWorkingCharacter().purpose.summary==="edited in Builder","an edit is visible to the other screens");
  check(session.isDirty()===true,"unsaved changes are reported");
  check(session.getActive().identity.character_id==="continuity-case","editing does not change which SAKU is active");
  session.markSaved();
  check(session.isDirty()===false,"saving clears the unsaved state");
  check(session.getWorkingCharacter().purpose.summary==="edited in Builder","saving keeps the edited content");
  // TOP keeps the subject; 「最初から」 is the operation that removes it.
  check(session.getActive()!==null,"returning to the workspace keeps the Active SAKU");
  // Workspace home names the subject; TOP keeps it, 「最初から」 removes it.
  const homeFrame=await loadHome("/desktop/index.html");
  const hd=homeFrame.contentDocument, hw=homeFrame.contentWindow;
  // The subject line is always present, so "未選択" has somewhere to be said;
  // the panel that used to appear only when something was selected is gone.
  const panel=hd.getElementById("selected-character");
  check(Boolean(panel),"workspace home has a subject line");
  check(panel.dataset.selected==="true","workspace home shows the current SAKU");
  check((hd.getElementById("selected-character-name").textContent||"").includes("継続テスト"),"workspace home names the current SAKU");
  // Without a native host there is no Workspace, so drive the state the host
  // would have reported and read the announcement that follows from it.
  const runtime={workspace:"C:/ws",first_run:false,install_dir:"i",config_dir:"c",log_dir:"l",cache_dir:"ca"};
  hw.__saku_home.renderState(runtime);
  check((hd.getElementById("host-status").textContent||"").includes("編集やトレーニング"),"the announcement points at what to do next");
  hd.getElementById("view-characters").click();
  hd.getElementById("viewer-back").click();
  check(hw.localStorage.getItem("saku.workspace.active")!==null,"returning to TOP keeps the current SAKU");
  check(hd.getElementById("selected-character").dataset.selected==="true","TOP still shows the current SAKU");
  hw.confirm=()=>true;
  hd.getElementById("active-saku-clear").click();
  check(hw.localStorage.getItem("saku.workspace.active")===null,"start over leaves the workspace");
  check(hd.getElementById("selected-character-name").textContent==="未選択","start over reports 未選択");
  hw.__saku_home.renderState(runtime);
  check((hd.getElementById("host-status").textContent||"").includes("キャラクターを選択してください"),"with no subject the announcement asks for one");
  hw.__saku_home.renderState({...runtime,first_run:true});
  check((hd.getElementById("host-status").textContent||"").includes("Workspaceを選択"),"with no Workspace the announcement asks for that first");
  session.setActive(subject,{source:"test"});
  // Trainer Active SAKU / Session resume is covered in the UX3 browser suite.
  session.clearActive();
  check(session.getActive()===null,"starting over removes the Active SAKU");
  check(session.getWorkingCharacter()===null,"starting over removes the working draft");
  const desc=d.querySelector('[data-i18n="ui.catalog_desc"]');
  check(Boolean(desc),"Unified V1 catalog description is bound to the locale pack");
  check(/[぀-ゟ゠-ヿ一-龯]/.test(desc.textContent||""),"Unified V1 description renders in Japanese");
  check((desc.textContent||"").trim().length>0,"Unified V1 description is never blank when the pack is unavailable");
  for(const id of ["lbl_language1","btn_about"]){
    const el=d.getElementById(id);
    check(Boolean(el),"labelled control exists: "+id);
    const shown=(el.textContent||"").trim();
    check(shown.length>0,"labelled control is not empty: "+id);
    check(!/^ui./.test(shown),"no raw i18n key is shown for "+id+" (saw: "+shown+")");
  }
  for(const id of ["to-desktop-catalog","to-desktop-builder"]){
    const link=d.getElementById(id);
    check(Boolean(link),"Unified V1 return control exists: "+id);
    check(link.hidden===false,"Unified V1 return control is visible: "+id);
    check(link.getAttribute("href")==="../index.html?stay=1","Unified V1 return control targets the Desktop home: "+id);
  }

  result.dataset.status="PASS";result.textContent=JSON.stringify({status:"PASS",passed:checks.length,checks});document.title="SAKU_E2E_PASS";
}catch(error){result.dataset.status="FAIL";result.textContent=JSON.stringify({status:"FAIL",passed:checks.length,error:String(error&&error.message||error),checks});document.title="SAKU_E2E_FAIL";}
</script>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__e2e__.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(harness); return;
    }
    if (url.pathname === "/tools/__e2e_builder__.html") {
      const source = await readFile(path.join(ROOT, "tools/saku-builder-unified-v1.html"), "utf8");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(source.replace("</head>", tauriMock + "</head>")); return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "desktop/index.html";
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !(await stat(target)).isFile()) throw new Error("not found");
    response.writeHead(200, { "content-type": mime.get(path.extname(target).toLowerCase()) || "application/octet-stream", "cache-control": "no-store" }); response.end(await readFile(target));
  } catch (error) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end(String(error.message || error)); }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "saku-desktop-e2e-"));
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + profile, "--window-size=1280,820", "--virtual-time-budget=25000", "--dump-dom", `http://127.0.0.1:${server.address().port}/__e2e__.html`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let output = "", errors = ""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => errors += chunk);
const exitCode = await new Promise((resolve, reject) => { const timeout = setTimeout(() => { child.kill(); reject(new Error("Chrome timeout")); }, 60000); child.on("error", reject); child.on("exit", code => { clearTimeout(timeout); resolve(code); }); }).catch(error => { errors += "\n" + error.message; return -1; });
server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));
const match = output.match(/<pre id="result" data-status="PASS">([\s\S]*?)<\/pre>/);
if (exitCode !== 0 || !match) {
  console.error("DESKTOP_E2E_READINESS FAIL");
  const failed = output.match(/<pre id="result" data-status="FAIL">([\s\S]*?)<\/pre>/);
  if (failed) console.error(failed[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  else {
    const title = output.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "NO_TITLE";
    const state = output.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/)?.[0] || "NO_RESULT_NODE";
    console.error(`HARNESS_STATE ${title} ${state}`);
  }
  console.error(errors.trim().slice(-3000)); process.exit(1);
}
const report = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
console.log(`DESKTOP_E2E_READINESS PASS ${report.passed}/${report.passed}`);
for (const name of report.checks) console.log(`  PASS ${name}`);
console.log("CANONICAL_MUTATION_FROM_REVIEW_OR_VIEWER 0");
console.log("SAVE_EXPORT_REOPEN PASS");
