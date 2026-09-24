// Speed-test run store.  Its own namespace, nothing else.
//
// A run is recorded exactly as `makeRun` produced it plus a Builder run id and
// the Owner's session label.  The item is written and read back, then the
// index; a failure at either step leaves storage as it was and is reported as
// not recorded.  Nothing here touches Character, Trainer Session, Change
// Candidate, or external review keys.
import { contentDigest } from "./trainer-contract.mjs";
import { aggregate, compareSessions, diffAnswers, diffLineDigests, PASTE_MODE, SPEED_TEST_SCHEMA } from "./speed-test.mjs";

export const SPEED_TEST_KEYS = Object.freeze({
  index: "saku.trainer.speedTest.v1.index",
  runPrefix: "saku.trainer.speedTest.v1.run.",
});
/**
 * What the tool measured for itself about one run: the window between コピー and
 * 貼り付け, and whether the answer's own elapsed time fits inside it.
 *
 * Its own namespace, not a field on the run: the run's shape is replayed against
 * AMU 944151e4 vectors and is not widened from here (統制卓 2026-09-23 reserved
 * that kind of change). The record itself would be the better home, and that is
 * for 統制卓 to decide across the three products.
 */
export const SPEED_TEST_WINDOW_PREFIX = "saku.trainer.speedTest.v1.window.";
export const speedTestWindowKey = runId => `${SPEED_TEST_WINDOW_PREFIX}${runId}`;

export function writeWindowMark(storage, runId, mark) {
  if (!runId || !mark) return { ok: false, code: "WINDOW_MARK_INVALID" };
  try { storage.setItem(speedTestWindowKey(runId), JSON.stringify({ run_id: runId, ...mark })); return { ok: true }; }
  catch (error) { return { ok: false, code: "WINDOW_MARK_NOT_WRITTEN", detail: String(error?.message || error) }; }
}

/** Every mark this browser holds, by run id. A missing one simply means no window was measured. */
export function readWindowMarks(storage) {
  const marks = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(SPEED_TEST_WINDOW_PREFIX)) continue;
    try { const mark = JSON.parse(storage.getItem(key)); if (mark?.run_id) marks[mark.run_id] = mark; }
    catch { /* an unreadable mark is simply absent */ }
  }
  return marks;
}

export const SPEED_TEST_INDEX_SCHEMA_ID = "saku.trainer.speed-test-index@1";
export const SPEED_TEST_RECORD_SCHEMA_ID = "saku.trainer.speed-test-record@1";
export const MAX_RUNS = 1000;
export const speedTestRunKey = runId => `${SPEED_TEST_KEYS.runPrefix}${runId}`;

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const refusal = (code, detail = "", extra = {}) => ({ ok: false, code, detail, recorded: false, ...extra });
const recordProjection = record => { const projection = clone(record); delete projection.record_content_digest; return projection; };

function readJson(storage, key) {
  let raw;
  try { raw = storage.getItem(key); } catch { return { ok: false, code: "STORAGE_READ_FAILED" }; }
  if (raw === null || raw === undefined) return { ok: true, value: null, raw: null };
  try { return { ok: true, value: JSON.parse(raw), raw }; } catch { return { ok: false, code: "STORAGE_RECORD_INVALID" }; }
}
function readIndex(storage) {
  const read = readJson(storage, SPEED_TEST_KEYS.index);
  if (!read.ok) return read;
  if (read.value === null) return { ok: true, index: { schema_id: SPEED_TEST_INDEX_SCHEMA_ID, run_ids: [] }, raw: null };
  if (read.value?.schema_id !== SPEED_TEST_INDEX_SCHEMA_ID || !Array.isArray(read.value.run_ids)) return { ok: false, code: "STORAGE_RECORD_INVALID" };
  return { ok: true, index: read.value, raw: read.raw };
}

