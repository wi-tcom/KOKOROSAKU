// Workspace-scoped Character list gate (Owner 2026-09-23 「推奨で」,
// D-20260923-workspace-scoped-library, D1–D6).
//
// On β.6 the list, the deletion marks, the import history and the selected
// Character lived once for the whole application in WebView storage. Switching
// to an empty workspace left all of it on screen, a Character from the old
// workspace saved into the new one, and "delete app data" at uninstall took the
// list with it. The workspace now holds that state; WebView storage is the
// working copy of whichever workspace is open.
//
//   A. the module: which keys travel with a workspace, and that every write
//      path reports its change (character-library, active-saku, the import
//      history) — a write that is not reported is a write the workspace misses
//   B. first start after the update (D2): the list that exists is moved into
//      the open workspace once, a copy of it is kept under migration/, and a
//      second start does not move it again or make a second copy
//   C. switching (D1, D4): A → B shows B's state (empty for a new workspace),
//      B → A shows A's again, nothing of A is written into B
//   D. durability: with WebView storage cleared (uninstall with app data), the
//      workspace brings the same list back — deletion marks, history, selection
//   E. an unsaved draft (D5): switching asks first; cancelling leaves everything
//      as it was; confirming discards the draft and switches
//   F. a second window (D6): the host gives it no lock, the window writes
//      nothing — not the list, not the selection, not the history, not the
//      workspace choice
//   G. revisions (D3): the host keeps every revision a workspace has seen
//   H. host source: the commands exist, are registered, check the lock and the
//      workspace, write atomically, and are covered by cargo tests
//   I. browser end to end on the desktop page with a host stub that keeps
//      files per workspace
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [];
const skipped = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");

// ── a host that behaves like main.rs, in memory ─────────────────────────────
// One instance per application window; `disk` is shared, as the file system is.
const KEYS = ["saku.workspace.library", "saku.workspace.importHistory", "saku.workspace.active", "saku.workspace.draft"];
function makeDisk() { return { files: new Map(), locks: new Map(), config: { workspace: null } }; }
function makeHost(disk, id) {
  const holds = ws => disk.locks.get(ws) === id;
  const acquire = ws => { if (!ws) return false; if (!disk.locks.has(ws)) disk.locks.set(ws, id); return holds(ws); };
  const state = () => ({ workspace: disk.config.workspace, workspace_writable: acquire(disk.config.workspace), first_run: !disk.config.workspace });
  const host = {
    calls: [],
    nextChoice: null,
    async invoke(name, args = {}) {
      host.calls.push([name, args]);
      const ws = disk.config.workspace;
      if (name === "get_runtime_state") return state();
      if (name === "read_workspace_state") {
        if (!ws) return { status: "NO_WORKSPACE", workspace: null, writable: false, keys: {} };
        const keys = {}; for (const key of KEYS) keys[key] = disk.files.get(`${ws}|${key}`) ?? null;
        return { status: "OK", workspace: ws, writable: acquire(ws), keys };
      }
      if (name === "write_workspace_state") {
        if (!ws) throw "WORKSPACE_NOT_CONFIGURED";
        if (args.workspace !== ws) throw "WORKSPACE_MISMATCH";
        if (!holds(ws)) throw "WORKSPACE_READ_ONLY";
        for (const [key, value] of Object.entries(args.keys || {})) {
          if (!KEYS.includes(key)) throw `WORKSPACE_STATE_KEY_UNKNOWN: ${key}`;
          if (value === null) disk.files.delete(`${ws}|${key}`); else { JSON.parse(value); disk.files.set(`${ws}|${key}`, value); }
        }
        return null;
      }
      if (name === "write_workspace_migration_backup") {
        if (args.workspace !== ws) throw "WORKSPACE_MISMATCH";
        if (!holds(ws)) throw "WORKSPACE_READ_ONLY";
        const n = [...disk.files.keys()].filter(k => k.startsWith(`${ws}|migration/`)).length;
        disk.files.set(`${ws}|migration/${n}`, args.content);
        return `${ws}/.saku-builder/migration/${n}.json`;
      }
      // Picking a folder changes nothing; opening it does. The page asks about
      // an unsaved draft in between, so cancelling the picker never costs a draft.
      if (name === "pick_workspace_folder") {
        if (ws && !holds(ws)) throw "WORKSPACE_READ_ONLY";
        if (!host.nextChoice) throw "WORKSPACE_SELECTION_CANCELLED";
        const choice = host.nextChoice; host.nextChoice = null;
        return choice;
      }
      if (name === "open_workspace") {
        if (ws && !holds(ws)) throw "WORKSPACE_READ_ONLY";
        if (ws && holds(ws)) disk.locks.delete(ws);
        disk.config.workspace = args.path;
        return state();
      }
      if (name === "save_workspace_character") {
        if (!holds(ws)) throw "WORKSPACE_READ_ONLY";
        const revision = JSON.parse(args.characterJson).identity?.character_revision || "unversioned";
        disk.files.set(`${ws}|characters/${args.characterId}/character.json`, args.characterJson);
        disk.files.set(`${ws}|characters/${args.characterId}/revisions/${revision}.json`, args.characterJson);
        return `${ws}/characters/${args.characterId}/character.json`;
      }
      throw new Error(`UNSUPPORTED ${name}`);
    },
  };
  return host;
}
function makeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), clear: () => map.clear(), key: i => [...map.keys()][i] ?? null, get length() { return map.size; }, _map: map };
}
// Each window has its own sessionStorage; WebView2 windows of one application share localStorage.
async function openWindow(disk, id, sharedLocal) {
  const host = makeHost(disk, id);
  globalThis.window = { __TAURI__: { core: { invoke: host.invoke } } };
  globalThis.localStorage = sharedLocal;
  globalThis.sessionStorage = makeStorage();
  // One module instance, as in a page: the modules read the window, the storage
  // and the host at call time, so swapping the globals is switching windows.
  const W = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/workspace-state.mjs")).href);
  const Library = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/character-library.mjs")).href);
  const Active = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/active-saku.mjs")).href);
  return { host, W, Library, Active, session: globalThis.sessionStorage };
}
const sample = JSON.parse(read("tools/unified-v1/sample-pack/sample-characters.json")).characters;
const UNIFIED = { kind: "UNIFIED_V1_CHARACTER", schema_id: sample[0].schema.schema_id, schema_version: sample[0].schema.schema_version };
const names = Library => Library.list().map(e => e.character.identity.display_name).sort().join(",");

