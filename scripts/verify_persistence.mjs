// Character Library persistence.
//
// The Library index lives in WebView2 Local Storage under %LOCALAPPDATA%, which
// the uninstaller removes when the Owner ticks the app-data checkbox. That store
// is the working index; the workspace is the durable record. This gate proves
// the durable path exists, that an emptied index is rebuilt from it, and that
// the destructive option says what it destroys.

import assert from "node:assert/strict";
import { readFile, stat, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
const read = async file => readFile(path.join(ROOT, file), "utf8");
const checks = [];
const check = (condition, name) => { assert.ok(condition, name); checks.push(name); };

// -- 1. the durable store exists in the host --------------------------------
const host = await read("src-tauri/src/main.rs");
check(host.includes("fn save_workspace_character"), "the host can write a Character to the workspace");
check(host.includes("fn list_workspace_characters"), "the host can enumerate durable Characters");
check(host.includes("list_workspace_characters,") && host.includes("save_workspace_character"), "both commands are registered");
check(host.includes('workspace.join("characters")'), "authored Characters are stored under <workspace>/characters");
check(host.includes('workspace.join("imports")'), "imported packages are stored under <workspace>/imports");
check(host.includes("CHARACTER_NOT_JSON_OBJECT"), "the durable store refuses a non-object payload");

// -- 2. the app mirrors and rebuilds ----------------------------------------
const app = await read("desktop/app.mjs");
check(app.includes("mirrorToWorkspace"), "the app mirrors Characters to the workspace");
check(app.includes("reconstructFromWorkspace"), "the app can rebuild the index from the workspace");
check(app.includes('if (Library.summary().total) return { status: "INDEX_NOT_EMPTY"'), "a populated index is never overwritten from disk");
check(app.includes("LIBRARY_RECOVERED_FROM_WORKSPACE"), "recovery is announced, not silent");
const builder = await read("tools/saku-builder.html");
check(builder.includes('await invoke("save_workspace_character"'), "the Builder Save action writes the current Character to the selected workspace");
check(builder.includes('window.SAKU_ACTIVE?.setActive(character, { source: "builder-save" })'), "a successful Builder Save makes the saved revision the clean Active SAKU");

// -- 3. uninstall paths -----------------------------------------------------
const nsi = await read("src-tauri/windows/installer.nsi");
const destructive = nsi.slice(nsi.indexOf("Delete app data if the checkbox is selected"));
check(/\$DeleteAppDataCheckboxState = 1/.test(destructive), "app data is removed only when the checkbox is ticked");
check(destructive.includes('RmDir /r "$LOCALAPPDATA\\${BUNDLEID}"') && destructive.includes('RmDir /r "$APPDATA\\${BUNDLEID}"'), "the destructive path removes both roots");
const unconditional = nsi.split("\n").filter(line => /RmDir \/r "\$(LOCAL)?APPDATA\\\$\{BUNDLEID\}"/.test(line));
check(unconditional.length === 2, `the only removals of the app-data roots are the two inside the checkbox branch (${unconditional.length})`);
const ja = /LangString deleteAppData \$\{LANG_JAPANESE\} "([^"]+)"/.exec(nsi)?.[1] || "";
const en = /LangString deleteAppData \$\{LANG_ENGLISH\} "([^"]+)"/.exec(nsi)?.[1] || "";
check(ja.includes("キャラクター一覧") && ja.includes("破壊的"), "the Japanese checkbox names the Character Library and says it is destructive");
check(en.includes("Character Library") && en.includes("DESTRUCTIVE"), "the English checkbox names the Character Library and says it is destructive");
check(ja.includes("workspace") && en.includes("workspace"), "both say the workspace folder is not deleted");

// -- 4. help matches the behaviour ------------------------------------------
const help = await read("desktop/help/index.html");
check(help.includes("com.wi-t.saku-builder"), "help names the removable location");
check(help.includes("破壊的"), "help says the checkbox is destructive");
check(help.includes("characters") && help.includes("imports"), "help names the durable workspace locations");
const started = await read("desktop/help/getting-started.html");
check(started.includes("復元"), "getting started says the Library can be restored from the workspace");

// -- 5. the rebuild actually runs, in a browser -----------------------------
const candidates = [process.env.SAKU_CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].filter(Boolean);
let chrome = "";
for (const candidate of candidates) { try { if ((await stat(candidate)).isFile()) { chrome = candidate; break; } } catch { /* next */ } }
if (!chrome) { console.error("PERSISTENCE NOT_AVAILABLE / CHROME_NOT_FOUND"); process.exit(2); }

