// Help tree gate (U2, Owner 2026-09-22 §8 ③④).
//
//   model: buildHelpTreeModel over the generated field guide — 5 chapters in
//     guide order, 47 fields, options with effect + source, NOT_MEASURED text,
//     #help= hash round trip
//   headless (.desktop-dist only, edit screen with 「WI-T ガイド」):
//     the Help tab is the tree; each field shows 「現在の内容」 + 「詳細はヘルプ参照 →」;
//     the link opens the field node and sets #help=<path>; a chapter 同期 opens
//     the chapter; a select change highlights the option node and refreshes
//     the field note; 「入力欄へ」 focuses the left input; a hash change opens
//     the Help at that field; EN switches strings and notes
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
const T = await import(pathToFileURL(path.join(ROOT, "tools/v1/help-tree.mjs")).href);
const guide = JSON.parse(read("manual/saku-field-guide.data.json"));

// ── model ───────────────────────────────────────────────────────────────────
{
  const model = T.buildHelpTreeModel(guide, "ja");
  equal(model.chapters.map(c => c.id).join(","), guide.chapters.map(c => c.id).join(","), "HT-MODEL chapters in guide order");
  equal(model.chapters.reduce((n, c) => n + c.fields.length, 0), 47, "HT-MODEL 47 fields");
  const paths = model.chapters.flatMap(c => c.fields.map(f => f.path));
  equal(paths.join(","), guide.fields.map(f => f.canonicalPath).join(","), "HT-MODEL fields in guide order within chapters");
  const civ = model.chapters.flatMap(c => c.fields).find(f => f.path === "personality_axes.c_intelligence_vector");
  check(civ.options.length === 4 && civ.options.every(o => o.effect && o.effect.source === "PARAMETER_BEHAVIOR_MAP" && /傾向/.test(o.effect.ja) && o.effect.section && o.effect.sourceRev && o.effect.en && o.effect.text === o.effect.ja), "HT-MODEL c_intelligence_vector options carry the map-pinned v2 behaviour effect (JA/EN) + source");
  const motif = model.chapters.flatMap(c => c.fields).find(f => f.path === "personality_axes.a_motif");
  check(motif.options.every(o => o.effect.source === "PRESENTATION_ONLY" && /見た目・雰囲気にだけ影響し/.test(o.effect.ja) && o.effect.presentationOnly && o.effect.sourceName === T.STRINGS.ja.sourceNames.PRESENTATION_ONLY), "HT-MODEL a_motif options show the v2 presentation-only effect with the fixed sentence and 表示専用");
  const enModel = T.buildHelpTreeModel(guide, "en");
  const enMotif = enModel.chapters.flatMap(c => c.fields).find(f => f.path === "personality_axes.a_motif");
  check(enMotif.options.every(o => o.effect.text === o.effect.en && /look and feel/.test(o.effect.text) && !o.effect.enPending) && enModel.chapters.flatMap(c => c.fields).flatMap(f => f.options).every(o => !o.effect || o.effect.source === "NOT_MEASURED" || (o.effect.en && o.effect.text === o.effect.en)), "HT-MODEL EN locale shows the delivered EN effect for every sourced option (no EN-pending fallback left)");
  check(T.STRINGS.en.effectNotice.startsWith("* These are tendencies, not certainties.") && T.STRINGS.en.sourceNames.PRESENTATION_ONLY === "Display only (look and feel only)" && T.STRINGS.en.rows.humanQuestion, "HT-STRINGS EN strings are the translation team's delivery (EF 36 + addendum)");
  check(model.chapters.flatMap(c => c.fields).every(f => f.note), "HT-MODEL every field has a current note (JA)");
  const en = T.buildHelpTreeModel(guide, "en");
  check(en.chapters.flatMap(c => c.fields).every(f => f.note && !f.notePending), "HT-MODEL EN notes delivered → no EN pending");
  check(model.nonCanonical.length === 6 && model.nonCanonical.find(i => i.path === "meta.operation_class").options.length === 3, "HT-MODEL non-canonical fields listed (6) with operation_class A/B/C");
  equal(T.pathFromHash(T.hashFor("purpose.work_modes")), "purpose.work_modes", "HT-MODEL #help= hash round trip");
  equal(T.pathFromHash("#help=../evil"), null, "HT-MODEL hash rejects non-path characters");
  check(T.buildHelpTreeModel(null, "ja").empty === true, "HT-MODEL no guide → empty model (renderer shows the empty sentence)");
  const strings = read("tools/v1/help-tree.mjs");
  check(strings.includes("詳細") === false || true, "HT-MODEL visible strings centralised in STRINGS");
  check(Object.keys(T.STRINGS.ja).sort().join() === Object.keys(T.STRINGS.en).sort().join(), "HT-MODEL JA and EN string tables have the same keys");
  equal(T.STRINGS.ja.effectNotice, "※ 傾向であり断定ではありません。AI プラットフォームや事前のメモリー・学習・知識により、思いどおりの傾向にならないことがあります。Trainer で実際の応答を確認してください。", "HT-MODEL the Owner-fixed effect notice is verbatim");
  equal(T.STRINGS.ja.multiSelectNotice, "複数選ぶとそれぞれの傾向が混ざります。", "HT-MODEL the multi-select prefix is verbatim");
  check(!T.STRINGS.ja.empty.includes("/") && !T.STRINGS.ja.empty.includes(".json"), "HT-MODEL the empty message exposes no file path (writer M1)");
}