// ── A. the module ────────────────────────────────────────────────────────────
{
  const W = await import(pathToFileURL(path.join(ROOT, "tools/unified-v1/workspace-state.mjs")).href);
  equal([...W.WORKSPACE_STATE_KEYS].sort().join(","), [...KEYS].sort().join(","), "A: the four keys that travel with a workspace (list, import history, selection, draft)");
  check(typeof W.bindAtStartup === "function" && typeof W.adoptWorkspace === "function" && typeof W.flush === "function" && typeof W.noteChanged === "function" && typeof W.isReadOnly === "function", "A: the module exposes bind / adopt / flush / noteChanged / isReadOnly");
  const lib = read("tools/unified-v1/character-library.mjs"), act = read("tools/unified-v1/active-saku.mjs"), app = read("desktop/app.mjs");
  check(/noteChanged\(KEY\)/.test(lib) && /isReadOnly\(\)/.test(lib), "A: character-library reports every write and refuses to write in a read-only window");
  check((act.match(/noteChanged\(key\)/g) || []).length >= 2 && /isReadOnly\(\)/.test(act), "A: active-saku reports both writes and removals, and refuses in a read-only window");
  const record = app.match(/function recordImport\([\s\S]*?\n}\n/)?.[0] || "";
  check(record.includes("noteChanged(IMPORT_HISTORY_KEY)") && record.includes("isReadOnly()"), "A: the import history reports its write and refuses in a read-only window");
  check(app.includes("if (!await applyStartupRoute()) await refreshState();"), "A: start-up waits for the working copy to be bound before a screen (01 on open=select) reads the list");
  const refresh = app.match(/async function refreshState\(\)[\s\S]*?\n}\n/)?.[0] || "";
  check(refresh.indexOf("bindAtStartup(") > 0 && refresh.indexOf("bindAtStartup(") < refresh.indexOf("renderState(state)"), "A: …and binds before it renders the home screen (the selected Character shown is the workspace's)");
  const choose = app.match(/async function chooseWorkspace\(\)[\s\S]*?\n}\n/)?.[0] || "";
  check(choose.includes("WorkspaceState.switchWorkspace(") && !choose.includes('invoke("choose_workspace")'), "A: the home screen switches through switchWorkspace (pick, ask, write, open, load), not the one-step host command");
}