// A Character the adopted schema accepts: the workspace rebuild admits through
// the adopted schema (2026-09-23), as every intake route does. It is a shipped
// sample with its identity changed, so what this gate asks is unchanged.
const character = JSON.parse(await read("tools/unified-v1/sample-pack/sample-characters.json")).characters[0];
character.identity = { ...character.identity, character_id: "persistence-probe", character_revision: "1.0.0", display_name: "永続性確認用" };

const mime = new Map([[".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"]]);

const EMPTY_LIBRARY = JSON.stringify({ version: 1, entries: [] });
const harness = [
  '<!doctype html><meta charset="utf-8"><title>PERSIST</title>',
  '<pre id="r" data-status="RUNNING"></pre>',
  '<script type="module">',
  'const r=document.getElementById("r");const out=[];',
  'const check=(c,n)=>{ if(!c) throw new Error(n); out.push(n); };',
  'const wait=ms=>new Promise(x=>setTimeout(x,ms));',
  `const CHAR=${JSON.stringify(character)};`,
  `const EMPTY=${JSON.stringify(EMPTY_LIBRARY)};`,
  'const lib=()=>JSON.parse(localStorage.getItem("saku.workspace.library")||EMPTY).entries;',
  'try{',
  '  localStorage.clear();',
  '  const f=document.createElement("iframe");',
  '  f.style.cssText="width:1400px;height:950px;border:0";',
  '  f.src="/index.html";',
  '  document.body.append(f);',
  '  await new Promise(res=>f.addEventListener("load",res,{once:true}));',
  '  const w=f.contentWindow,d=f.contentDocument;',
  '  const saved=[];',
  '  w.__TAURI__={core:{invoke:async(name,args)=>{',
  '    if(name==="list_workspace_characters") return {status:"OK",workspace:"C:/ws",artifacts:[',
  '      {origin:"AUTHORED",path:"C:/ws/characters/persistence-probe",payload_json:JSON.stringify(CHAR),schema_id:"",schema_version:""}',
  '    ],unreadable:[]};',
  '    if(name==="save_workspace_character"){ saved.push(args); return "C:/ws/characters/x/character.json"; }',
  '    if(name==="get_runtime_state") return {app_version:"0.1.0",install_dir:"",config_dir:"",log_dir:"",cache_dir:"",workspace:"C:/ws",first_run:false,code_signing:"UNSIGNED"};',
  '    if(name==="get_startup_route") return "DEFAULT";',
  '    throw new Error("UNSUPPORTED_"+name);',
  '  }}};',
  '  check(lib().length===0,"the removable index starts empty, as after a destructive uninstall");',
  '  d.getElementById("view-characters").click();',
  '  await wait(1400);',
  '  const entries=lib();',
  '  check(entries.length===1,"the Character was rebuilt from the workspace ("+entries.length+")");',
  '  check(entries[0].character.identity.character_id==="persistence-probe","the rebuilt Character is the one the workspace held");',
  '  check(entries[0].source==="WORKSPACE_RECOVERY","the rebuilt entry is labelled as recovered, not as a fresh import");',
  '  check(d.body.textContent.includes("復元"),"the recovery is announced on screen");',
  '  check(d.getElementById("viewer-results").textContent.includes("永続性確認用"),"the recovered Character is discoverable in the list");',
  '  d.getElementById("viewer-back").click(); await wait(200);',
  '  d.getElementById("view-characters").click(); await wait(1000);',
  '  check(lib().length===1,"a populated index is not rebuilt over ("+lib().length+")");',
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
const profile = await mkdtemp(path.join(tmpdir(), "saku-persist-"));
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${profile}`, "--virtual-time-budget=15000", "--dump-dom", `http://127.0.0.1:${port}/__harness`], { stdio: ["ignore", "pipe", "pipe"] });
let dom = "";
child.stdout.on("data", chunk => { dom += chunk; });
await new Promise(resolve => child.on("close", resolve));
server.close();
await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));

const status = /data-status="([A-Z]+)"/.exec(dom)?.[1] || "UNKNOWN";
const body = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
let failure = "";
for (const line of body.split("\n").filter(Boolean)) { if (line.startsWith("FAIL")) failure = line; else checks.push(line); }
for (const name of checks) console.log(`  PASS ${name}`);
if (status !== "PASS") { console.error(`  ${failure}`); console.error(`PERSISTENCE FAIL (${status})`); process.exit(1); }

console.log(`PERSISTENCE PASS ${checks.length}/${checks.length}`);
console.log("CHARACTER_LIBRARY_SOURCE_OF_TRUTH WORKSPACE_DURABLE_RECORD / LOCALAPPDATA_WORKING_INDEX");
