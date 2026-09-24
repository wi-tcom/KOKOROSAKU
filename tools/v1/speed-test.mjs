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
// AI 申告値 (Owner 2026-09-22).  A second, weaker time: the probe is copied with
// a fixed trailing instruction asking the AI to end its answer with one line
// `処理時間: <秒>`, and that line is parsed back as `reported_time_sec`.  It is
// the model's own claim, cannot be verified here, never feeds the manual
// aggregate, and every place it appears says so.  The probe text itself and
// its pinned digest are unchanged; the instruction travels as a separate,
// digest-recorded suffix.
export const REPORTED_TIME_INSTRUCTION = Object.freeze({
  ja: "回答の最後に「処理時間: <秒>」の 1 行を必ず付けてください（例: 処理時間: 4.2）。",
  en: "End your answer with exactly one line \u300c処理時間: <seconds>\u300d (example: 処理時間: 4.2).",
});
export const REPORTED_TIME_SOURCE = "AI_SELF_REPORT";

/**
 * Ask for the two clock readings instead of a duration (Owner 2026-09-23).
 *
 * ChatGPT and Gemini do answer 「今何時何分何秒」, so this is a real reading and
 * not an invented number — Owner checked. The part still worth watching is the
 * **end** time: a model usually gets one clock value when the turn starts, so a
 * start time is a reading while an end time may be start plus an estimate
 * unless the platform reads the clock again. Two readings make that checkable,
 * which one duration never was: the elapsed time they imply cannot be longer
 * than the window this tool measured for itself between コピー and 貼り付け.
 *
 * SAKU-local. `REPORTED_TIME_INSTRUCTION` above is shared with AMU and ERABAZU
 * and is left untouched (統制卓 2026-09-23 froze that surface pending a decision),
 * and answers that still carry 「処理時間: <秒>」 are read as before.
 */
export const CLOCK_TIME_INSTRUCTION = Object.freeze({
  ja: "回答の最初に「開始時刻: HH:MM:SS」の 1 行を、最後に「終了時刻: HH:MM:SS」の 1 行を付けてください。開始時刻は回答を書き始める直前、終了時刻は書き終えた直後に、そのつど現在のシステム時刻を読んで書いてください（24 時間表記。例: 開始時刻: 14:03:07 / 終了時刻: 14:03:19）。コード実行などで時刻を取得できる場合は、その値を使ってください。取得できない場合は、推測せずに「開始時刻: 取得不可」「終了時刻: 取得不可」と書いてください。",
  en: "Begin your answer with one line, 「開始時刻: HH:MM:SS」, and end it with one line, 「終了時刻: HH:MM:SS」. Read the system clock twice: read it immediately before you start writing the answer, and read it again immediately after you finish writing the answer. Do not reuse one reading for both lines. Write both times in 24-hour format (example: 開始時刻: 14:03:07 / 終了時刻: 14:03:19). If a tool such as code execution can obtain the time, use that value. If you cannot obtain the time, write 「開始時刻: unavailable」 and 「終了時刻: unavailable」. Do not guess a time. Write the labels 開始時刻 and 終了時刻 exactly as shown; do not translate them.",
});
export const CLOCK_TIME_SOURCE = "AI_CLOCK_READING";
/**
 * Owner 2026-09-24 asked for the system time at the start and at the end. The
 * Japanese says when to read the clock (just before writing and just after, each
 * time), where from (the current system time; code execution when the platform
 * has it) and what to write when it cannot be read (取得不可, never a guess).
 * Japanese approved: ライター&SNS 様式チェック 2026-09-24（Wi-t_Site be337b0,
 * site-content/manuals/reviews/2026-09-24_clock-instruction-v2-check.md）.
 * English: 英語翻訳チーム via ライター&SNS 2026-09-24 (Wi-t_Site 2829634,
 * `SAKU-verify/saku-clock-instruction-v2-N_EN.json`); the value it asks for when
 * the clock cannot be read is `unavailable`, which the parser reads as 取得不可.
 */