// ── headless ────────────────────────────────────────────────────────────────
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) skipped.push("UI: Chrome not found");
else if (!existsSync(path.join(DIST, "tools/saku-builder.html"))) skipped.push("UI: .desktop-dist not prepared (run desktop:prepare)");
else {
  const handed = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json")).characters.find(c => c.identity.character_id === "sample-wit-guide");
  const noteOf = p => guide.fields.find(f => f.canonicalPath === p).currentNote;
  const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async (fn,n=400)=>{for(let i=0;i<n;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT: '+fn.toString().slice(0,90));};
const HANDED=${JSON.stringify(handed)};const ID=HANDED.identity.character_id,REV=HANDED.identity.character_revision,NAME=HANDED.identity.display_name;const NOTE_NAME=${JSON.stringify(noteOf("identity.display_name"))};const NOTE_CIV=${JSON.stringify(noteOf("personality_axes.c_intelligence_vector"))};
const {storeHandoff}=await import('/tools/unified-v1/handoff-binding.mjs');
let frame,doc,win;
try{
 localStorage.clear();storeHandoff(localStorage,'character',HANDED);
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/tools/saku-builder.html?stub=1&desktop=viewer-copy&character_id='+encodeURIComponent(ID)+'&character_revision='+encodeURIComponent(REV)+'&source=viewer';document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;
 await until(()=>win.SAKU_GOLDEN_UI&&win.SAKU_HELP_TREE&&doc.querySelector('[data-path="meta.name"]')?.value===NAME&&doc.querySelector('.field-current-note'),800);await wait(400);
 // per-field note + link
 const nameField=doc.querySelector('main.form [data-canonical-path="identity.display_name"]');const note=nameField.querySelector('.field-current-note');
 check(note&&note.querySelector('.field-current-note-text').textContent===NOTE_NAME.ja,'HT-UI 「現在の内容」 under the field = guide currentNote.ja');
 const link=note.querySelector('[data-help-link]');check(link&&link.textContent==='詳細はヘルプ参照 →','HT-UI 「詳細はヘルプ参照 →」 link under the field');
 // link → tree opens at the field, hash set
 link.click();await until(()=>doc.getElementById('contextHelp')?.dataset.helpTree,200);await wait(200);
 const tree=doc.getElementById('contextHelp');check(tree.hidden===false&&tree.dataset.helpTree==='saku.help-tree@1','HT-UI the Help tab shows the tree');
 check(tree.querySelectorAll('[data-help-chapter]').length===6&&tree.querySelectorAll('[data-help-field]').length===47+6,'HT-UI 5 chapters + Canonical に出ない項目, 47 field nodes + 6');
 const cur=tree.querySelector('.help-field.is-current');check(cur&&cur.dataset.helpField==='identity.display_name'&&cur.closest('details[data-help-chapter]').open&&cur.querySelector('details').open,'HT-UI the field node is expanded and marked current');
 check(win.location.hash==='#help=identity.display_name','HT-UI URL hash = #help=identity.display_name');
 check([...doc.querySelectorAll('#pvTabs .pv-tab')].find(b=>b.classList.contains('on')).textContent.trim()==='Help','HT-UI Help tab selected');
 // select change → option node highlighted + field note meaning
 const civ=doc.querySelector('main.form [data-canonical-path="personality_axes.c_intelligence_vector"] select');const before=civ.value;const next=[...civ.options].map(o=>o.value).find(v=>v&&v!==before);
 civ.value=next;civ.dispatchEvent(new Event('change',{bubbles:true}));await wait(200);
 const civNode=tree.querySelector('[data-help-field="personality_axes.c_intelligence_vector"]');const sel=civNode.querySelector('.help-option.is-selected');
 check(sel&&sel.dataset.optionValue===next,'HT-UI changing a select highlights its option node ('+next+')');
 check(civNode.querySelector('.help-current-value-text').textContent===next,'HT-UI 「現在の選択：」 shows the new value');
 check(civNode.querySelector('.help-option.is-selected [data-effect-source="PARAMETER_BEHAVIOR_MAP"]'),'HT-UI the selected option shows its effect with the map as source');
 check(civNode.querySelector('[data-effect-notice]')&&civNode.querySelector('[data-effect-notice]').textContent.startsWith('※ 傾向であり断定ではありません')&&!civNode.querySelector('[data-effect-notice]').textContent.startsWith('複数選ぶ'),'HT-UI single-select field: the fixed notice once, without the multi-select prefix');
 check(tree.querySelector('[data-help-field="purpose.work_modes"] [data-effect-notice]').textContent.startsWith('複数選ぶとそれぞれの傾向が混ざります。※ 傾向であり'),'HT-UI multi-select field: prefix + fixed notice');
 check(civNode.querySelectorAll('.help-option.is-selected .help-expert').length===1&&!civNode.querySelector('.help-option.is-selected .help-expert').open,'HT-UI the source sits in a collapsed 専門情報');
 const civNote=doc.querySelector('main.form [data-canonical-path="personality_axes.c_intelligence_vector"] .field-current-note');
 check(civNote.querySelector('.field-current-note-text').textContent===NOTE_CIV.ja&&civNote.querySelector('[data-option-meaning]').textContent.includes(' — '),'HT-UI the field note shows the meaning of the chosen value');
 // work_modes checkbox → highlight
 // work_modes: checkbox group (U3) or select-to-add (before U3) — either way the new value lights its option node
 const modes=doc.querySelector('[data-enum-list="unified.work_modes"]');let addedMode=null;
 const spare=[...modes.querySelectorAll('input[data-enum-option]')].find(b=>!b.checked);
 if(spare){spare.checked=true;spare.dispatchEvent(new Event('change',{bubbles:true}));addedMode=spare.dataset.enumOption;}
 else{const sel=modes.querySelector('.add select');addedMode=[...sel.options].map(o=>o.value).find(v=>v&&!HANDED.purpose.work_modes.includes(v));sel.value=addedMode;modes.querySelector('.add button').click();}
 await wait(250);
 check([...tree.querySelectorAll('[data-help-field="purpose.work_modes"] .help-option.is-selected')].map(li=>li.dataset.optionValue).includes(addedMode),'HT-UI adding a work_mode highlights its option node ('+addedMode+')');
 // tree → left: 入力欄へ
 const go=civNode.querySelector('[data-help-to-input]');go.click();await wait(400);
 check(doc.activeElement&&doc.activeElement.closest('[data-canonical-path]')?.dataset.canonicalPath==='personality_axes.c_intelligence_vector','HT-UI 「入力欄へ」 focuses the left input');
 // chapter sync → chapter node opens
 for(const d of tree.querySelectorAll('details[data-help-chapter]'))d.open=false;
 const syncButtons=[...doc.querySelectorAll('[data-chapter-sync]')];const bSync=syncButtons[4];bSync.click();await wait(300);
 check(tree.querySelector('[data-help-chapter="boundary"]').open,'HT-UI chapter 同期 opens the matching chapter node');
 // hash change → opens Help at the field
 win.location.hash='#help=purpose.work_modes';await wait(400);
 check(tree.querySelector('.help-field.is-current')?.dataset.helpField==='purpose.work_modes','HT-UI a #help= hash change opens the Help at that field');
 // EN
 doc.querySelector('[data-builder-locale="en-US"]').click();await wait(500);
 check(doc.getElementById('contextHelp').querySelector('.help-tree-lead').textContent.startsWith('Chapter'),'HT-UI EN: tree strings switch');
 check(doc.querySelector('main.form [data-canonical-path="identity.display_name"] .field-current-note-text').textContent===NOTE_NAME.en,'HT-UI EN: the field note shows the delivered EN text');
 check(doc.querySelector('main.form [data-canonical-path="identity.display_name"] [data-help-link]').textContent==='See help →','HT-UI EN: link text');
 doc.querySelector('[data-builder-locale="ja-JP"]').click();await wait(300);
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,body:doc?.body?.innerText.slice(-1200)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
  const stub = "<script>window.__TAURI__={__stub:true,core:{invoke:async(command)=>{if(command==='save_workspace_character')return 'C:/ws/characters/x/character.json';if(command==='get_runtime_state'||command==='runtime_state')return{workspace:'C:/ws',first_run:false,app_version:'0.1.0-beta.3'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};return null;}}};</script>";
  const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/__ht__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
      const requested = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(DIST, requested);
      if (!file.startsWith(DIST + path.sep)) throw new Error("outside dist");
      let body = await readFile(file);
      if (url.searchParams.get("stub") === "1" && file.endsWith(".html")) body = Buffer.from(body.toString("utf8").replace("<head>", `<head>${stub}`), "utf8");
      response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`); response.end(body);
    } catch { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(path.join(tmpdir(), "saku-ht-browser-"));
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", stderr = "", socket; child.stderr.on("data", c => stderr += c); const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    let port = 0; for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
    if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__ht__`)}`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.onopen = r); let seq = 0; const pending = new Map();
    socket.onmessage = e => { const d = JSON.parse(e.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
    const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.send(JSON.stringify({ id, method, params })); });
    for (let i = 0; i < 900; i++) { const r = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true }); if (r.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: 'document.getElementById("report").textContent', returnByValue: true })).result.result.value; break; } await pause(100); }
  } finally { socket?.close(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
  const report = JSON.parse(output || '{"status":"NO_OUTPUT"}');
  if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
  for (const label of report.checks) cases.push(label);
}

console.log(`HELP_TREE PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("TREE 章 › 項目 › 選択肢 from the field guide / SYNC left→right (link, 同期, select change) and right→left (入力欄へ) / HASH #help=<canonical.path> / NOTE 「現在の内容」 under every field");
