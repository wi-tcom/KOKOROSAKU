// Self-made Character ZIP gate (Owner 2026-09-27: 「SAKU に ZIP 書き出しを足す」; the shape
// AMU accepted on 2026-09-27, KOKOROAMU-STUDIO DECISION 2026-09-27-10).
//
//   ZIP-SHAPE    two stored entries in a fixed order, a fixed time, readable by the strict reader
//   ZIP-MANIFEST format / signature NONE / no package / files[] and manifest_digest (JCS)
//   ZIP-REFUSE   every refusal AMU applies, each as its own negative case
//   ZIP-SCHEMA   character.json passes the adopted Schema; a broken one is caught
//   ZIP-FIXTURE  the committed fixture is what the builder makes from the sample (sha256 pinned)
//   ZIP-UI       02 offers the ZIP only on the JSON tab, behind the same gates as the JSON download
//   ZIP-HOST     the host saves only `<slug>.saku-character.zip` bytes that start as a ZIP
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Z from "../tools/unified-v1/self-made-character-zip.mjs";
import { canonicalJson } from "../tools/v1/external-review-intake.mjs";
import { validateCompleteAdoptedCharacter } from "../tools/v1/adopted-schema-validator.mjs";
import { loadAdoptedSchemaFromRepository } from "../tools/v1/adopted-schema-node.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const utf8 = text => new TextEncoder().encode(text);

// The sample: the first OSS sample (CC0-1.0, kept as test material after its distribution ended,
// D-20260924-oss-samples-retired), exported as the JSON download writes it.
const samples = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json"));
const sample = samples.characters[0].character || samples.characters[0];
const characterText = JSON.stringify(sample, null, 2);
const FIXED = { slug: "sample-general-compass", characterText, appVersion: "0.1.0-beta.8", createdAt: "2026-09-27T00:00:00Z", exportChecks: { adopted_schema: "PASS", contact_guard: "PASS", human_confirmation: true } };
const built = await Z.buildSelfMadeCharacterZip(FIXED);

// ZIP-SHAPE
check(built.filename === "sample-general-compass.saku-character.zip", "ZIP-SHAPE the file is <slug>.saku-character.zip");
const read1 = Z.readStoredZip(built.bytes);
check(read1.errors.length === 0 && read1.entries.map(e => e.name).join() === "saku-character-manifest.json,character.json", "ZIP-SHAPE two entries, manifest first, character.json second");
check(new TextDecoder().decode(read1.entries[1].bytes) === characterText, "ZIP-SHAPE character.json is the same bytes as the JSON download");
const again = await Z.buildSelfMadeCharacterZip(FIXED);
check(sha(again.bytes) === sha(built.bytes), "ZIP-SHAPE the same Character and manifest fields give the same bytes");
check(sha((await Z.buildSelfMadeCharacterZip({ ...FIXED, createdAt: "2026-09-27T00:00:01Z" })).bytes) !== sha(built.bytes), "ZIP-SHAPE created_at is part of the bytes (the manifest records the time)");
const dv = new DataView(built.bytes.buffer);
check(dv.getUint16(8, true) === 0 && dv.getUint16(10, true) === 0 && dv.getUint16(12, true) === 0x21, "ZIP-SHAPE stored, 1980-01-01 00:00 on every entry");
check(Z.crc32(utf8("123456789")) === 0xcbf43926, "ZIP-SHAPE CRC-32 known answer (123456789 → cbf43926)");

// ZIP-MANIFEST
const m = built.manifest;
check(m.format === "saku-self-made-character" && m.format_version === "1" && m.signature === "NONE" && !Object.hasOwn(m, "package"), "ZIP-MANIFEST format, version 1, signature NONE, no package field");
check(m.character.character_id === sample.identity.character_id && m.character.character_revision === sample.identity.character_revision && m.character.display_name === sample.identity.display_name, "ZIP-MANIFEST character fields are the Character's own");
check(m.schema.schema_id === sample.schema.schema_id && m.schema.schema_version === sample.schema.schema_version, "ZIP-MANIFEST schema is the Character's declared Schema");
check(m.files.length === 1 && m.files[0].path === "character.json" && m.files[0].bytes === utf8(characterText).length && m.files[0].digest === `sha-256:${sha(utf8(characterText))}`, "ZIP-MANIFEST files[] names character.json with its size and sha-256");
const { manifest_digest, ...rest } = m;
check(manifest_digest === `sha-256:${sha(utf8(canonicalJson(rest)))}`, "ZIP-MANIFEST manifest_digest is sha-256 over JCS of the manifest without it");
check(JSON.stringify(Object.keys(m)) === JSON.stringify(["format", "format_version", "character", "schema", "files", "created_by", "created_at", "export_checks", "signature", "manifest_digest"]), "ZIP-MANIFEST exactly the fields AMU accepted, in that order");
check((await Z.checkSelfMadeCharacterZip(built.bytes)).ok, "ZIP-MANIFEST the export passes the refusal rules");

