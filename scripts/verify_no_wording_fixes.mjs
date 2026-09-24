// Defects fixed without new wording (Owner 2026-09-24 「新しい文言が要らない
// 不具合を改修してください」; found in the 2026-09-23 overall check and the β.6
// hands-on check).
//
//   D1 opening a Character in 02 marked it 「未保存の変更あり」 with nothing
//      edited: the draft (form shape) was compared with the opened Character
//      (Unified shape), which never match
//   D2 the pack's 「理由」 row said the signature was not verified while the
//      detail row said 署名検証 PASS: the row kept the host's sentence after
//      the page had verified the signature
//   D3 03 「コピーする」 could be pressed with nothing to copy, and did nothing
//   D4 the fifteen axis selects in 02 listed internal codes (STUDY_LAMP …)
//      although the field guide names every option
//   D5 the editor's status line named fields the screen does not have (slug,
//      活動分野)
//   D6 「このキャラクターを選択する」 said so only at the top of the page
//   D7 two revisions of one Character looked the same in the action dialog
//   D8 04 Trainer admitted Characters on the hand checks alone
//   D9 a verify script opened a page retired on 2026-09-14 and always failed
//   D10 02 opened from a Character just selected in 01 showed a blank form: the
//      Unified API was installed after the restore, which then read the
//      Character as the old form (found while fixing D1)
//
// No new wording: every text shown comes from an existing, reviewed source
// (the field guide, the semantic registry, signatureStateText, the record's
// own revision).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");
const body = (text, name) => text.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0] || "";
const sample = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json")).characters[0];

// ── D1 in Node: the dirty test compares like with like ──────────────────────
{
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const Active = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/active-saku.mjs")).href);
  Active.setActive(sample, { source: "gate" });
  const formShape = { meta: { name: sample.identity.display_name, slug: sample.identity.character_id }, identity: { ...sample.identity }, unified: { note: "form shape" } };
  Active.updateDraft(formShape, { openedShape: formShape });
  equal(Active.isDirty(), false, "D1: a draft identical to what was opened is not an unsaved change (form shape against form shape)");
  Active.updateDraft({ ...formShape, meta: { ...formShape.meta, name: "変えた" } }, { openedShape: { other: true } });
  equal(Active.isDirty(), true, "D1: an edit is an unsaved change — and the shape recorded at opening is kept, not replaced by a later call");
  Active.updateDraft(formShape, { openedShape: { other: true } });
  equal(Active.isDirty(), false, "D1: undoing the edit brings it back to not dirty");
  const reordered = Object.fromEntries(Object.entries(formShape).reverse());
  Active.updateDraft(reordered);
  equal(Active.isDirty(), false, "D1: key order is not a change");
  Active.setActive(sample, { source: "gate" });
  Active.updateDraft({ ...sample, identity: { ...sample.identity, display_name: "別名" } });
  equal(Active.isDirty(), true, "D1: a draft written without an opened shape (Trainer apply) is still compared with the opened Character");
  const html = read("tools/saku-builder.html");
  const publish = body(html, "publishWorkingCharacter");
  check(/openedShape/.test(publish), "D1: the editor passes the shape it opened with when it writes the draft");
}

// ── D2 source ───────────────────────────────────────────────────────────────
{
  const app = read("desktop/app.mjs");
  const pack = body(app, "handOffCharacterPack");
  check(pack.includes("HOST_SIGNATURE_NOT_VERIFIED") && pack.includes("signatureStateText("), "D2: after the page verifies the signature, the host's 'not verified here' sentence is replaced by the page's result");
  check(read("src-tauri/src/main.rs").includes("署名（Ed25519）はこのホストでは未検証です。"), "D2: the host still says what it did (it does not verify signatures) — the page states what it verified");
}

