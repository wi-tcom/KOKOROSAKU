// Package-route formats gate (Owner instruction 2026-09-21, via 統制卓):
//   1. the two-file Builder package (.witpkg / wit-package.json + payload.json)
//      is retired — no intake, no output, no wording that offers it;
//   2. the AMU Character File (.amupkg, KOKOROAMU-STUDIO PR #68/#69) is
//      recognised by its own declared strings and answered with "use AMU Studio
//      の『SAKU へ戻す』", never read as a SAKU pack;
//   3. a bare Character JSON/YAML on the package route is pointed at 個別インポート;
//   4. the host imports only packs of the active Unified V1 schema.
//
// Rust rules are checked by text here and by `cargo test` when RUN_CARGO=1.
// The real AMU files (C:/Users/Public/SAKU-verify, or SAKU_AMU_FIXTURES) are
// inspected when present. The desktop page is driven headless with a host stub
// for the two new refusals.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const cases = [];
const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };

// Pinned AMU strings (KOKOROAMU-STUDIO specification/constants.js, PR #68 7c1e24e).
const AMU = { package_type: "WIT_PACKAGE", kind: "AMU_CHARACTER", schema: "AMU-CHARACTER/3.0.0", extension: ".amupkg", return_schema: "AMU-SAKU-RETURN/1.0.0" };

// ── 1. Rust source rules ────────────────────────────────────────────────────
const mainRs = await read("src-tauri/src/main.rs");
for (const gone of ["MAX_WITPKG_ENTRIES", "struct PackageEnvelope", "fn parse_zip_package", "fn validate_package", "fn validate_schema_binding", "ParsedPackage::Envelope", "payload_encoding", "fn parse_package_envelope"]) {
  check(!mainRs.includes(gone), `FMT-RUST retired symbol absent: ${gone}`);
}
const witpkgLines = mainRs.split("\n").filter(line => /witpkg/i.test(line));
check(witpkgLines.length > 0 && witpkgLines.every(line => /retired|廃止|"witpkg"|old\.witpkg/.test(line)), `FMT-RUST every remaining "witpkg" mention is the retirement notice or its test (${witpkgLines.length} lines)`);
check(mainRs.includes(`const AMU_WIT_PACKAGE_TYPE: &str = "${AMU.package_type}";`) && mainRs.includes(`const AMU_CHARACTER_KIND: &str = "${AMU.kind}";`) && mainRs.includes(`const AMU_CHARACTER_SCHEMA_PREFIX: &str = "AMU-CHARACTER/";`), "FMT-RUST AMU marker strings pinned exactly");
check(mainRs.includes("package_type == AMU_WIT_PACKAGE_TYPE && (kind == AMU_CHARACTER_KIND || schema.starts_with(AMU_CHARACTER_SCHEMA_PREFIX))"), "FMT-RUST AMU file decided by package_type + kind (schema prefix as hedge)");
check(mainRs.includes('"PACKAGE_FORMAT_AMU_CHARACTER_FILE"') && mainRs.includes("AMU Studio の「この編集内容を SAKU へ戻す」"), "FMT-RUST AMU file → PACKAGE_FORMAT_AMU_CHARACTER_FILE with the AMU Studio pointer");
check(mainRs.includes("fn peek_root_wit_package") && mainRs.includes("peek_only: true"), "FMT-RUST mixed-root archives are classified by a peek-only read, never imported from it");
check(mainRs.includes('"PACKAGE_FORMAT_INDIVIDUAL_FILE"') && mainRs.includes("Character JSON／YAML は「個別インポート」から読み込んでください"), "FMT-RUST bare Character file → PACKAGE_FORMAT_INDIVIDUAL_FILE pointing at 個別インポート");
check(mainRs.includes("旧 Builder パッケージ（.witpkg: wit-package.json と payload.json）は 2026-09-21 に廃止され"), "FMT-RUST retired Builder package is named as retired");
check(mainRs.includes('.add_filter("SAKU Character Pack (.zip)", &["zip"])'), "FMT-RUST file dialog offers .zip only");
check(mainRs.includes('"CHARACTER_PACK_SCHEMA_UNSUPPORTED"') && mainRs.includes('const ACTIVE_SCHEMA_ID: &str = "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE";'), "FMT-RUST packs of another schema are refused before anything is written");
check(mainRs.includes('受け付ける形式: SAKU Character Pack（character-pack.json を含む署名付き ZIP）'), "FMT-RUST accepted formats text names the pack only");
check(mainRs.includes('import_dir.join("wit-package.json")') || mainRs.includes('join("wit-package.json")'), "FMT-RUST workspace imports/<dir>/wit-package.json record is kept (existing β.2 imports stay readable)");
{
  const start = mainRs.indexOf("fn import_package(");
  const next = Math.min(...["fn import_saku_return(", "fn import_character_pack("].map(name => mainRs.indexOf(name)).filter(index => index > start));
  const body = mainRs.slice(start, next);
  check(!/fs::(write|create_dir_all)|payload_json\.as_bytes\(\)/.test(body) && body.includes("import_character_pack(app, pack, source_path)"), "FMT-RUST import_package writes nothing itself; packs go through import_character_pack");
}
if (process.env.RUN_CARGO === "1") {
  const result = spawnSync("cargo", ["test", "--release"], { cwd: path.join(ROOT, "src-tauri"), encoding: "utf8", env: { ...process.env, RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || "1.97.1" }, windowsHide: true });
  check(result.status === 0 && /test result: ok\. \d+ passed; 0 failed/.test(result.stdout), `FMT-RUST cargo test passes (${(result.stdout.match(/test result: ok\. (\d+) passed/) || [])[1] || "?"} tests)`);
} else skipped.push("FMT-RUST cargo test not run (set RUN_CARGO=1)");

