// Editor round-trip gate (Owner defect 2026-09-22: 「WI-T ガイド」 could not be saved).
//
// The Builder's authoring module rebuilt `hard_invariants` with Input Integrity
// first, silently moving every other row; the index-based locators in
// conformance_expectations / Seat 8 then pointed at the wrong invariant and the
// locator check (PR #30) refused an unchanged save. It also dropped the
// locator from Seat 8's human_required_condition_refs. This gate proves:
//
//   A. unchanged round trip (fromUnifiedCharacter → toUnifiedCharacter, no
//      revision bump) is IDENTICAL for every Character this repository ships,
//      tests with, or — when the sibling corpora are present — sells; and
//      byte-identical for files written with 2-space JSON (the OSS samples,
//      the 64 catalogue); locator mismatches 0; the authoring validator accepts
//   B. with the revision bump (what Save does) only identity.character_revision differs
//   C. edits: in-place statement edit keeps the index; a new invariant is
//      appended and its locator resolves; base rows the form omitted survive
//      in place; Seat 8 refs keep their locator; relocateRequirementRefs re-points by id
//   D. the module on main reproduces the defect on sample-wit-guide (8 mismatches)
//   E. headless Chrome: the real Builder screen, handed 「WI-T ガイド」, saves
//      without change — no alert, saved Character has 0 mismatches and equals
//      the source except for the revision
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)?.slice(0, 200)})`); cases.push(label); };
const A = await import(pathToFileURL(path.join(ROOT, "tools/v1/unified-authoring.mjs")).href);
const U = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/unified-schema-v1.mjs")).href);
const S = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/character-schema.mjs")).href);
const Adopted = await import(pathToFileURL(path.join(ROOT, "tools/v1/adopted-schema-validator.mjs")).href);
const schema = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/canonical/saku-unified-character.v1.schema.json"), "utf8"));
// admit() asks the adopted schema too (2026-09-23); give it the one the application loads.
const { loadAdoptedSchemaFromRepository } = await import(pathToFileURL(path.join(ROOT, "tools/v1/adopted-schema-node.mjs")).href);
const adoptedSchema = loadAdoptedSchemaFromRepository();
const readJson = file => JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const isCharacter = doc => doc && typeof doc === "object" && doc.schema && doc.identity && doc.conformance_expectations;
const canon = value => JSON.stringify(value);
const roundTrip = (character, bump = false) => A.toUnifiedCharacter(A.fromUnifiedCharacter(character), character, { bumpRevision: bump });

// ── A/B. unchanged round trip over corpora ──────────────────────────────────
function unzip(buffer) {
  const out = new Map(); const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (eocd < 0) return out;
  const count = buffer.readUInt16LE(eocd + 10); let offset = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20), nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength); const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + compressed);
    out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data)); offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}
function* docs(dir) {
  if (!existsSync(dir)) return;
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => { const p = path.join(d, e.name); return e.isDirectory() ? (e.name === "node_modules" || e.name === ".git" ? [] : walk(p)) : [p]; });
  for (const file of walk(dir)) {
    const lower = file.toLowerCase();
    if (lower.endsWith(".json")) { let doc; try { doc = readJson(file); } catch { continue; } const list = Array.isArray(doc) ? doc : doc?.characters || [doc]; for (const [k, c] of list.entries()) if (isCharacter(c)) yield [`${path.relative(dir, file)}${list.length > 1 ? `#${k}` : ""}`, c, list.length === 1 ? readFileSync(file, "utf8") : null]; }
    else if (lower.endsWith(".zip")) { let outer; try { outer = unzip(readFileSync(file)); } catch { continue; } for (const [name, bytes] of outer) { const inner = name.toLowerCase().endsWith(".zip") ? (() => { try { return unzip(bytes); } catch { return new Map(); } })() : new Map([[name, bytes]]); for (const [n2, b2] of inner) if (n2.toLowerCase().endsWith(".json")) { let doc; try { doc = JSON.parse(b2.toString("utf8")); } catch { continue; } if (isCharacter(doc)) yield [`${path.relative(dir, file)}!${name}!${n2}`, doc, null]; } } }
  }
}
const report = [];
function scan(label, iterable, { expectBytes = false } = {}) {
  let n = 0, identical = 0, bytes = 0, bytesChecked = 0, mismatches = 0, valid = 0, bumpOnlyRevision = 0;
  const problems = [];
  for (const [name, character, text] of iterable) {
    n += 1;
    const out = roundTrip(character);
    if (canon(out) === canon(character)) identical += 1; else problems.push(`${name}: not identical`);
    if (U.conformanceLocatorMismatches(out).length === 0) mismatches += 0; else { mismatches += 1; problems.push(`${name}: locator mismatch`); }
    if (Adopted.validateCompleteAdoptedCharacter(out, schema).ok && S.admit(out, { schema: adoptedSchema }).accepted) valid += 1; else problems.push(`${name}: validator refused`);
    if (expectBytes && text !== null) { bytesChecked += 1; if (JSON.stringify(out, null, 2) + "\n" === text) bytes += 1; else problems.push(`${name}: bytes differ`); }
    const bumped = roundTrip(character, true);
    const a = structuredClone(bumped), b = structuredClone(character); delete a.identity.character_revision; delete b.identity.character_revision;
    if (canon(a) === canon(b) && bumped.identity.character_revision !== character.identity.character_revision) bumpOnlyRevision += 1; else problems.push(`${name}: bump changed more than the revision`);
  }
  report.push({ label, characters: n, identical, bytes_identical: expectBytes ? `${bytes}/${bytesChecked}` : "n/a", mismatched: mismatches, valid });
  return { n, identical, bytes, bytesChecked, mismatches, valid, bumpOnlyRevision, problems };
}
{
  const inRepo = [
    ["tools/unified-v1/sample-pack/sample-characters.json", false],
    ["desktop/resources/source/oss-sample-characters.json", false],
    ["tests/fixtures/conformance-locators/positive-sample.json", true],
    ["tests/fixtures/conformance-locators/positive-no-locators.json", true],
  ];
  for (const [rel, expectBytes] of inRepo) {
    const doc = readJson(path.join(ROOT, rel)); const list = doc.characters || [doc];
    const r = scan(rel, list.map((c, k) => [`${rel}#${k}`, c, list.length === 1 ? readFileSync(path.join(ROOT, rel), "utf8") : null]), { expectBytes });
    equal(r.identical, r.n, `A: ${rel} — unchanged round trip identical (${r.n})`);
    equal(r.mismatches, 0, `A: ${rel} — 0 locator mismatches after round trip`);
    equal(r.valid, r.n, `A: ${rel} — validator and admit() accept the round-tripped Character`);
    if (expectBytes) equal(r.bytes, r.bytesChecked, `A: ${rel} — byte-identical (2-space JSON)`);
    equal(r.bumpOnlyRevision, r.n, `B: ${rel} — revision bump changes only identity.character_revision`);
  }
  const canonical = path.resolve(ROOT, "../-SAKU-1-7-Character-System/samples/oss-launch/unified-v1");
  if (existsSync(canonical)) {
    const r = scan("Canonical OSS samples (sample-1/2/3.json + pack)", docs(canonical), { expectBytes: true });
    check(r.n >= 6, `A: Canonical OSS samples — ${r.n} Characters read`);
    equal(r.problems.length, 0, `A: Canonical OSS samples — identical, byte-identical where single-file (${r.bytes}/${r.bytesChecked}), 0 mismatches, valid${r.problems.length ? `\n${r.problems.join("\n")}` : ""}`);
  } else skipped.push("A: sibling Canonical repository absent");
  const corpus = process.env.SAKU_LOCATOR_CORPUS || path.resolve(ROOT, "../../ClaudeCode/codex-handoff-20260911");
  for (const [rel, label, expectBytes] of [["catalog64-unified-v1/characters", "catalog64 (118 sold Characters)", true], ["catalog64-pack/packs-3way-production", "sold packs (json + zip)", false], ["catalog64-pack/subscriber-pack-production", "subscriber pack", false]]) {
    const dir = path.join(corpus, rel);
    if (!existsSync(dir)) { skipped.push(`A: ${rel} absent`); continue; }
    const r = scan(label, docs(dir), { expectBytes });
    check(r.n > 0, `A: ${label} — ${r.n} Characters read`);
    equal(r.problems.length, 0, `A: ${label} — identical${expectBytes ? ` (bytes ${r.bytes}/${r.bytesChecked})` : ""}, 0 mismatches, valid, bump = revision only${r.problems.length ? `\n${r.problems.slice(0, 5).join("\n")}` : ""}`);
  }
  const packs = process.env.SAKU_PACK_FIXTURES || path.resolve(ROOT, "../KOKOROAMU-STUDIO/tests/adapters-character-package/fixtures");
  if (existsSync(packs)) { const r = scan("sold-pack fixtures", docs(packs)); check(r.n >= 54, `A: sold-pack fixtures — ${r.n} Characters`); equal(r.problems.length, 0, `A: sold-pack fixtures — identical, 0 mismatches, valid`); } else skipped.push("A: pack fixtures absent");
}