/** Record one paste run.  `run` must come from `makeRun`; anything else is refused. */
export function recordRun(storage, run, { sessionLabel = "" } = {}) {
  if (!run || run.schema !== SPEED_TEST_SCHEMA || run.mode !== PASTE_MODE) return refusal("SPEED_RUN_MODE_INVALID", "only paste runs from makeRun are recorded");
  if (!run.probe_id || !run.probe_digest || !run.provider_ref || !run.model_ref || !run.at) return refusal("SPEED_RUN_INVALID", "run is incomplete");
  if (!Array.isArray(run.answer?.line_digests)) return refusal("SPEED_RUN_INVALID", "run has no line_digests");
  const indexRead = readIndex(storage);
  if (!indexRead.ok) return refusal(indexRead.code, "the run index could not be read");
  if (indexRead.index.run_ids.length >= MAX_RUNS) return refusal("SPEED_RUN_LIMIT", `at most ${MAX_RUNS} runs are kept`);
  const record = {
    schema_id: SPEED_TEST_RECORD_SCHEMA_ID,
    run_id: `SR-${contentDigest(`${run.at}:${run.probe_id}:${run.provider_ref}:${run.model_ref}:${run.total_ms}:${run.answer.digest || ""}:${indexRead.index.run_ids.length}`)}`,
    session_label: String(sessionLabel || "").slice(0, 120),
    run: clone(run),
  };
  record.record_content_digest = contentDigest(recordProjection(record));
  if (indexRead.index.run_ids.includes(record.run_id)) return refusal("SPEED_RUN_DUPLICATE", "an identical run is already recorded");
  const runKey = speedTestRunKey(record.run_id);
  const runText = JSON.stringify(record);
  const indexText = JSON.stringify({ ...indexRead.index, run_ids: [...indexRead.index.run_ids, record.run_id] });
  try {
    storage.setItem(runKey, runText);
    if (storage.getItem(runKey) !== runText) throw new Error("RUN_WRITE_UNVERIFIED");
  } catch (error) {
    try { storage.removeItem(runKey); } catch { /* nothing durable was written */ }
    return refusal("STORAGE_WRITE_FAILED", String(error?.message || error));
  }
  try {
    storage.setItem(SPEED_TEST_KEYS.index, indexText);
    if (storage.getItem(SPEED_TEST_KEYS.index) !== indexText) throw new Error("INDEX_WRITE_UNVERIFIED");
  } catch (error) {
    try { storage.removeItem(runKey); } catch { /* reported below */ }
    try { if (indexRead.raw === null) storage.removeItem(SPEED_TEST_KEYS.index); else storage.setItem(SPEED_TEST_KEYS.index, indexRead.raw); } catch { /* rechecked on next read */ }
    return refusal("STORAGE_WRITE_FAILED", String(error?.message || error));
  }
  return { ok: true, code: "SPEED_RUN_RECORDED", recorded: true, record: clone(record) };
}

export function listRuns(storage, { probe_id = null, provider_ref = null, model_ref = null, session_label = null } = {}) {
  const indexRead = readIndex(storage);
  if (!indexRead.ok) return { ok: false, code: indexRead.code, records: [], problems: [] };
  const records = [];
  const problems = [];
  for (const id of indexRead.index.run_ids) {
    const read = readJson(storage, speedTestRunKey(id));
    if (!read.ok || !read.value) { problems.push({ run_id: id, code: read.code || "STORAGE_RECORD_MISSING" }); continue; }
    if (read.value.record_content_digest !== contentDigest(recordProjection(read.value))) { problems.push({ run_id: id, code: "STORAGE_RECORD_TAMPERED" }); continue; }
    const run = read.value.run;
    if ((probe_id && run.probe_id !== probe_id) || (provider_ref && run.provider_ref !== provider_ref) || (model_ref && run.model_ref !== model_ref) || (session_label !== null && read.value.session_label !== session_label)) continue;
    records.push(read.value);
  }
  return { ok: true, records, problems };
}

/** Explicit deletion of one run by the Owner.  Index first, then the item; a leftover item is invisible and reported. */
export function deleteRun(storage, runId) {
  const indexRead = readIndex(storage);
  if (!indexRead.ok) return { ok: false, code: indexRead.code };
  if (!indexRead.index.run_ids.includes(runId)) return { ok: false, code: "STORAGE_RECORD_MISSING" };
  const indexText = JSON.stringify({ ...indexRead.index, run_ids: indexRead.index.run_ids.filter(id => id !== runId) });
  try {
    storage.setItem(SPEED_TEST_KEYS.index, indexText);
    if (storage.getItem(SPEED_TEST_KEYS.index) !== indexText) throw new Error("INDEX_WRITE_UNVERIFIED");
  } catch (error) { return { ok: false, code: "STORAGE_WRITE_FAILED", detail: String(error?.message || error) }; }
  let itemRemoved = true;
  try { storage.removeItem(speedTestRunKey(runId)); if (storage.getItem(speedTestRunKey(runId)) !== null) itemRemoved = false; } catch { itemRemoved = false; }
  return { ok: true, code: "SPEED_RUN_DELETED", item_removed: itemRemoved };
}