// ── 2. page and texts ───────────────────────────────────────────────────────
const app = await read("desktop/app.mjs");
const index = await read("desktop/index.html");
const i18n = await read("desktop/i18n.mjs");
for (const [name, text] of [["desktop/app.mjs", app], ["desktop/index.html", index], ["desktop/i18n.mjs", i18n]]) check(!/witpkg/i.test(text), `FMT-PAGE ${name} carries no .witpkg wording`);
check(index.includes("SAKU Character Pack（`.zip`）をここへドロップ") && i18n.includes('"SAKU Character Pack（`.zip`）をここへドロップ":"Drop a SAKU Character Pack (`.zip`) here"'), "FMT-PAGE drop zone names the pack only (ja/en)");
check(app.includes('code === "PACKAGE_FORMAT_AMU_CHARACTER_FILE" || code === "PACKAGE_FORMAT_INDIVIDUAL_FILE"'), "FMT-PAGE importRecovery passes the two new refusals through verbatim");
const handOff = app.slice(app.indexOf("function handOffImport("), app.indexOf("async function handOffCharacterPack("));
check(!handOff.includes("saku.desktop.pendingPack") && handOff.includes("PACKAGE_RESULT_UNEXPECTED"), "FMT-PAGE handOffImport has no envelope branch; a pack-less IMPORTED result is refused");
check(handOff.includes("if (result.pack) { handOffCharacterPack(result, characters, binding); return; }"), "FMT-PAGE pack route unchanged");
for (const rel of ["tools", "desktop"]) {
  const hits = spawnSync("git", ["grep", "-il", "witpkg", "--", rel], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  check(hits === "", `FMT-PAGE no tracked file under ${rel}/ mentions witpkg`);
}
const hostDoc = await read("docs/desktop-host-candidate.md");
check(/retired|廃止/i.test(hostDoc) && hostDoc.includes("AMU Character File"), "FMT-DOCS desktop-host-candidate.md marks the WIT package candidate retired and names the AMU file");

// ── 3. real AMU files when present ──────────────────────────────────────────
function unzip(buffer) {
  const out = new Map();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
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
const FIXTURES = process.env.SAKU_AMU_FIXTURES || "C:/Users/Public/SAKU-verify";
const amupkg = path.join(FIXTURES, "aimi-meguru.amupkg");
if (existsSync(amupkg)) {
  const entries = unzip(readFileSync(amupkg));
  const wit = JSON.parse(entries.get("wit-package.json").toString("utf8"));
  equal(wit.package_type, AMU.package_type, "FMT-AMU real .amupkg package_type");
  equal(wit.kind, AMU.kind, "FMT-AMU real .amupkg kind");
  equal(wit.schema, AMU.schema, "FMT-AMU real .amupkg schema");
  check([...entries.keys()].some(name => name.startsWith("pack/") && name.endsWith(".zip")) && [...entries.keys()].some(name => /^characters\/[^/]+\/instance\.json$/.test(name)), "FMT-AMU real .amupkg has the mixed root the pack layout rules refuse (pack/ + characters/)");
  check(!entries.has("character-pack.json") && ![...entries.keys()].some(name => name.endsWith("/character-pack.json")), "FMT-AMU real .amupkg carries no character-pack.json at any level → never a SAKU pack");
} else skipped.push(`FMT-AMU real .amupkg not present at ${amupkg}`);
const sakuReturn = path.join(FIXTURES, "aimi-meguru.saku-return.zip");
if (existsSync(sakuReturn)) {
  const entries = unzip(readFileSync(sakuReturn));
  const request = JSON.parse(entries.get("edit-request.json").toString("utf8"));
  equal(request.schema, AMU.return_schema, "FMT-AMU real .saku-return.zip edit-request schema (PR-B input, recorded here)");
  check(entries.has("character.json") && entries.has("portable-manifest.json") && !entries.has("wit-package.json"), "FMT-AMU real .saku-return.zip has no wit-package.json → not mistaken for the AMU file or the retired package");
} else skipped.push(`FMT-AMU real .saku-return.zip not present at ${sakuReturn}`);

// ── 4. browser: the two refusals reach the screen ───────────────────────────
{
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!existsSync(chrome)) skipped.push("FMT-UI Chrome not found");
  else if (!existsSync(path.join(ROOT, ".desktop-dist/index.html"))) skipped.push("FMT-UI .desktop-dist not prepared (run desktop:prepare)");
  else {
    const results = {
      amu: { status: "UNSUPPORTED", code: "PACKAGE_FORMAT_AMU_CHARACTER_FILE", reason: "これは AMU Character File（.amupkg）です。SAKU Builder では開けません。SAKU へ戻すには AMU Studio の「この編集内容を SAKU へ戻す」を使い、できた .saku-return.zip を読み込んでください。", source_path: "C:/x/aimi-meguru.amupkg" },
      individual: { status: "INVALID", code: "PACKAGE_FORMAT_INDIVIDUAL_FILE", reason: "Character JSON／YAML は「個別インポート」から読み込んでください。 受け付ける形式: SAKU Character Pack（character-pack.json を含む署名付き ZIP）。", source_path: "C:/x/hero.json" },
    };
    const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
let frame,doc,win;
try{
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/__desktop_stub__/index.html?stay=1&open=select';
 document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;
 check(win.__TAURI__&&win.__TAURI__.__stub===true,'FMT-UI host stub installed before app.mjs');
 await until(()=>doc.getElementById('viewer-import-package'));
 check(doc.getElementById('drop-zone').textContent.includes('SAKU Character Pack'),'FMT-UI drop zone names the pack');
 check(!/witpkg/i.test(doc.documentElement.outerHTML),'FMT-UI no .witpkg wording on the page');
 win.__FMT_MODE__='amu';doc.getElementById('viewer-import-package').click();
 await until(()=>doc.getElementById('viewer-status').innerText.includes('PACKAGE_FORMAT_AMU_CHARACTER_FILE'));
 const amu=doc.getElementById('viewer-status').innerText;
 check(amu.includes('AMU Studio')&&amu.includes('SAKU へ戻す'),'FMT-UI .amupkg refusal tells the user to use AMU Studio の「SAKU へ戻す」');
 const stored=JSON.parse(win.localStorage.getItem('saku.workspace.library')||'{}');check(((stored.entries||[]).length)===0,'FMT-UI nothing enters the Library from an .amupkg');
 win.__FMT_MODE__='individual';doc.getElementById('viewer-import-package').click();
 await until(()=>doc.getElementById('viewer-status').innerText.includes('PACKAGE_FORMAT_INDIVIDUAL_FILE'));
 check(doc.getElementById('viewer-status').innerText.includes('個別インポート'),'FMT-UI bare JSON refusal points at 個別インポート');
 const history=JSON.parse(win.localStorage.getItem('saku.workspace.importHistory')||'[]');
 check(history.filter(h=>h.kind==='PACKAGE'&&['PACKAGE_FORMAT_AMU_CHARACTER_FILE','PACKAGE_FORMAT_INDIVIDUAL_FILE'].includes(h.code)).length===2,'FMT-UI both refusals are recorded in import history');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2000)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__fmt__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
        if (url.pathname === "/__desktop_stub__/index.html") {
          const html = await readFile(path.join(ROOT, ".desktop-dist/index.html"), "utf8");
          const stub = ["<script>", `window.__FMT_RESULTS__=${JSON.stringify(results)};window.__FMT_MODE__='amu';`,
            "window.__TAURI__={__stub:true,core:{invoke:async(command)=>{",
            "if(command==='choose_and_import_package'||command==='import_package_path')return structuredClone(window.__FMT_RESULTS__[window.__FMT_MODE__]);",
            "if(command==='save_workspace_character')return{status:'SAVED'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};",
            "if(command==='runtime_state')return{workspace:'C:/ws',app_version:'0.1.0-beta.2',first_run:false};return null;}}};window.confirm=()=>true;try{localStorage.clear();}catch{}",
            "</script>"].join("");
          response.setHeader("Content-Type", "text/html;charset=utf-8");
          response.end(html.replace("<script>", `${stub}<script>`).replace(/(href|src)="\.\//g, '$1="/.desktop-dist/'));
          return;
        }
        const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
        if (!file.startsWith(ROOT + path.sep)) throw new Error("outside root");
        response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`);
        response.end(await readFile(file));
      } catch { response.statusCode = 404; response.end("not found"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "saku-fmt-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let stderr = ""; let socket;
    child.stderr.on("data", chunk => stderr += chunk);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let port = 0;
      for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__fmt__`)}`, { method: "PUT" })).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise(resolve => socket.onopen = resolve);
      let sequence = 0; const pending = new Map();
      socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } };
      const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
      for (let i = 0; i < 600; i++) {
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

console.log(`PACKAGE_FORMATS PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("WITPKG RETIRED / AMU_CHARACTER_FILE → AMU Studio / INDIVIDUAL_FILE → 個別インポート / PACK_SCHEMA active Unified V1 only");