export const CLOCK_TEXT_APPROVED = true;

const CLOCK_LINE = /^(開始時刻|終了時刻)\s*[:：]\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*[:：]\s*(\d{2})/;
/**
 * What the instruction asks the AI to write when it cannot read the clock. An AI
 * answering in English may translate the value, so `unavailable` is read the same
 * way (ライター&SNS 2026-09-24, be337b0, 案 B); the labels stay as they are.
 */
export const CLOCK_UNAVAILABLE = "取得不可";
export const CLOCK_UNAVAILABLE_SYNONYMS = Object.freeze(["unavailable"]);
const CLOCK_UNAVAILABLE_LINE = /^(開始時刻|終了時刻)\s*[:：]\s*(?:取得不可|unavailable)\s*[。.]?\s*$/i;

/**
 * Split the two clock lines off the answer and work out the elapsed seconds.
 *
 * Only a line at the very start and a line at the very end count, so a clock
 * time quoted inside an answer is not mistaken for one. A pair that runs
 * backwards is refused rather than wrapped around midnight — crossing midnight
 * is rare, and silently adding a day would invent a measurement. The elapsed
 * value is null whenever anything is missing; it is never guessed.
 */
export function extractClockTimes(text) {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/);
  const firstAt = lines.findIndex(line => line.trim());
  let lastAt = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) if (lines[index].trim()) { lastAt = index; break; }
  const none = { answerText: raw, started_at: null, finished_at: null, elapsed_sec: null, problem: null };
  if (firstAt < 0 || lastAt <= firstAt) return none;

  // 取得不可 is the AI saying it could not read the clock: no measurement, and
  // the two lines are still not part of the answer.
  const headOff = CLOCK_UNAVAILABLE_LINE.exec(lines[firstAt].trim());
  const tailOff = CLOCK_UNAVAILABLE_LINE.exec(lines[lastAt].trim());
  const head = CLOCK_LINE.exec(lines[firstAt].trim());
  const tail = CLOCK_LINE.exec(lines[lastAt].trim());
  if (headOff || tailOff) {
    const startLine = headOff || head, endLine = tailOff || tail;
    if (startLine?.[1] === "開始時刻" && endLine?.[1] === "終了時刻") {
      return { answerText: lines.slice(firstAt + 1, lastAt).join("\n"), started_at: lines[firstAt].trim(), finished_at: lines[lastAt].trim(), elapsed_sec: null, problem: "CLOCK_UNAVAILABLE" };
    }
    return { ...none, problem: "CLOCK_UNAVAILABLE" };
  }
  if (!head || head[1] !== "開始時刻") return { ...none, problem: tail ? "CLOCK_START_MISSING" : null };
  if (!tail || tail[1] !== "終了時刻") return { ...none, problem: "CLOCK_END_MISSING" };

  const seconds = match => Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]);
  const startSec = seconds(head), endSec = seconds(tail);
  const answerText = lines.slice(firstAt + 1, lastAt).join("\n");
  const pair = { answerText, started_at: lines[firstAt].trim(), finished_at: lines[lastAt].trim() };
  if (Number(head[2]) > 23 || Number(tail[2]) > 23 || Number(head[3]) > 59 || Number(tail[3]) > 59 || Number(head[4]) > 59 || Number(tail[4]) > 59) {
    return { ...pair, elapsed_sec: null, problem: "CLOCK_NOT_A_TIME" };
  }
  if (endSec < startSec) return { ...pair, elapsed_sec: null, problem: "CLOCK_RUNS_BACKWARDS" };
  return { ...pair, elapsed_sec: Math.round((endSec - startSec) * 1000) / 1000, problem: null };
}

/**
 * What the tool measured for itself, against what the answer claims.
 *
 * `observedMs` is the window between pressing コピー and pasting the answer —
 * measured here, not reported by anyone. It contains the model's work plus the
 * person moving between two windows, so it is an **upper bound**: a claim
 * longer than the window cannot be true. A claim shorter than it says nothing
 * either way, which is the honest reading and what this returns.
 */
