// Edit screen hand-off buttons + tab cleanup gate (Owner 2026-09-22).
//
//   static: the preview tabs are character.yaml / Character File / 試験記録 / Help;
//     no prompt / Guild generator remains; the Character File purpose names the
//     canonical JSON and the signed-pack-only hand-over; the two buttons live in
//     .desktop-toolbar-additions (outside the golden toolbar projection)
//   headless (.desktop-dist only, as the packaged app would serve it):
//     A. browser mode (no host): the two buttons stay hidden
//     B. desktop mode, Character handed in, no edits → 「トレーニングする」 asks
//        nothing, stores the bound trainer hand-off and lands on
//        saku-trainer.html?desktop=builder&…; the Trainer accepts it
//     C. desktop mode, an edit → 「AIプラットフォームで動作確認」 asks; Cancel
//        stays (nothing saved); OK saves through the same Save (Library +1,
//        Workspace write once), sets the Active SAKU to the saved revision and
//        lands on index.html?open=platform, where 03 shows the saved Character
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const cases = []; const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");

// ── static ──────────────────────────────────────────────────────────────────
{
  const html = read("tools/saku-builder.html");
  const tabsBlock = html.slice(html.indexOf("const TABS=["), html.indexOf("];", html.indexOf("const TABS=[")));
  const tabs = [...tabsBlock.matchAll(/\["(\w+)","([^"]+)"\]/g)].map(m => m[2]);
  check(tabs.join(",") === "character.yaml,Character File,試験記録,Help", `TABS: ${tabs.join(" / ")}`);
  check(!/function toPrompt\(|function toGuildJson\(|schema:"MACHI-GUILD-SUMMARY"/.test(html), "TABS: no prompt / Guild generator on the page");
  check(/isExternalOutput\(tab\)\{return tab==="json";\}/.test(html), "TABS: the export gate applies to the Character File only");
  check(html.includes('ja:"署名・パック化の元になる正本（Unified V1）JSON。AMU/MACHI は署名付きパック経由でのみ受け取る。ここへは読み戻せません。"'), "TABS: Character File purpose = 正本 Unified V1 JSON / 署名付きパック経由でのみ");
  check(html.includes("Character File（署名・パック化の元になる正本 Unified V1 JSON）にのみ出力する。AMU/MACHI は署名付きパック経由でのみ受け取る。"), "TABS: chapter 十 note says the same");
  const additions = html.slice(html.indexOf('<div class="desktop-toolbar-additions">'), html.indexOf('<span class="subtitle" style="margin:0">'));
  check(/id="runOnPlatform"[^>]*hidden>AIプラットフォームで動作確認</.test(additions) && /id="trainCharacter"[^>]*hidden>トレーニングする</.test(additions), "BTN: both buttons sit in .desktop-toolbar-additions, hidden until the host reveals them");
  check(html.includes('location.assign("../index.html?stay=1&open=platform")') && html.includes("saku-trainer.html?desktop=builder&character_id="), "BTN: destinations are desktop 03 (open=platform) and 04 (saku-trainer, desktop=builder)");
  check(html.includes("window.SAKU_SAVE_UNIFIED_CHARACTER = performSave") && (html.match(/await performSave\(\)/g) || []).length === 1, "BTN: the hand-off runs the same Save function, once");
  check(html.includes("未保存の変更があります。この内容で保存してから進みますか？"), "BTN: unsaved edits are asked about, not handed over silently");
  const app = read("desktop/app.mjs");
  check(/open === "platform"\) showPlatform\(\)/.test(app), "03: desktop index opens the platform panel for open=platform");
  const contract = JSON.parse(read("tests/fixtures/owner-golden-ui-contract.json"));
  check(contract.preview_tabs.join(",") === "character.yaml,Character File,試験記録" && !contract.golden_function_names.includes("toPrompt") && !contract.golden_function_names.includes("toGuildJson"), "CONTRACT: preview tabs and golden functions follow");
}

// ── headless ────────────────────────────────────────────────────────────────
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(chrome)) skipped.push("UI: Chrome not found");
else if (!existsSync(path.join(DIST, "tools/saku-builder.html"))) skipped.push("UI: .desktop-dist not prepared (run desktop:prepare)");
else {
  const handed = JSON.parse(readFileSync(path.join(ROOT, "tools/unified-v1/sample-pack/sample-characters.json"), "utf8")).characters.find(c => c.identity.character_id === "sample-wit-guide");
  const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async (fn,n=400)=>{for(let i=0;i<n;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT: '+fn.toString().slice(0,80));};
const HANDED=${JSON.stringify(handed)};const ID=HANDED.identity.character_id,REV=HANDED.identity.character_revision,NAME=HANDED.identity.display_name;
const {storeHandoff}=await import('/tools/unified-v1/handoff-binding.mjs');
const lib=()=>((JSON.parse(localStorage.getItem('saku.workspace.library')||'{}').entries)||[]).filter(e=>!e.deleted);
let frame,doc,win;
const load=async (src)=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src=src;document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;};
const openEditor=async (stub)=>{storeHandoff(localStorage,'character',HANDED);await load('/tools/saku-builder.html?'+(stub?'stub=1&':'')+'desktop=viewer-copy&character_id='+encodeURIComponent(ID)+'&character_revision='+encodeURIComponent(REV)+'&source=viewer');await until(()=>win.SAKU_GOLDEN_UI&&win.SAKU_UNIFIED&&doc.querySelector('[data-path="meta.name"]')?.value===NAME,800);await wait(400);};
try{
 localStorage.clear();
 // A. browser mode
 await openEditor(false);
 check(doc.getElementById('runOnPlatform').hidden===true&&doc.getElementById('trainCharacter').hidden===true,'A: without a desktop host the two buttons stay hidden');
 check([...doc.querySelectorAll('#pvTabs .pv-tab')].map(b=>b.textContent.trim()).join(',')==='character.yaml,Character File,試験記録,Help','A: preview tabs = character.yaml / Character File / 試験記録 / Help');
 // B. desktop, no edits → train
 localStorage.clear();await openEditor(true);
 check(win.__TAURI__&&win.__TAURI__.__stub===true,'B: host stub installed before the page scripts');
 check(doc.getElementById('runOnPlatform').hidden===false&&doc.getElementById('trainCharacter').hidden===false,'B: both buttons visible under the desktop host');
 const before=lib().length;let confirms=0;win.confirm=()=>{confirms+=1;return false;};
 doc.getElementById('trainCharacter').click();
 await until(()=>/saku-trainer\\.html/.test(win.location.href)||/saku-trainer\\.html/.test(frame.contentWindow.location.href),400);
 const trainerUrl=new URL(frame.contentWindow.location.href);
 check(confirms===0,'B: no unsaved-edit question when nothing changed');
 check(lib().length===before,'B: nothing was saved (no edits)');
 check(trainerUrl.pathname.endsWith('/tools/saku-trainer.html')&&trainerUrl.searchParams.get('desktop')==='builder'&&trainerUrl.searchParams.get('character_id')===ID&&trainerUrl.searchParams.get('character_revision')===REV&&trainerUrl.searchParams.get('source')==='builder','B: landed on 04 with desktop=builder and the exact id / revision');
 await new Promise(r=>frame.contentWindow.document.readyState==='complete'?r():frame.addEventListener('load',r,{once:true}));
 doc=frame.contentDocument;win=frame.contentWindow;
 await until(()=>doc.body&&doc.body.innerText.includes(NAME+' / revision '+REV),600);
 check(doc.body.innerText.includes(NAME+' / revision '+REV)&&!/handoff_rejected|HANDOFF_BINDING|Return to Viewer|Viewer.*戻/.test(doc.body.innerText),'B: the Trainer accepted the bound hand-off and shows '+NAME+' / revision '+REV);
 check(localStorage.getItem('saku.desktop.pendingTrainerCharacter')===null,'B: the one-shot trainer hand-off was consumed');
 // C. desktop, edit → platform (cancel, then OK)
 localStorage.clear();await openEditor(true);
 const nameField=doc.querySelector('[data-path="meta.name"]');nameField.value=NAME+'（改）';nameField.dispatchEvent(new Event('input',{bubbles:true}));nameField.dispatchEvent(new Event('change',{bubbles:true}));await wait(300);
 const before2=lib().length;let asked=[];win.confirm=q=>{asked.push(q);return false;};const href=win.location.href;
 doc.getElementById('runOnPlatform').click();await wait(600);
 check(asked.length===1&&asked[0].includes('未保存の変更があります'),'C: an edit triggers the unsaved-edit question');
 check(win.location.href===href&&lib().length===before2,'C: Cancel stays on the editor and saves nothing');
 win.confirm=q=>{asked.push(q);return true;};
 doc.getElementById('runOnPlatform').click();
 await until(()=>/index\\.html/.test(frame.contentWindow.location.href),600);
 const platformUrl=new URL(frame.contentWindow.location.href);
 check(lib().length===before2+1,'C: OK saved exactly one new Character through the same Save ('+before2+'→'+lib().length+')');
 const saved=lib()[lib().length-1].character;
 check(saved.identity.display_name===NAME+'（改）'&&saved.identity.character_revision!==REV,'C: the saved Character carries the edit as a new revision ('+saved.identity.character_revision+')');
 check(Number(localStorage.getItem('__eh_saves')||0)===1,'C: the Workspace was written exactly once (through the same Save)');
 const active=JSON.parse(localStorage.getItem('saku.workspace.active'));
 check(active&&active.source==='builder-platform'&&active.character.identity.character_revision===saved.identity.character_revision,'C: the Active SAKU is the saved revision, source builder-platform');
 check(platformUrl.pathname.endsWith('/index.html')&&platformUrl.searchParams.get('open')==='platform','C: landed on the desktop index with open=platform');
 await new Promise(r=>frame.contentWindow.document.readyState==='complete'?r():frame.addEventListener('load',r,{once:true}));
 doc=frame.contentDocument;win=frame.contentWindow;
 await until(()=>doc.getElementById('platform-panel')&&doc.getElementById('platform-panel').hidden===false,600);
 check(doc.getElementById('home-content').hidden===true&&doc.getElementById('viewer-panel').hidden===true,'C: 03 is the panel shown, not Home or 01');
 check(doc.body.innerText.includes(NAME+'（改）'),'C: 03 shows the saved (edited) Character');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,body:doc?.body?.innerText.slice(-1500),href:frame?.contentWindow?.location?.href});document.getElementById('report').dataset.status='FAIL';}
</script>`;
  const stub = "<script>window.__TAURI__={__stub:true,core:{invoke:async(command)=>{if(command==='save_workspace_character'){try{localStorage.setItem('__eh_saves',String(Number(localStorage.getItem('__eh_saves')||0)+1));}catch{}return 'C:/ws/characters/x/character.json';}if(command==='get_runtime_state'||command==='runtime_state')return{workspace:'C:/ws',first_run:false,app_version:'0.1.0-beta.3'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};return null;}}};</script>";
  const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/__eh__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
      const requested = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(DIST, requested);
      if (!file.startsWith(DIST + path.sep)) throw new Error("outside dist");
      let body = await readFile(file);
      // The host stub must precede the page's own scripts (the editor reads window.__TAURI__ at load).
      if (url.searchParams.get("stub") === "1" && file.endsWith(".html")) body = Buffer.from(body.toString("utf8").replace("<head>", `<head>${stub}`), "utf8");
      response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`); response.end(body);
    } catch { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const profile = await mkdtemp(path.join(tmpdir(), "saku-eh-browser-"));
  const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", stderr = "", socket; child.stderr.on("data", c => stderr += c); const pause = ms => new Promise(r => setTimeout(r, ms));
  try {
    let port = 0; for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
    if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__eh__`)}`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.onopen = r); let seq = 0; const pending = new Map();
    socket.onmessage = e => { const d = JSON.parse(e.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
    const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.send(JSON.stringify({ id, method, params })); });
    for (let i = 0; i < 900; i++) { const r = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true }); if (r.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: 'document.getElementById("report").textContent', returnByValue: true })).result.result.value; break; } await pause(100); }
  } finally { socket?.close(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
  const report = JSON.parse(output || '{"status":"NO_OUTPUT"}');
  if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
  for (const label of report.checks) cases.push(label);
}

console.log(`EDITOR_HANDOFF PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("TABS yaml/json/test/help (prompt → 03, Guild retired) / BUTTONS 03 open=platform + 04 desktop=builder / UNSAVED asks, saves via the same Save, never hands over silently");
