// AMU Studio 「この編集内容を SAKU へ戻す」 intake gate (PR-B, Owner GO 2026-09-21).
//
// The host (src-tauri/src/saku_return.rs) cross-checks the four files of a
// `<slug>.saku-return.zip` and hands the page one Character plus the edit
// request, writing nothing. The page verifies the signed portable-manifest
// with the pinned publisher keys, says how the Character relates to the
// Library, and stores the edit request as the Character's provenance.
//
//   1. Rust rules by text (cargo test when RUN_CARGO=1)
//   2. module: signature PASS on the real AMU fixture with the pinned keys,
//      FAIL on tamper / unknown key, DIGEST_ONLY without Ed25519; Library
//      relation SAME / DIFFERS / NOT_IN_LIBRARY; provenance shape
//   3. headless Chrome: empty list → added with the edit request visible in
//      the detail; after the real support pack → SAME_AS_LIBRARY and 「両方残す」
//      keeps both; tampered signature → refused, list unchanged
//
// Real fixture: C:/Users/Public/SAKU-verify/aimi-meguru.saku-return.zip (or
// SAKU_AMU_FIXTURES); sold support pack: sibling KOKOROAMU-STUDIO fixtures (or
// SAKU_PACK_FIXTURES). Absent inputs are reported as skipped, never as passed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const cases = [];
const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const Intake = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/character-pack-intake.mjs")).href);

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
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;