export function checkAgainstWindow(elapsedSec, observedMs) {
  if (!Number.isFinite(elapsedSec) || !Number.isFinite(observedMs) || observedMs <= 0) return { state: "NO_WINDOW", observed_ms: null, claimed_sec: Number.isFinite(elapsedSec) ? elapsedSec : null };
  const observed = Math.round(observedMs);
  if (elapsedSec * 1000 > observed) return { state: "LONGER_THAN_WINDOW", observed_ms: observed, claimed_sec: elapsedSec, over_ms: Math.round(elapsedSec * 1000 - observed) };
  return { state: "WITHIN_WINDOW", observed_ms: observed, claimed_sec: elapsedSec };
}
export const REPORTED_TIME_MEANING = Object.freeze({
  ja: "AI 申告値（検証不能）。AI が自ら書いた処理時間で、このツールでは確かめられません。手計測とは別に扱います",
  en: "AI-reported (unverifiable). The time the AI wrote about itself; this tool cannot check it. Kept apart from the manual measurement.",
  meaning: "AI self-reported time: unverifiable claim written by the model; never compared with or mixed into manual measurements.",
});
export const REPORTED_TIME_LINE = /^\s*(?:処理時間|処理時間（秒）|processing[ _-]?time)\s*[:：]\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:秒|s|sec|secs|seconds?)?\s*[。.]?\s*$/i;
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

/**
 * The probes the speed test actually uses (Owner 2026-09-23: 「簡単な質問すぎて
 * 0.1 秒でしか返ってこないので、数秒から数十秒となるような設問にしてください」).
 *
 * DEFAULT_PROBES above is ERABAZU canon, carried byte for byte and pinned by a
 * parity gate against ERABAZU 409b4a2 and AMU 944151e4 — it is **not** edited
 * here, because those texts are shared with two other products. This is a
 * second pack, and only this repository's screen uses it.
 *
 * The time is made by **asking for several steps**, not by asking for volume
 * (統制卓 2026-09-23): each probe decomposes, then grounds what it said, then
 * marks what it cannot settle. A long answer would measure typing speed; a
 * multi-step one measures the work. The texts are fixed — a probe that changed
 * between runs would make "it got faster" mean nothing — and carry a version
 * and a digest so a record can say which text produced a number.
 *
 * Japanese approved (notation only: 算用数字, one stray space): ライター&SNS 様式チェック 2026-09-24（Wi-t_Site 7ffbaa0, site-content/manuals/reviews/2026-09-24_saku-builder-5groups-wording-check.md）.
 * The texts changed, so the version did too; a record says which text it used.
 */