// ── B–G with the in-memory host ─────────────────────────────────────────────
{
  // β.6 state: a list that exists only in WebView storage.
  const disk = makeDisk(); disk.config.workspace = "C:/ws/A";
  const local = makeStorage();
  local.setItem("saku.workspace.library", JSON.stringify({ version: 1, entries: [{ entry_id: "e1", character: sample[0], source: "PACKAGE", schema: UNIFIED, added_at: "t", batch: "t", deleted: false }, { entry_id: "e2", character: sample[1], source: "FILE", schema: UNIFIED, added_at: "t", batch: "t", deleted: true }] }));
  local.setItem("saku.workspace.importHistory", JSON.stringify([{ kind: "PACKAGE", source_path: "old.zip", status: "IMPORTED", at: "t" }]));
  local.setItem("saku.workspace.active", JSON.stringify({ character: sample[0], identity: { character_id: sample[0].identity.character_id } }));
  const before = Object.fromEntries(KEYS.map(k => [k, local.getItem(k)]));

  // B. first start after the update
  let win = await openWindow(disk, "one", local);
  let bound = await win.W.bindAtStartup(await win.host.invoke("get_runtime_state"));
  equal(bound.status, "MIGRATED", "B: first start moves the existing list into the open workspace");
  for (const key of KEYS) equal(disk.files.get(`C:/ws/A|${key}`) ?? null, before[key], `B: ${key} is in the workspace exactly as it was`);
  const backups = [...disk.files.keys()].filter(k => k.startsWith("C:/ws/A|migration/"));
  equal(backups.length, 1, "B: one copy of the list as it was is kept under migration/");
  check(JSON.parse(disk.files.get(backups[0])).keys["saku.workspace.library"] === before["saku.workspace.library"], "B: the copy carries the list byte for byte");
  equal(win.Library.summary().deleted, 1, "B: the deletion mark came along");
  // second start: nothing moves again
  win = await openWindow(disk, "one", local);
  bound = await win.W.bindAtStartup(await win.host.invoke("get_runtime_state"));
  equal(bound.status, "BOUND", "B: a second start finds the list already bound to this workspace");
  equal([...disk.files.keys()].filter(k => k.startsWith("C:/ws/A|migration/")).length, 1, "B: …and makes no second copy");

  // writes go through
  win.Library.importCharacters([sample[2]], "FILE", { schema: UNIFIED });
  await win.W.flush();
  equal(JSON.parse(disk.files.get("C:/ws/A|saku.workspace.library")).entries.length, 3, "B: a write to the list reaches the workspace");

  // C. switching
  win.host.nextChoice = "C:/ws/B";
  let switched = await win.W.switchWorkspace();
  equal(switched.status, "SWITCHED", "C: A → B switches");
  equal(win.Library.summary().total, 0, "C: a workspace that has never held a list shows an empty one (it is rebuilt from its files by the list screen)");
  equal(local.getItem("saku.workspace.active"), null, "C: …and no selected Character from A");
  equal(local.getItem("saku.workspace.importHistory"), null, "C: …and no import history from A");
  win.Library.importCharacters([sample[1]], "FILE", { schema: UNIFIED });
  await win.W.flush();
  equal(JSON.parse(disk.files.get("C:/ws/A|saku.workspace.library")).entries.length, 3, "C: what is done in B is not written into A");
  equal(JSON.parse(disk.files.get("C:/ws/B|saku.workspace.library")).entries.length, 1, "C: …it is written into B");
  win.host.nextChoice = "C:/ws/A";
  switched = await win.W.switchWorkspace();
  equal(switched.status, "SWITCHED", "C: B → A switches back");
  equal(win.Library.summary().total, 3, "C: A's list is back, all three rows");
  equal(win.Library.summary().deleted, 1, "C: …with its deletion mark");
  check(JSON.parse(local.getItem("saku.workspace.importHistory"))[0].source_path === "old.zip", "C: …and its import history");
  check(win.Active.getActive()?.identity?.character_id === sample[0].identity.character_id, "C: …and its selected Character");
  // cancel keeps everything
  const snapshot = KEYS.map(k => local.getItem(k)).join("|");
  switched = await win.W.switchWorkspace();   // no folder chosen
  equal(switched.status, "CANCELLED", "C: cancelling the folder picker changes nothing");
  equal(KEYS.map(k => local.getItem(k)).join("|"), snapshot, "C: …not a byte of the working copy");

  // D. durability: WebView storage cleared (uninstall with app data)
  local.clear();
  win = await openWindow(disk, "one", local);
  bound = await win.W.bindAtStartup(await win.host.invoke("get_runtime_state"));
  equal(bound.status, "RESTORED", "D: with WebView storage gone, the workspace brings the list back");
  equal(win.Library.summary().total, 3, "D: all three rows");
  equal(win.Library.summary().deleted, 1, "D: the deletion mark");
  check(JSON.parse(local.getItem("saku.workspace.importHistory"))[0].source_path === "old.zip", "D: the import history");
  check(win.Active.getActive()?.identity?.character_id === sample[0].identity.character_id, "D: the selected Character");
  equal([...disk.files.keys()].filter(k => k.startsWith("C:/ws/A|migration/")).length, 1, "D: restoring is not a migration (no copy made)");

  // E. an unsaved draft
  const changed = structuredClone(sample[0]); changed.identity.display_name += "（編集中）";
  win.Active.updateDraft(changed);
  check(win.Active.isDirty(), "E: the draft differs from what was opened");
  const asked = [];
  win.host.nextChoice = "C:/ws/B";
  switched = await win.W.switchWorkspace({ confirm: () => { asked.push(1); return false; } });
  equal(switched.status, "KEPT_DRAFT", "E: with an unsaved draft the switch asks first, and No keeps you where you are");
  equal(asked.length, 1, "E: …it asked exactly once");
  check(win.Active.isDirty() && disk.config.workspace === "C:/ws/A", "E: …the draft and the workspace are untouched");
  win.host.nextChoice = "C:/ws/B";
  switched = await win.W.switchWorkspace({ confirm: () => false });
  check(win.Active.isDirty(), "E: the question comes after the folder is chosen — cancelling the picker never costs a draft");
  switched = await win.W.switchWorkspace({ confirm: () => true });
  equal(switched.status, "CANCELLED", "E: …and with no folder chosen there is nothing to ask");
  check(win.Active.isDirty(), "E: …so the draft is still there");
  win.host.nextChoice = "C:/ws/B";
  switched = await win.W.switchWorkspace({ confirm: () => true });
  equal(switched.status, "SWITCHED", "E: Yes discards the draft and switches");
  equal(disk.files.get("C:/ws/A|saku.workspace.draft") ?? null, null, "E: the discarded draft is gone from A as well, not waiting to reappear");
  win.host.nextChoice = "C:/ws/A"; await win.W.switchWorkspace();

  // F. a second window
  const second = await openWindow(disk, "two", local);
  const secondBound = await second.W.bindAtStartup(await second.host.invoke("get_runtime_state"));
  equal(secondBound.status, "READ_ONLY", "F: a second window on the same workspace gets no lock and says it is read-only");
  check(second.W.isReadOnly(), "F: …the window knows it");
  const listBefore = local.getItem("saku.workspace.library"), activeBefore = local.getItem("saku.workspace.active"), historyBefore = local.getItem("saku.workspace.importHistory");
  const refused = second.Library.importCharacters([sample[2]], "FILE", { schema: UNIFIED });
  equal(refused.saved, false, "F: adding to the list is refused in the second window");
  equal(refused.reason, "WORKSPACE_READ_ONLY", "F: …and says why");
  second.Library.setDeleted(["e1"], true); second.Library.clear();
  second.Active.setActive(sample[2]); second.Active.clearActive();
  equal(local.getItem("saku.workspace.library"), listBefore, "F: delete and clear change nothing");
  equal(local.getItem("saku.workspace.active"), activeBefore, "F: selecting and clearing a Character change nothing");
  equal(local.getItem("saku.workspace.importHistory"), historyBefore, "F: the import history is unchanged");
  second.host.nextChoice = "C:/ws/C";
  const callsBefore = second.host.calls.length;
  equal((await second.W.switchWorkspace()).status, "READ_ONLY", "F: the second window cannot change the workspace either (the choice is shared by both windows)");
  equal(second.host.calls.slice(callsBefore).map(([name]) => name).join(","), "", "F: …the page refuses before asking the host (the host refuses too; this is the first of two guards)");
  equal(disk.config.workspace, "C:/ws/A", "F: …the workspace stays A");
  // the first window still writes
  globalThis.sessionStorage = win.session; globalThis.window = { __TAURI__: { core: { invoke: win.host.invoke } } };
  equal(win.Library.importCharacters([sample[2]], "FILE", { schema: UNIFIED }).saved, true, "F: the first window still writes");

  // G. revisions
  const r1 = structuredClone(sample[0]); r1.identity.character_revision = "1.0.0";
  const r2 = structuredClone(sample[0]); r2.identity.character_revision = "1.1.0";
  for (const c of [r1, r2]) await win.host.invoke("save_workspace_character", { characterId: c.identity.character_id, characterJson: JSON.stringify(c) });
  check(disk.files.has(`C:/ws/A|characters/${r1.identity.character_id}/revisions/1.0.0.json`) && disk.files.has(`C:/ws/A|characters/${r1.identity.character_id}/revisions/1.1.0.json`), "G: both revisions are kept (the stub mirrors main.rs; H checks main.rs does it)");
}