// ZIP-REFUSE: every AMU refusal, one at a time.
const entriesOf = bytes => Z.readStoredZip(bytes).entries.map(entry => ({ name: entry.name, bytes: entry.bytes }));
const manifestBytes = manifest => utf8(`${JSON.stringify(manifest, null, 2)}\n`);
const withManifest = async (change, { redigest = true } = {}) => {
  const next = structuredClone(m);
  change(next);
  if (redigest) { delete next.manifest_digest; next.manifest_digest = `sha-256:${sha(utf8(canonicalJson(next)))}`; }
  return Z.storedZip([{ name: "saku-character-manifest.json", bytes: manifestBytes(next) }, { name: "character.json", bytes: utf8(characterText) }]);
};
const refused = async (bytes, code, label) => {
  const verdict = await Z.checkSelfMadeCharacterZip(bytes);
  check(!verdict.ok && verdict.errors.some(error => error.startsWith(code)), `ZIP-REFUSE ${label} → ${code} (got ${verdict.errors.join(", ") || "ok"})`);
};
await refused(await withManifest(x => { x.format = "saku-character-archive"; }), "FORMAT_NOT_SELF_MADE", "another format");
await refused(await withManifest(x => { x.signature = "sig"; }), "SIGNATURE_NOT_NONE", "a signature value");
await refused(await withManifest(x => { x.package = { algorithm: "Ed25519" }; }), "PACKAGE_FIELD_PRESENT", "a package field");
await refused(Z.storedZip([...entriesOf(built.bytes), { name: "directives.json", bytes: utf8("{}") }]), "ZIP_ENTRY_UNDECLARED", "a third, undeclared entry");
await refused(Z.storedZip([entriesOf(built.bytes)[0]]), "ZIP_ENTRY_MISSING", "character.json missing");
await refused(Z.storedZip([...entriesOf(built.bytes), entriesOf(built.bytes)[1]]), "ZIP_ENTRY_DUPLICATE", "character.json twice");
await refused(Z.storedZip([entriesOf(built.bytes)[0], { name: "character.json", bytes: utf8(characterText.replace(sample.identity.display_name, "Changed")) }]), "FILE_DIGEST_MISMATCH", "character.json changed after export");
await refused(await withManifest(x => { x.created_at = "2026-01-01T00:00:00Z"; }, { redigest: false }), "MANIFEST_DIGEST_MISMATCH", "the manifest changed after export");
await refused(await withManifest(x => { x.character.display_name = "Someone else"; }), "CHARACTER_FIELD_MISMATCH", "manifest character fields that disagree with character.json");
{
  const tampered = new Uint8Array(built.bytes); tampered[8] = 8;   // method 8 (deflate) in the first local header
  const central = new DataView(tampered.buffer);
  for (let at = tampered.length - 22; at >= 0; at--) if (central.getUint32(at, true) === 0x02014b50) { central.setUint16(at + 10, 8, true); break; }
  await refused(tampered, "ZIP_ENTRY_NOT_STORED", "a compressed entry");
}
{
  const flipped = new Uint8Array(built.bytes); flipped[flipped.length - 200] ^= 1;
  const verdict = await Z.checkSelfMadeCharacterZip(flipped);
  check(!verdict.ok, `ZIP-REFUSE one flipped byte is caught (${verdict.errors.join(", ")})`);
}
await refused(utf8("not a zip"), "ZIP_NOT_READABLE", "not a ZIP");

// ZIP-SCHEMA
const schema = loadAdoptedSchemaFromRepository();   // the same schema and digests the page validates with
check((await validateCompleteAdoptedCharacter(JSON.parse(new TextDecoder().decode(read1.entries[1].bytes)), schema)).ok, "ZIP-SCHEMA character.json passes the adopted Schema");
{
  const broken = structuredClone(sample); delete broken.character_core;
  check(!(await validateCompleteAdoptedCharacter(broken, schema)).ok, "ZIP-SCHEMA falsification: a Character without character_core is refused");
}

// ZIP-FIXTURE: AMU copies this file into its import tests.
const FIXTURE = "tests/fixtures/self-made-character/sample-general-compass.saku-character.zip";
const FIXTURE_SHA256 = "890da0a86b98f942bfd3c850ffb2441052cb38917dcd3f311d4c4c08a42db93d";
const fixture = readFileSync(path.join(ROOT, FIXTURE));
check(sha(fixture) === sha(built.bytes), "ZIP-FIXTURE the committed fixture is exactly what the builder makes from the sample");
check(sha(fixture) === FIXTURE_SHA256, `ZIP-FIXTURE sha256 pinned (${sha(fixture)})`);