// ── C. edits ────────────────────────────────────────────────────────────────
{
  const source = readJson(path.join(ROOT, "tests/fixtures/conformance-locators/positive-sample.json")); // [C90-1, C90-2, INPUT-INTEGRITY]
  const ids = c => c.character_core.hard_invariants.map(i => i.id);
  // in-place statement edit keeps the index
  let form = A.fromUnifiedCharacter(source);
  form.unified.hard_invariants[1].statement = "改めた文";
  let out = A.toUnifiedCharacter(form, source, { bumpRevision: false });
  equal(ids(out).join(","), ids(source).join(","), "C: editing a statement keeps the invariant order");
  equal(out.character_core.hard_invariants[1].statement, "改めた文", "C: the edited statement is written in place");
  equal(U.conformanceLocatorMismatches(out).length, 0, "C: locators still resolve after an in-place edit");
  // new invariant appended; existing locators unchanged; a new ref with a locator resolves
  form = A.fromUnifiedCharacter(source);
  form.unified.hard_invariants.push({ id: "INV-NEW-1", statement: "新しい不変条件" });
  form.unified.continuity_refs.push({ requirement_id: "INV-NEW-1", locator: "/character_core/hard_invariants/0" });
  out = A.toUnifiedCharacter(form, source, { bumpRevision: false });
  equal(ids(out).join(","), [...ids(source), "INV-NEW-1"].join(","), "C: a new invariant is appended at the end");
  equal(JSON.stringify(out.conformance_expectations.must_preserve_refs), JSON.stringify(source.conformance_expectations.must_preserve_refs), "C: existing refs keep their locators");
  equal(out.conformance_expectations.continuity_refs.at(-1).locator, "/character_core/hard_invariants/3", "C: the new ref's locator is re-pointed by id");
  equal(U.conformanceLocatorMismatches(out).length, 0, "C: 0 mismatches after adding an invariant");
  // a base row the form omitted survives in place (existing retention semantics)
  form = A.fromUnifiedCharacter(source);
  form.unified.hard_invariants = form.unified.hard_invariants.filter(i => i.id !== "INV-OSS-C90-1");
  out = A.toUnifiedCharacter(form, source, { bumpRevision: false });
  equal(ids(out).join(","), ids(source).join(","), "C: a base row omitted by the form is retained in place (no silent removal)");
  // form rows reordered → base order wins, locators still resolve
  form = A.fromUnifiedCharacter(source);
  form.unified.hard_invariants.reverse();
  out = A.toUnifiedCharacter(form, source, { bumpRevision: false });
  equal(ids(out).join(","), ids(source).join(","), "C: reordering rows in the form does not move the array (base order is authoritative)");
  equal(U.conformanceLocatorMismatches(out).length, 0, "C: locators resolve after a form reorder");
  // Seat 8 refs keep their locator; toggling off removes the ref; toggling on a handoff without a previous ref yields a ref without locator
  form = A.fromUnifiedCharacter(source);
  out = A.toUnifiedCharacter(form, source, { bumpRevision: false });
  equal(JSON.stringify(out.assistant_composition.seat8.human_required_condition_refs), JSON.stringify(source.assistant_composition.seat8.human_required_condition_refs), "C: Seat 8 refs keep requirement_id and locator");
  form.unified.human_handoff_conditions[0].seat8_required = false;
  out = A.toUnifiedCharacter(form, source, { bumpRevision: false });
  equal(out.assistant_composition.seat8.human_required_condition_refs.length, 0, "C: un-marking the handoff removes the Seat 8 ref");
  // relocateRequirementRefs on a swapped fixture repairs every locator
  const swapped = readJson(path.join(ROOT, "tests/fixtures/conformance-locators/swapped-hard-invariants.json"));
  const repaired = structuredClone(swapped);
  equal(A.relocateRequirementRefs(repaired), 6, "C: relocateRequirementRefs rewrites the 6 swapped locators");
  equal(U.conformanceLocatorMismatches(repaired).length, 0, "C: the repaired fixture has 0 mismatches");
  equal(A.relocateRequirementRefs(structuredClone(source)), 0, "C: relocateRequirementRefs is a no-op on a correct Character");
  // a new Character (no base) still gets Input Integrity first
  const fresh = A.toUnifiedCharacter({ meta: { name: "新規", slug: "fresh-one", version: "1.0.0" }, unified: { ...A.blankUnifiedExtras(), hard_invariants: [{ id: "INV-A", statement: "a" }] } });
  equal(fresh.character_core.hard_invariants[0].id, "INV-INPUT-INTEGRITY", "C: a Character without a base gets Input Integrity first, authored rows after");
}

