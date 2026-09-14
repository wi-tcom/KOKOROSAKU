// SAKU Builder — the Character list the Owner builds up.
//
// The previous screen showed whatever the last import left behind. It now holds
// a list that survives further imports, soft-deletes rows, clears only on
// confirmation, and reads YAML as well as JSON. Every one of those is a
// behaviour, not a marker, so this gate performs them:
//
//   * the module, against a storage stub, for the state rules
//   * the YAML reader, for what it accepts and what it refuses
//   * the packaged page in a real browser, for what the Owner actually clicks
//
// The third part exists because the last two defects on this project both
// passed gates that only looked at source text or at an element's presence.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, ".desktop-dist");
let passed = 0;
const ok = (condition, name) => { assert.ok(condition, name); passed += 1; console.log(`  PASS ${name}`); };

// ── the module, with storage it cannot rely on ───────────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: key => { store.delete(key); },
};
const Library = await import("../tools/unified-v1/character-library.mjs");
// Intake decides this; a test that inserts directly has to state it, because
// the library no longer accepts a Character of unstated schema.
const LEGACY_SCHEMA_VERSION = ["v", "next-1.0"].join("");
const LEGACY_SCHEMA = { kind: "LEGACY_SCHEMA_CHARACTER", schema_id: "saku.character", schema_version: LEGACY_SCHEMA_VERSION };

// Intake validates the whole composition now, so the fixture carries one. A
// half-built Character is a different test, and it lives in the compatibility
// gate rather than here.
const composition = () => {
  const fns = ["FRONT_COORDINATOR", "SPECIALIST", "FACT_CHECKER", "SAFETY_BOUNDARY", "USER_ADVOCATE", "RED_TEAM", "FORWARD_DRIVER"];
  const comp = { profile_version: LEGACY_SCHEMA_VERSION };
  fns.forEach((fn, index) => { comp[`seat${index + 1}`] = { function: fn, archetype: "X", intensity: "MEDIUM" }; });
  comp.seat8 = { function: "HUMAN", archetype: "HUMAN" };
  return comp;
};

const character = (id, name) => ({
  schema: { schema_id: "saku.character", schema_version: LEGACY_SCHEMA_VERSION },
  identity: { character_id: id, character_revision: "1.0.0", display_name: name, catalog: { catalog_code: "C01", catalog_group: "CORE_CROSS_FUNCTIONAL", role_label: "role" } },
  purpose: { summary: `${name} の概要` },
  assistant_composition: composition(),
});

console.log("CHARACTER_LIBRARY");
Library.clear();
Library.importCharacters([character("a", "あかり"), character("b", "ベル")], "PACKAGE", { verification: { status: "IMPORTED", code: "PACKAGE_IMPORTED" }, schema: LEGACY_SCHEMA });
ok(Library.list().length === 2, "an imported package lands in the list");

// A second import must add to the list, not replace it — the defect that made
// this module necessary.
Library.importCharacters([character("c", "カイ")], "PACKAGE", { schema: LEGACY_SCHEMA });
ok(Library.list().length === 3, "a second import adds rather than replaces");

const conflicts = Library.nameConflicts([character("a2", "あかり")]);
ok(conflicts.length === 1 && conflicts[0].name === "あかり", "a repeated name is reported before importing");

Library.importCharacters([character("a2", "あかり")], "FILE", { onConflict: "KEEP_BOTH", schema: LEGACY_SCHEMA });
ok(Library.list().filter(entry => Library.displayNameOf(entry.character) === "あかり").length === 2, "keep both leaves two rows with the same name");

Library.importCharacters([character("a3", "あかり")], "FILE", { onConflict: "REPLACE", schema: LEGACY_SCHEMA });
const akari = Library.list().filter(entry => Library.displayNameOf(entry.character) === "あかり");
ok(akari.length === 2 && akari.some(entry => entry.character.identity.character_id === "a3"), "replace overwrites one row instead of adding a third");

const target = Library.list()[0];
Library.setDeleted([target.entry_id], true);
ok(Library.list().length === 3 && Library.list({ includeDeleted: true }).length === 4, "a deleted Character leaves the list but not the store");
ok(Library.get(target.entry_id) !== null, "a deleted Character can still be found by id");
Library.setDeleted([target.entry_id], false);
ok(Library.list().length === 4, "a deleted Character can be restored");