/** Groups: one per (session_label, provider, model, probe), each with its aggregate under the given thresholds. */
export function groupRuns(records, thresholds = {}) {
  const groups = new Map();
  for (const record of records) {
    const run = record.run;
    const key = `${record.session_label} | ${run.provider_ref} | ${run.model_ref} | ${run.probe_id}`;
    const group = groups.get(key) || { session_label: record.session_label, provider_ref: run.provider_ref, model_ref: run.model_ref, probe_id: run.probe_id, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const ordered = [...group.records].sort((a, b) => String(a.run.at).localeCompare(String(b.run.at)));
    return { ...group, records: ordered, aggregate: aggregate(ordered.map(record => record.run), thresholds) };
  });
}

/** Diff of a run against the previous run of the same group: by text when both kept it, else by line digests. */
export function diffAgainstPrevious(current, previous) {
  if (!previous) return { available: false, reason: "NO_PREVIOUS_RUN" };
  const a = previous.run.answer, b = current.run.answer;
  if (typeof a.text === "string" && typeof b.text === "string") return { available: true, basis: "TEXT", ...diffAnswers(a.text, b.text) };
  if (Array.isArray(a.line_digests) && Array.isArray(b.line_digests)) return { available: true, ...diffLineDigests(a.line_digests, b.line_digests) };
  return { available: false, reason: "NOT_COMPARABLE_NO_LINE_DIGESTS" };
}

export function compareGroups(before, after, options = {}) {
  return compareSessions(before?.aggregate || null, after?.aggregate || null, options);
}

export const SPEED_TEST_EXPORT_SCHEMA_ID = "saku.trainer.speed-test-export@1";

/**
 * Read a file that was written by `exportRuns`. Anything else is refused by
 * name rather than half-read: a JSON that is not this export would otherwise
 * compare as "no runs in common", which reads like a result.
 */
export function readExport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, code: "SAVED_EXPORT_NOT_AN_OBJECT" };
  if (value.schema !== SPEED_TEST_EXPORT_SCHEMA_ID) return { ok: false, code: "SAVED_EXPORT_WRONG_SCHEMA", detail: String(value.schema ?? "(none)") };
  if (!Array.isArray(value.records)) return { ok: false, code: "SAVED_EXPORT_NO_RECORDS" };
  const usable = value.records.filter(record => record?.run?.probe_id && record?.run?.answer);
  if (!usable.length) return { ok: false, code: "SAVED_EXPORT_EMPTY" };
  return { ok: true, exported_at: String(value.exported_at ?? ""), records: usable, skipped: value.records.length - usable.length };
}

/** The run each side would be judged by for a probe: the latest one it holds. */
function latestByProbe(records) {
  const byProbe = new Map();
  for (const record of records || []) {
    const id = record?.run?.probe_id;
    if (!id) continue;
    const held = byProbe.get(id);
    if (!held || String(record.run.at ?? "") > String(held.run.at ?? "")) byProbe.set(id, record);
  }
  return byProbe;
}

/**
 * Answer diffs between two sets of records, matched by probe (Owner 2026-09-23:
 * the comparison is of the answers, not of the speed figures — those are two
 * different questions and the aggregate already answers the other one).
 * A probe only one side holds is reported as that, never as "no change".
 */
export function compareSavedAnswers(beforeRecords, afterRecords) {
  const before = latestByProbe(beforeRecords);
  const after = latestByProbe(afterRecords);
  return [...new Set([...before.keys(), ...after.keys()])].sort().map(probe_id => {
    const a = before.get(probe_id) || null;
    const b = after.get(probe_id) || null;
    if (!a || !b) return { probe_id, available: false, reason: a ? "ONLY_IN_BEFORE" : "ONLY_IN_AFTER" };
    return { probe_id, before_run_id: a.run_id, after_run_id: b.run_id, before_at: a.run.at, after_at: b.run.at, ...diffAgainstPrevious(b, a) };
  });
}

/** JSON export of the stored runs, exactly as stored (text only where the Owner kept it). */
export function exportRuns(storage, filter = {}) {
  const listed = listRuns(storage, filter);
  return {
    schema: "saku.trainer.speed-test-export@1",
    exported_at: new Date().toISOString(),
    mode: PASTE_MODE,
    manual_measurement: "手動計測。コピー＆ペーストの時間を含む / Manual measurement. Times include the human copy & paste.",
    records: listed.records,
    problems: listed.problems,
  };
}
