// AI スピードテスト — paste mode core for the KOKOROSAKU Trainer.
//
// Pure functions over records.  The Owner copies a fixed probe into an external
// AI, pastes the answer back, and a stopwatch measures the whole round trip
// including the human's own copy and paste.  That is all a paste run can
// honestly say, so every time it reports carries MANUAL_MEASUREMENT.
//
// Semantics, vocabulary, thresholds and quantile method are those of the AMU
// core (KOKOROAMU-STUDIO core/diagnostics/speed-test.js at main 944151e4);
// `verify_speed_test.mjs` replays that revision's vectors through this module.
// The probe texts are ERABAZU canon (erabazu/speed-test-probe-pack/default);
// the same gate pins their digests against both the AMU and ERABAZU copies.
// Own implementation (Owner D-5); a later bounded swap to the AMU file is
// possible once the 03 ledger clears it.
//
// Nothing here reads or writes a Character, a Trainer Session, a Change
// Candidate, or an external review record.  There is no network path.

import { canonicalJson, sha256Hex } from "./external-review-intake.mjs";

export const SPEED_TEST_SCHEMA = "amu.ai-speed-test-run/1";
export const PROBE_PACK_SCHEMA = "amu.ai-speed-test-probe-pack/1";
export const PROBE_PACK_ID = "amu-speed-test-default";
export const ERABAZU_PROBE_PACK_ID = "erabazu/speed-test-probe-pack/default";
export const PASTE_MODE = "paste";
export const MANUAL_MEASUREMENT = Object.freeze({
  ja: "手動計測。コピー＆ペーストの時間を含む",
  en: "Manual measurement. Times include the human copy & paste.",
  meaning: "Manual measurement: times include the human copy/paste; compare only against other paste runs.",
});
export const DEFAULT_THRESHOLDS = Object.freeze({ fastMs: 2000, slowMs: 8000, minRuns: 3 });
export const DEFAULT_SLOWDOWN_RATIO = 1.5;

// Fixed probes.  Text and digest are pinned to the ERABAZU canon pack and the
// AMU DEFAULT_PROBES; the gate re-hashes every text.
export const DEFAULT_PROBES = Object.freeze([
  Object.freeze({ id: "echo-1", title: "往復", text: "次の 1 語だけを返してください: 了解", expect: Object.freeze({ kind: "exact", value: "了解" }) }),
  Object.freeze({ id: "count-1", title: "数える", text: "1 から 12 までの整数をカンマ区切りで、他の文字を含めずに返してください。", expect: Object.freeze({ kind: "exact", value: "1,2,3,4,5,6,7,8,9,10,11,12" }) }),
  Object.freeze({ id: "reason-1", title: "短い推論", text: "「東京は日本の首都である。大阪は東京より西にある。」この 2 文から確実に言えることを 1 文、20 字以内で書いてください。", expect: Object.freeze({ kind: "length", max: 40 }) }),
  Object.freeze({ id: "format-1", title: "形式遵守", text: "次の JSON だけを返してください（前後に文字を付けない）: {\"ok\":true,\"n\":3}", expect: Object.freeze({ kind: "json", value: Object.freeze({ ok: true, n: 3 }) }) }),
]);
export const PROBE_DIGESTS = Object.freeze({
  "echo-1": "1024c08de9bdd224fdac12223c9c8118388b165f19d0741f6a97669763a7cd3d",
  "count-1": "4952832614fdcd83433bbeb711db7168fe0244897517915ea03a1f782e89ce16",
  "reason-1": "8de9d5ea5dd767f15b6f325b070c3e09397ee68d7890e9914aae9456094675dd",
  "format-1": "6b6f6755b25632acbf540ecedff07deb3046c32d8baa239fcabff6f3f9c342e8",
});

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const failure = (code, detail) => Object.assign(new Error(detail || code), { code });

export function normalizeText(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}
const linesOf = text => { const normalized = normalizeText(text); return normalized ? normalized.split("\n") : []; };

export async function buildProbePack({ probes = DEFAULT_PROBES, pack_id = PROBE_PACK_ID } = {}) {
  const items = [];
  for (const probe of probes) {
    if (!nonEmpty(probe.id) || !nonEmpty(probe.text)) throw failure("SPEED_PROBE_INVALID", "probe needs id and text");
    items.push({ id: probe.id, title: probe.title ?? probe.id, text: probe.text, digest: `sha-256:${await sha256Hex(probe.text)}`, expect: clone(probe.expect ?? null) });
  }
  return Object.freeze({ schema: PROBE_PACK_SCHEMA, pack_id, probes: Object.freeze(items), meaning: "Fixed probe texts; what will be sent is exactly this and is shown to the human before any run." });
}