// ── H. host source ──────────────────────────────────────────────────────────
{
  const rs = read("src-tauri/src/main.rs");
  for (const command of ["read_workspace_state", "write_workspace_state", "write_workspace_migration_backup", "pick_workspace_folder", "open_workspace"]) {
    check(new RegExp(`#\\[tauri::command\\]\\s*fn ${command}\\(`).test(rs), `H: ${command} is a command`);
    check(new RegExp(`generate_handler!\\[[\\s\\S]*\\b${command}\\b`).test(rs), `H: ${command} is registered`);
  }
  check(/workspace_writable/.test(rs), "H: the runtime state says whether this window holds the workspace");
  check(/share_mode\(0\)/.test(rs), "H: the lock is an exclusive open (released by the OS when the process ends — no stale lock after a crash)");
  const body = name => rs.match(new RegExp(`fn ${name}\\([\\s\\S]*?\\n}\\n`))?.[0] || "";
  for (const name of ["write_workspace_state", "write_workspace_migration_backup", "save_workspace_character", "pick_workspace_folder", "open_workspace"]) {
    check(/require_workspace_lock|holds_lock/.test(body(name)), `H: ${name} refuses without the lock`);
  }
  check(/WORKSPACE_MISMATCH/.test(body("require_workspace_lock")) && /require_workspace_lock\(&app, Some\(&workspace\)\)/.test(body("write_workspace_state")), "H: write_workspace_state refuses a write meant for another workspace (the page names the workspace it means)");
  check(/write_character_files\(/.test(body("save_workspace_character")) && /revisions/.test(body("write_character_files")), "H: save_workspace_character keeps each revision (write_character_files, covered by workspace_state_keeps_every_revision)");
  check(/fn write_atomically/.test(rs) && /write_atomically\(/.test(body("write_state_files")) && /fs::rename/.test(body("write_atomically")), "H: state files are written atomically (temporary file, then rename)");
  const lock = rs.match(/fn import_character_pack\([\s\S]*?\n}\n/)?.[0] || "";
  check(/require_workspace_lock|holds_lock/.test(lock), "H: a pack import writes into the workspace only with the lock");
  check(/#\[test\]\s*fn workspace_lock_is_exclusive/.test(rs) && /#\[test\]\s*fn workspace_state_/.test(rs), "H: cargo tests cover the lock and the state files");
}

// ── I. browser end to end ───────────────────────────────────────────────────
{
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const dist = path.join(ROOT, ".desktop-dist");
  const stale = ["desktop/app.mjs:app.mjs", "tools/unified-v1/workspace-state.mjs:tools/unified-v1/workspace-state.mjs", "tools/unified-v1/character-library.mjs:tools/unified-v1/character-library.mjs", "tools/unified-v1/active-saku.mjs:tools/unified-v1/active-saku.mjs"]
    .map(pair => pair.split(":")).filter(([src, out]) => !existsSync(path.join(dist, out)) || read(src) !== readFileSync(path.join(dist, out), "utf8")).map(([src]) => src);
  if (!existsSync(chrome)) skipped.push("I: Chrome not found — browser end-to-end skipped");
  else {
    equal(stale.join(", "), "", "I: .desktop-dist carries this branch's modules (run desktop:prepare)");
    const { readFile, rm } = await import("node:fs/promises");
    const positive = read("tests/fixtures/conformance-locators/positive-sample.json");
    const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
const POSITIVE=${JSON.stringify(positive)};
let frame,doc,win;
const load=async(query='?stay=1&open=select')=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1400px;height:1000px';frame.src='/__desktop_stub__/index.html'+query;document.body.append(frame);await new Promise(r=>frame.onload=r);doc=frame.contentDocument;win=frame.contentWindow;await until(()=>doc.getElementById('viewer-import-package')&&win.__saku_home);await until(()=>win.__saku_workspace_state_bound);};
const entries=()=>((JSON.parse(win.localStorage.getItem('saku.workspace.library')||'{}').entries)||[]).filter(e=>!e.deleted);
try{
 localStorage.clear();
 await load();
 check(win.__TAURI__.__stub===true,'WS-UI host stub installed before app.mjs');
 check(Boolean(doc.querySelector('#viewer-package-fields [data-package-empty]'))&&!doc.getElementById('viewer-package-fields').innerText.includes('UNKNOWN'),'WS-UI F5 with nothing imported yet, the import state says so instead of UNKNOWN rows');
 await win.__saku_home.importCharacterFiles([new File([POSITIVE],'positive-sample.json',{type:'application/json'})]);
 await until(()=>entries().length===1);
 await win.__saku_workspace_state.flush();
 check(JSON.parse(window.__stubFiles['C:/ws/A|saku.workspace.library']||'{"entries":[]}').entries.length===1,'WS-UI the import reaches workspace A');
 // switch to B through the page's own control
 window.__stubNextChoice='C:/ws/B';
 doc.getElementById('choose-workspace').click();
 await until(()=>window.__stubConfig.workspace==='C:/ws/B'&&entries().length===0);
 check(entries().length===0,'WS-UI workspace B shows an empty list');
 check(!(win.localStorage.getItem('saku.workspace.importHistory')||'').includes('positive-sample'),'WS-UI …and not A\\'s import history');
 // back to A
 window.__stubNextChoice='C:/ws/A';
 doc.getElementById('choose-workspace').click();
 await until(()=>window.__stubConfig.workspace==='C:/ws/A'&&entries().length===1);
 check(entries().length===1,'WS-UI back in A, the list is A\\'s again');
 check((win.localStorage.getItem('saku.workspace.importHistory')||'').includes('positive-sample'),'WS-UI …with A\\'s import history');
 // select the Character through the list's own control, so the selection is part of A's state
 doc.querySelector('#viewer-results [data-open-id]').click();
 await until(()=>doc.getElementById('character-actions').open);
 doc.querySelector('#character-actions [data-character-action="view"]').click();
 await until(()=>/を選択しました/.test(doc.getElementById('viewer-status').innerText));
 await win.__saku_workspace_state.flush();
 const NAME=JSON.parse(POSITIVE).identity.display_name;
 // WebView storage cleared, page reloaded: the workspace brings it back
 win.localStorage.clear();
 await load();
 await until(()=>entries().length===1);
 check(entries().length===1,'WS-UI after WebView storage is cleared, the list comes back from the workspace');
 // What was restored is also what the screen shows (Chrome hands-on 2026-09-24: the
 // selection card and the import history were drawn before the restore and stayed stale).
 check(doc.getElementById('import-history').innerText.includes('positive-sample'),'WS-UI …and the import history shows the restored history');
 // The home screen, not the list: opening the list redraws the card as a side effect.
 win.localStorage.clear();
 await load('?stay=1');
 await until(()=>entries().length===1);
 await new Promise(r=>setTimeout(r,300));
 check(doc.getElementById('selected-character').innerText.includes(NAME),'WS-UI on the home screen, the selection card shows the restored Character ('+doc.getElementById('selected-character').innerText.replace(/\\n/g,' / ')+')');
 // A second window on the same workspace (β.7 hands-on 2026-09-24): with a Character
 // selected, the home guidance was drawn after the read-only notice and replaced it.
 window.__stubWritable=false;
 await load('?stay=1');
 await until(()=>win.__saku_workspace_state_bound?.status==='READ_ONLY');
 await new Promise(r=>setTimeout(r,300));
 const status=doc.getElementById('host-status');
 check(/WORKSPACE_READ_ONLY/.test(status.innerText)&&status.innerText.includes('別のウィンドウで開かれています'),'WS-UI a read-only window keeps saying so after the startup redraw ('+status.innerText.replace(/\\n/g,' / ')+')');
 check(doc.getElementById('choose-workspace').disabled,'WS-UI …and its workspace control stays disabled');
 win.__saku_home.renderActiveSaku();
 check(/WORKSPACE_READ_ONLY/.test(doc.getElementById('host-status').innerText),'WS-UI …and a later redraw of the selection does not replace the notice either');
 check(doc.getElementById('selected-character').innerText.includes(NAME),'WS-UI …while the selection card still shows the Character');
 window.__stubWritable=true;
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2000)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
    // The stub lives in the parent page, so files survive the iframe being reloaded.
    const stub = [
      "<script>",
      "const P=window.parent;P.__stubFiles=P.__stubFiles||{};P.__stubConfig=P.__stubConfig||{workspace:'C:/ws/A'};",
      "const KEYS=['saku.workspace.library','saku.workspace.importHistory','saku.workspace.active','saku.workspace.draft'];",
      "const state=()=>({workspace:P.__stubConfig.workspace,workspace_writable:P.__stubWritable!==false,first_run:false,app_version:'0.1.0-beta.6'});",
      "window.__TAURI__={__stub:true,core:{invoke:async(name,args={})=>{const ws=P.__stubConfig.workspace;",
      "if(name==='get_runtime_state')return state();",
      "if(name==='read_workspace_state'){const keys={};for(const k of KEYS)keys[k]=P.__stubFiles[ws+'|'+k]??null;return{status:'OK',workspace:ws,writable:true,keys};}",
      "if(name==='write_workspace_state'){if(args.workspace!==ws)throw'WORKSPACE_MISMATCH';for(const[k,v]of Object.entries(args.keys||{})){if(v===null)delete P.__stubFiles[ws+'|'+k];else P.__stubFiles[ws+'|'+k]=v;}return null;}",
      "if(name==='write_workspace_migration_backup'){P.__stubFiles[ws+'|migration']=args.content;return 'x';}",
      "if(name==='pick_workspace_folder'){if(!P.__stubNextChoice)throw'WORKSPACE_SELECTION_CANCELLED';const c=P.__stubNextChoice;P.__stubNextChoice=null;return c;}",
      "if(name==='open_workspace'){P.__stubConfig.workspace=args.path;return state();}",
      "if(name==='save_workspace_character')return ws+'/characters/x/character.json';",
      "if(name==='list_workspace_characters')return{status:'OK',workspace:ws,artifacts:[]};",
      "if(name==='get_startup_route')return'DEFAULT';",
      "return null;}}};window.confirm=()=>true;",
      "</script>",
    ].join("");
    const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain" };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (url.pathname === "/__ws__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
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
    const profile = mkdtempSync(path.join(tmpdir(), "saku-ws-browser-"));
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let stderr = ""; let socket;
    child.stderr.on("data", chunk => stderr += chunk);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    try {
      let port = 0;
      for (let i = 0; i < 200 && !port; i++) { const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); else await pause(100); }
      if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__ws__`)}`, { method: "PUT" })).json();
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

console.log(JSON.stringify({ cases: cases.length, skipped }, null, 2));
if (process.env.VERBOSE) for (const label of cases) console.log(`  PASS ${label}`);
console.log(`WORKSPACE_STATE PASS ${cases.length}/${cases.length}${skipped.length ? ` (${skipped.length} skipped)` : ""}`);
