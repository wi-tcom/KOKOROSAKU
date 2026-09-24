// Which workspace the Character list belongs to (Owner 2026-09-23 「推奨で」,
// D-20260923-workspace-scoped-library).
//
// The list, its deletion marks, the import history, the selected Character and
// its unsaved draft used to live once for the whole application in WebView
// storage. Switching to another workspace left them on screen, a Character from
// the old workspace was saved into the new one, and "delete app data" at
// uninstall took the list with it.
//
// Now the workspace holds them (`.saku-builder/state/` through the host) and
// WebView storage is the working copy of the workspace that is open:
//
//   - every write to one of the four keys is reported here and written through
//     to the workspace (coalesced within a task, so a burst is one write)
//   - at start the working copy is bound to the open workspace: restored from
//     it, or — the first time, when only the working copy has a list — moved
//     into it once, with a copy kept under `.saku-builder/migration/` (D2)
//   - switching picks the folder first, then asks about an unsaved draft (D5),
//     then writes what is pending to the old workspace and loads the new one
//   - a window that does not hold the workspace's lock writes nothing (D6);
//     WebView storage is shared between windows, so the refusal is here, in
//     every write path, and not only in the host
//
// Outside the desktop host (browser preview, public tooling) there is no
// workspace to write to and every function here does nothing.
//
// Boundary: this moves Builder working state. It is not AMU memory, not
// runtime activation and not Canonical Adoption.

/** The keys that travel with a workspace (D4). Trainer records and speed-test records do not, yet. */
export const WORKSPACE_STATE_KEYS = Object.freeze(["saku.workspace.library", "saku.workspace.importHistory", "saku.workspace.active", "saku.workspace.draft"]);
/** Which workspace the working copy in WebView storage belongs to. */
export const BOUND_KEY = "saku.workspace.bound";
/** Per window: this window does not hold the workspace and must not write. */
const READ_ONLY_KEY = "saku.workspace.readOnly";
const ACTIVE_KEY = "saku.workspace.active";
const DRAFT_KEY = "saku.workspace.draft";

const host = () => globalThis.window?.__TAURI__?.core?.invoke || null;
const local = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const session = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
const get = key => { try { return local()?.getItem(key) ?? null; } catch { return null; } };

export function isReadOnly() {
  try { return session()?.getItem(READ_ONLY_KEY) === "1"; } catch { return false; }
}
function setReadOnly(flag) {
  try { if (flag) session()?.setItem(READ_ONLY_KEY, "1"); else session()?.removeItem(READ_ONLY_KEY); } catch { /* nothing to record */ }
}

/** Put a workspace's values into the working copy without reporting them back as changes. */
function restore(keys) {
  const storage = local();
  if (!storage) return;
  for (const key of WORKSPACE_STATE_KEYS) {
    const value = keys?.[key];
    try { if (value === null || value === undefined) storage.removeItem(key); else storage.setItem(key, value); } catch { /* storage full or blocked */ }
  }
}
function setBound(workspace) { try { local()?.setItem(BOUND_KEY, workspace); } catch { /* nothing to record */ } }

export function snapshot() {
  return Object.fromEntries(WORKSPACE_STATE_KEYS.map(key => [key, get(key)]));
}
function isEmpty(keys) {
  return WORKSPACE_STATE_KEYS.every(key => {
    const value = keys[key];
    if (value === null || value === undefined) return true;
    if (key !== "saku.workspace.library") return false;
    try { return !(JSON.parse(value)?.entries || []).length; } catch { return false; }
  });
}

// ── write-through ────────────────────────────────────────────────────────────
const pending = new Set();
let scheduled = false;
let inflight = Promise.resolve();
let lastError = "";

/** The last write the workspace refused or could not take, or "". */
export function lastWriteError() { return lastError; }

async function send() {
  const invoke = host();
  const workspace = get(BOUND_KEY);
  const keys = {};
  for (const key of pending) keys[key] = get(key);
  pending.clear();
  // Before the working copy is bound there is nowhere to write; binding writes
  // everything it keeps.
  if (!invoke || !workspace || !Object.keys(keys).length) return;
  try {
    await invoke("write_workspace_state", { workspace, keys });
    lastError = "";
  } catch (error) {
    lastError = String(error?.message || error);
    try { globalThis.window?.dispatchEvent?.(new CustomEvent("saku-workspace-state-error", { detail: { error: lastError } })); } catch { /* no window events here */ }
  }
}

/** A write path calls this after changing one of the four keys. */
export function noteChanged(key) {
  if (!host() || isReadOnly() || !WORKSPACE_STATE_KEYS.includes(key)) return;
  pending.add(key);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; inflight = inflight.then(send); });
}

/** Wait until every reported change has reached the workspace (or failed). */
export async function flush() {
  await Promise.resolve();   // let a change reported in this task start its write
  await inflight;
}

async function writeAll() {
  for (const key of WORKSPACE_STATE_KEYS) pending.add(key);
  inflight = inflight.then(send);
  await inflight;
}