const draft = Library.createDraft("NEW");
ok(draft.entry.draft === true && Library.list().length === 5, "a new Character joins the list immediately");
ok(Object.keys(draft.entry.character.assistant_composition).filter(key => key.startsWith("seat")).length === 8, "a new Character starts with all eight seats");

const cleared = Library.clear();
ok(cleared.removed === 5 && Library.list({ includeDeleted: true }).length === 0, "clearing removes every row");

// Storage that refuses to write must be reported, not swallowed.
const good = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
const refused = Library.importCharacters([character("x", "エックス")], "FILE", { schema: LEGACY_SCHEMA });
ok(refused.saved === false && refused.reason.includes("Quota"), "a storage failure is reported, not silently lost");
globalThis.localStorage.setItem = good;
Library.clear();

// ── the YAML reader ──────────────────────────────────────────────────────────
console.log("YAML_READER");
const { parseYaml, parseCharacterText, YamlLiteError, parseYamlWithReport } = await import("../tools/unified-v1/yaml-lite.mjs");
const sample = JSON.parse(await readFile(path.join(ROOT, "desktop/resources/source/oss-sample-characters.json"), "utf8")).characters[0];

const yaml = [
  `schema: { schema_id: saku.character, schema_version: "${LEGACY_SCHEMA_VERSION}" }`,
  "identity:",
  "  character_id: sample-general-compass",
  "  display_name: サンプル・コンパス   # trailing comment",
  "  catalog: { catalog_code: C90, role_label: \"General Sample\" }",
  "purpose:",
  "  work_modes: [ANALYSIS, PLANNING]",
  "  non_goals:",
  "    - 権限者判断の代行",
  "    - 未確認情報の断定",
  "core:",
  "  hard_invariants:",
  "    - { id: INV-1, statement: 未確認の内容を事実として扱わない。 }",
  "  depth: 2000",
  "  enabled: true",
  "  missing: null",
].join("\n");
const parsed = parseYaml(yaml);
ok(parsed.identity.character_id === "sample-general-compass", "block mapping reads a nested scalar");
ok(parsed.identity.display_name === "サンプル・コンパス", "a trailing comment is not part of the value");
ok(parsed.schema.schema_version === LEGACY_SCHEMA_VERSION && parsed.identity.catalog.catalog_code === "C90", "a flow mapping reads as a mapping");
ok(Array.isArray(parsed.purpose.work_modes) && parsed.purpose.work_modes.length === 2, "a flow sequence reads as a list");
ok(parsed.purpose.non_goals[1] === "未確認情報の断定", "a block sequence reads as a list");
ok(parsed.core.hard_invariants[0].id === "INV-1", "a flow mapping inside a sequence item is not mistaken for a key");
ok(parsed.core.depth === 2000 && parsed.core.enabled === true && parsed.core.missing === null, "numbers, booleans and null read as themselves");

// Round trip a real shipped Character through YAML the reader must accept.
const empty = value => (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0);
const emit = (value, indent = 0) => {
  const pad = " ".repeat(indent);
  const inline = item => (Array.isArray(item) ? "[]" : "{}");
  if (Array.isArray(value)) {
    return value.map(item => (item && typeof item === "object"
      ? (empty(item) ? `${pad}- ${inline(item)}` : `${pad}-\n${emit(item, indent + 2)}`)
      : `${pad}- ${JSON.stringify(item)}`)).join("\n");
  }
  return Object.entries(value).map(([key, item]) => (item && typeof item === "object"
    ? (empty(item) ? `${pad}${key}: ${inline(item)}` : `${pad}${key}:\n${emit(item, indent + 2)}`)
    : `${pad}${key}: ${JSON.stringify(item)}`)).join("\n");
};
const roundTripped = parseYaml(emit(sample));
ok(JSON.stringify(roundTripped) === JSON.stringify(sample), "a real shipped Character survives a YAML round trip unchanged");

const refuses = (text, needle) => {
  try { parseYaml(text); return false; }
  catch (error) { return error instanceof YamlLiteError && error.message.includes(needle); }
};
ok(refuses("a: &anchor 1\nb: *anchor", "Anchors"), "anchors are refused, not resolved as text");
ok(refuses("a: |\n  block", "Block scalars"), "block scalars are refused");
ok(refuses("a: 1\n---\nb: 2", "Multiple YAML documents"), "a second document is refused");
ok(refuses("a:\n\tb: 1", "Tab"), "tab indentation is refused");
ok(refuses("a: { b: 1", "Expected ',' or '}'"), "an unclosed flow mapping is refused");
ok(refuses("a: 1\na: 2", "Duplicate key"), "a duplicate key is refused rather than silently overwritten");