/** Facts about an answer: length, lines, and conformance to the probe's expectation.  No free-text inference. */
export function answerFacts(text, expect) {
  const normalized = normalizeText(text);
  let conformance = "NOT_ASSESSED";
  if (expect?.kind === "exact") conformance = normalized === expect.value ? "CONFORMS" : "DEVIATES";
  else if (expect?.kind === "length") conformance = normalized.length > 0 && normalized.length <= expect.max ? "CONFORMS" : "DEVIATES";
  else if (expect?.kind === "json") {
    try { conformance = canonicalJson(JSON.parse(normalized)) === canonicalJson(expect.value) ? "CONFORMS" : "DEVIATES"; }
    catch { conformance = "DEVIATES"; }
  }
  return { chars: normalized.length, lines: normalized ? normalized.split("\n").length : 0, conformance };
}

/** One sha-256 per normalized line.  Lets two answers be compared without keeping their text. */
export async function lineDigests(text) {
  const digests = [];
  for (const line of linesOf(text)) digests.push(`sha-256:${await sha256Hex(line)}`);
  return digests;
}

/**
 * One paste run.  `measurement.total_ms` comes from the Owner's stopwatch;
 * `reachable:false` records "no answer came".  The raw answer is kept only when
 * `keepText` is true; `line_digests` are always kept so a later diff is possible.
 */
export async function makeRun({ mode = PASTE_MODE, probe, provider_ref, model_ref, measurement, answerText, at, keepText = false, note = "" } = {}) {
  if (mode !== PASTE_MODE) throw failure("SPEED_RUN_MODE_INVALID", "the Trainer records paste runs only");
  if (!isObject(probe) || !nonEmpty(probe.id) || !nonEmpty(probe.digest)) throw failure("SPEED_RUN_INVALID", "probe from a probe pack is required");
  if (!nonEmpty(provider_ref) || !nonEmpty(model_ref)) throw failure("SPEED_RUN_INVALID", "provider_ref and model_ref are required");
  if (!nonEmpty(at)) throw failure("SPEED_RUN_INVALID", "at is required");
  const m = measurement ?? {};
  const total = Number.isFinite(m.total_ms) ? m.total_ms : null;
  const reachable = m.reachable === false ? false : total !== null;
  const text = normalizeText(answerText);
  const facts = answerFacts(text, probe.expect);
  return Object.freeze({
    schema: SPEED_TEST_SCHEMA, mode: PASTE_MODE, at, probe_id: probe.id, probe_digest: probe.digest, provider_ref, model_ref, model_observed: null,
    reachable, first_byte_ms: null, total_ms: total, request_bytes: null, response_bytes: null,
    usage: null, tokens_per_s: null,
    answer: { digest: text ? `sha-256:${await sha256Hex(text)}` : null, ...facts, line_digests: await lineDigests(text), ...(keepText ? { text } : {}) },
    note: String(note).slice(0, 300),
    meaning: MANUAL_MEASUREMENT.meaning,
  });
}

const quantile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))] : null);

/** Aggregate over runs of one probe / provider / model.  Thresholds are explicit and echoed back. */
export function aggregate(runs, { fastMs = DEFAULT_THRESHOLDS.fastMs, slowMs = DEFAULT_THRESHOLDS.slowMs, minRuns = DEFAULT_THRESHOLDS.minRuns } = {}) {
  const ok = runs.filter(run => run.reachable && run.total_ms !== null);
  const totals = ok.map(run => run.total_ms).sort((a, b) => a - b);
  const median = quantile(totals, 0.5);
  const p95 = quantile(totals, 0.95);
  const speed = ok.length < minRuns || median === null ? "NOT_ASSESSED" : median <= fastMs ? "FAST" : median <= slowMs ? "NORMAL" : "SLOW";
  const digests = new Set(ok.map(run => run.answer.digest).filter(Boolean));
  const models = [...new Set(ok.map(run => run.model_observed?.model_id ?? run.model_observed ?? null).filter(Boolean))];
  return Object.freeze({
    runs: runs.length, reachable_runs: ok.length, unreachable_runs: runs.length - ok.length,
    reachability: runs.length === 0 ? "NOT_ASSESSED" : ok.length === 0 ? "UNREACHABLE" : ok.length === runs.length ? "REACHABLE" : "INTERMITTENT",
    median_ms: median, p95_ms: p95, min_ms: totals[0] ?? null, max_ms: totals[totals.length - 1] ?? null,
    spread_ratio: median ? Math.round(((totals[totals.length - 1] - totals[0]) / median) * 100) / 100 : null,
    speed, thresholds: { fastMs, slowMs, minRuns },
    answer_variants: digests.size,
    conformance: ok.length ? Math.round((ok.filter(run => run.answer.conformance === "CONFORMS").length / ok.length) * 100) : null,
    models_observed: models,
    stability: ok.length < 2 ? "NOT_COMPARABLE" : digests.size === 1 ? "STABLE" : "DRIFTED",
  });
}