// ZIP-UI
const page = read("tools/saku-builder.html");
check(/<button class="pv-btn" id="downloadZipBtn" hidden>AMU 用 ZIP をダウンロード<\/button>/.test(page), "ZIP-UI the ZIP button sits beside Download, hidden until the JSON tab, named for where it goes (ライター&SNS)");
check(read("tools/v1/builder-golden-ui.mjs").includes('"AMU 用 ZIP をダウンロード":"Download ZIP for AMU"'), "ZIP-UI the button has its English name (英語翻訳チーム AB1)");
check(page.includes("画面を開き直してください。直らないときは、SAKU Builder を入れ直してください。") && page.includes("Reopen the screen. If that does not fix it, reinstall SAKU Builder."), "ZIP-UI the not-ready notice says what to do (it does not clear by waiting)");
check(page.includes('zipButton.hidden=curTab!=="json"'), "ZIP-UI the button shows only on the JSON tab");
const handler = page.slice(page.indexOf('document.getElementById("downloadZipBtn").addEventListener'), page.indexOf('document.getElementById("copyBtn").addEventListener'));
const order = ["validateAdoptedOutput()", 'exportCheck("json",data)', "if(!gate.ok)", "buildSelfMadeCharacterZip(", 'invoke("save_self_made_zip"'].map(token => handler.indexOf(token));
check(order.every(index => index > 0) && order.every((index, i) => i === 0 || index > order[i - 1]), "ZIP-UI the adopted Schema, ContactGuard, organization and human gates pass before the ZIP is built and saved");
check(handler.includes('characterText:payloadFor("json",data).text'), "ZIP-UI character.json is the JSON download's text");
check(page.includes('import * as SelfMadeZip from "./unified-v1/self-made-character-zip.mjs";') && page.includes("window.SAKU_SELF_MADE_ZIP = SelfMadeZip;"), "ZIP-UI the module is loaded by the page");

// ZIP-TEXT (ライター&SNS 2026-09-27, EN 依頼 AC): how the Character File reaches AMU and MACHI is
// stated once, as the shared constant, under the Character File tab and in manual P09. The older
// "AMU/MACHI receive it only through a signed pack" is gone from every screen text.
{
  const { CHARACTER_FILE_PURPOSE } = await import("../tools/unified-v1/character-file-text.mjs");
  const purpose = page.match(/json:\{reimport:false,\s*(?:\/\*[^*]*\*\/\s*)?ja:("(?:[^"\\]|\\.)*"),\s*en:("(?:[^"\\]|\\.)*")\}/);
  check(purpose && JSON.parse(purpose[1]) === CHARACTER_FILE_PURPOSE.ja && JSON.parse(purpose[2]) === CHARACTER_FILE_PURPOSE.en, "ZIP-TEXT the Character File tab line is the shared constant (JA and EN)");
  const manual = read("manual/saku-field-guide.html");
  const attr = text => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  check(manual.includes(`data-ja="${attr(CHARACTER_FILE_PURPOSE.ja)}" data-en="${attr(CHARACTER_FILE_PURPOSE.en)}"`), "ZIP-TEXT manual P09 shows the same constant in both languages");
  const OLD_HANDOVER = /署名付きパック経由でのみ|署名付きのパックの形でだけ受け取|only through a signed pack|receive it only through/;
  const surfaces = { "tools/saku-builder.html": page, "tools/v1/builder-golden-ui.mjs": read("tools/v1/builder-golden-ui.mjs"), "manual/saku-field-guide.html": manual, "scripts/generate_frozen_ia_manual.mjs": read("scripts/generate_frozen_ia_manual.mjs") };
  for (const [rel, text] of Object.entries(surfaces)) check(!OLD_HANDOVER.test(text), `ZIP-TEXT ${rel} no longer says the Character File reaches AMU/MACHI only through a signed pack`);
  check((page.match(/MACHI へは、署名付きのパックにして渡します/g) || []).length === 1 && !read("scripts/generate_frozen_ia_manual.mjs").includes("MACHI へは"), "ZIP-TEXT the hand-over sentence is written once on the page, and the manual takes it from the constant");
  check(OLD_HANDOVER.test("AMU/MACHI は署名付きパック経由でのみ受け取る。"), "ZIP-TEXT falsification: the old sentence is detectable");
}

// ZIP-HOST
const host = read("src-tauri/src/main.rs");
check(/fn save_self_made_zip\(filename: String, bytes: Vec<u8>, dialog_title: String\) -> SaveFileResult/.test(host) && /save_builder_file,\s*\n\s*save_self_made_zip,/.test(host), "ZIP-HOST save_self_made_zip is a registered command");
check(host.includes('filename.strip_suffix(SELF_MADE_ZIP_SUFFIX)') && host.includes("bytes[..4] != [0x50, 0x4b, 0x03, 0x04]") && host.includes("fn self_made_zip_saves_only_its_own_file()"), "ZIP-HOST only <slug>.saku-character.zip bytes that start as a ZIP are saved (cargo test covers the refusals)");
for (const manifest of ["desktop/resources/manifests/native-public.json", "desktop/resources/manifests/static-public.json"]) {
  check(JSON.parse(read(manifest)).files.some(([source]) => source === "tools/unified-v1/self-made-character-zip.mjs"), `ZIP-HOST ${manifest} ships the module`);
}

console.log(`SELF_MADE_ZIP PASS ${cases.length}/${cases.length}`);
console.log(`FIXTURE ${FIXTURE} sha256 ${sha(fixture)} bytes ${fixture.length}`);