// ── D5 / D8 / D9 source ─────────────────────────────────────────────────────
{
  const html = read("tools/saku-builder.html");
  const validate = body(html, "validate");
  check(!/miss\.push\("slug|miss\.push\("活動分野"\)/.test(validate), "D5: the editor's check no longer names slug or 活動分野");
  check(/fieldLabel\("identity\.character_id"/.test(validate) && /fieldLabel\("character_core\.character_role"/.test(validate), "D5: it names the fields by the labels the screen shows (semantic registry)");
  const trainer = read("tools/unified-v1/trainer-ux4-ui.mjs");
  check(/loadAdoptedSchema/.test(trainer) && /validateCompleteAdoptedCharacter/.test(trainer), "D8: 04 Trainer reads the adopted schema and validates against it");
  check(!/if\(validateUnifiedV1\(entry\.character\)\.ok\)/.test(trainer) && !/character&&!validateUnifiedV1\(character\)\.ok/.test(trainer), "D8: …and no longer admits on the hand checks alone");
  check(!existsSync(path.join(ROOT, "scripts/verify_trainer_ux3_browser.mjs")), "D9: the script that opened the retired UX3 page is gone");
}

// ── browser: D1 D2 D3 D4 D5 D6 D7 on the real pages ─────────────────────────
{
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const dist = path.join(ROOT, ".desktop-dist");
  const pairs = ["desktop/app.mjs:app.mjs", "tools/saku-builder.html:tools/saku-builder.html", "tools/v1/frozen-ia-ui.mjs:tools/v1/frozen-ia-ui.mjs", "tools/unified-v1/active-saku.mjs:tools/unified-v1/active-saku.mjs"];
  const stale = pairs.map(p => p.split(":")).filter(([src, out]) => !existsSync(path.join(dist, out)) || read(src) !== readFileSync(path.join(dist, out), "utf8")).map(([src]) => src);
  const PACKS = process.env.SAKU_PACK_FIXTURES || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
  const supportZip = path.join(PACKS, "saku-pack-support-1.0.0-beta.zip");
  if (!existsSync(chrome)) skipped.push("browser: Chrome not found");
  else if (!existsSync(supportZip)) skipped.push("browser: sold support pack fixture absent");
  else {
    equal(stale.join(", "), "", "browser: .desktop-dist carries this branch's pages (run desktop:prepare)");
    const { readFile, rm } = await import("node:fs/promises");
    function unzip(buffer) {
      const out = new Map(); const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (eocd < 0) return out;
      const count = buffer.readUInt16LE(eocd + 10); let offset = buffer.readUInt32LE(eocd + 16);
      for (let i = 0; i < count; i += 1) {
        const method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32);
        const local = buffer.readUInt32LE(offset + 42); const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
        const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28);
        const data = buffer.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + compressed);
        out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data)); offset += 46 + nameLength + extraLength + commentLength;
      }
      return out;
    }
    const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
    const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    const unsignedDigest = manifest => { const copy = structuredClone(manifest); delete copy.package.digest; delete copy.package.signature; return `sha-256:${sha256(canonical(copy))}`; };
    const archive = unzip(readFileSync(supportZip)); const prefix = `${[...archive.keys()][0].split("/")[0]}/`;
    const pack = JSON.parse(archive.get(`${prefix}character-pack.json`).toString()); const catalog = JSON.parse(archive.get(`${prefix}catalog-release.v1.json`).toString());
    const entries = []; const characters = [];
    for (const entry of pack.entries) {
      const inner = unzip(archive.get(`${prefix}${entry.file}`)); const manifest = JSON.parse(inner.get("portable-manifest.json").toString());
      characters.push(JSON.parse(inner.get("character.json").toString()));
      entries.push({ slug: entry.slug, character_id: entry.characterId, display_name: entry.displayName, source_version: entry.sourceVersion, operation_class: entry.operationClass, file: entry.file, archive_digest: entry.archiveDigest, package_digest: entry.packageDigest, character_digest: entry.characterDigest, publisher_key_id: manifest.package.publisherKeyId, signature: manifest.package.signature, manifest_digest_recomputed: unsignedDigest(manifest) === manifest.package.digest, schema_id: manifest.source.schema.schemaId, schema_version: manifest.source.schema.schemaVersion });
    }
    const payload_json = JSON.stringify({ characters });
    const hostReason = `SAKU Character Pack ${pack.pack.id} ${pack.pack.version}: ${entries.length} 体の digest 整合（SHA256SUMS・archive・files・catalog release・manifest digest）を確認しました。署名（Ed25519）はこのホストでは未検証です。`;
    const hostResult = {
      status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", reason: hostReason, source_path: "saku-pack-support-1.0.0-beta.zip", imported_path: "<workspace>/imports/saku-pack-support", payload_json,
      manifest: { package_type: "kokorosaku-character-pack", product: pack.pack.id, package_version: pack.pack.version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, minimum_app_version: "0.1.0-beta.1", content_type: "CHARACTER_PACK", distribution_channel: "STORE", license_state: "BUNDLED_LICENSE_MD", payload_hash: sha256(payload_json) },
      pack: { format: "kokorosaku-character-pack", pack_id: pack.pack.id, pack_version: pack.pack.version, created_at: pack.pack.createdAt, character_count: entries.length, catalog_id: catalog.catalog_id, catalog_release_version: catalog.release_version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, pack_publisher_key_id: pack.package.publisherKeyId, pack_manifest_digest: pack.package.digest, pack_signature: pack.package.signature, pack_manifest_digest_recomputed: unsignedDigest(pack) === pack.package.digest, sha256sums_verified: archive.size - 1, digest_state: "SHA256_BINDINGS_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", entries },
    };
    // Two revisions of one Character, for D7.
    const r1 = structuredClone(sample); r1.identity.character_revision = "1.0.0";
    const r2 = structuredClone(sample); r2.identity.character_revision = "1.1.0";
    const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<1500;i++){if(fn())return;await wait(20);}throw new Error('TIMEOUT');};