// The one real-world hazard: an unquoted comma inside a flow mapping cuts the
// scalar short. Read it the way every YAML reader does, and say so.
const cut = parseYamlWithReport('catalog: { role_label: Finish, Record & Handoff）, code: X }');
ok(cut.warnings.some(warning => warning.code === "FLOW_KEY_WITHOUT_VALUE"), "a value cut short by an unquoted comma is reported");

ok(parseCharacterText('{"identity":{"character_id":"j"}}', "x.json").format === "JSON", "a JSON file is read as JSON");
ok(parseCharacterText("identity:\n  character_id: y", "x.yaml").value.identity.character_id === "y", "a YAML file is read as YAML");
try { parseCharacterText("{ broken", "x.json"); assert.fail("should have thrown"); }
catch (error) { ok(error instanceof YamlLiteError, "broken JSON is refused with a clear error"); }

// ── the packaged page, in a browser ──────────────────────────────────────────
console.log("SELECTION_SCREEN");
const chrome = [process.env.SAKU_CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].filter(Boolean);
let browser = "";
for (const candidate of chrome) { try { if ((await stat(candidate)).isFile()) { browser = candidate; break; } } catch { /* next */ } }
if (!browser) { console.error("CHARACTER_LIBRARY NOT_AVAILABLE / CHROME_NOT_FOUND"); process.exit(2); }

const pack = JSON.stringify({ characters: [character("p1", "一号"), character("p2", "二号")] });
const mime = new Map([[".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"]]);

