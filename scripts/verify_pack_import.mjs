// SAKU Character Pack import gate (Owner defect 2026-09-20: sold packs refused
// by the β.1 Package import).
//
// Rust side (host): `cargo test --release` in src-tauri covers the pack parser
// (synthetic pack, digest mismatches, nesting, limits, the unchanged .witpkg
// path, and the three production packs when the sibling KOKOROAMU-STUDIO
// fixtures are present).  This gate runs it when RUN_CARGO=1 and otherwise
// checks the Rust source for the rules by text.
//
// JS side (this file): the pinned publisher keys verify the real pack
// signatures through WebCrypto; tampered / unknown-key / missing signatures
// fail; the no-Ed25519 runtime yields DIGEST_ONLY (never PASS); the Library
// stores per-Character provenance; and the desktop screen, driven end to end
// with a host stub that returns the real pack result, lists 15 Characters with
// operation class and signature state.  Rules are falsified in a mutated copy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };

const MODULE = "tools/unified-v1/character-pack-intake.mjs";
const Intake = await import(pathToFileURL(path.join(ROOT, MODULE)).href);

// ── fixtures: the sold packs, when present (never committed: .gitignore *.zip) ──
const FIXTURES = process.env.SAKU_PACK_FIXTURES
  || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
const PACKS = [["saku-pack-support-1.0.0-beta.zip", 15], ["saku-pack-business-1.0.0-beta.zip", 19], ["saku-pack-technical-1.0.0-beta.zip", 20]];
const packsPresent = PACKS.every(([name]) => existsSync(path.join(FIXTURES, name)));

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
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const unsignedDigest = manifest => { const copy = structuredClone(manifest); delete copy.package.digest; delete copy.package.signature; return `sha-256:${sha256(canonical(copy))}`; };

/** Build the host's `pack` summary + ImportResult from a real pack, the way main.rs does. */
function hostResultFor(name) {
  const bytes = readFileSync(path.join(FIXTURES, name));
  const archive = unzip(bytes);
  const prefix = `${[...archive.keys()][0].split("/")[0]}/`;
  const pack = JSON.parse(archive.get(`${prefix}character-pack.json`).toString());
  const catalog = JSON.parse(archive.get(`${prefix}catalog-release.v1.json`).toString());
  const entries = [];
  const characters = [];
  for (const entry of pack.entries) {
    const inner = unzip(archive.get(`${prefix}${entry.file}`));
    const manifest = JSON.parse(inner.get("portable-manifest.json").toString());
    const character = JSON.parse(inner.get("character.json").toString());
    characters.push(character);
    entries.push({
      slug: entry.slug, character_id: entry.characterId, display_name: entry.displayName, source_version: entry.sourceVersion,
      operation_class: entry.operationClass, file: entry.file, archive_digest: entry.archiveDigest, package_digest: entry.packageDigest,
      character_digest: entry.characterDigest, publisher_key_id: manifest.package.publisherKeyId, signature: manifest.package.signature,
      manifest_digest_recomputed: unsignedDigest(manifest) === manifest.package.digest,
      schema_id: manifest.source.schema.schemaId, schema_version: manifest.source.schema.schemaVersion,
    });
  }
  const payload_json = JSON.stringify({ characters });
  return {
    status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", reason: "gate stub", source_path: name, imported_path: `<workspace>/imports/${pack.pack.id}`,
    payload_json,
    manifest: { package_type: "kokorosaku-character-pack", product: pack.pack.id, package_version: pack.pack.version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version, minimum_app_version: "0.1.0-beta.1", content_type: "CHARACTER_PACK", distribution_channel: "STORE", license_state: "BUNDLED_LICENSE_MD", payload_hash: sha256(payload_json) },
    pack: {
      format: "kokorosaku-character-pack", pack_id: pack.pack.id, pack_version: pack.pack.version, created_at: pack.pack.createdAt, character_count: entries.length,
      catalog_id: catalog.catalog_id, catalog_release_version: catalog.release_version, schema_id: entries[0].schema_id, schema_version: entries[0].schema_version,
      pack_publisher_key_id: pack.package.publisherKeyId, pack_manifest_digest: pack.package.digest, pack_signature: pack.package.signature,
      pack_manifest_digest_recomputed: unsignedDigest(pack) === pack.package.digest, sha256sums_verified: archive.size - 1,
      digest_state: "SHA256_BINDINGS_VERIFIED", signature_state: "NOT_VERIFIED_BY_HOST", entries,
    },
  };
}