// ── 1. Rust rules ───────────────────────────────────────────────────────────
const retRs = await read("src-tauri/src/saku_return.rs");
const mainRs = await read("src-tauri/src/main.rs");
check(retRs.includes('pub const SAKU_RETURN_SCHEMA: &str = "AMU-SAKU-RETURN/1.0.0";'), "SR-RUST edit-request schema pinned exactly");
check(retRs.includes("looks_like_saku_return") && retRs.includes('entries.contains_key(EDIT_REQUEST_JSON) && entries.contains_key(CHARACTER_JSON)'), "SR-RUST shape decided by root edit-request.json + character.json");
for (const rule of ["identity_id != character_id || identity_revision != character_revision", 'text(&manifest, "source.characterDigest.value") != Some(character_digest.as_str())', "digest.strip_prefix(\"sha-256:\").unwrap_or(digest) != character_json_sha256", "recomputed != manifest_digest", "inner_character != character_bytes", "inner_manifest != manifest_bytes", "戻しファイルに想定外の項目があります"]) {
  check(retRs.includes(rule), `SR-RUST cross-check present: ${rule.slice(0, 60)}`);
}
check(retRs.includes('signature_state: "NOT_VERIFIED_BY_HOST"') && !/signature_state: "PASS"/.test(retRs), "SR-RUST host never claims a signature");
check(retRs.includes("MAX_RETURN_ENTRIES: usize = 8") && retRs.includes("MAX_RETURN_TOTAL_BYTES: usize = 8 * 1024 * 1024") && retRs.includes("MAX_NOTE_CHARS: usize = 4000") && retRs.includes("MAX_FIELD_CHARS: usize = 120"), "SR-RUST limits: 8 entries, 8 MiB, note ≤ 4000, field ≤ 120 (AMU's own limits)");
check(mainRs.includes("fn import_saku_return(") && /fn import_saku_return\([\s\S]*?imported_path: None,[\s\S]*?saku_return: Some\(ret\)/.test(mainRs) && !/fn import_saku_return\([\s\S]*?fs::(write|create_dir_all)[\s\S]*?\n}\n/.test(mainRs.slice(mainRs.indexOf("fn import_saku_return("), mainRs.indexOf("fn import_character_pack("))), "SR-RUST import_saku_return writes nothing and needs no workspace (Q1 = not persisted)");
check(mainRs.includes('"SAKU_RETURN_SCHEMA_UNSUPPORTED"') && mainRs.includes("ret.schema_id != ACTIVE_SCHEMA_ID || ret.schema_version != ACTIVE_SCHEMA_VERSION"), "SR-RUST returned Character pinned to the active Unified V1 schema");
check(mainRs.includes('content_type: "CHARACTER".to_string()') && mainRs.includes('package_type: "amu-saku-return".to_string()'), "SR-RUST result manifest names the return and one Character");
if (process.env.RUN_CARGO === "1") {
  const result = spawnSync("cargo", ["test", "--release"], { cwd: path.join(ROOT, "src-tauri"), encoding: "utf8", env: { ...process.env, RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || "1.97.1" }, windowsHide: true });
  check(result.status === 0 && /test result: ok\. \d+ passed; 0 failed/.test(result.stdout) && /saku_return_is_read_and_cross_checked_without_writing \.\.\. ok/.test(result.stdout) && /saku_return_mismatches_and_bad_requests_are_refused \.\.\. ok/.test(result.stdout), `SR-RUST cargo test passes incl. the two return tests (${(result.stdout.match(/test result: ok\. (\d+) passed/) || [])[1] || "?"} tests)`);
} else skipped.push("SR-RUST cargo test not run (set RUN_CARGO=1)");

// ── 2. module, on the real AMU fixture ──────────────────────────────────────
const FIXTURES = process.env.SAKU_AMU_FIXTURES || "C:/Users/Public/SAKU-verify";
const returnZip = path.join(FIXTURES, "aimi-meguru.saku-return.zip");
let hostResult = null;
if (existsSync(returnZip)) {
  const entries = unzip(readFileSync(returnZip));
  const request = JSON.parse(entries.get("edit-request.json").toString("utf8"));
  const manifest = JSON.parse(entries.get("portable-manifest.json").toString("utf8"));
  const characterBytes = entries.get("character.json");
  const character = JSON.parse(characterBytes.toString("utf8"));
  const unsigned = structuredClone(manifest); delete unsigned.package.digest; delete unsigned.package.signature;
  equal(`sha-256:${sha256(canonical(unsigned))}`, manifest.package.digest, "SR-FIX real manifest's signed digest recomputes");
  equal(manifest.files.find(f => f.path === "character.json").digest, `sha-256:${sha256(characterBytes)}`, "SR-FIX real character.json bytes match the signed files[] digest");
  equal(request.character_digest, manifest.source.characterDigest.value, "SR-FIX real edit-request.character_digest = manifest characterDigest (profile saku.sha256-rfc8785-ijson@1.0.0)");
  check(request.character_digest !== sha256(characterBytes), "SR-FIX character_digest is NOT the byte sha-256 (so the host must not recompute it that way)");
  // The host's summary, as saku_return.rs produces it.
  const ret = {
    schema: request.schema, character_id: request.character_id, character_revision: request.character_revision, character_digest: request.character_digest,
    character_json_sha256: sha256(characterBytes), display_name: character.identity.display_name, schema_id: character.schema.schema_id, schema_version: character.schema.schema_version,
    note: request.note, fields: request.fields, created_at: request.created_at, from_instance: request.from_instance,
    publisher_key_id: manifest.package.publisherKeyId, manifest_digest: manifest.package.digest, signature: manifest.package.signature, manifest_digest_recomputed: true,
    archive_file: [...entries.keys()].find(n => n.endsWith(".kokorosaku.zip")) || null, archive_present: true,
    digest_state: "CHARACTER_BYTES_AND_SIGNED_MANIFEST_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", character_json: characterBytes.toString("utf8"),
  };
  const payload_json = JSON.stringify({ characters: [character] });
  hostResult = {
    status: "IMPORTED", code: "SAKU_RETURN_READY", reason: "gate stub", source_path: "C:/x/aimi-meguru.saku-return.zip", imported_path: null, payload_json,
    manifest: { package_type: "amu-saku-return", product: ret.character_id, package_version: ret.character_revision, schema_id: ret.schema_id, schema_version: ret.schema_version, minimum_app_version: "0.1.0-beta.2", content_type: "CHARACTER", distribution_channel: "AMU_STUDIO_RETURN", license_state: "AS_SIGNED_ARCHIVE", payload_hash: sha256(payload_json) },
    saku_return: ret,
  };
  const signatures = await Intake.assessReturnSignature(ret);
  equal(signatures.signature_state, "PASS", "SR-SIG real return's portable-manifest signature verifies under the pinned Character publisher key");
  equal(Object.keys(signatures.fingerprints)[0], "saku-character-publisher-ed25519.v1", "SR-SIG fingerprint recorded for the signing key");
  check(/^[0-9a-f]{64}$/.test(signatures.fingerprints["saku-character-publisher-ed25519.v1"]), "SR-SIG fingerprint is sha-256 hex of the SPKI");
  const tampered = { ...ret, signature: ret.signature.replace(/^./, c => (c === "A" ? "B" : "A")) };
  equal((await Intake.assessReturnSignature(tampered)).signature_state, "FAIL", "SR-SIG tampered signature → FAIL");
  equal((await Intake.assessReturnSignature({ ...ret, manifest_digest: `sha-256:${"1".repeat(64)}` })).signature_state, "FAIL", "SR-SIG another digest → FAIL");
  equal((await Intake.assessReturnSignature({ ...ret, publisher_key_id: "nobody" })).signature_state, "FAIL", "SR-SIG unknown key → FAIL (never DIGEST_ONLY)");
  const realImport = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle);
  globalThis.crypto.subtle.importKey = async () => { throw new Error("no Ed25519"); };
  try { equal((await Intake.assessReturnSignature(ret)).signature_state, "DIGEST_ONLY", "SR-SIG no Ed25519 in the runtime → DIGEST_ONLY, never PASS"); } finally { globalThis.crypto.subtle.importKey = realImport; }
  // Library relation
  const entry = (character, provenance, source = "PACKAGE") => ({ entry_id: `e-${Math.random()}`, character, provenance, source });
  equal(Intake.compareReturnWithLibrary(ret, []).relation, "NOT_IN_LIBRARY", "SR-REL empty list → NOT_IN_LIBRARY");
  equal(Intake.compareReturnWithLibrary(ret, [entry(character, { character_digest: ret.character_digest })]).relation, "SAME_AS_LIBRARY", "SR-REL same character_id + same pack digest → SAME_AS_LIBRARY");
  const older = structuredClone(character); older.identity.character_revision = "0.9.0";
  const differs = Intake.compareReturnWithLibrary(ret, [entry(older, { character_digest: "0".repeat(64) })]);
  equal(differs.relation, "DIFFERS_FROM_LIBRARY", "SR-REL same character_id + other digest → DIFFERS_FROM_LIBRARY");
  equal(differs.others[0].revision, "0.9.0", "SR-REL the differing revision is named");
  check(Intake.returnRelationText(differs, ret, "ja").includes("rev 0.9.0") && Intake.returnRelationText(differs, ret, "ja").includes(`rev ${ret.character_revision}`), "SR-REL Japanese relation text names both revisions");
  const other = structuredClone(character); other.identity.character_id = "someone-else";
  equal(Intake.compareReturnWithLibrary(ret, [entry(other, { character_digest: ret.character_digest })]).relation, "NOT_IN_LIBRARY", "SR-REL another character_id never matches, even with an equal digest");
  const meta = Intake.returnEntryMeta(ret, signatures, differs);
  check(meta.edit_request.note === ret.note && meta.edit_request.fields.join() === ret.fields.join() && meta.edit_request.from_instance?.amu_instance_ref === ret.from_instance.amu_instance_ref && meta.signature_state === "PASS" && meta.library_relation === "DIFFERS_FROM_LIBRARY" && meta.source === "AMU_STUDIO_RETURN", "SR-META provenance carries the edit request, signature state and relation");
  const verification = Intake.returnVerification(hostResult, signatures);
  check(verification.saku_return.character_digest === ret.character_digest && verification.saku_return.signature_state === "PASS" && verification.saku_return.archive_present === true, "SR-META batch verification records digest, signature and archive presence");
} else skipped.push(`SR-FIX real .saku-return.zip not present at ${returnZip} — module and browser sections skipped`);

