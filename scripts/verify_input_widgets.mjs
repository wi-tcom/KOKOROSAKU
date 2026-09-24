// Input widgets gate (U3, Owner 2026-09-22 §8 ①②).
//
//   static: work_modes is a checkbox group (nothing typed, nothing to add);
//     reason_class options equal the adopted schema enum; the reference
//     lists have no typed requirement_id / locator controls
//   module: a ref added on the screen gets an id-resolved locator at save,
//     a ref the base carried is kept exactly, a ref whose id is on no row gets
//     no locator (validator's job), unchanged saves stay byte-identical
//     for every bundled Character
//   headless (.desktop-dist only): the edit screen with 「WI-T ガイド」 —
//     13 checkboxes reflect the Character, ticking appends / unticking
//     removes; every requirement and handoff row carries 保持／逸脱禁止／継続性
//     checks that mirror the reference lists; ticking one and saving stores a
//     ref with a resolving locator; renaming a row id renames its refs; a
//     foreign ref is listed under その他の参照 with 外す
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const cases = []; const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)?.slice(0, 200)})`); cases.push(label); };
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");
const A = await import(pathToFileURL(path.join(ROOT, "tools/v1/unified-authoring.mjs")).href);
const U = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/unified-schema-v1.mjs")).href);
const R = await import(pathToFileURL(path.join(ROOT, "tools/v1/semantic-registry.mjs")).href);
const schema = JSON.parse(read("tests/fixtures/canonical/saku-unified-character.v1.schema.json"));
const samples = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json")).characters;

// ── static ──────────────────────────────────────────────────────────────────
{
  const ui = read("tools/v1/frozen-ia-ui.mjs");
  check(/input type="checkbox" value="\$\{esc\(option\)\}" data-enum-option/.test(ui) && !/\.add select/.test(ui.slice(ui.indexOf("function enumListMarkup"), ui.indexOf("function normalizeList"))), "W-STATIC work_modes renders one checkbox per Schema value; no select-to-add");
  equal(R.HANDOFF_REASON_OPTIONS.join(","), schema.$defs.handoffCondition.properties.reason_class.enum.join(","), "W-STATIC reason_class select options equal the adopted schema enum (8)");
  equal(schema.$defs.purpose.properties.work_modes.items.enum.length, 13, "W-STATIC work_modes enum has 13 values");
  const refs = ui.slice(ui.indexOf("function renderReferences"), ui.indexOf("function wireFrozenActions"));
  check(!/requirement_id", ui\(|"locator", ui\(|object-add/.test(refs), "W-STATIC the reference lists have no typed requirement_id / locator rows and no add button");
  check(ui.includes('["must_preserve_refs", "保持"') && ui.includes('["prohibited_drift_refs", "逸脱禁止"') && ui.includes('["continuity_refs", "継続性"'), "W-STATIC the three checks are 保持／逸脱禁止／継続性");
  check(/renameRef\(/.test(ui) && /onIdChange: renameRef/.test(ui), "W-STATIC editing a row id renames its references");
  check(A.LOCATOR_PENDING === "" && read("tools/v1/unified-authoring.mjs").includes("locator: LOCATOR_PENDING"), "W-STATIC new refs are marked for locator generation at save");
}

// ── module ──────────────────────────────────────────────────────────────────
{
  for (const base of samples) {
    const same = A.toUnifiedCharacter(A.fromUnifiedCharacter(base), base, { bumpRevision: false });
    assert.equal(JSON.stringify(same), JSON.stringify(base), `W-MOD ${base.identity.character_id} unchanged save is byte-identical`);
  }
  cases.push(`W-MOD unchanged saves are byte-identical for the ${samples.length} bundled Characters (refs without locator preserved as they were)`);
  const base = samples.find(c => c.identity.character_id === "sample-wit-guide");
  const form = A.fromUnifiedCharacter(base);
  const rowId = form.unified.hard_invariants[0].id; const handoffId = base.character_core.human_handoff_conditions[0].id;
  form.unified.must_preserve_refs = [...(form.unified.must_preserve_refs || []), { requirement_id: rowId }];
  form.unified.continuity_refs = [...(form.unified.continuity_refs || []), { requirement_id: handoffId }, { requirement_id: "NOT-ON-ANY-ROW" }];
  const out = A.toUnifiedCharacter(form, base, { bumpRevision: false });
  const added = out.conformance_expectations.must_preserve_refs.at(-1);
  equal(added.locator, `/character_core/hard_invariants/${base.character_core.hard_invariants.findIndex(i => i.id === rowId)}`, "W-MOD a ref added on the screen gets an id-resolved locator into hard_invariants");
  const addedHandoff = out.conformance_expectations.continuity_refs.at(-2);
  equal(addedHandoff.locator, `/character_core/human_handoff_conditions/${base.character_core.human_handoff_conditions.findIndex(i => i.id === handoffId)}`, "W-MOD a ref to a handoff row gets its locator into human_handoff_conditions");
  const foreign = out.conformance_expectations.continuity_refs.at(-1);
  check(foreign.requirement_id === "NOT-ON-ANY-ROW" && !("locator" in foreign), "W-MOD a ref whose id is on no row gets no locator (left for the validator)");
  equal(U.conformanceLocatorMismatches(out).length, 0, "W-MOD every generated locator resolves to its requirement_id");
  check(JSON.stringify(out.conformance_expectations.prohibited_drift_refs) === JSON.stringify(base.conformance_expectations.prohibited_drift_refs), "W-MOD an untouched reference list is unchanged");
  // a base ref without locator stays without one
  const stripped = structuredClone(base); stripped.conformance_expectations.must_preserve_refs = stripped.conformance_expectations.must_preserve_refs.map(ref => ({ requirement_id: ref.requirement_id }));
  const keep = A.toUnifiedCharacter(A.fromUnifiedCharacter(stripped), stripped, { bumpRevision: false });
  check(keep.conformance_expectations.must_preserve_refs.every(ref => !("locator" in ref)), "W-MOD a base ref that had no locator is not given one (round trip stays identical)");
  // reordered rows: generated locator follows the id
  const swapped = structuredClone(base); swapped.character_core.hard_invariants.reverse();
  const f2 = A.fromUnifiedCharacter(swapped); f2.unified.must_preserve_refs = [...(f2.unified.must_preserve_refs || []), { requirement_id: rowId }];
  const out2 = A.toUnifiedCharacter(f2, swapped, { bumpRevision: false });
  equal(out2.conformance_expectations.must_preserve_refs.at(-1).locator, `/character_core/hard_invariants/${swapped.character_core.hard_invariants.findIndex(i => i.id === rowId)}`, "W-MOD the generated locator follows the id, not a position");
}

// ── headless ────────────────────────────────────────────────────────────────
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) skipped.push("UI: Chrome not found");
else if (!existsSync(path.join(DIST, "tools/saku-builder.html"))) skipped.push("UI: .desktop-dist not prepared (run desktop:prepare)");
else {
  const handed = structuredClone(samples.find(c => c.identity.character_id === "sample-wit-guide"));
  handed.conformance_expectations.continuity_refs = [...handed.conformance_expectations.continuity_refs, { requirement_id: "LEGACY-FOREIGN-1" }];
  const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async (fn,n=400)=>{for(let i=0;i<n;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT: '+fn.toString().slice(0,90));};
const HANDED=${JSON.stringify(handed)};const ID=HANDED.identity.character_id,REV=HANDED.identity.character_revision,NAME=HANDED.identity.display_name;
const {storeHandoff}=await import('/tools/unified-v1/handoff-binding.mjs');const {conformanceLocatorMismatches}=await import('/tools/unified-v1/unified-schema-v1.mjs');
const lib=()=>((JSON.parse(localStorage.getItem('saku.workspace.library')||'{}').entries)||[]).filter(e=>!e.deleted);
let frame,doc,win;
try{
 localStorage.clear();storeHandoff(localStorage,'character',HANDED);
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/tools/saku-builder.html?stub=1&desktop=viewer-copy&character_id='+encodeURIComponent(ID)+'&character_revision='+encodeURIComponent(REV)+'&source=viewer';document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;
 await until(()=>win.SAKU_GOLDEN_UI&&win.SAKU_UNIFIED&&doc.querySelector('[data-path="meta.name"]')?.value===NAME,800);await wait(600);
 const data=()=>win.__saku_data();
 // work_modes
 const modes=doc.querySelector('[data-enum-list="unified.work_modes"]');const boxes=[...modes.querySelectorAll('input[data-enum-option]')];
 check(boxes.length===13&&!modes.querySelector('.add select'),'W-UI work_modes: 13 checkboxes, no select-to-add');
 check(boxes.filter(b=>b.checked).map(b=>b.dataset.enumOption).sort().join(',')===[...HANDED.purpose.work_modes].sort().join(','),'W-UI checked boxes = the Character\\'s work_modes ('+HANDED.purpose.work_modes.join(',')+')');
 const spare=boxes.find(b=>!b.checked);spare.checked=true;spare.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);
 check(data().unified.work_modes.at(-1)===spare.dataset.enumOption&&data().unified.work_modes.slice(0,-1).join(',')===HANDED.purpose.work_modes.join(','),'W-UI ticking appends the value after the existing ones (order kept)');
 spare.checked=false;spare.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);
 check(data().unified.work_modes.join(',')===HANDED.purpose.work_modes.join(','),'W-UI unticking removes it again');
 check(!!modes.querySelector('.enum-name'),'W-UI option names from the field guide are shown beside the values');
 // reason_class
 const reason=doc.querySelector('#handoffEditor select[data-reason-class]');check(reason&&[...reason.options].map(o=>o.value).join(',')==='AUTHORITY_REQUIRED,CREDENTIAL_REQUIRED,LEGAL_OR_REGULATORY,SAFETY_CRITICAL,EXTERNAL_IRREVERSIBLE,MATERIAL_UNCERTAINTY,CHARACTER_BOUNDARY,OTHER','W-UI handoff row: reason_class is a select with the 8 schema values');
 // reference checks on rows
 const invRows=[...doc.querySelectorAll('#invariantsEditor .object-row')];check(invRows.length===HANDED.character_core.hard_invariants.filter(i=>i.id!=='INV-INPUT-INTEGRITY').length||invRows.length===HANDED.character_core.hard_invariants.length,'W-UI one row per hard invariant ('+invRows.length+')');
 check(invRows.every(r=>r.querySelectorAll('input[data-ref-group]').length===3)&&[...doc.querySelectorAll('#handoffEditor .object-row')].every(r=>r.querySelectorAll('input[data-ref-group]').length===3),'W-UI every requirement and handoff row carries 保持／逸脱禁止／継続性 checks');
 check(!doc.querySelector('#referenceEditors .object-add')&&!doc.querySelector('#referenceEditors input'),'W-UI reference lists: no add button, no typed requirement_id / locator');
 const fixed=doc.querySelector('[data-fixed-invariant]');check(fixed&&fixed.querySelectorAll('input[data-ref-group]').length===3,'W-UI INV-INPUT-INTEGRITY line carries the three checks too');
 const mirrors=invRows.every(r=>{const id=r.querySelector('input').value;return [...r.querySelectorAll('input[data-ref-group]')].every(b=>b.checked===((data().unified[b.dataset.refGroup]||[]).some(x=>x.requirement_id===id)));});check(mirrors,'W-UI row checks mirror the reference lists of the loaded Character');
 // foreign ref shown, removable
 const foreign=doc.querySelector('[data-ref-group="continuity_refs"] [data-ref-foreign]');check(foreign&&foreign.textContent.includes('LEGACY-FOREIGN-1'),'W-UI a ref whose id is on no row is listed under その他の参照');
 // tick 保持 on the first row → summary + state
 const first=invRows[0];const firstId=first.querySelector('input').value;const keep=first.querySelector('input[data-ref-group="must_preserve_refs"]');const wasChecked=keep.checked;
 keep.checked=!wasChecked;keep.dispatchEvent(new Event('change',{bubbles:true}));await wait(150);
 check((data().unified.must_preserve_refs.some(x=>x.requirement_id===firstId))===!wasChecked,'W-UI ticking 保持 on a row adds / removes the reference by the row id');
 if(wasChecked){keep.checked=true;keep.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);}
 // add a fresh invariant row, tick 継続性, save → locator generated
 doc.querySelector('#invariantsEditor .object-add').click();await wait(150);
 const rows2=[...doc.querySelectorAll('#invariantsEditor .object-row')];const fresh=rows2[rows2.length-1];const idInput=fresh.querySelector('input');idInput.value='INV-U3-NEW';idInput.dispatchEvent(new Event('input',{bubbles:true}));const stmt=fresh.querySelector('textarea');stmt.value='新しい約束';stmt.dispatchEvent(new Event('input',{bubbles:true}));
 const cont=fresh.querySelector('input[data-ref-group="continuity_refs"]');cont.checked=true;cont.dispatchEvent(new Event('change',{bubbles:true}));await wait(150);
 check(data().unified.continuity_refs.some(x=>x.requirement_id==='INV-U3-NEW'&&!x.locator),'W-UI the new ref is stored by id only (no locator typed)');
 // rename the row id → ref follows
 idInput.value='INV-U3-RENAMED';idInput.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);
 check(data().unified.continuity_refs.some(x=>x.requirement_id==='INV-U3-RENAMED')&&!data().unified.continuity_refs.some(x=>x.requirement_id==='INV-U3-NEW'),'W-UI renaming the row id renames its reference');
 // remove the foreign ref via 外す
 doc.querySelector('[data-ref-group="continuity_refs"] [data-ref-foreign] button').click();await wait(100);
 check(!data().unified.continuity_refs.some(x=>x.requirement_id==='LEGACY-FOREIGN-1'),'W-UI 外す removes the foreign reference explicitly');
 // Owner-approved vocabulary as datalist (U4)
 const fp=doc.querySelector('main.form [data-canonical-path="expression_semantics.first_person"] > input');await until(()=>fp.getAttribute('list'),400);
 const dl=doc.getElementById(fp.getAttribute('list'));check(dl&&dl.tagName==='DATALIST'&&dl.options.length>=3&&[...dl.options].some(o=>o.value==='私'),'W-UI first_person carries an Owner-approved datalist (≥ 3 words, includes 私)');
 check(doc.querySelector('[data-candidate-note="expression_semantics.first_person"]')?.textContent==='例です。自由に書けます','W-UI the datalist note reads 「例です。自由に書けます」');
 fp.value='拙者';fp.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);check(data().identity.first_person==='拙者'||JSON.stringify(data()).includes('拙者'),'W-UI a value outside the list is accepted (free text)');
 check(!doc.querySelector('main.form [data-canonical-path="character_core.character_role"] > input')?.getAttribute('list'),'W-UI character_role has no datalist (入力例 only)');
 // save
 const before=lib().length;win.alert=m=>{win.__alerts=(win.__alerts||[]).concat(String(m));};doc.getElementById('saveUnifiedCharacter').click();
 await until(()=>lib().length===before+1,400);
 const saved=lib().at(-1).character;const ref=saved.conformance_expectations.continuity_refs.find(x=>x.requirement_id==='INV-U3-RENAMED');
 check(ref&&ref.locator==='/character_core/hard_invariants/'+saved.character_core.hard_invariants.findIndex(i=>i.id==='INV-U3-RENAMED'),'W-UI saved: the new reference carries an id-resolved locator ('+(ref&&ref.locator)+')');
 check(conformanceLocatorMismatches(saved).length===0,'W-UI saved Character: every locator resolves');
 check(!(win.__alerts||[]).some(a=>/保存できません/.test(a)),'W-UI save was not refused');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,alerts:frame?.contentWindow?.__alerts||null,body:doc?.body?.innerText.slice(-1200)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
  const stub = "<script>window.__TAURI__={__stub:true,core:{invoke:async(command)=>{if(command==='save_workspace_character')return 'C:/ws/characters/x/character.json';if(command==='get_runtime_state'||command==='runtime_state')return{workspace:'C:/ws',first_run:false,app_version:'0.1.0-beta.3'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};return null;}}};</script>";
  const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/__iw__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
      const requested = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(DIST, requested);
      if (!file.startsWith(DIST + path.sep)) throw new Error("outside dist");
      let body = await readFile(file);
      if (url.searchParams.get("stub") === "1" && file.endsWith(".html")) body = Buffer.from(body.toString("utf8").replace("<head>", `<head>${stub}`), "utf8");
      response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`); response.end(body);
    } catch { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(path.join(tmpdir(), "saku-iw-browser-"));
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", stderr = "", socket; child.stderr.on("data", c => stderr += c); const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    let port = 0; for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
    if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__iw__`)}`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.onopen = r); let seq = 0; const pending = new Map();
    socket.onmessage = e => { const d = JSON.parse(e.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
    const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.send(JSON.stringify({ id, method, params })); });
    for (let i = 0; i < 900; i++) { const r = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true }); if (r.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: 'document.getElementById("report").textContent', returnByValue: true })).result.result.value; break; } await pause(100); }
  } finally { socket?.close(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
  const report = JSON.parse(output || '{"status":"NO_OUTPUT"}');
  if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
  for (const label of report.checks) cases.push(label);
}

console.log(`INPUT_WIDGETS PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("WORK_MODES checkbox group (13, schema) / REASON_CLASS select (8, schema) / REFS from row checks, locator generated at save by id, nothing typed / UNCHANGED saves byte-identical");