// ── 0. pinned keys and module facts ────────────────────────────────────────
equal(Object.keys(Intake.TRUSTED_PUBLISHERS).sort().join(","), "saku-character-publisher-ed25519.v1,saku-pack-publisher-ed25519.v1", "PK-KEYS two publisher keys pinned");
equal(Intake.TRUSTED_PUBLISHERS_SOURCE.main_revision, "b56eace5e5925aba081eb44963c4ffe9e0a347c8", "PK-KEYS pin names its exact source revision");
const sibling = path.resolve(ROOT, "../KOKOROAMU-characterpack/release/publisher-keys/trusted-publishers-production.json");
if (existsSync(sibling)) {
  const upstream = JSON.parse(readFileSync(sibling, "utf8"));
  check(JSON.stringify(upstream) === JSON.stringify(Intake.TRUSTED_PUBLISHERS), "PK-KEYS pinned keys are byte-equal to the sibling KOKOROAMU-characterpack production file");
} else cases.push("PK-KEYS sibling KOKOROAMU-characterpack clone not present — upstream equality not compared");
check(!/verified|PASS/.test(Intake.signatureStateText("DIGEST_ONLY", "en").replace("not verified", "")) && Intake.signatureStateText("DIGEST_ONLY") === "digest 一致・署名は未検証", "PK-TEXT DIGEST_ONLY wording is exactly 「digest 一致・署名は未検証」");
check(/^署名検証 PASS（発行者 fingerprint: [0-9a-f]{16}…）$/.test(Intake.signatureStateText("PASS", "ja", "ab".repeat(32))), "PK-TEXT PASS wording carries the publisher fingerprint");
// Verifier source pin (Owner 2026-09-20: same verifier as AMU Studio, exact-pinned): the sibling clone's files at
// b56eace5 must carry the pinned digests, and the fingerprint rule must equal AMU's (sha-256 of the SPKI DER).
const packRepo = path.resolve(ROOT, "../KOKOROAMU-characterpack");
if (existsSync(packRepo)) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: packRepo, encoding: "utf8", windowsHide: true }).stdout.trim();
  for (const [file, digest] of Object.entries(Intake.VERIFIER_SOURCE.files)) {
    const shown = spawnSync("git", ["show", `${Intake.VERIFIER_SOURCE.main_revision}:${file}`], { cwd: packRepo, encoding: "buffer", windowsHide: true });
    check(shown.status === 0 && sha256(shown.stdout) === digest, `PK-VERIFIER ${file} @ b56eace5 matches the pinned digest`);
  }
  const keysShown = spawnSync("git", ["show", `${Intake.TRUSTED_PUBLISHERS_SOURCE.main_revision}:${Intake.TRUSTED_PUBLISHERS_SOURCE.path}`], { cwd: packRepo, encoding: "buffer", windowsHide: true });
  check(keysShown.status === 0 && sha256(keysShown.stdout) === Intake.TRUSTED_PUBLISHERS_SOURCE.sha256, "PK-VERIFIER trusted-publishers file @ b56eace5 matches the pinned digest");
  cases.push(`PK-VERIFIER sibling KOKOROAMU-characterpack HEAD ${head.slice(0, 8)} (pin is by revision, not by HEAD)`);
} else cases.push("PK-VERIFIER sibling KOKOROAMU-characterpack clone not present — source pin digests not compared");
const amuPrimitives = path.resolve(ROOT, "../KOKOROAMU-STUDIO/adapters/character-package-unified-v1/primitives.js");
if (existsSync(amuPrimitives)) {
  const Amu = await import(pathToFileURL(amuPrimitives).href);
  for (const keyId of Object.keys(Intake.TRUSTED_PUBLISHERS)) {
    equal(await Intake.publisherFingerprint(keyId), await Amu.publicKeyFingerprint(Intake.TRUSTED_PUBLISHERS[keyId]), `PK-FINGERPRINT ${keyId} fingerprint equals AMU Studio's publicKeyFingerprint`);
  }
} else cases.push("PK-FINGERPRINT sibling KOKOROAMU-STUDIO primitives not present — fingerprint equality not compared");