const R1=${JSON.stringify(JSON.stringify(r1))},R2=${JSON.stringify(JSON.stringify(r2))},SAMPLE=${JSON.stringify(JSON.stringify(sample))};
let frame,doc,win;
const load=async src=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:900px';frame.src=src;document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;};
try{
 localStorage.clear();
 // D3: 03 with nothing selected
 await load('/__desktop_stub__/index.html?stay=1&open=platform');
 await until(()=>doc.getElementById('platform-copy'));
 await wait(300);
 check(doc.getElementById('platform-copy').disabled===true,'D3 with no Character selected, 03 「コピーする」 cannot be pressed');
 // D2: pack route
 await load('/__desktop_stub__/index.html?stay=1&open=select');
 await until(()=>doc.getElementById('viewer-import-package'));
 doc.getElementById('viewer-import-package').click();
 await until(()=>/件を一覧に追加しました/.test(doc.getElementById('viewer-status').innerText));
 const reasonText=doc.body.innerText;
 check(!reasonText.includes('このホストでは未検証'),'D2 the 理由 row no longer says the signature is unverified after the page verified it');
 check(/署名検証 PASS（発行者 fingerprint/.test(reasonText),'D2 …it says what the page verified (the same words as the detail row)');
 // D7 + D6: two revisions, select from the bottom of the list
 await win.__saku_home.importCharacterFiles([new File([R1],'r1.json',{type:'application/json'}),new File([R2],'r2.json',{type:'application/json'})]);
 await until(()=>/件を一覧に追加しました/.test(doc.getElementById('viewer-status').innerText));
 const cards=[...doc.querySelectorAll('#viewer-results [data-open-id]')].filter(el=>(el.closest('li,article,tr,.catalog-card')||el).textContent.includes(${JSON.stringify(sample.identity.display_name)}));
 check(cards.length>=2,'D7 fixture: two revisions of one Character are listed ('+cards.length+')');
 const last=cards[cards.length-1];last.scrollIntoView({block:'end'});frame.contentWindow.scrollTo(0,doc.body.scrollHeight);await wait(100);
 last.click();
 await until(()=>doc.getElementById('character-actions').open);
 const title=doc.getElementById('character-actions-title').textContent;
 check(/1\\.[01]\\.0/.test(title),'D7 the dialog names the revision ('+title+')');
 doc.querySelector('#character-actions [data-character-action="view"]').click();
 await until(()=>/を選択しました/.test(doc.getElementById('viewer-status').innerText));
 await wait(700);
 const rect=doc.getElementById('viewer-status').getBoundingClientRect();
 check(rect.top>=0&&rect.bottom<=frame.contentWindow.innerHeight,'D6 the selection notice is on screen, not only at the top of the page ('+Math.round(rect.top)+')');
 // D1 D4 D5: the editor
 localStorage.clear();
 localStorage.setItem('saku.workspace.active',JSON.stringify({character:JSON.parse(SAMPLE),identity:{character_id:JSON.parse(SAMPLE).identity.character_id},source:'gate',opened_at:new Date().toISOString()}));
 await load('/.desktop-dist/tools/saku-builder.html?desktop=app');
 await until(()=>doc.querySelector('select[data-path="unified.axes.a_motif"]'));
 await wait(1500);
 const nameField=doc.querySelector('.registry-field[data-canonical-path="identity.display_name"] input');
 check(nameField&&nameField.value===JSON.parse(SAMPLE).identity.display_name,'D10 02 opened from a Character selected in 01 shows that Character, not a blank form ('+(nameField&&nameField.value)+')');
 const Active=await import('/.desktop-dist/tools/unified-v1/active-saku.mjs');
 // Make the screen write its draft without changing anything (the same value, re-entered).
 nameField.dispatchEvent(new Event('input',{bubbles:true}));nameField.dispatchEvent(new Event('change',{bubbles:true}));
 await until(()=>localStorage.getItem('saku.workspace.draft'));
 check(Boolean(localStorage.getItem('saku.workspace.draft')),'D1 fixture: the screen has written its draft (the check below is not about an absent draft)');
 check(Active.isDirty()===false,'D1 opening a Character in 02 and editing nothing is not an unsaved change');
 const motif=doc.querySelector('select[data-path="unified.axes.a_motif"]');
 const texts=[...motif.options].map(o=>o.text);
 check(texts.includes('書斎の灯り')&&!texts.includes('STUDY_LAMP'),'D4 the axis options are named as the field guide names them ('+texts.join(' | ')+')');
 check([...motif.options].map(o=>o.value).includes('STUDY_LAMP'),'D4 …the values stored are unchanged');
 // A re-render (as a language switch does) keeps the names: the render itself names the options.
 win.SAKU_FROZEN_IA.refresh();await wait(200);
 const again=[...doc.querySelector('select[data-path="unified.axes.a_motif"]').options].map(o=>o.text);
 check(again.includes('書斎の灯り')&&!again.includes('STUDY_LAMP'),'D4 …and still after the screen is drawn again ('+again.join(' | ')+')');
 const pause=[...doc.querySelector('select[data-path="unified.axes.i_thinking_pause_ms"]').options].map(o=>o.text);
 check(pause.some(t=>/ミリ秒/.test(t)),'D4 the numeric axes carry their unit ('+pause.join(' | ')+')');
 const input=doc.querySelector('.registry-field[data-canonical-path="identity.display_name"] input');check(Boolean(input),'D1 fixture: the Character名 field on the screen');
 input.value=input.value+'（変更）';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
 await until(()=>Active.isDirty()===true);
 check(Active.isDirty()===true,'D1 an actual edit is an unsaved change');
 // D5: an empty form names today's fields
 localStorage.clear();
 await load('/.desktop-dist/tools/saku-builder.html?desktop=new');
 await until(()=>doc.getElementById('statusText')&&/validation/.test(doc.getElementById('statusText').textContent));
 await wait(800);
 const status=doc.getElementById('statusText').textContent;
 check(!/slug|活動分野/.test(status),'D5 the status line does not name slug or 活動分野 ('+status+')');
 check(/Character ID/.test(status)&&/このCharacterが担う役割/.test(status),'D5 …it names Character ID and このCharacterが担う役割, as the screen does');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body?.innerText?.slice(-1500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
    const stub = [
      "<script>",
      `window.__FIX_RESULT__=${JSON.stringify(hostResult)};`,
      "window.__TAURI__={__stub:true,core:{invoke:async(command)=>{",
      "if(command==='choose_and_import_package'||command==='import_package_path')return structuredClone(window.__FIX_RESULT__);",
      "if(command==='save_workspace_character')return'C:/ws/characters/x/character.json';",
      "if(command==='list_workspace_characters')return{status:'OK',workspace:'C:/ws',artifacts:[]};",
      "if(command==='read_workspace_state')return{status:'OK',workspace:'C:/ws',writable:true,keys:{}};",
      "if(command==='write_workspace_state')return null;",
      "if(command==='get_runtime_state')return{workspace:'C:/ws',workspace_writable:true,app_version:'0.1.0-beta.6',first_run:false};",
      "if(command==='get_startup_route')return'DEFAULT';",
      "return null;}}};window.confirm=()=>true;",
      "</script>",
    ].join("");
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__fix__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
        if (url.pathname === "/__desktop_stub__/index.html") {
          const html = await readFile(path.join(dist, "index.html"), "utf8");
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
    const profile = mkdtempSync(path.join(tmpdir(), "saku-fix-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let stderr = ""; let socket;
    child.stderr.on("data", chunk => stderr += chunk);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let port = 0;
      for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__fix__`)}`, { method: "PUT" })).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise(resolve => socket.onopen = resolve);
      let sequence = 0; const pending = new Map();
      socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } };
      const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
      for (let i = 0; i < 1500; i++) {
        const result = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true });
        if (result.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value; break; }
        await pause(100);
      }
      if (!output) output = (await call("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true })).result.result.value;
    } finally {
      socket?.close(); child.kill();
      await new Promise(resolve => child.exitCode !== null ? resolve() : child.once("exit", resolve));
      server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));
    }
    const match = output.match(/<pre id="report" data-status="(PASS|FAIL)">([\s\S]*?)<\/pre>/);
    if (!match) { console.error(output.slice(0, 2000), stderr.slice(-1000)); process.exit(1); }
    const report = JSON.parse(match[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
    for (const label of report.checks) cases.push(label);
  }
}

console.log(JSON.stringify({ cases: cases.length, skipped }, null, 2));
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`NO_WORDING_FIXES PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped)` : ""}`);