// ── 3. browser ──────────────────────────────────────────────────────────────
const PACKS = process.env.SAKU_PACK_FIXTURES || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
const supportZip = path.join(PACKS, "saku-pack-support-1.0.0-beta.zip");
{
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!hostResult) { /* skipped above */ }
  else if (!existsSync(chrome)) skipped.push("SR-UI Chrome not found");
  else if (!existsSync(path.join(ROOT, ".desktop-dist/index.html"))) skipped.push("SR-UI .desktop-dist not prepared (run desktop:prepare)");
  else if (!existsSync(supportZip)) skipped.push("SR-UI sold support pack fixture absent");
  else {
    // The real support pack's host result (same construction as verify_pack_import.mjs) for the "after a pack" scenario.
    const unsignedDigest = manifest => { const copy = structuredClone(manifest); delete copy.package.digest; delete copy.package.signature; return `sha-256:${sha256(canonical(copy))}`; };
    const archive = unzip(readFileSync(supportZip));
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
    const packPayload = JSON.stringify({ characters });
    const packResult = { status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", reason: "gate stub", source_path: "support.zip", imported_path: "<ws>/imports/saku-pack-support", payload_json: packPayload,
      manifest: { package_type: "kokorosaku-character-pack", product: pack.pack.id, package_version: pack.pack.version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, minimum_app_version: "0.1.0-beta.2", content_type: "CHARACTER_PACK", distribution_channel: "STORE", license_state: "BUNDLED_LICENSE_MD", payload_hash: sha256(packPayload) },
      pack: { format: "kokorosaku-character-pack", pack_id: pack.pack.id, pack_version: pack.pack.version, created_at: pack.pack.createdAt, character_count: entries.length, catalog_id: catalog.catalog_id, catalog_release_version: catalog.release_version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, pack_publisher_key_id: pack.package.publisherKeyId, pack_manifest_digest: pack.package.digest, pack_signature: pack.package.signature, pack_manifest_digest_recomputed: unsignedDigest(pack) === pack.package.digest, sha256sums_verified: archive.size - 1, digest_state: "SHA256_BINDINGS_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", entries } };
    const tamperedResult = structuredClone(hostResult); tamperedResult.saku_return.signature = tamperedResult.saku_return.signature.replace(/^./, c => (c === "A" ? "B" : "A"));
    const results = { return: hostResult, pack: packResult, tampered: tamperedResult };
    const ret = hostResult.saku_return;
    const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(v,l)=>{if(!v)throw new Error(l);checks.push(l);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
const RET=${JSON.stringify({ id: ret.character_id, rev: ret.character_revision, note: ret.note, fields: ret.fields, name: ret.display_name })};
let frame,doc,win;
const entries=()=>((JSON.parse(win.localStorage.getItem('saku.workspace.library')||'{}').entries)||[]).filter(e=>!e.deleted);
const status=()=>doc.getElementById('viewer-status').innerText;
async function importAs(mode){win.__SR_MODE__=mode;doc.getElementById('viewer-import-package').click();}
try{
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/__desktop_stub__/index.html?stay=1&open=select';
 document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;
 check(win.__TAURI__&&win.__TAURI__.__stub===true,'SR-UI host stub installed before app.mjs');
 await until(()=>doc.getElementById('viewer-import-package'));
 // A. empty list → the return is added, edit request visible
 await importAs('return');
 await until(()=>status().includes('SAKU_RETURN_IMPORTED')||status().includes('取り込みませんでした'));
 check(status().includes('SAKU_RETURN_IMPORTED'),'SR-UI A: return imported on an empty list');
 check(status().includes('一覧に同じ character_id')&&status().includes('ありません'),'SR-UI A: relation text says NOT_IN_LIBRARY');
 check(entries().length===1,'SR-UI A: one Library entry ('+entries().length+')');
 const e=entries()[0];
 check(e.source==='SAKU_RETURN'&&e.provenance&&e.provenance.edit_request&&e.provenance.edit_request.note===RET.note&&e.provenance.edit_request.fields.join()===RET.fields.join()&&e.provenance.signature_state==='PASS'&&e.provenance.library_relation==='NOT_IN_LIBRARY','SR-UI A: entry carries the edit request as provenance with PASS');
 check(e.verification&&e.verification.saku_return&&e.verification.saku_return.digest_state==='CHARACTER_BYTES_AND_SIGNED_MANIFEST_VERIFIED','SR-UI A: batch verification carries the host digest state');
 const first=doc.querySelector('[data-entry-id], .catalog-row, tr[data-id], [data-record-id]');
 if(first){first.click();await wait(300);}
 const detail=doc.getElementById('viewer-detail');
 check(detail&&!detail.hidden&&detail.innerText.includes('AMU からの編集依頼')&&detail.innerText.includes(RET.note)&&detail.innerText.includes('依頼フィールド')&&detail.innerText.includes(RET.fields[0])&&detail.innerText.includes('元の Instance')&&/署名検証 PASS（発行者 fingerprint: [0-9a-f]{16}…）/.test(detail.innerText),'SR-UI A: detail shows the edit request rows and the PASS signature');
 check(status().includes('workspace には保存していません'),'SR-UI A: the screen says the return was not written to the workspace');
 // B. after the real support pack: the same Character → SAME_AS_LIBRARY, 「両方残す」 keeps both
 win.localStorage.clear();win.location.reload();await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;await until(()=>doc.getElementById('viewer-import-package'));
 await importAs('pack');await until(()=>status().includes('件を一覧に追加しました'));
 check(entries().length===15,'SR-UI B: support pack imported (15)');
 win.confirm=()=>false; // キャンセル = 両方残す
 await importAs('return');await until(()=>status().includes('SAKU_RETURN_IMPORTED'));
 check(status().includes('一覧の現行')&&status().includes('と同じ Character です'),'SR-UI B: relation text says SAME_AS_LIBRARY');
 check(entries().length===16,'SR-UI B: 両方残す → 16 entries ('+entries().length+')');
 const kept=entries().filter(x=>x.character&&x.character.identity&&x.character.identity.character_id===RET.id);
 check(kept.length===2&&kept.some(x=>x.source==='PACKAGE'&&x.provenance&&x.provenance.pack_id)&&kept.some(x=>x.source==='SAKU_RETURN'&&x.provenance.library_relation==='SAME_AS_LIBRARY'),'SR-UI B: the pack entry keeps its pack provenance, the return entry carries the request');
 // C. tampered signature → refused, list unchanged
 await importAs('tampered');await until(()=>status().includes('SAKU_RETURN_SIGNATURE_INVALID'));
 check(status().includes('署名検証に失敗したため取り込みませんでした'),'SR-UI C: tampered signature refused with the Japanese reason');
 check(entries().length===16,'SR-UI C: list unchanged after the refusal');
 const history=JSON.parse(win.localStorage.getItem('saku.workspace.importHistory')||'[]');
 check(history.some(h=>h.code==='SAKU_RETURN_SIGNATURE_INVALID'&&h.status==='REFUSED'),'SR-UI C: refusal recorded in import history');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__sr__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
        if (url.pathname === "/__desktop_stub__/index.html") {
          const html = await readFile(path.join(ROOT, ".desktop-dist/index.html"), "utf8");
          const stub = ["<script>", `window.__SR_RESULTS__=${JSON.stringify(results)};window.__SR_MODE__='return';`,
            "window.__TAURI__={__stub:true,core:{invoke:async(command)=>{",
            "if(command==='choose_and_import_package'||command==='import_package_path')return structuredClone(window.__SR_RESULTS__[window.__SR_MODE__]);",
            "if(command==='save_workspace_character')return{status:'SAVED'};if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};",
            "if(command==='runtime_state')return{workspace:'C:/ws',app_version:'0.1.0-beta.2',first_run:false};return null;}}};window.confirm=()=>true;",
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
    const profile = await mkdtemp(path.join(tmpdir(), "saku-sr-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let stderr = ""; let socket;
    child.stderr.on("data", chunk => stderr += chunk);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let port = 0;
      for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__sr__`)}`, { method: "PUT" })).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise(resolve => socket.onopen = resolve);
      let sequence = 0; const pending = new Map();
      socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { pending.get(data.id)?.(data); pending.delete(data.id); } };
      const call = (method, params = {}) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
      for (let i = 0; i < 900; i++) {
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

console.log(`SAKU_RETURN PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped: ${skipped.join("; ")})` : ""}`);
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log("HOST cross-checks request↔character.json↔signed manifest↔archive, writes nothing / PAGE pinned-key signature (FAIL refuses) + Library relation + edit request as provenance / characterDigest NOT recomputed (signature-bound; AMU recomputes on re-import)");