export const DELIBERATE_PACK_ID = "saku.speed-test.deliberate";
export const DELIBERATE_PACK_VERSION = "1.0";
export const DELIBERATE_PROBES = Object.freeze([
  Object.freeze({
    id: "decompose-1",
    title: "分解する",
    text: [
      "次の状況を読み、3 つの見出しに分けて答えてください。",
      "状況: 小さな店が、土曜の来客だけが前年より減ったことに気づいた。平日の来客と売上の合計は変わっていない。",
      "1. 事実: 状況から確実に言えることだけを箇条書きで挙げてください。",
      "2. 仮説: 土曜だけが減った理由として考えられるものを 4 つ挙げ、それぞれ一行で根拠を書いてください。",
      "3. 確かめられないこと: この状況だけでは判断できないことを挙げてください。",
      "推測を事実として書かないでください。",
    ].join("\n"),
    expect: Object.freeze({ kind: "length", max: 1600 }),
  }),
  Object.freeze({
    id: "ground-1",
    title: "根拠をたどる",
    text: [
      "次の 3 文だけを前提に答えてください。",
      "A: この装置は、電源が入っているときだけ音を出す。",
      "B: 昨夜、装置は音を出していなかった。",
      "C: 昨夜、建物の電源は落ちていない。",
      "1. この 3 文から確実に言えることを 1 つ書いてください。",
      "2. その結論が A・B・C のどれに、どう依存しているかを一つずつ書いてください。",
      "3. 3 文に書かれていないために決められないことを 2 つ挙げてください。",
    ].join("\n"),
    expect: Object.freeze({ kind: "length", max: 1200 }),
  }),
  Object.freeze({
    id: "enumerate-1",
    title: "列挙して分ける",
    text: [
      "「利用者が同じ操作を二度行ってしまう」原因を 6 つ挙げてください。",
      "1. それぞれに、一行で理由を付けてください。",
      "2. 6 つを「画面の作りが原因」「利用者の状況が原因」「どちらとも言える」の 3 群に分けてください。",
      "3. 同時には起こりえない組み合わせがあれば指摘してください。無ければ「無し」と書いてください。",
    ].join("\n"),
    expect: Object.freeze({ kind: "length", max: 1600 }),
  }),
  Object.freeze({
    id: "order-1",
    title: "順序を決める",
    text: [
      "次の条件をすべて満たす並び順を 1 つ求めてください。作業は ア・イ・ウ・エ・オ の 5 つです。",
      "条件 1: ア は イ より先。",
      "条件 2: ウ は最後ではない。",
      "条件 3: エ は イ の直後。",
      "条件 4: オ は ア より先。",
      "1. 並び順を書いてください。",
      "2. 隣り合う組それぞれについて、どの条件がそれを許すかを書いてください。",
      "3. 条件だけでは決まらない点が残るなら、それを書いてください。",
    ].join("\n"),
    expect: Object.freeze({ kind: "length", max: 1200 }),
  }),
]);

/** True while the deliberate probe texts have not been through the review route. */
export const PROBE_TEXT_APPROVED = true;

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const failure = (code, detail) => Object.assign(new Error(detail || code), { code });

export function normalizeText(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}
const linesOf = text => { const normalized = normalizeText(text); return normalized ? normalized.split("\n") : []; };

/** The text the Owner pastes: the pinned probe, a blank line, the fixed instruction. */
export function probeCopyText(probe, lang = "ja") {
  const instruction = lang === "en" ? REPORTED_TIME_INSTRUCTION.en : REPORTED_TIME_INSTRUCTION.ja;
  return `${String(probe?.text ?? "")}\n\n${instruction}`;
}

/**
 * Split the AI's reported time off the pasted answer.  Only the LAST non-empty
 * line is considered, so a probe answer that merely mentions the words is not
 * mistaken for a report.  Returns the answer without that line (what the
 * probe expectation is judged against) and the claim, or null when absent.
 */
export function extractReportedTime(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last -= 1;
  if (last < 0) return { answerText: String(text ?? ""), reported_time_sec: null, reported_line: null };
  const match = lines[last].match(REPORTED_TIME_LINE);
  if (!match) return { answerText: String(text ?? ""), reported_time_sec: null, reported_line: null };
  const seconds = Number(match[1].replace(",", "."));
  if (!Number.isFinite(seconds) || seconds < 0) return { answerText: String(text ?? ""), reported_time_sec: null, reported_line: null };
  return { answerText: lines.slice(0, last).join("\n"), reported_time_sec: Math.round(seconds * 1000) / 1000, reported_line: lines[last].trim() };
}

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
 * One paste run.  `measurement.total_ms` comes from the Owner's stopwatch (or a
 * typed manual time); `reachable:false` records "no answer came".  The raw
 * answer is kept only when `keepText` is true; `line_digests` are always kept
 * so a later diff is possible.
 *
 * `measurement.reported_time_sec` (optional) is the AI 申告値 parsed from the
 * answer's last line.  When present the run carries a `reported` block and is
 * reachable even without a manual time; when absent the record is exactly the
 * AMU-vector shape.  The block never enters total_ms or the manual aggregate.
 */