// Line LCS over two sequences.  `label` decides what an op carries: the line
// text (diffAnswers) or the line digest (diffLineDigests).  An empty answer is
// zero lines (ERABAZU answer-diff/v1; AMU main 944151e4).
function lcsDiff(A, B, label) {
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ op: "=", [label]: A[i] }); i += 1; j += 1; }
    else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ op: "-", [label]: A[i] }); i += 1; }
    else { ops.push({ op: "+", [label]: B[j] }); j += 1; }
  }
  while (i < n) ops.push({ op: "-", [label]: A[i++] });
  while (j < m) ops.push({ op: "+", [label]: B[j++] });
  const same = ops.filter(op => op.op === "=").length;
  const similarity = n + m === 0 ? 1 : Math.round(((2 * same) / (n + m)) * 1000) / 1000;
  return { similarity, added: ops.filter(op => op.op === "+").length, removed: ops.filter(op => op.op === "-").length, ops };
}

/** Diff of two kept answer texts to the same probe. */
export function diffAnswers(a, b) {
  const result = lcsDiff(linesOf(a), linesOf(b), "text");
  return Object.freeze({ identical: normalizeText(a) === normalizeText(b), ...result });
}

/** Diff of two answers from their line digests only.  No line text is present or recoverable. */
export function diffLineDigests(a = [], b = []) {
  const A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : [];
  const result = lcsDiff(A, B, "line_digest");
  return Object.freeze({ identical: A.length === B.length && A.every((digest, index) => digest === B[index]), basis: "LINE_DIGESTS_ONLY", ...result });
}

/** Two aggregates of the same probe / provider / model at different times. */
export function compareSessions(before, after, { slowdownRatio = DEFAULT_SLOWDOWN_RATIO } = {}) {
  if (!before || !after || before.median_ms === null || after.median_ms === null) return { speed_change: "NOT_COMPARABLE", answer_change: "NOT_COMPARABLE" };
  const ratio = after.median_ms / before.median_ms;
  const modelChanged = JSON.stringify(before.models_observed) !== JSON.stringify(after.models_observed);
  return Object.freeze({
    speed_change: ratio >= slowdownRatio ? "SLOWER" : ratio <= 1 / slowdownRatio ? "FASTER" : "SIMILAR",
    ratio: Math.round(ratio * 100) / 100,
    model_changed: modelChanged,
    answer_change: before.answer_variants === 1 && after.answer_variants === 1 ? "COMPARE_BY_DIFF" : "VARIES_WITHIN_SESSION",
  });
}

export function contractProjection() {
  return {
    run_schema: SPEED_TEST_SCHEMA, probe_pack_schema: PROBE_PACK_SCHEMA, probe_pack_id: PROBE_PACK_ID, erabazu_probe_pack_id: ERABAZU_PROBE_PACK_ID,
    modes: [PASTE_MODE], network: "NONE", text_default: "NOT_KEPT", line_digests: "KEPT",
    thresholds: { ...DEFAULT_THRESHOLDS }, slowdown_ratio: DEFAULT_SLOWDOWN_RATIO,
    vocabulary: { speed: ["FAST", "NORMAL", "SLOW", "NOT_ASSESSED"], stability: ["STABLE", "DRIFTED", "NOT_COMPARABLE"], conformance: ["CONFORMS", "DEVIATES", "NOT_ASSESSED"], speed_change: ["SLOWER", "SIMILAR", "FASTER", "NOT_COMPARABLE"] },
    writes: ["saku.trainer.speedTest.v1.index", "saku.trainer.speedTest.v1.run.<run_id>"],
    character_mutation: false, trainer_session_attachment: false, change_candidate: false,
  };
}