const harness = `<!doctype html><meta charset="utf-8"><title>LIB</title>
<pre id="r" data-status="RUNNING"></pre>
<script type="module">
const r=document.getElementById("r");const checks=[];
const LEGACY_SCHEMA_VERSION=["v","next-1.0"].join("");
const check=(c,n)=>{ if(!c) throw new Error(n); checks.push(n); };
const wait=ms=>new Promise(x=>setTimeout(x,ms));
try{
  localStorage.clear();
  localStorage.setItem("saku.desktop.pendingPack", ${JSON.stringify(pack)});
  const f=document.createElement("iframe");
  f.style.cssText="width:1280px;height:900px;border:0";
  f.src="/index.html";
  document.body.append(f);
  await new Promise(res=>f.addEventListener("load",res,{once:true}));
  await wait(900);
  const d=f.contentDocument,w=f.contentWindow;

  check(d.getElementById("selected-character-name").textContent==="未選択","TOP says 未選択 before anything is chosen");
  check(!d.getElementById("step-source"),"the Package / 新規作成 card is gone from TOP");
  check(d.getElementById("view-characters").textContent.includes("キャラクターを選択する"),"entry 01 reads as choosing a Character");

  d.getElementById("view-characters").click();
  await wait(600);
  const cards=()=>[...d.querySelectorAll("#viewer-results .catalog-card")];
  check(cards().length===2,"the handoff pack is adopted into the list ("+cards().length+")");
  check(cards()[0].querySelector("strong").textContent.length>0,"a card shows the Character name");
  check([...d.querySelectorAll(".catalog-summary")].some(node=>node.textContent.includes("概要")),"a card shows the summary, not just the name");

  // The list must survive a second import instead of being replaced by it.
  w.__saku_home.renderLibrary();
  const Library=await import("/tools/unified-v1/character-library.mjs");
  Library.importCharacters([{schema:{schema_id:"saku.character",schema_version:LEGACY_SCHEMA_VERSION},identity:{character_id:"p3",character_revision:"1.0.0",display_name:"三号"},purpose:{summary:"三号 の概要"},assistant_composition:{seat1:{function:"FRONT_COORDINATOR"},seat2:{function:"SPECIALIST"},seat3:{function:"FACT_CHECKER"},seat4:{function:"SAFETY_BOUNDARY"},seat5:{function:"USER_ADVOCATE"},seat6:{function:"RED_TEAM"},seat7:{function:"FORWARD_DRIVER"},seat8:{function:"HUMAN"}}}],"PACKAGE",{schema:{kind:"LEGACY_SCHEMA_CHARACTER",schema_id:"saku.character",schema_version:LEGACY_SCHEMA_VERSION}});
  w.__saku_home.renderLibrary();
  await wait(200);
  check(cards().length===3,"a further import adds to the list rather than replacing it");

  // Individual import, through the same path the button uses.
  const yamlFile={name:"one.yaml",text:async()=>"schema: { schema_id: saku.character, schema_version: \\""+LEGACY_SCHEMA_VERSION+"\\" }\\nidentity:\\n  character_id: y1\\n  character_revision: \\"1.0.0\\"\\n  display_name: 四号\\npurpose:\\n  summary: 四号 の概要\\nassistant_composition:\\n  seat1: { function: FRONT_COORDINATOR }\\n  seat2: { function: SPECIALIST }\\n  seat3: { function: FACT_CHECKER }\\n  seat4: { function: SAFETY_BOUNDARY }\\n  seat5: { function: USER_ADVOCATE }\\n  seat6: { function: RED_TEAM }\\n  seat7: { function: FORWARD_DRIVER }\\n  seat8: { function: HUMAN }"};
  w.confirm=()=>false;
  await w.__saku_home.importCharacterFiles([yamlFile]);
  await wait(200);
  check(cards().length===4,"a YAML file imports into the list");
  check(cards().some(card=>card.textContent.includes("四号")),"the YAML Character appears by name");

  const badFile={name:"bad.yaml",text:async()=>"a: &x 1\\nb: *x"};
  await w.__saku_home.importCharacterFiles([badFile]);
  await wait(200);
  check(cards().length===4,"a YAML file it cannot read does not add anything");
  check(d.getElementById("viewer-status").textContent.includes("bad.yaml"),"the unreadable file is named in the status");

  // Deleting the checked rows is a flag, and the filter brings them back.
  const box=cards()[0].querySelector("input[type=checkbox]");
  box.click();
  await wait(120);
  d.getElementById("viewer-delete-selected").click();
  await wait(250);
  check(cards().length===3,"the checked Character leaves the list");
  d.getElementById("catalog-deleted").value="SHOW";
  d.getElementById("catalog-deleted").dispatchEvent(new w.Event("change"));
  await wait(200);
  check(cards().length===4,"the deleted Character comes back with the filter");
  check(cards().some(card=>card.dataset.deleted==="true"),"the deleted Character is marked as deleted");

  // Choosing a card asks what to do with it.
  const open=cards().find(card=>card.dataset.deleted!=="true").querySelector("[data-open-id]");
  open.click();
  await wait(200);
  const dialog=d.getElementById("character-actions");
  check(dialog.open===true,"clicking a card opens the action menu");
  const menuActions=[...dialog.querySelectorAll("[data-character-action]")].map(b=>b.dataset.characterAction);
  // Tuning added a fifth action. The guarantee is that the original four are
  // still there, not that the count never changes.
  check(["view","edit","train","delete"].every(a=>menuActions.includes(a)),"the menu keeps the original four actions ("+menuActions.join(",")+")");
  dialog.querySelector('[data-character-action="view"]').click();
  await wait(250);
  check(dialog.open===false,"choosing an action closes the menu");
  check(w.localStorage.getItem("saku.workspace.active")!==null,"choosing 見る makes it the selected Character");

  d.getElementById("viewer-back").click();
  await wait(200);
  check(d.getElementById("selected-character-name").textContent!=="未選択","TOP now names the selected Character");
  check(d.getElementById("host-status").textContent.includes("編集やトレーニング")||d.getElementById("host-status").textContent.includes("DESKTOP_HOST"),"TOP moves on from asking for a Character");

  // What just arrived, and what is checked, must be findable among many rows.
  d.getElementById("view-characters").click();
  await wait(300);
  check(cards().some(card=>card.dataset.new==="true"),"the rows that just arrived are marked");
  check(cards().some(card=>card.querySelector(".catalog-badge")),"a newly added row carries a badge");
  check(cards().filter(card=>card.dataset.new==="true").length<cards().length,"the mark distinguishes the new rows from the rest");
  const pick=cards().find(card=>card.dataset.checked!=="true");
  pick.querySelector("input[type=checkbox]").click();
  await wait(150);
  check(pick.dataset.checked==="true","a checked row is marked as checked");
  const checkedStyle=w.getComputedStyle(pick);
  check(parseFloat(checkedStyle.borderTopWidth)>=2,"a checked row is visibly heavier than an unchecked one ("+checkedStyle.borderTopWidth+")");
  pick.querySelector("input[type=checkbox]").click();
  await wait(150);
  check(pick.dataset.checked==="false","unchecking removes the mark");

  // The subject line must not read as one more list row.
  d.getElementById("viewer-back").click();
  await wait(250);
  const subjectStyle=w.getComputedStyle(d.getElementById("selected-character"));
  check(parseFloat(subjectStyle.borderTopWidth)>=2,"the subject line is drawn heavier than the panels around it ("+subjectStyle.borderTopWidth+")");
  check(subjectStyle.boxShadow!=="none","the subject line stands off the page");

  // The action the Owner reads must say what it does.
  d.getElementById("view-characters").click();
  await wait(300);
  cards()[0].querySelector("[data-open-id]").click();
  await wait(200);
  check(d.querySelector('[data-character-action="view"]').textContent.includes("このキャラクターを選択する"),"the menu says the action selects the Character");
  d.getElementById("character-actions-close").click();
  await wait(150);

  // 編集 carries the subject. The row is keyed by its entry, so a handoff that
  // passes the row key as the character_id fails identity and takes the subject
  // with it — which is exactly what happened.
  const target=cards().find(card=>card.dataset.deleted!=="true");
  const targetName=target.querySelector("strong").textContent;
  const targetEntryId=target.querySelector("[data-open-id]").dataset.openId;
  const libraryBeforeHandoff=JSON.parse(w.localStorage.getItem("saku.workspace.library")||"null");
  const handedBeforeHandoff=libraryBeforeHandoff?.entries?.find(entry=>entry.entry_id===targetEntryId)?.character||null;
  target.querySelector("[data-open-id]").click();
  await wait(200);
  d.querySelector('[data-character-action="edit"]').click();
  await wait(900);
  const active=JSON.parse(w.localStorage.getItem("saku.workspace.active")||"null");
  check(active!==null,"編集 leaves the subject set, not cleared");
  check((active.identity.display_name||"")===targetName,"編集 carries the Character that was chosen");
  check(!String(active.identity.character_id||"").startsWith("entry-"),"the subject carries the Character's own id, not the row key");
  // Storage holding the right value proves nothing about what the Builder shows.
  // It opened blank once while every stored value was correct, because the row
  // was handed to an editor that reads a different schema. Editing now lands on
  // the V1-baseline Builder, and that surface authors the v1 migration-source
  // schema: it shares no field path with Unified V1, so it must not pretend to
  // have loaded the Character. It must name what it received instead.
  const bd=f.contentDocument;
  check(!f.contentWindow.location.pathname.includes("saku-builder-unified-v1"),"編集 does not open the legacy-schema Builder (saw: "+f.contentWindow.location.pathname+")");
  check(f.contentWindow.location.pathname.includes("saku-builder.html"),"編集 opens the V1-baseline Builder");
  for(let i=0;i<40&&!bd.getElementById("desktopHandoffNotice");i++) await wait(100);
  const notice=bd.getElementById("desktopHandoffNotice");
  check(Boolean(notice),"編集 states which Character was handed off instead of showing an unexplained form");
  check(notice.textContent.includes(targetName),"the notice names the Character that was chosen (saw: "+notice.textContent.slice(0,80)+")");
  // The expected state follows the handed-off Character's own declaration, so
  // this cannot pass by declaring everything unauthorable.
  // The pending handoff is single-use and may already be consumed by the
  // destination. Capture the exact selected library Character before navigation
  // instead of trying to reconstruct the consumed envelope afterwards.
  const declaredId=String((handedBeforeHandoff&&handedBeforeHandoff.schema&&handedBeforeHandoff.schema.schema_id)||"");
  const expectedState=declaredId==="SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE"?"POPULATED_FROM_UNIFIED_V1":(declaredId?"DECLARED_NOT_UNIFIED":"SCHEMA_NOT_DECLARED");
  check(notice.dataset.handoffState===expectedState,"the notice reports the state the handed-off Character's schema implies (expected "+expectedState+", saw "+notice.dataset.handoffState+")");
  check(notice.dataset.handoffSchemaId===(declaredId||"UNDECLARED"),"the notice reports the schema it actually received");
  check(notice.textContent.includes("変更されていません"),"the notice states the Character was not modified");

  // A Character that cannot be edited must say why, not arrive as a blank form.
  f.src="/index.html";
  await new Promise(res=>f.addEventListener("load",res,{once:true}));
  await wait(700);
  const dr=f.contentDocument;
  const Lib2=await import("/tools/unified-v1/character-library.mjs");
  Lib2.importCharacters([{schema:{schema_id:"saku.character",schema_version:LEGACY_SCHEMA_VERSION},identity:{character_id:"norev",display_name:"版なし"},purpose:{summary:"版なし の概要"},assistant_composition:{seat1:{function:"FRONT_COORDINATOR"},seat2:{function:"SPECIALIST"},seat3:{function:"FACT_CHECKER"},seat4:{function:"SAFETY_BOUNDARY"},seat5:{function:"USER_ADVOCATE"},seat6:{function:"RED_TEAM"},seat7:{function:"FORWARD_DRIVER"},seat8:{function:"HUMAN"}}}],"FILE",{schema:{kind:"LEGACY_SCHEMA_CHARACTER",schema_id:"saku.character",schema_version:LEGACY_SCHEMA_VERSION}});
  dr.getElementById("view-characters").click();
  await wait(600);
  const norev=[...dr.querySelectorAll("#viewer-results .catalog-card")].find(card=>card.textContent.includes("版なし"));
  norev.querySelector("[data-open-id]").click();
  await wait(200);
  dr.querySelector('[data-character-action="edit"]').click();
  await wait(600);
  check(dr.getElementById("viewer-status").textContent.includes("character_revision"),"a Character with no revision is refused by name, not opened blank");
  check(f.contentWindow.location.pathname.endsWith("/index.html"),"the refusal keeps the Owner on the list");

  // Any handoff URL must carry the Character's own id.
  f.src="/index.html";
  await new Promise(res=>f.addEventListener("load",res,{once:true}));
  await wait(700);
  const d2=f.contentDocument;
  check(d2.getElementById("selected-character-name").textContent===targetName,"returning to TOP still names the Character (TOP="+d2.getElementById("selected-character-name").textContent+" expected="+targetName+")");
  d2.getElementById("view-characters").click();
  await wait(500);
  const trainerLink=d2.querySelector("#viewer-detail [data-trainer-handoff]");
  check(Boolean(trainerLink),"the detail pane offers a Trainer handoff");
  check(!/character_id=entry-/.test(trainerLink.getAttribute("href")),"the Trainer handoff carries the Character's own id, not the row key");

  // Clearing asks first, and a refusal really does keep the list. The frame has
  // navigated since the first checks, so read the document it holds now.
  const w2=f.contentWindow;
  const cards2=()=>[...d2.querySelectorAll("#viewer-results .catalog-card")];
  const before=cards2().length;
  check(before>0,"the list is still there after the Builder round trip ("+before+")");
  w2.confirm=()=>false;
  d2.getElementById("viewer-clear-list").click();
  await wait(200);
  check(cards2().length===before,"declining the confirmation keeps the list");
  w2.confirm=()=>true;
  d2.getElementById("viewer-clear-list").click();
  await wait(250);
  check(cards2().length===0,"confirming clears the list");
  check(d2.getElementById("viewer-empty").hidden===false,"an empty list says so");

  check(!w2.__SAKU_HOME_ERROR,"the page ran without an uncaught error");
  r.dataset.status="PASS"; r.textContent=JSON.stringify({status:"PASS",passed:checks.length,checks});
}catch(e){ r.dataset.status="FAIL"; r.textContent=JSON.stringify({status:"FAIL",error:String(e&&e.message||e),passed:checks.length,checks}); }
</script>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__lib__.html") { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(harness); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const target = path.resolve(DIST, relative);
    if (!target.startsWith(DIST + path.sep) || !(await stat(target)).isFile()) throw new Error("not found");
    response.writeHead(200, { "content-type": mime.get(path.extname(target).toLowerCase()) || "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(target));
  } catch (error) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end(String(error.message || error)); }
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "saku-lib-"));
const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + profile, "--window-size=1400,900", "--virtual-time-budget=30000", "--dump-dom", `http://127.0.0.1:${server.address().port}/__lib__.html`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", chunk => output += chunk);
await new Promise(resolve => child.on("exit", resolve));
server.close(); await rm(profile, { recursive: true, force: true });

const decode = value => value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const match = output.match(/<pre id="r" data-status="(PASS|FAIL)">([\s\S]*?)<\/pre>/);
if (!match) { console.error("CHARACTER_LIBRARY FAIL / HARNESS_DID_NOT_REPORT"); console.error(output.slice(-1500)); process.exit(1); }
const report = JSON.parse(decode(match[2]));
for (const name of report.checks) console.log(`  PASS ${name}`);
passed += report.checks.length;
if (report.status !== "PASS") { console.error(`CHARACTER_LIBRARY FAIL\n  ${report.error}`); process.exit(1); }
console.log(`CHARACTER_LIBRARY PASS ${passed}/${passed}`);