export async function makeRun({ mode = PASTE_MODE, probe, provider_ref, model_ref, measurement, answerText, at, keepText = false, note = "" } = {}) {
  if (mode !== PASTE_MODE) throw failure("SPEED_RUN_MODE_INVALID", "the Trainer records paste runs only");
  if (!isObject(probe) || !nonEmpty(probe.id) || !nonEmpty(probe.digest)) throw failure("SPEED_RUN_INVALID", "probe from a probe pack is required");
  if (!nonEmpty(provider_ref) || !nonEmpty(model_ref)) throw failure("SPEED_RUN_INVALID", "provider_ref and model_ref are required");
  if (!nonEmpty(at)) throw failure("SPEED_RUN_INVALID", "at is required");
  const m = measurement ?? {};
  const total = Number.isFinite(m.total_ms) ? m.total_ms : null;
  const reportedSec = Number.isFinite(m.reported_time_sec) && m.reported_time_sec >= 0 ? m.reported_time_sec : null;
  const reachable = m.reachable === false ? false : (total !== null || reportedSec !== null);
  const text = normalizeText(answerText);
  const facts = answerFacts(text, probe.expect);
  const reported = reportedSec === null ? null : {
    source: REPORTED_TIME_SOURCE, time_sec: reportedSec, line: String(m.reported_line ?? "").slice(0, 120) || null,
    instruction_digest: `sha-256:${await sha256Hex(String(m.instruction ?? REPORTED_TIME_INSTRUCTION.ja))}`,
    verified: false, meaning: REPORTED_TIME_MEANING.meaning,
  };
  return Object.freeze({
    schema: SPEED_TEST_SCHEMA, mode: PASTE_MODE, at, probe_id: probe.id, probe_digest: probe.digest, provider_ref, model_ref, model_observed: null,
    reachable, first_byte_ms: null, total_ms: total, request_bytes: null, response_bytes: null,
    usage: null, tokens_per_s: null,
    answer: { digest: text ? `sha-256:${await sha256Hex(text)}` : null, ...facts, line_digests: await lineDigests(text), ...(keepText ? { text } : {}) },
    note: String(note).slice(0, 300),
    meaning: MANUAL_MEASUREMENT.meaning,
    ...(reported ? { reported } : {}),
  });
}

const quantile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))] : null);

/** Aggregate over runs of one probe / provider / model.  Thresholds are explicit and echoed back. */
export function aggregate(runs, { fastMs = DEFAULT_THRESHOLDS.fastMs, slowMs = DEFAULT_THRESHOLDS.slowMs, minRuns = DEFAULT_THRESHOLDS.minRuns } = {}) {
  // A run that reached the AI but carries only an AI 申告値 (no manual time) is
  // reachable and counts for answers/conformance; timing figures use manual times only.
  const reached = runs.filter(run => run.reachable);
  const ok = reached.filter(run => run.total_ms !== null);
  const totals = ok.map(run => run.total_ms).sort((a, b) => a - b);
  const median = quantile(totals, 0.5);
  const p95 = quantile(totals, 0.95);
  const speed = ok.length < minRuns || median === null ? "NOT_ASSESSED" : median <= fastMs ? "FAST" : median <= slowMs ? "NORMAL" : "SLOW";
  const digests = new Set(reached.map(run => run.answer.digest).filter(Boolean));
  const models = [...new Set(reached.map(run => run.model_observed?.model_id ?? run.model_observed ?? null).filter(Boolean))];
  // AI 申告値 are summarised beside, never inside, the manual figures.
  const claims = runs.filter(run => run.reported && Number.isFinite(run.reported.time_sec)).map(run => run.reported.time_sec).sort((a, b) => a - b);
  const reported = claims.length ? { runs: claims.length, median_sec: quantile(claims, 0.5), min_sec: claims[0], max_sec: claims[claims.length - 1], source: REPORTED_TIME_SOURCE, verified: false, meaning: REPORTED_TIME_MEANING.meaning } : null;
  return Object.freeze({
    runs: runs.length, reachable_runs: reached.length, unreachable_runs: runs.length - reached.length,
    reachability: runs.length === 0 ? "NOT_ASSESSED" : reached.length === 0 ? "UNREACHABLE" : reached.length === runs.length ? "REACHABLE" : "INTERMITTENT",
    median_ms: median, p95_ms: p95, min_ms: totals[0] ?? null, max_ms: totals[totals.length - 1] ?? null,
    spread_ratio: median ? Math.round(((totals[totals.length - 1] - totals[0]) / median) * 100) / 100 : null,
    speed, thresholds: { fastMs, slowMs, minRuns },
    answer_variants: digests.size,
    conformance: reached.length ? Math.round((reached.filter(run => run.answer.conformance === "CONFORMS").length / reached.length) * 100) : null,
    models_observed: models,
    stability: reached.length < 2 ? "NOT_COMPARABLE" : digests.size === 1 ? "STABLE" : "DRIFTED",
    ...(reported ? { reported } : {}),
  });
}