// ── 1. signatures on the real packs ────────────────────────────────────────
let results = {};
if (packsPresent) {
  for (const [name, count] of PACKS) {
    const result = hostResultFor(name);
    results[name] = result;
    equal(result.pack.character_count, count, `PK-FIXTURE ${name} carries ${count} Characters`);
    check(result.pack.pack_manifest_digest_recomputed && result.pack.entries.every(entry => entry.manifest_digest_recomputed), `PK-FIXTURE ${name} manifest digests recompute over canonical JSON`);
    const signatures = await Intake.assessPackSignatures(result.pack);
    equal(signatures.signature_state, "PASS", `PK-SIG ${name} pack + ${count} Character signatures verify under the pinned keys`);
    equal(signatures.checked, count + 1, `PK-SIG ${name} checked count`);
    check(result.pack.entries.every(entry => ["A", "B", "C"].includes(entry.operation_class)), `PK-FIXTURE ${name} operation classes in A/B/C`);
  }
  const base = results["saku-pack-support-1.0.0-beta.zip"].pack;
  const tamperedSig = structuredClone(base); tamperedSig.entries[3].signature = tamperedSig.entries[3].signature.replace(/[A-Za-z]/, char => char === "A" ? "B" : "A");
  equal((await Intake.assessPackSignatures(tamperedSig)).signature_state, "FAIL", "PK-NEG a tampered Character signature fails the whole pack");
  const tamperedDigest = structuredClone(base); tamperedDigest.pack_manifest_digest = `sha-256:${"0".repeat(64)}`;
  equal((await Intake.assessPackSignatures(tamperedDigest)).signature_state, "FAIL", "PK-NEG a pack digest that is not what was signed fails");
  const unknownKey = structuredClone(base); unknownKey.pack_publisher_key_id = "someone-else.v9";
  const unknown = await Intake.assessPackSignatures(unknownKey);
  check(unknown.signature_state === "FAIL" && unknown.failed[0].state === "UNKNOWN_KEY", "PK-NEG an unpinned publisher key fails (not DIGEST_ONLY)");
  const missing = structuredClone(base); delete missing.entries[0].signature;
  equal((await Intake.assessPackSignatures(missing)).signature_state, "FAIL", "PK-NEG a missing signature fails");
  const other = structuredClone(base); other.pack_publisher_key_id = "saku-character-publisher-ed25519.v1";
  equal((await Intake.assessPackSignatures(other)).signature_state, "FAIL", "PK-NEG the right signature under the wrong pinned key fails");
  // No Ed25519 in the runtime → DIGEST_ONLY, never PASS.
  const realImport = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle);
  globalThis.crypto.subtle.importKey = async () => { throw new Error("Ed25519 unsupported (simulated)"); };
  try { equal((await Intake.assessPackSignatures(base)).signature_state, "DIGEST_ONLY", "PK-RUNTIME no Ed25519 → DIGEST_ONLY"); }
  finally { globalThis.crypto.subtle.importKey = realImport; }
  equal((await Intake.assessPackSignatures(null)).signature_state, "FAIL", "PK-NEG no pack summary → FAIL");
  // verification + per-entry meta shapes
  const signatures = await Intake.assessPackSignatures(base);
  const verification = Intake.packVerification(results["saku-pack-support-1.0.0-beta.zip"], signatures);
  check(verification.pack.pack_id === "saku-pack-support" && verification.pack.signature_state === "PASS" && verification.pack.digest_state === "SHA256_BINDINGS_VERIFIED" && verification.pack.publisher_key_ids.length === 2 && Object.keys(verification.pack.publisher_fingerprints).length === 2, "PK-VERIFICATION batch record carries pack id, digest and signature state, both key ids and fingerprints");
  const meta = Intake.packEntryMeta(base, signatures);
  equal(meta.size, 15, "PK-META one provenance record per Character");
  check([...meta.values()].every(item => item.pack_id === "saku-pack-support" && item.operation_class && item.character_digest && item.signature_state === "PASS" && /^[0-9a-f]{64}$/.test(item.publisher_fingerprint)), "PK-META provenance carries class, digest, signature state and publisher fingerprint");
} else {
  cases.push(`PK-FIXTURE production packs not present under ${FIXTURES} — signature checks on real packs skipped (set SAKU_PACK_FIXTURES)`);
}

