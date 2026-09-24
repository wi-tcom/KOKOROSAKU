// Locator repair tool gate (Owner 2026-09-22: 「キャラクターは手元にあるので修復ツールを用意」).
//
//   1. module: repairLocators re-points only locators, bumps the revision,
//      records before/after digests; unresolvable refs are reported, not hidden
//   2. CLI tools/v1/relocate-locators.mjs: dry-run writes nothing; --out writes
//      the repaired JSON + a sidecar record; a second run is a no-op; a file
//      with an unresolvable ref exits 1 and is not written; YAML in → JSON out
//   3. headless Chrome: the desktop 個別インポート of a shifted Character is
//      refused with the repair button; the button imports it repaired
//      (provenance.locator_repair, new revision, detail row); the pack route
//      shows no repair button (signed content is never edited)
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = []; const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)?.slice(0, 200)})`); cases.push(label); };
const readJson = file => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const FIX = path.join(ROOT, "tests/fixtures/conformance-locators");
const R = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/locator-repair.mjs")).href);
const U = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/unified-schema-v1.mjs")).href);
const S = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/character-schema.mjs")).href);
// admit() asks the adopted schema too (2026-09-23); give it the one the application loads.
const { loadAdoptedSchemaFromRepository } = await import(pathToFileURL(path.join(ROOT, "tools/v1/adopted-schema-node.mjs")).href);
const adoptedSchema = loadAdoptedSchemaFromRepository();

// ── 1. module ───────────────────────────────────────────────────────────────
{
  const swapped = readJson(path.join(FIX, "swapped-hard-invariants.json"));
  const out = await R.repairLocators(swapped);
  equal(out.rewritten, 6, "MOD: swapped fixture — 6 locators rewritten");
  equal(out.remaining.length, 0, "MOD: swapped fixture — 0 remaining");
  equal(U.conformanceLocatorMismatches(out.character).length, 0, "MOD: repaired copy resolves");
  equal(S.admit(out.character, { schema: adoptedSchema }).accepted, true, "MOD: repaired copy is admitted");
  equal(out.to_revision !== out.from_revision, true, `MOD: revision bumped (${out.from_revision} → ${out.to_revision})`);
  const a = structuredClone(out.character), b = structuredClone(swapped);
  delete a.identity.character_revision; delete b.identity.character_revision;
  for (const list of [...Object.values(a.conformance_expectations), ...Object.values(b.conformance_expectations)]) for (const ref of list) delete ref.locator;
  equal(JSON.stringify(a), JSON.stringify(b), "MOD: nothing but locators and the revision changed");
  check(U.conformanceLocatorMismatches(swapped).length === 6, "MOD: the input object was not mutated");
  check(out.record.tool === R.REPAIR_TOOL && out.record.changes.length === 6 && out.record.changes.every(c => c.from !== c.to) && /^[0-9a-f]{64}$/.test(out.record.digest_before) && out.record.digest_before !== out.record.digest_after, "MOD: record carries tool, 6 from→to changes and before/after digests");
  const clean = readJson(path.join(FIX, "positive-sample.json"));
  const noop = await R.repairLocators(clean);
  equal(noop.rewritten, 0, "MOD: a correct Character is untouched");
  equal(noop.to_revision, noop.from_revision, "MOD: no revision bump when nothing was rewritten");
  const missing = readJson(path.join(FIX, "requirement-id-missing.json"));
  const bad = await R.repairLocators(missing);
  equal(bad.remaining.length, 1, "MOD: a ref without requirement_id stays unresolved and is reported");
  equal(bad.to_revision, bad.from_revision, "MOD: no bump when a mismatch remains");
  const noBump = await R.repairLocators(swapped, { bumpRevision: false });
  equal(noBump.to_revision, noBump.from_revision, "MOD: bumpRevision:false keeps the revision");
}

// ── 2. CLI ──────────────────────────────────────────────────────────────────
{
  const cli = path.join(ROOT, "tools/v1/relocate-locators.mjs");
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: ROOT, encoding: "utf8" });
  const tmp = mkdtempSync(path.join(tmpdir(), "saku-locator-cli-"));
  try {
    const original = readFileSync(path.join(FIX, "swapped-hard-invariants.json"));
    const dry = run(path.join(FIX, "swapped-hard-invariants.json"), path.join(FIX, "positive-sample.json"));
    equal(dry.status, 0, "CLI: dry-run exits 0 for repairable + clean inputs");
    check(/FIX .*swapped-hard-invariants\.json.*locator 6 件/.test(dry.stdout) && /OK .*positive-sample\.json/.test(dry.stdout) && /dry-run/.test(dry.stdout), "CLI: dry-run reports FIX (6) and OK and says nothing was written");
    check(readFileSync(path.join(FIX, "swapped-hard-invariants.json")).equals(original), "CLI: dry-run did not modify the input");
    const bad = run(path.join(FIX, "requirement-id-missing.json"));
    equal(bad.status, 1, "CLI: an unresolvable ref exits 1");
    check(/FAIL /.test(bad.stdout) && /残り/.test(bad.stdout), "CLI: the unresolvable ref is named");
    const outDir = path.join(tmp, "out");
    const write = run("--out", outDir, path.join(FIX, "swapped-hard-invariants.json"), path.join(FIX, "requirement-id-missing.json"));
    equal(write.status, 1, "CLI: --out with one unresolvable file exits 1 (the other is still written)");
    check(existsSync(path.join(outDir, "swapped-hard-invariants.json")) && existsSync(path.join(outDir, "swapped-hard-invariants.json.locator-repair.json")), "CLI: repaired JSON + sidecar record written");
    check(!existsSync(path.join(outDir, "requirement-id-missing.json")), "CLI: the unresolvable file was not written");
    const repaired = readJson(path.join(outDir, "swapped-hard-invariants.json"));
    equal(U.conformanceLocatorMismatches(repaired).length, 0, "CLI: written file resolves");
    equal(repaired.identity.character_revision, "1.1.0", "CLI: written file carries the bumped revision");
    const side = readJson(path.join(outDir, "swapped-hard-invariants.json.locator-repair.json"));
    check(side.repairs[0].rewritten === 6 && side.repairs[0].from_revision === "1.0.0-unified-v1-candidate" && side.repairs[0].to_revision === "1.1.0" && side.repairs[0].digest_before !== side.repairs[0].digest_after, "CLI: sidecar records rewritten count, revisions and digests");
    check(readFileSync(path.join(FIX, "swapped-hard-invariants.json")).equals(original), "CLI: --out left the source untouched");
    const again = run(path.join(outDir, "swapped-hard-invariants.json"));
    check(again.status === 0 && /OK /.test(again.stdout), "CLI: the repaired file is a no-op on a second run");
    // in-place --write with --no-bump on a temp copy
    const copy = path.join(tmp, "copy.json"); writeFileSync(copy, original);
    const inplace = run("--write", "--no-bump", copy);
    equal(inplace.status, 0, "CLI: --write --no-bump exits 0");
    const inplaceDoc = readJson(copy);
    check(U.conformanceLocatorMismatches(inplaceDoc).length === 0 && inplaceDoc.identity.character_revision === "1.0.0-unified-v1-candidate", "CLI: in-place write repaired locators and kept the revision (--no-bump)");
    // YAML in → JSON out
    const yaml = path.join(tmp, "y.yaml");
    const doc = readJson(path.join(FIX, "swapped-hard-invariants.json"));
    writeFileSync(yaml, `identity:\n  character_id: ${doc.identity.character_id}\n`); // yaml-lite parses this; the Character is incomplete on purpose
    const y = run(yaml);
    check(y.status === 0 && /OK /.test(y.stdout) && /SCHEMA_NOT_DECLARED/.test(y.stdout), "CLI: a YAML file is read (no locator mismatch → OK, admissibility named, nothing written)");
    const usage = run();
    equal(usage.status, 2, "CLI: no arguments → usage, exit 2");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// The sold support pack, when present (never committed), built into a host result the way main.rs does.
const FIXTURES = process.env.SAKU_PACK_FIXTURES || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const unsignedDigest = manifest => { const copy = structuredClone(manifest); delete copy.package.digest; delete copy.package.signature; return `sha-256:${sha256(canonical(copy))}`; };
function unzip(buffer) {
  const out = new Map();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
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
function realPackResult(shiftedCharacter) {
  const file = path.join(FIXTURES, "saku-pack-support-1.0.0-beta.zip");
  if (!existsSync(file)) return null;
  const archive = unzip(readFileSync(file));
  const prefix = `${[...archive.keys()][0].split("/")[0]}/`;
  const pack = JSON.parse(archive.get(`${prefix}character-pack.json`).toString());
  const catalog = JSON.parse(archive.get(`${prefix}catalog-release.v1.json`).toString());
  const entries = []; const characters = [];
  for (const entry of pack.entries) {
    const inner = unzip(archive.get(`${prefix}${entry.file}`));
    const manifest = JSON.parse(inner.get("portable-manifest.json").toString());
    characters.push(JSON.parse(inner.get("character.json").toString()));
    entries.push({ slug: entry.slug, character_id: entry.characterId, display_name: entry.displayName, source_version: entry.sourceVersion, operation_class: entry.operationClass, file: entry.file, archive_digest: entry.archiveDigest, package_digest: entry.packageDigest, character_digest: entry.characterDigest, publisher_key_id: manifest.package.publisherKeyId, signature: manifest.package.signature, manifest_digest_recomputed: unsignedDigest(manifest) === manifest.package.digest, schema_id: manifest.source.schema.schemaId, schema_version: manifest.source.schema.schemaVersion });
  }
  characters[0] = shiftedCharacter; // the one shifted Character rides inside an otherwise real pack
  const payload_json = JSON.stringify({ characters });
  return { status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", reason: "gate stub", source_path: "saku-pack-support-1.0.0-beta.zip", imported_path: `<workspace>/imports/${pack.pack.id}`, payload_json,
    manifest: { package_type: "kokorosaku-character-pack", product: pack.pack.id, package_version: pack.pack.version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, minimum_app_version: "0.1.0-beta.1", content_type: "CHARACTER_PACK", distribution_channel: "STORE", license_state: "BUNDLED_LICENSE_MD", payload_hash: sha256(payload_json) },
    pack: { format: "kokorosaku-character-pack", pack_id: pack.pack.id, pack_version: pack.pack.version, created_at: pack.pack.createdAt, character_count: entries.length, catalog_id: catalog.catalog_id, catalog_release_version: catalog.release_version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, pack_publisher_key_id: pack.package.publisherKeyId, pack_manifest_digest: pack.package.digest, pack_signature: pack.package.signature, pack_manifest_digest_recomputed: unsignedDigest(pack) === pack.package.digest, sha256sums_verified: archive.size - 1, digest_state: "SHA256_BINDINGS_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", entries } };
}

// ── 2b. static: the repair offer exists on the FILE route only ──────────────
{
  const app = readFileSync(path.join(ROOT, "desktop/app.mjs"), "utf8");
  const calls = [...app.matchAll(/offerLocatorRepair\(/g)].length;
  equal(calls, 2, "SRC: offerLocatorRepair is defined once and called once");
  const fileRoute = app.slice(app.indexOf("async function importCharacterFiles("), app.indexOf("function offerLocatorRepair("));
  check(fileRoute.includes("offerLocatorRepair(repairable"), "SRC: the one call is inside importCharacterFiles (個別インポート)");
  const packSide = app.slice(app.indexOf("async function handOffCharacterPack("), app.indexOf("async function importCharacterFiles("));
  check(packSide.length > 0 && !packSide.includes("repairLocators(") && !packSide.includes("offerLocatorRepair("), "SRC: the pack / return hand-offs never call the repair");
}

// ── 3. headless desktop ─────────────────────────────────────────────────────
{
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!existsSync(chrome)) skipped.push("UI: Chrome not found");
  else if (!existsSync(path.join(ROOT, ".desktop-dist/index.html"))) skipped.push("UI: .desktop-dist not prepared (run desktop:prepare)");
  else {
    const swappedText = readFileSync(path.join(FIX, "swapped-hard-invariants.json"), "utf8");
    const missingText = readFileSync(path.join(FIX, "requirement-id-missing.json"), "utf8");
    // Pack route: the real signed support pack (host result built the way main.rs
    // builds it) with ONE Character in the payload replaced by the shifted fixture.
    // Signatures PASS, so the page reaches admit() — which refuses the Character.
    // Without the sold-pack fixture the pack route falls back to a minimal stub
    // whose signature fails (still no button, but for the signature reason).
    const swapped = JSON.parse(swappedText);
    const packResult = realPackResult(swapped) || { status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", reason: "stub", source_path: "x.zip", imported_path: "<ws>/imports/x", payload_json: JSON.stringify({ characters: [swapped] }),
      manifest: { package_type: "kokorosaku-character-pack", product: "saku-pack-x", package_version: "1.0.0", schema_id: swapped.schema.schema_id, schema_version: swapped.schema.schema_version, minimum_app_version: "0.1.0-beta.3", content_type: "CHARACTER_PACK", distribution_channel: "STORE", license_state: "BUNDLED_LICENSE_MD", payload_hash: "0".repeat(64) },
      pack: { format: "kokorosaku-character-pack", pack_id: "saku-pack-x", pack_version: "1.0.0", created_at: "2026-09-22T00:00:00.000Z", character_count: 1, catalog_id: "saku-character-catalog", catalog_release_version: "x", schema_id: swapped.schema.schema_id, schema_version: swapped.schema.schema_version, pack_publisher_key_id: "nobody", pack_manifest_digest: `sha-256:${"1".repeat(64)}`, pack_signature: "AA", pack_manifest_digest_recomputed: true, sha256sums_verified: 1, digest_state: "SHA256_BINDINGS_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", entries: [] } };
    const packRouteReal = Boolean(realPackResult(swapped));
    const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
const SWAPPED=${JSON.stringify(swappedText)},MISSING=${JSON.stringify(missingText)},REAL_PACK=${JSON.stringify(packRouteReal)};
let frame,doc,win;const entries=()=>((JSON.parse(win.localStorage.getItem('saku.workspace.library')||'{}').entries)||[]).filter(e=>!e.deleted);const status=()=>doc.getElementById('viewer-status').innerText;
try{
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/__desktop_stub__/index.html?stay=1&open=select';document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;
 await until(()=>doc.getElementById('viewer-import-package'));
 // A. shifted Character via 個別インポート → refused with the repair button
 await win.__saku_home.importCharacterFiles([new File([SWAPPED],'swapped.json',{type:'application/json'})]);await wait(200);
 check(status().includes('CONFORMANCE_LOCATOR_MISMATCH')&&status().includes('locator'),'UI-A: shifted Character refused, locator named');
 check(entries().length===0,'UI-A: nothing imported yet');
 const btn=doc.getElementById('viewer-repair-locators');check(btn&&btn.textContent.includes('1件'),'UI-A: repair button offered for 1 Character');
 btn.click();await until(()=>status().includes('LOCATOR_REPAIRED'));
 check(entries().length===1,'UI-A: repaired Character imported');
 const e=entries()[0];check(e.source==='FILE_REPAIRED'&&e.provenance&&e.provenance.locator_repair&&e.provenance.locator_repair.rewritten===6&&e.provenance.locator_repair.from_revision==='1.0.0-unified-v1-candidate'&&e.character.identity.character_revision==='1.1.0','UI-A: provenance.locator_repair (6 rewritten, rev 1.0.0-unified-v1-candidate → 1.1.0)');
 const {conformanceLocatorMismatches}=await import('/.desktop-dist/tools/unified-v1/unified-schema-v1.mjs');check(conformanceLocatorMismatches(e.character).length===0,'UI-A: stored Character resolves');
 const history=JSON.parse(win.localStorage.getItem('saku.workspace.importHistory')||'[]');check(history.some(h=>h.code==='LOCATOR_REPAIRED'),'UI-A: history records LOCATOR_REPAIRED');
 const first=doc.querySelector('[data-entry-id], .catalog-row, tr[data-id], [data-record-id]');if(first){first.click();await wait(300);}
 const detail=doc.getElementById('viewer-detail');check(detail&&!detail.hidden&&detail.innerText.includes('locator 修復')&&detail.innerText.includes('rev 1.0.0-unified-v1-candidate → 1.1.0')&&detail.innerText.includes('6件'),'UI-A: detail shows the locator 修復 row');
 // B. unresolvable ref → button appears, repair refuses, nothing imported
 await win.__saku_home.importCharacterFiles([new File([MISSING],'missing.json',{type:'application/json'})]);await wait(200);
 const btn2=doc.getElementById('viewer-repair-locators');check(btn2,'UI-B: button offered');btn2.click();await wait(500);
 check(entries().length===1&&status().includes('修復できません'),'UI-B: unresolvable Character stays refused (still 1 entry)');
 // C. pack route: a pack whose payload carries the shifted Character → that Character is refused, no repair button
 doc.getElementById('viewer-import-package').click();await until(()=>status().includes('取り込めませんでした')||status().includes('取り込みませんでした'));
 if(REAL_PACK){check(status().includes('CONFORMANCE_LOCATOR_MISMATCH')&&!doc.getElementById('viewer-repair-locators'),'UI-C: pack route refuses the shifted Character (CONFORMANCE_LOCATOR_MISMATCH) without a repair button');check(entries().length===1+14,'UI-C: the other 14 signed Characters of the pack were imported ('+entries().length+')');}
 else check(!doc.getElementById('viewer-repair-locators'),'UI-C: pack route (stub, signature FAIL) shows no repair button');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-1500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__lr__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
        if (url.pathname === "/__desktop_stub__/index.html") {
          const html = await readFile(path.join(ROOT, ".desktop-dist/index.html"), "utf8");
          const stub = ["<script>", `window.__PACK__=${JSON.stringify(packResult)};`,
            "window.__TAURI__={__stub:true,core:{invoke:async(c)=>{if(c==='choose_and_import_package'||c==='import_package_path')return structuredClone(window.__PACK__);",
            "if(c==='save_workspace_character')return{status:'SAVED'};if(c==='list_workspace_characters')return{status:'OK',artifacts:[]};if(c==='runtime_state')return{workspace:'C:/ws',app_version:'0.1.0-beta.3',first_run:false};return null;}}};",
            "window.confirm=()=>true;try{localStorage.clear();}catch{}</script>"].join("");
          response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(html.replace("<script>", `${stub}<script>`).replace(/(href|src)="\.\//g, '$1="/.desktop-dist/')); return;
        }
        // The page's own imports ("../tools/…" from /.desktop-dist/app.mjs) resolve to
        // /tools/… — serve those from the prepared dist ONLY, as the packaged app would,
        // so a module missing from the native manifest fails here instead of on the desktop.
        const requested = decodeURIComponent(url.pathname).replace(/^\//, "");
        const file = path.resolve(ROOT, requested.startsWith(".desktop-dist/") ? requested : path.join(".desktop-dist", requested));
        if (!file.startsWith(path.join(ROOT, ".desktop-dist") + path.sep)) throw new Error("outside dist");
        response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`); response.end(await readFile(file));
      } catch { response.statusCode = 404; response.end("not found"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "saku-lr-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", stderr = "", socket; child.stderr.on("data", c => stderr += c); const pause = ms => new Promise(r => setTimeout(r, ms));
    try {
      let port = 0; for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__lr__`)}`, { method: "PUT" })).json();
      socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => socket.onopen = r); let seq = 0; const pending = new Map();
      socket.onmessage = e => { const d = JSON.parse(e.data); if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } };
      const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.send(JSON.stringify({ id, method, params })); });
      for (let i = 0; i < 600; i++) { const r = await call("Runtime.evaluate", { expression: 'document.getElementById("report")?.dataset.status', returnByValue: true }); if (r.result?.result?.value) { output = (await call("Runtime.evaluate", { expression: 'document.getElementById("report").textContent', returnByValue: true })).result.result.value; break; } await pause(100); }
    } finally { socket?.close(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
    const report = JSON.parse(output || '{"status":"NO_OUTPUT"}');
    if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
    for (const label of report.checks) cases.push(label);
  }
}

console.log(`LOCATOR_REPAIR PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("REPAIR = locators re-pointed by id only / revision bumped / record with digests / FILE route only (pack route never repaired)");