/**
 * The same figures, computed from the AI 申告値 instead of the stopwatch
 * (Owner 2026-09-23: 「その値で検証してください。早すぎてストップウォッチでは
 * 計測できないこと多いため」).
 *
 * This is a second aggregate, not a change to `aggregate()`: that one's shape
 * is replayed against AMU vectors and adding a field there would break the
 * parity this module exists to keep. The two are never added together — they
 * measure different things. The manual time includes the person's copy and
 * paste; the reported one is what the model said about itself.
 *
 * `verified` stays false. The value is used, and it is still not something this
 * tool measured — a paste-mode tool has no way to time a model, which is why
 * the reported value is the only signal there is for a sub-second answer.
 */
export function reportedAggregate(runs, { fastMs = DEFAULT_THRESHOLDS.fastMs, slowMs = DEFAULT_THRESHOLDS.slowMs, minRuns = DEFAULT_THRESHOLDS.minRuns } = {}) {
  const claims = (runs || []).filter(run => run.reachable && run.reported && Number.isFinite(run.reported.time_sec)).map(run => run.reported.time_sec).sort((a, b) => a - b);
  if (!claims.length) return Object.freeze({ runs: 0, median_sec: null, p95_sec: null, min_sec: null, max_sec: null, spread_ratio: null, speed: "NOT_ASSESSED", thresholds: { fastMs, slowMs, minRuns }, source: REPORTED_TIME_SOURCE, verified: false });
  const median = quantile(claims, 0.5);
  const medianMs = median === null ? null : median * 1000;
  return Object.freeze({
    runs: claims.length,
    median_sec: median,
    p95_sec: quantile(claims, 0.95),
    min_sec: claims[0],
    max_sec: claims[claims.length - 1],
    spread_ratio: median ? Math.round(((claims[claims.length - 1] - claims[0]) / median) * 100) / 100 : null,
    speed: claims.length < minRuns || medianMs === null ? "NOT_ASSESSED" : medianMs <= fastMs ? "FAST" : medianMs <= slowMs ? "NORMAL" : "SLOW",
    thresholds: { fastMs, slowMs, minRuns },
    source: REPORTED_TIME_SOURCE,
    verified: false,
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
    reported_time: { source: REPORTED_TIME_SOURCE, verified: false, feeds_manual_aggregate: false, instruction_ja: REPORTED_TIME_INSTRUCTION.ja },
    thresholds: { ...DEFAULT_THRESHOLDS }, slowdown_ratio: DEFAULT_SLOWDOWN_RATIO,
    vocabulary: { speed: ["FAST", "NORMAL", "SLOW", "NOT_ASSESSED"], stability: ["STABLE", "DRIFTED", "NOT_COMPARABLE"], conformance: ["CONFORMS", "DEVIATES", "NOT_ASSESSED"], speed_change: ["SLOWER", "SIMILAR", "FASTER", "NOT_COMPARABLE"] },
    writes: ["saku.trainer.speedTest.v1.index", "saku.trainer.speedTest.v1.run.<run_id>"],
    character_mutation: false, trainer_session_attachment: false, change_candidate: false,
  };
}