// ── D. the module on main reproduces the defect ─────────────────────────────
{
  const tmp = mkdtempSync(path.join(tmpdir(), "saku-authoring-main-"));
  try {
    const bytes = execFileSync("git", ["show", "main:tools/v1/unified-authoring.mjs"], { cwd: ROOT, maxBuffer: 1 << 24 });
    const text = bytes.toString("utf8");
    if (text.includes("relocateRequirementRefs")) skipped.push("D: main already carries the fix (branch merged) — before/after comparison not applicable");
    else {
      // the module imports ../unified-v1/unified-schema-v1.mjs relatively: mirror the layout
      const dirV1 = path.join(tmp, "v1"), dirU = path.join(tmp, "unified-v1");
      for (const d of [dirV1, dirU]) rmSync(d, { recursive: true, force: true });
      mkdirSync(dirV1, { recursive: true }); mkdirSync(dirU, { recursive: true });
      writeFileSync(path.join(dirV1, "unified-authoring.mjs"), bytes);
      writeFileSync(path.join(dirU, "unified-schema-v1.mjs"), readFileSync(path.join(ROOT, "tools/unified-v1/unified-schema-v1.mjs")));
      const Main = await import(pathToFileURL(path.join(dirV1, "unified-authoring.mjs")).href);
      const wit = readJson(path.join(ROOT, "tools/unified-v1/sample-pack/sample-characters.json")).characters.find(c => c.identity.character_id === "sample-wit-guide");
      const before = Main.toUnifiedCharacter(Main.fromUnifiedCharacter(wit), wit, { bumpRevision: false });
      equal(before.character_core.hard_invariants[0].id, "INV-INPUT-INTEGRITY", "D: main's module moves Input Integrity to the front of 「WI-T ガイド」");
      equal(U.conformanceLocatorMismatches(before).length, 8, "D: main's module produces the 8 locator mismatches the Owner saw");
      equal(Adopted.validateCompleteAdoptedCharacter(before, schema).ok, false, "D: the authoring validator refuses main's output (the save dialog)");
      check(!("locator" in (before.assistant_composition.seat8.human_required_condition_refs[0] || {})), "D: main's module also drops the Seat 8 locator");
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
// ── E. the real Builder screen: 「WI-T ガイド」 saved without change ──────────
{
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
  const DIST = path.join(ROOT, ".desktop-dist");
  if (!chrome) skipped.push("E: Chrome not found");
  else if (!existsSync(path.join(DIST, "tools/saku-builder.html"))) skipped.push("E: .desktop-dist not prepared (run desktop:prepare)");
  else {
    const wit = readJson(path.join(ROOT, "tools/unified-v1/sample-pack/sample-characters.json")).characters.find(c => c.identity.character_id === "sample-wit-guide");
    const mime = new Map([[".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"], [".ico", "image/x-icon"], [".png", "image/png"]]);
    const harness = `<!doctype html><meta charset="utf-8"><pre id="r" data-status="RUNNING"></pre><script type="module">
const r=document.getElementById("r");const out=[];const check=(c,n)=>{if(!c)throw new Error(n);out.push(n);};const wait=ms=>new Promise(x=>setTimeout(x,ms));
const SRC=${JSON.stringify(wit)};
try{
 localStorage.clear();
 const {storeHandoff}=await import("/tools/unified-v1/handoff-binding.mjs");
 storeHandoff(localStorage,"character",SRC);
 const f=document.createElement("iframe");f.style.cssText="width:1400px;height:1000px;border:0";f.src="/tools/saku-builder.html";document.body.append(f);
 await new Promise(res=>f.addEventListener("load",res,{once:true}));await wait(1500);
 const d=f.contentDocument,w=f.contentWindow;const alerts=[];w.alert=m=>alerts.push(String(m));
 const val=p=>{const el=d.querySelector('[data-path="'+p+'"]');return el?el.value:null;};
 check(val("meta.name")==="WI-T ガイド","E: the editor shows 「WI-T ガイド」 (saw "+val("meta.name")+")");
 const draft=JSON.parse(w.toSakuJson(w.__saku_data()));
 check(draft.character_core.hard_invariants.map(i=>i.id).join(",")==="INV-OSS-H90-1,INV-OSS-H90-2,INV-INPUT-INTEGRITY","E: the unchanged draft keeps the source invariant order");
 const lib=()=>{try{return JSON.parse(localStorage.getItem("saku.workspace.library")).entries||[];}catch{return [];}};
 const before=lib().length;const durable=[];w.__TAURI__={core:{invoke:async(name,args)=>{if(name!=="save_workspace_character")throw new Error("UNEXPECTED_"+name);durable.push(args);return "C:/ws/characters/x.json";}}};
 const save=d.getElementById("saveUnifiedCharacter");check(save&&!save.hidden,"E: Save is offered");
 save.click();for(let i=0;i<40&&lib().length===before;i++)await wait(100);
 check(alerts.length===0,"E: no 保存できません dialog (alerts: "+alerts.join(" | ").slice(0,300)+")");
 check(lib().length===before+1,"E: Save added the Character to the Library");
 const saved=lib().at(-1).character;
 const {conformanceLocatorMismatches}=await import("/tools/unified-v1/unified-schema-v1.mjs");
 check(conformanceLocatorMismatches(saved).length===0,"E: the saved Character has 0 locator mismatches");
 check(saved.character_core.hard_invariants.map(i=>i.id).join(",")==="INV-OSS-H90-1,INV-OSS-H90-2,INV-INPUT-INTEGRITY","E: saved invariant order = source order");
 check(JSON.stringify(saved.assistant_composition.seat8.human_required_condition_refs)===JSON.stringify(SRC.assistant_composition.seat8.human_required_condition_refs),"E: Seat 8 refs (with locator) preserved");
 const a=structuredClone(saved),b=structuredClone(SRC);delete a.identity.character_revision;delete b.identity.character_revision;
 check(JSON.stringify(a)===JSON.stringify(b),"E: saved Character equals the source except for the revision");
 check(saved.identity.character_revision!==SRC.identity.character_revision,"E: Save produced a new revision ("+saved.identity.character_revision+")");
 check(durable.length===1&&JSON.parse(durable[0].characterJson).identity.character_id==="sample-wit-guide","E: the workspace write carries the same Character");
 r.textContent=out.join("\\n");r.dataset.status="PASS";
}catch(error){r.textContent=(out.join("\\n")+"\\nFAIL "+error.message).trim();r.dataset.status="FAIL";}
</script>`;
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/__harness") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(harness); return; }
      try { const file = path.join(DIST, url.pathname.slice(1)); const body = await readFile(file); response.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream" }); response.end(body); }
      catch { response.writeHead(404); response.end("not found"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "saku-roundtrip-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--enable-logging=stderr", `--user-data-dir=${profile}`, "--virtual-time-budget=20000", "--dump-dom", `http://127.0.0.1:${server.address().port}/__harness`], { windowsHide: true });
    let dom = "", log = ""; child.stdout.on("data", c => dom += c); child.stderr.on("data", c => log += c);
    await new Promise(resolve => child.on("close", resolve)); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
    const status = /data-status="([A-Z]+)"/.exec(dom)?.[1] || "UNKNOWN";
    const body = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
    for (const line of body.split("\n").filter(Boolean)) { if (line.startsWith("FAIL")) { console.error(line); console.error(log.split(/\r?\n/).filter(l => /error|fail|uncaught/i.test(l)).slice(-10).join("\n")); process.exit(1); } cases.push(line); }
    if (status !== "PASS") { console.error(`E: browser status ${status}`); process.exit(1); }
  }
}

console.log(JSON.stringify({ cases: cases.length, skipped, corpus: report }, null, 1));
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`AUTHORING_ROUNDTRIP PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped)` : ""}`);
console.log(`UNCHANGED_SAVE identical / LOCATORS re-pointed by id / INPUT_INTEGRITY keeps its place / SEAT8 locator kept`);