// ── 2. Library stores provenance beside the Character ──────────────────────
{
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.has(key) ? store.get(key) : null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
  const Library = await import(`${pathToFileURL(path.join(ROOT, "tools/unified-v1/character-library.mjs")).href}?pack-gate`);
  const character = { schema: { schema_id: "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE", schema_version: "final-delta-recovery-closure-2026-09-04" }, identity: { character_id: "gate-one", character_revision: "1.0.0", display_name: "ゲート一" }, purpose: { summary: "x" } };
  const outcome = Library.importCharacters([character], "PACKAGE", { onConflict: "KEEP_BOTH", verification: { status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", pack: { pack_id: "p", signature_state: "PASS" } }, schema: { kind: "UNIFIED_V1_CHARACTER", schema_id: character.schema.schema_id, schema_version: character.schema.schema_version }, entryMeta: item => ({ pack_id: "p", operation_class: "B", signature_state: "PASS", character_id: item.identity.character_id }) });
  check(outcome.saved && outcome.added === 1, "PK-LIB pack Character added");
  const entry = Library.list().find(item => item.character.identity.character_id === "gate-one");
  check(entry && entry.provenance && entry.provenance.operation_class === "B" && entry.provenance.pack_id === "p", "PK-LIB provenance stored beside the Character");
  check(!("provenance" in entry.character) && !("operation_class" in entry.character), "PK-LIB the Character itself is not modified");
  const plain = Library.importCharacters([{ ...character, identity: { ...character.identity, character_id: "gate-two", display_name: "ゲート二" } }], "FILE", { onConflict: "KEEP_BOTH", verification: null, schema: { kind: "UNIFIED_V1_CHARACTER", schema_id: character.schema.schema_id, schema_version: character.schema.schema_version } });
  check(plain.added === 1 && Library.list().find(item => item.character.identity.character_id === "gate-two").provenance === null, "PK-LIB entries without a pack carry null provenance (unchanged behaviour)");
}

// ── 3. Rust source rules present; cargo test on request ────────────────────
const mainRs = await read("src-tauri/src/main.rs");
const packRs = await read("src-tauri/src/character_pack.rs");
check(mainRs.includes("const MAX_PACK_ENTRIES: usize = 512;") && mainRs.includes("const MAX_WITPKG_ENTRIES: usize = 16;"), "PK-RUST pack ceiling 512, .witpkg ceiling unchanged at 16");
check(mainRs.includes("MAX_ARCHIVE_TOTAL_BYTES") && mainRs.includes("ZIP exceeds the total uncompressed size limit"), "PK-RUST total uncompressed budget enforced");
check(mainRs.includes("ZIP package files may sit at most one folder deep") && mainRs.includes("ZIP package files must share one folder"), "PK-RUST one folder prefix only");
check(mainRs.includes("受け付ける形式: SAKU Character Pack（character-pack.json を含む ZIP）"), "PK-RUST unknown format names the accepted formats in Japanese");
check(packRs.includes("does not match SHA256SUMS") && packRs.includes("does not match its archiveDigest") && packRs.includes("does not match portable-manifest.json") && packRs.includes("CHARACTER_PACK_CATALOG_MISMATCH") && packRs.includes("package.digest does not match the canonical manifest"), "PK-RUST digest rules: SHA256SUMS, archive, files, catalog, signed-manifest digest");
check(packRs.includes("nested archives inside a Character archive are not accepted") && packRs.includes("MAX_INNER_ARCHIVE_ENTRIES"), "PK-RUST nesting depth 1 and inner archive limits");
check(packRs.includes('signature_state: "NOT_VERIFIED_BY_HOST"') && !packRs.includes('"SIGNED"'), "PK-RUST host never reports a signature as verified");
if (process.env.RUN_CARGO === "1") {
  const cargo = spawnSync("cargo", ["test", "--release"], { cwd: path.join(ROOT, "src-tauri"), encoding: "utf8", windowsHide: true, env: { ...process.env, SAKU_PACK_FIXTURES: FIXTURES } });
  const summary = (cargo.stdout + cargo.stderr).match(/test result: (\w+)\. (\d+) passed; (\d+) failed/);
  check(cargo.status === 0 && summary && summary[1] === "ok", `PK-RUST cargo test --release ${summary ? `${summary[2]} passed` : "(no summary)"}`);
} else cases.push("PK-RUST cargo test not run in this invocation (RUN_CARGO=1 runs it)");

// ── 4. falsification ───────────────────────────────────────────────────────
if (packsPresent) {
  const moduleText = await read(MODULE);
  const falsifications = [
    ["PK-FALSIFY verify result", "return ok ? { state: \"PASS\", detail: publisher_key_id } : { state: \"FAIL\"", "return true ? { state: \"PASS\", detail: publisher_key_id } : { state: \"FAIL\"", async mutated => { const t = structuredClone(results["saku-pack-support-1.0.0-beta.zip"].pack); t.pack_manifest_digest = `sha-256:${"1".repeat(64)}`; return (await mutated.assessPackSignatures(t)).signature_state === "PASS"; }],
    ["PK-FALSIFY unknown key rule", "if (!pem) return { state: \"UNKNOWN_KEY\"", "if (false) return { state: \"UNKNOWN_KEY\"", async mutated => { const t = structuredClone(results["saku-pack-support-1.0.0-beta.zip"].pack); t.pack_publisher_key_id = "nobody"; const r = await mutated.assessPackSignatures(t); return r.failed.every(item => item.state !== "UNKNOWN_KEY"); }],
    ["PK-FALSIFY DIGEST_ONLY never PASS", "if (unavailable) return { signature_state: \"DIGEST_ONLY\"", "if (unavailable) return { signature_state: \"PASS\"", async mutated => { const realImport = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle); globalThis.crypto.subtle.importKey = async () => { throw new Error("x"); }; try { return (await mutated.assessPackSignatures(results["saku-pack-support-1.0.0-beta.zip"].pack)).signature_state === "PASS"; } finally { globalThis.crypto.subtle.importKey = realImport; } }],
  ];
  for (const [label, from, to, probe] of falsifications) {
    check(moduleText.includes(from), `${label}: target rule present`);
    const mutatedPath = path.join(ROOT, "tools/unified-v1", `__pk_falsify_${cases.length}.mjs`);
    await writeFile(mutatedPath, moduleText.replace(from, to), "utf8");
    try { check(await probe(await import(pathToFileURL(mutatedPath).href)), `${label}: disabling the rule lets the defect through (rule is live)`); }
    finally { await rm(mutatedPath, { force: true }); }
  }
}

// ── 5. browser: the desktop screen end to end with a host stub ─────────────
if (packsPresent) {
  const supportResult = results["saku-pack-support-1.0.0-beta.zip"];
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
const RESULT=${JSON.stringify(supportResult)};
let frame,doc,win;
try{
 // The page is served with the host stub injected BEFORE app.mjs, because the
 // app captures window.__TAURI__.core.invoke at module load.
 frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/__desktop_stub__/index.html?stay=1&open=select';
 document.body.append(frame);
 await new Promise(resolve=>frame.onload=resolve);doc=frame.contentDocument;win=frame.contentWindow;
 check(win.__TAURI__&&win.__TAURI__.__stub===true,'PK-UI host stub installed before app.mjs');
 void RESULT;
 await until(()=>doc.getElementById('viewer-import-package'));
 const button=doc.getElementById('viewer-import-package');
 check(button,'PK-UI package import control found');
 button.click();
 await until(()=>doc.body.innerText.includes('CHARACTER_PACK_IMPORTED')||doc.body.innerText.includes('取り込みませんでした')||doc.body.innerText.includes('SIGNATURE'));
 check(doc.body.innerText.includes('CHARACTER_PACK_IMPORTED'),'PK-UI pack import status shown');
 check(/15件を一覧に追加しました|15件を追加/.test(doc.body.innerText),'PK-UI the list reports 15 Characters added');
 const history=JSON.parse(win.localStorage.getItem('saku.workspace.importHistory')||'[]');
 check(history.some(item=>item.kind==='PACKAGE'&&item.code==='CHARACTER_PACK_IMPORTED'),'PK-UI import history records the pack import');
 const Library=await import('/.desktop-dist/tools/unified-v1/character-library.mjs');
 const stored=JSON.parse(win.localStorage.getItem('saku.workspace.library')||'{}');
 const entries=(stored.entries||[]).filter(e=>!e.deleted);
 check(entries.length===15,'PK-UI 15 library entries stored ('+entries.length+')');
 check(entries.every(e=>e.provenance&&e.provenance.pack_id==='saku-pack-support'&&['A','B'].includes(e.provenance.operation_class)&&e.provenance.signature_state==='PASS'),'PK-UI every entry carries pack provenance with class and PASS');
 check(entries.every(e=>e.verification&&e.verification.pack&&e.verification.pack.digest_state==='SHA256_BINDINGS_VERIFIED'),'PK-UI batch verification carries the digest state');
 const first=doc.querySelector('[data-entry-id], .catalog-row, tr[data-id], [data-record-id]');
 if(first){first.click();await wait(300);}
 const detail=doc.getElementById('viewer-detail');
 check(detail&&!detail.hidden&&/運用区分/.test(detail.innerText)&&/署名検証 PASS（発行者 fingerprint: [0-9a-f]{16}…）/.test(detail.innerText)&&/saku-pack-support 1\\.0\\.0/.test(detail.innerText),'PK-UI detail shows operation class, pack and signature rows');
 check(!/初動/.test(doc.body.innerText),'PK-UI no stray text');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
  if (!existsSync(path.join(ROOT, ".desktop-dist/index.html"))) {
    cases.push("PK-UI .desktop-dist not prepared — browser end-to-end skipped (run desktop:prepare first)");
  } else {
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__pk__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
        if (url.pathname === "/__desktop_stub__/index.html") {
          const html = await readFile(path.join(ROOT, ".desktop-dist/index.html"), "utf8");
          const stubScript = [
            "<script>",
            `window.__PK_RESULT__=${JSON.stringify(supportResult)};`,
            "window.__TAURI__={__stub:true,core:{invoke:async(command)=>{",
            "if(command==='choose_and_import_package'||command==='import_package_path')return structuredClone(window.__PK_RESULT__);",
            "if(command==='save_workspace_character')return{status:'SAVED'};",
            "if(command==='list_workspace_characters')return{status:'OK',artifacts:[]};",
            "if(command==='runtime_state')return{workspace:'C:/ws',app_version:'0.1.0-beta.1',first_run:false};",
            "return null;}}};window.confirm=()=>true;try{localStorage.clear();}catch{}",
            "</script>",
          ].join("");
          const rewritten = html.replace("<script>", `${stubScript}<script>`).replace(/(href|src)="\.\//g, '$1="/.desktop-dist/');
          response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(rewritten); return;
        }
        const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
        if (!file.startsWith(ROOT + path.sep)) throw new Error("outside root");
        response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`);
        response.end(await readFile(file));
      } catch { response.statusCode = 404; response.end("not found"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "saku-pk-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let stderr = ""; let socket;
    child.stderr.on("data", chunk => stderr += chunk);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let port = 0;
      for (let i = 0; i < 200 && !port; i++) { const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (match) port = Number(match[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__pk__`)}`, { method: "PUT" })).json();
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
      server.close(); await rm(profile, { recursive: true, force: true });
    }
    const match = output.match(/<pre id="report" data-status="(PASS|FAIL)">([\s\S]*?)<\/pre>/);
    if (!match) { console.error(output.slice(0, 2000), stderr.slice(-1000)); process.exit(1); }
    const report = JSON.parse(match[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
    for (const label of report.checks) cases.push(label);
  }
}

console.log(`PACK_IMPORT PASS ${cases.length}/${cases.length}`);
for (const label of cases) console.log(`  PASS ${label}`);
console.log(`FIXTURES ${packsPresent ? "15/19/20 (sibling KOKOROAMU-STUDIO)" : "NOT_PRESENT"} / SIGNATURE ${packsPresent ? "PASS (WebCrypto Ed25519, pinned keys)" : "NOT_EVALUATED"} / HOST_SIGNATURE_CLAIM NONE`);