async function keepCopy(workspace, keys, reason) {
  const content = JSON.stringify({ profile: "saku.workspace.state-copy@1", reason, workspace_before: get(BOUND_KEY) || null, taken_at: new Date().toISOString(), keys }, null, 2);
  await host()("write_workspace_migration_backup", { workspace, content });
}

// ── binding ──────────────────────────────────────────────────────────────────

/**
 * At start: make the working copy the open workspace's.
 *
 *   BOUND       it already was; everything is written through once more
 *   RESTORED    the workspace had a list and the working copy did not belong
 *               to it (first start after an uninstall that removed app data,
 *               or after the workspace was changed elsewhere)
 *   MIGRATED    first start after this change: the working copy held a list and
 *               the workspace none; it is moved in once, a copy kept (D2)
 *   STRAY_KEPT  the working copy belonged to another workspace that this one
 *               has never seen: a copy is kept here and this workspace starts
 *               from its own files
 *   READ_ONLY   another window holds this workspace (D6)
 */
export async function bindAtStartup(runtime) {
  const invoke = host();
  const workspace = runtime?.workspace || "";
  if (!invoke || !workspace) return { status: "NO_WORKSPACE" };
  if (runtime.workspace_writable === false) { setReadOnly(true); return { status: "READ_ONLY", workspace }; }
  setReadOnly(false);
  let file;
  try { file = await invoke("read_workspace_state"); }
  catch (error) { lastError = String(error?.message || error); return { status: "FAILED", reason: lastError }; }
  const bound = get(BOUND_KEY);
  const held = file?.keys || {};
  const workspaceHasState = WORKSPACE_STATE_KEYS.some(key => held[key] !== null && held[key] !== undefined);
  if (bound === workspace) { await writeAll(); return { status: "BOUND", workspace }; }
  if (workspaceHasState) { restore(held); setBound(workspace); return { status: "RESTORED", workspace }; }
  const working = snapshot();
  if (isEmpty(working)) { setBound(workspace); return { status: "BOUND", workspace }; }
  try { await keepCopy(workspace, working, bound ? "WORKING_COPY_OF_ANOTHER_WORKSPACE" : "FIRST_START_AFTER_WORKSPACE_SCOPING"); }
  catch (error) { lastError = String(error?.message || error); return { status: "FAILED", reason: lastError }; }
  if (!bound) { setBound(workspace); await writeAll(); return { status: "MIGRATED", workspace }; }
  restore({}); setBound(workspace);
  return { status: "STRAY_KEPT", workspace };
}

/** After the host has opened a workspace: show that workspace's state (empty if it has none). */
export async function adoptWorkspace(runtime) {
  const invoke = host();
  const workspace = runtime?.workspace || "";
  if (!invoke || !workspace) return { status: "NO_WORKSPACE" };
  setReadOnly(runtime.workspace_writable === false);
  let file;
  try { file = await invoke("read_workspace_state"); }
  catch (error) { lastError = String(error?.message || error); return { status: "FAILED", reason: lastError }; }
  const held = file?.keys || {};
  restore(held);
  setBound(workspace);
  return { status: isReadOnly() ? "READ_ONLY" : WORKSPACE_STATE_KEYS.some(key => held[key] != null) ? "RESTORED" : "EMPTY", workspace };
}

function draftIsUnsaved() {
  try {
    const draft = JSON.parse(get(DRAFT_KEY) || "null");
    const active = JSON.parse(get(ACTIVE_KEY) || "null");
    return Boolean(draft && active && JSON.stringify(draft.character) !== JSON.stringify(active.character));
  } catch { return false; }
}

/**
 * Switch workspace: pick the folder, ask about an unsaved draft (D5), write
 * what is pending to the workspace being left, open the new one, show its state.
 * The question comes after the folder is chosen, so cancelling the picker
 * never costs a draft. `confirm()` returns true to discard the draft.
 */
export async function switchWorkspace({ confirm = null } = {}) {
  const invoke = host();
  if (!invoke) return { status: "NO_HOST" };
  if (isReadOnly()) return { status: "READ_ONLY" };
  let folder;
  try { folder = await invoke("pick_workspace_folder"); }
  catch (error) {
    const reason = String(error?.message || error);
    return { status: reason.includes("CANCELLED") ? "CANCELLED" : reason.includes("READ_ONLY") ? "READ_ONLY" : "FAILED", reason };
  }
  if (draftIsUnsaved()) {
    const discard = typeof confirm === "function" ? await confirm() : false;
    if (!discard) return { status: "KEPT_DRAFT" };
    try { local()?.removeItem(DRAFT_KEY); } catch { /* nothing to drop */ }
    noteChanged(DRAFT_KEY);
  }
  await flush();
  let runtime;
  try { runtime = await invoke("open_workspace", { path: folder }); }
  catch (error) { return { status: "FAILED", reason: String(error?.message || error) }; }
  const adopted = await adoptWorkspace(runtime);
  return { status: "SWITCHED", runtime, adopted: adopted.status };
}
