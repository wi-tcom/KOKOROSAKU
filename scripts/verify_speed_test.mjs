// AI speed test (paste mode) gate — Owner GO 2026-09-20 acceptance conditions 1–6.
//
//  1 probe pack parity: text digests equal the AMU DEFAULT_PROBES pin and the
//    ERABAZU canon pack (sha256: notation) byte-copied from AMU vendor 409b4a2;
//  2 equivalence: AMU main 944151e4 vectors replay identically through the
//    Builder core (answerFacts / makeRun / aggregate / diffAnswers incl. empty
//    answer = zero lines / compareSessions);
//  3 mode !== 'paste' → SPEED_RUN_MODE_INVALID; no provider/model, stop before
//    start → no run;
//  4 keep_text off → stored bytes carry no answer text, line digests present,
//    digests are one-way;
//  5 only saku.trainer.speedTest.v1.* is written; frozen-ia and intake records
//    are byte-identical before/after;
//  6 browser: the manual-measurement sentence accompanies every time display,
//    no first-byte / 初動 column, 390 px no horizontal overflow, JA/EN.
// Each rule that refuses is also falsified in a temporary module copy.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFile(path.join(ROOT, relative), "utf8");
const sha256 = text => createHash("sha256").update(text, "utf8").digest("hex");
const cases = [];
const check = (condition, label) => { assert.ok(condition, label); cases.push(label); };
const equal = (actual, expected, label) => { assert.equal(actual, expected, `${label} (got ${JSON.stringify(actual)})`); cases.push(label); };
const same = (actual, expected, label) => { assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}\n  got ${JSON.stringify(actual)}\n  exp ${JSON.stringify(expected)}`); cases.push(label); };

const CORE = "tools/v1/speed-test.mjs";
const STORE = "tools/v1/speed-test-store.mjs";
const Core = await import(pathToFileURL(path.join(ROOT, CORE)).href);
const Store = await import(pathToFileURL(path.join(ROOT, STORE)).href);
const Contract = await import(pathToFileURL(path.join(ROOT, "tools/v1/trainer-frozen-ia.mjs")).href);
const Intake = await import(pathToFileURL(path.join(ROOT, "tools/v1/external-review-intake.mjs")).href);

function storage() {
  const values = new Map();
  return {
    values,
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
const snapshot = (store, prefix = "") => JSON.stringify([...store.values.entries()].filter(([key]) => key.startsWith(prefix)).sort());

// ── the deliberate probes, and the reported value as the measurement ──────
// Owner 2026-09-23: 「簡単な質問すぎて 0.1 秒でしか返ってこない」 and 「その値で
// 検証してください」. Both are checked by the property, not by the sentence: a
// probe must ask for several steps, and the aggregate must come from the
// reported values.
{
  const probes = Core.DELIBERATE_PROBES;
  equal(probes.length, 4, "ST-PROBE the deliberate pack has four probes");
  check(new Set(probes.map(probe => probe.id)).size === probes.length, "ST-PROBE their ids are distinct");
  check(probes.every(probe => !Core.DEFAULT_PROBES.some(canon => canon.id === probe.id)), "ST-PROBE none of them reuses a canon id");
  for (const probe of probes) {
    const lines = probe.text.split(String.fromCharCode(10));
    const steps = lines.filter(line => /^\d\./.test(line.trim()));
    check(steps.length >= 3, `ST-PROBE ${probe.id} asks for at least three numbered steps (saw ${steps.length}) — the time comes from the steps, not from the volume asked for`);
    check(probe.text.length <= 400, `ST-PROBE ${probe.id} is short to read (${probe.text.length} chars): a long probe would measure reading, not thinking`);
    check(Boolean(probe.expect), `ST-PROBE ${probe.id} carries an expectation, so conformance stays a fact and not an opinion`);
  }
  // the canon pack is not edited from here — it is shared with ERABAZU and AMU
  equal(Core.DEFAULT_PROBES[0].text, "次の 1 語だけを返してください: 了解", "ST-PROBE the ERABAZU canon probe is untouched");
  check(Core.PROBE_TEXT_APPROVED === true && Core.DELIBERATE_PACK_VERSION === "1.0", "ST-PROBE the deliberate wording is approved (ライター&SNS 2026-09-24) and the pack version moved with the text");
  check(Boolean(Core.DELIBERATE_PACK_VERSION), "ST-PROBE the pack carries a version, so a record can say which text produced a number");
}

// the reported value, used as the measurement
{
  const run = (sec, manualMs) => ({ reachable: true, total_ms: manualMs ?? null, reported: sec === null ? null : { time_sec: sec }, answer: { digest: "d", conformance: "CONFORMS" } });
  const runs = [run(3.0, 100), run(5.0, 200), run(4.0, 150)];
  const reported = Core.reportedAggregate(runs, { fastMs: 2000, slowMs: 8000, minRuns: 1 });
  equal(reported.runs, 3, "ST-BASIS every run that carries a reported time counts toward the measurement");
  equal(reported.median_sec, 4, "ST-BASIS the median comes from the reported values");
  equal(reported.speed, "NORMAL", "ST-BASIS and the verdict is taken from them, against the same thresholds");
  equal(reported.verified, false, "ST-BASIS the figure never claims it was checked — nothing checked it");
  // the two bases are not added together
  const manual = Core.aggregate(runs, { fastMs: 2000, slowMs: 8000, minRuns: 1 });
  equal(manual.median_ms, 150, "ST-BASIS the manual aggregate is unchanged, still from the stopwatch times");
  check(manual.median_ms !== reported.median_sec * 1000, "ST-BASIS the two bases stay apart — one includes the person's copy and paste, the other does not");
  equal(Core.reportedAggregate([run(null, 100)], { minRuns: 1 }).runs, 0, "ST-BASIS a run with no reported time contributes nothing to the measurement");
  equal(Core.reportedAggregate([], {}).speed, "NOT_ASSESSED", "ST-BASIS no reported times → NOT_ASSESSED, not a guess");
  equal(Core.reportedAggregate([run(3.0, null)], { minRuns: 3 }).speed, "NOT_ASSESSED", "ST-BASIS below minRuns → NOT_ASSESSED");
}

// ── two clock readings, checked against a window this tool measured ───────
// Owner 2026-09-23: 「AI に作業開始時と結果表示の際の時刻を表示してもらえばよい
// のでは」. ChatGPT and Gemini do answer 「今何時何分何秒」, so these are readings.
// The end time is the part worth watching — a model usually gets one clock value
// when its turn starts — so the pair is checked against the window between コピー
// and 貼り付け, which this tool measures itself.
{
  const NL = String.fromCharCode(10);
  const answer = (start, end, body) => [`開始時刻: ${start}`, body ?? "本文", `終了時刻: ${end}`].join(NL);

  const ok = Core.extractClockTimes(answer("14:03:07", "14:03:19"));
  equal(ok.elapsed_sec, 12, "ST-CLOCK the elapsed time is the gap between the two readings");
  equal(ok.answerText, "本文", "ST-CLOCK the two lines are split off the answer");
  equal(ok.problem, null, "ST-CLOCK a well-formed pair carries no problem");

  equal(Core.extractClockTimes(answer("14:03:19", "14:03:07")).elapsed_sec, null, "ST-CLOCK a pair that runs backwards yields no measurement");
  equal(Core.extractClockTimes(answer("14:03:19", "14:03:07")).problem, "CLOCK_RUNS_BACKWARDS", "ST-CLOCK and says why — midnight is not assumed, which would invent a measurement");
  equal(Core.extractClockTimes(`開始時刻: 14:03:07${NL}本文`).problem, "CLOCK_END_MISSING", "ST-CLOCK a missing end time is named, not guessed");
  equal(Core.extractClockTimes("ただの回答").elapsed_sec, null, "ST-CLOCK an answer with no readings yields nothing");
  equal(Core.extractClockTimes(answer("25:00:00", "25:00:05")).problem, "CLOCK_NOT_A_TIME", "ST-CLOCK a reading that is not a clock time is refused");
  // Owner 2026-09-24: the system time at the start and at the end, and 取得不可 — not a guess — when it cannot be read
  const off = Core.extractClockTimes(answer(Core.CLOCK_UNAVAILABLE, Core.CLOCK_UNAVAILABLE));
  same({ elapsed: off.elapsed_sec, problem: off.problem, text: off.answerText }, { elapsed: null, problem: "CLOCK_UNAVAILABLE", text: "本文" }, "ST-CLOCK 取得不可 on both lines yields no measurement, is named, and is not part of the answer");
  const half = Core.extractClockTimes(answer("14:03:07", Core.CLOCK_UNAVAILABLE));
  same({ elapsed: half.elapsed_sec, problem: half.problem, text: half.answerText }, { elapsed: null, problem: "CLOCK_UNAVAILABLE", text: "本文" }, "ST-CLOCK one reading and one 取得不可 make no measurement — the missing end is not estimated");
  const ja = Core.CLOCK_TIME_INSTRUCTION.ja;
  check(/そのつど現在のシステム時刻を読んで/.test(ja) && /書き始める直前/.test(ja) && /書き終えた直後/.test(ja), "ST-CLOCK the instruction asks for the current system time, read each time: just before writing and just after");
  check(ja.includes(`「開始時刻: ${Core.CLOCK_UNAVAILABLE}」`) && ja.includes(`「終了時刻: ${Core.CLOCK_UNAVAILABLE}」`) && /推測せずに/.test(ja), "ST-CLOCK it names the exact 取得不可 lines the parser reads, and asks for them instead of a guess");
  check(Core.CLOCK_TEXT_APPROVED === true && ja.startsWith("回答の最初に") && ja.endsWith("と書いてください。"), "ST-CLOCK the Japanese is the approved text (ライター&SNS 2026-09-24, be337b0)");
  const english = Core.extractClockTimes(answer("unavailable", "Unavailable"));
  same({ elapsed: english.elapsed_sec, problem: english.problem, text: english.answerText }, { elapsed: null, problem: "CLOCK_UNAVAILABLE", text: "本文" }, "ST-CLOCK an AI that translates 取得不可 to unavailable is read the same way");
  check(/24 時間表記/.test(ja), "ST-CLOCK it still asks for 24-hour times");
  // English (英語翻訳チーム via ライター&SNS 2026-09-24, Wi-t_Site 2829634): the value it asks for is one the parser reads
  const en = Core.CLOCK_TIME_INSTRUCTION.en;
  check(/Read the system clock twice/.test(en) && /Do not reuse one reading for both lines\./.test(en) && /Do not guess a time\./.test(en), "ST-CLOCK the English asks for two readings of the system clock and no guess");
  check(Core.CLOCK_UNAVAILABLE_SYNONYMS.every(word => en.includes(`「開始時刻: ${word}」`) && en.includes(`「終了時刻: ${word}」`)) && Core.extractClockTimes(answer("unavailable", "unavailable")).problem === "CLOCK_UNAVAILABLE", "ST-CLOCK the English names the unavailable lines, and the parser reads exactly those");
  // a time quoted inside the answer is not a reading
  equal(Core.extractClockTimes([`開始時刻: 10:00:00`, "開始時刻: 09:00:00 と書いてありました", `終了時刻: 10:00:04`].join(NL)).elapsed_sec, 4, "ST-CLOCK the readings on the first and last lines are the ones used");
  // The first line here is ordinary prose and the quoted reading is inside the
  // answer. Reading it would give 3604 s, so this fixture can tell the two
  // apart — the earlier one could not, because its first line was a reading too.
  equal(Core.extractClockTimes(["本文の冒頭です", "開始時刻: 09:00:00 と書いてありました", `終了時刻: 10:00:04`].join(NL)).elapsed_sec, null, "ST-CLOCK a reading quoted inside the answer is not used — only the first line counts");

  equal(Core.checkAgainstWindow(12, 30000).state, "WITHIN_WINDOW", "ST-WINDOW a claim that fits the measured window is not contradicted");
  equal(Core.checkAgainstWindow(8, 3000).state, "LONGER_THAN_WINDOW", "ST-WINDOW a claim longer than the window is impossible and is marked");
  equal(Core.checkAgainstWindow(8, 3000).over_ms, 5000, "ST-WINDOW by how much");
  equal(Core.checkAgainstWindow(12, null).state, "NO_WINDOW", "ST-WINDOW with no window measured, nothing is claimed either way");
  equal(Core.checkAgainstWindow(1, 30000).state, "WITHIN_WINDOW", "ST-WINDOW a claim shorter than the window says nothing on its own — the window holds the person's switching too");
}

// ── 1. probe pack parity ───────────────────────────────────────────────────
const erabazu = JSON.parse(await read("tests/fixtures/speed-test/erabazu-speed-test-probe-pack.default.json"));
equal(sha256(await read("tests/fixtures/speed-test/erabazu-speed-test-probe-pack.default.json")), "663e2bba394dc21e093f8b09e3767f21d6d5e5c160145dda050bfa1ddcfe2591", "ST-PACK ERABAZU canon pack bytes (AMU vendor 409b4a2 PROVENANCE)");
equal(erabazu.pack_id, Core.ERABAZU_PROBE_PACK_ID, "ST-PACK ERABAZU pack id pinned");
equal(erabazu.schema, "erabazu.candidate/speed-test-probe-pack/v1", "ST-PACK ERABAZU schema");
const vectors = JSON.parse(await read("tests/fixtures/speed-test/amu-vectors.944151e4.json"));
equal(vectors.source.main_revision, "944151e4", "ST-VEC vectors come from AMU main 944151e4");
equal(Core.DEFAULT_PROBES.length, 4, "ST-PACK four probes");
for (const probe of Core.DEFAULT_PROBES) {
  const hex = sha256(probe.text);
  equal(hex, Core.PROBE_DIGESTS[probe.id], `ST-PACK ${probe.id} text matches the Builder pin`);
  const canon = erabazu.probes.find(item => item.id === probe.id);
  equal(`sha256:${hex}`, canon?.digest, `ST-PACK ${probe.id} text matches the ERABAZU canon digest (sha256: notation)`);
  equal(probe.text, canon.text, `ST-PACK ${probe.id} text equals the ERABAZU canon text`);
  same(probe.expect, canon.expect, `ST-PACK ${probe.id} expect rule equals the ERABAZU canon`);
  const amu = vectors.pack.probes.find(item => item.id === probe.id);
  equal(`sha-256:${hex}`, amu?.digest, `ST-PACK ${probe.id} matches the AMU DEFAULT_PROBES digest (sha-256: notation)`);
}
const pack = await Core.buildProbePack();
same(pack, vectors.pack, "ST-PACK buildProbePack output equals the AMU pack");

// ── 2. equivalence with the AMU vectors ────────────────────────────────────
for (const vector of vectors.facts) same(Core.answerFacts(vector.text, vector.expect), vector.out, `ST-VEC answerFacts ${JSON.stringify(vector.text).slice(0, 24)}`);
for (const vector of vectors.paste_runs) {
  const out = await Core.makeRun({ ...vector.input });
  const { line_digests, ...answer } = out.answer;
  same({ ...out, answer }, vector.out, `ST-VEC makeRun paste ${vector.input.at} (minus Builder line_digests)`);
  check(Array.isArray(line_digests) && line_digests.every(digest => /^sha-256:[0-9a-f]{64}$/.test(digest)) && line_digests.length === out.answer.lines, `ST-VEC makeRun ${vector.input.at} carries one line digest per normalized line`);
}
for (const vector of vectors.aggregates) same(Core.aggregate(vector.runs, vector.options), vector.out, `ST-VEC aggregate ${vector.label}`);
for (const vector of vectors.diffs) same(Core.diffAnswers(vector.a, vector.b), vector.out, `ST-VEC diffAnswers ${JSON.stringify([vector.a, vector.b]).slice(0, 30)}`);
check(vectors.diffs.some(vector => vector.a === "" && vector.b === "" && vector.out.ops.length === 0), "ST-VEC empty answer = zero lines is among the vectors (N-1)");
for (const vector of vectors.compares) same(Core.compareSessions(vector.before, vector.after, vector.options), vector.out, `ST-VEC compareSessions ${vector.out.speed_change}`);
same(Core.DEFAULT_THRESHOLDS, { fastMs: 2000, slowMs: 8000, minRuns: 3 }, "ST-VEC thresholds equal the AMU defaults");
const ld = Core.diffLineDigests(await Core.lineDigests("a\nb\nc"), await Core.lineDigests("a\nx\nc\nd"));
check(ld.similarity === 0.571 && ld.added === 2 && ld.removed === 1 && ld.ops.every(op => !("text" in op) && /^sha-256:/.test(op.line_digest)), "ST-VEC line-digest diff reproduces the text diff shape without any line text");

// ── 3. refusals ────────────────────────────────────────────────────────────
const probe = pack.probes[0];
const base = { probe, provider_ref: "external/chat-ui", model_ref: "unknown", measurement: { total_ms: 4200 }, answerText: "了解", at: "2026-09-20T01:00:00.000Z" };
await assert.rejects(Core.makeRun({ ...base, mode: "automatic" }), error => error.code === "SPEED_RUN_MODE_INVALID"); cases.push("ST-MODE automatic refused");
await assert.rejects(Core.makeRun({ ...base, mode: "stream" }), error => error.code === "SPEED_RUN_MODE_INVALID"); cases.push("ST-MODE stream refused");
await assert.rejects(Core.makeRun({ ...base, provider_ref: "" }), error => error.code === "SPEED_RUN_INVALID"); cases.push("ST-RUN missing provider → no run");
await assert.rejects(Core.makeRun({ ...base, model_ref: "  " }), error => error.code === "SPEED_RUN_INVALID"); cases.push("ST-RUN missing model → no run");
await assert.rejects(Core.makeRun({ ...base, probe: { id: "echo-1" } }), error => error.code === "SPEED_RUN_INVALID"); cases.push("ST-RUN probe without digest → no run");
const store = storage();
const foreign = { ...(await Core.makeRun(base)), mode: "automatic" };
equal(Store.recordRun(store, foreign).code, "SPEED_RUN_MODE_INVALID", "ST-MODE store refuses a non-paste run");
equal(store.values.size, 0, "ST-MODE refused run writes nothing");
equal(Store.recordRun(store, { schema: "amu.ai-speed-test-run/1", mode: "paste" }).code, "SPEED_RUN_INVALID", "ST-RUN store refuses an incomplete run");

// ── 4. text not kept by default; line digests kept; one-way ────────────────
const frozenBefore = snapshot(store);
const run = await Core.makeRun({ ...base, answerText: "了解\n二行目" });
check(!("text" in run.answer), "ST-TEXT keep_text off → run has no answer.text");
const recorded = Store.recordRun(store, run, { sessionLabel: "gate" });
equal(recorded.code, "SPEED_RUN_RECORDED", "ST-STORE paste run recorded");
const storedText = store.getItem(Store.speedTestRunKey(recorded.record.run_id));
check(!storedText.includes('"text"') && !storedText.includes("了解") && !storedText.includes("二行目"), "ST-TEXT stored bytes contain neither the text key nor the answer content");
check(JSON.parse(storedText).run.answer.line_digests.length === 2, "ST-TEXT line_digests stored (2 lines)");
check(JSON.parse(storedText).run.answer.line_digests[0] === `sha-256:${sha256("了解")}`, "ST-TEXT line digest is sha-256 of the normalized line (one-way)");
const kept = await Core.makeRun({ ...base, at: "2026-09-20T01:01:00.000Z", answerText: "了解", keepText: true });
const keptRecord = Store.recordRun(store, kept, { sessionLabel: "gate" });
check(store.getItem(Store.speedTestRunKey(keptRecord.record.run_id)).includes('"text":"了解"'), "ST-TEXT explicit opt-in keeps the text");
const listed = Store.listRuns(store);
equal(listed.records.length, 2, "ST-STORE list returns both runs");
const groups = Store.groupRuns(listed.records, Core.DEFAULT_THRESHOLDS);
equal(groups.length, 1, "ST-STORE runs of one probe/provider/model/label form one group");
equal(groups[0].aggregate.speed, "NOT_ASSESSED", "ST-AGG two runs < minRuns → NOT_ASSESSED");
equal(groups[0].aggregate.stability, "DRIFTED", "ST-AGG two different answers → DRIFTED");
const diff = Store.diffAgainstPrevious(groups[0].records[1], groups[0].records[0]);
check(diff.available && diff.basis === "LINE_DIGESTS_ONLY" && diff.removed === 1 && diff.added === 0 && diff.ops.every(op => !("text" in op)), "ST-DIFF previous-run diff works from line digests without text");
equal(Store.diffAgainstPrevious(groups[0].records[0], null).available, false, "ST-DIFF first run has no previous");
same(Store.compareGroups(groups[0], groups[0]), { speed_change: "SIMILAR", ratio: 1, model_changed: false, answer_change: "VARIES_WITHIN_SESSION" }, "ST-CMP a group compared with itself is SIMILAR (median exists even below minRuns)");
const unreachableOnly = Store.groupRuns([{ session_label: "x", run: await Core.makeRun({ ...base, measurement: { reachable: false }, answerText: "" }) }], Core.DEFAULT_THRESHOLDS)[0];
same(Store.compareGroups(groups[0], unreachableOnly), { speed_change: "NOT_COMPARABLE", answer_change: "NOT_COMPARABLE" }, "ST-CMP no median on one side → NOT_COMPARABLE");

// ── 03 compares against something saved (Owner 2026-09-23) ────────────────
// The saved thing is the JSON 04 writes, and only the answers are diffed.
{
  const record = (probe_id, at, answer) => ({ run_id: `r-${probe_id}-${at}`, run: { probe_id, at, answer: { text: answer, line_digests: [] } } });
  const exported = extra => ({ schema: "saku.trainer.speed-test-export@1", exported_at: "2026-09-20T00:00:00.000Z", records: [record("echo-1", "2026-09-20T00:00:00Z", "むかしの回答")], ...extra });

  check(Store.readExport(exported()).ok, "ST-SAVED an export written by this screen reads back");
  same(Store.readExport(exported()).records.length, 1, "ST-SAVED with its runs");
  // anything else is refused by name — a wrong file must not read as "no change"
  same(Store.readExport({ schema: "something.else@1", records: [] }).code, "SAVED_EXPORT_WRONG_SCHEMA", "ST-SAVED a JSON that is not this export is refused by name");
  same(Store.readExport(exported({ records: [] })).code, "SAVED_EXPORT_EMPTY", "ST-SAVED an export with no usable run is refused, not compared as empty");
  same(Store.readExport("nope").code, "SAVED_EXPORT_NOT_AN_OBJECT", "ST-SAVED a non-object is refused");

  const before = [record("echo-1", "2026-09-20T00:00:00Z", "むかしの回答"), record("count-1", "2026-09-20T00:00:00Z", "1,2,3")];
  // The older run is listed first on purpose: taking whichever comes first in
  // the array would pick it, and the check below would then be measuring nothing.
  const after = [record("echo-1", "2026-09-21T00:00:00Z", "もっと前"), record("echo-1", "2026-09-23T00:00:00Z", "いまの回答")];
  const rows = Store.compareSavedAnswers(before, after);
  same(rows.map(row => row.probe_id), ["count-1", "echo-1"], "ST-SAVED every probe either side holds appears once");
  same(rows.find(row => row.probe_id === "count-1").reason, "ONLY_IN_BEFORE", "ST-SAVED a probe only one side holds says so — never 「同一」");
  const echo = rows.find(row => row.probe_id === "echo-1");
  same(echo.after_at, "2026-09-23T00:00:00Z", "ST-SAVED each side is judged by the latest run it holds");
  check(echo.available && echo.identical === false, "ST-SAVED a changed answer is reported as changed");
  check(Store.compareSavedAnswers(before, before).every(row => row.identical === true), "ST-SAVED the same set compared with itself is identical throughout");
  check(!("speed_change" in echo) && !("ratio" in echo), "ST-SAVED the comparison carries no speed figure — that is the aggregate's question");
}
const third = Store.recordRun(store, await Core.makeRun({ ...base, at: "2026-09-20T01:02:00.000Z", measurement: { total_ms: 1500 }, answerText: "了解" }), { sessionLabel: "gate" });
const threeGroup = Store.groupRuns(Store.listRuns(store).records, Core.DEFAULT_THRESHOLDS)[0];
equal(threeGroup.aggregate.speed, "NORMAL", "ST-AGG three runs → speed assessed (median 4200 → NORMAL)");
equal(Store.groupRuns(Store.listRuns(store).records, { fastMs: 5000, slowMs: 9000, minRuns: 3 })[0].aggregate.speed, "FAST", "ST-AGG thresholds are honoured and echoed");
same(Store.groupRuns(Store.listRuns(store).records, { fastMs: 5000, slowMs: 9000, minRuns: 3 })[0].aggregate.thresholds, { fastMs: 5000, slowMs: 9000, minRuns: 3 }, "ST-AGG thresholds recorded per aggregate");
const exported = Store.exportRuns(store);
check(exported.records.length === 3 && exported.manual_measurement.includes("手動計測") && !JSON.stringify(exported.records[0]).includes('"text"'), "ST-EXPORT export carries the manual sentence and no unkept text");
equal(Store.deleteRun(store, third.record.run_id).code, "SPEED_RUN_DELETED", "ST-STORE explicit delete");
equal(Store.listRuns(store).records.length, 2, "ST-STORE deleted run is gone from the list");
const tampered = JSON.parse(store.getItem(Store.speedTestRunKey(recorded.record.run_id))); tampered.run.total_ms = 1; store.setItem(Store.speedTestRunKey(recorded.record.run_id), JSON.stringify(tampered));
check(Store.listRuns(store).problems.some(item => item.code === "STORAGE_RECORD_TAMPERED"), "ST-STORE tampered record is reported, not shown");

// storage failure paths
const failItem = storage(); failItem.setItem = key => { if (key.startsWith(Store.SPEED_TEST_KEYS.runPrefix)) throw new Error("QUOTA"); };
const itemFailure = Store.recordRun(failItem, run);
check(itemFailure.code === "STORAGE_WRITE_FAILED" && itemFailure.recorded === false && failItem.values.size === 0, "ST-STORE item write failure → not recorded, nothing left");
const failIndex = storage(); const realSet = failIndex.setItem; failIndex.setItem = (key, value) => { if (key === Store.SPEED_TEST_KEYS.index) throw new Error("QUOTA"); return realSet(key, value); };
const indexFailure = Store.recordRun(failIndex, run);
check(indexFailure.code === "STORAGE_WRITE_FAILED" && indexFailure.recorded === false && failIndex.values.size === 0, "ST-STORE index write failure rolls the item back");

// ── 5. namespace and neighbours untouched ──────────────────────────────────
check([...store.values.keys()].every(key => key.startsWith("saku.trainer.speedTest.v1.")), "ST-NS only saku.trainer.speedTest.v1.* written");
const frozenKeys = [...Object.values(Contract.TRAINER_HANDOFF_KEYS), Contract.TRAINER_BUILDER_CONTEXT_KEY, ...Object.values(Contract.SESSION_KEYS), Intake.EXTERNAL_REVIEW_KEYS.index];
check(frozenKeys.every(key => store.getItem(key) === null), "ST-NS no frozen-ia / intake key written");
// A storage that already holds an intake record and a Trainer transport stays byte-identical outside the speed-test namespace.
const shared = storage();
shared.setItem(Intake.EXTERNAL_REVIEW_KEYS.index, JSON.stringify({ schema_id: "saku.trainer.external-review-index@1", candidate_ids: [] }));
shared.setItem(Contract.TRAINER_HANDOFF_KEYS.payload, "{\"kept\":true}");
shared.setItem(Contract.SESSION_KEYS.index, "[]");
const outside = () => JSON.stringify([...shared.values.entries()].filter(([key]) => !key.startsWith(Store.SPEED_TEST_KEYS.runPrefix) && key !== Store.SPEED_TEST_KEYS.index).sort());
const before = outside();
Store.recordRun(shared, run, { sessionLabel: "shared" });
Store.recordRun(shared, kept, { sessionLabel: "shared" });
Store.deleteRun(shared, Store.listRuns(shared).records[0].run_id);
equal(outside(), before, "ST-NS intake / handoff / session keys byte-identical after record + delete");
check(Store.listRuns(shared).records.length === 1 && Intake.listExternalReviews(shared).records.length === 0 && Contract.consumeBuilderHandoff(storage(), {}).status === "EMPTY", "ST-NS neighbouring contracts unaffected");
const moduleText = await read(CORE);
const storeText = await read(STORE);
const uiText = await read("tools/unified-v1/speed-test-ui.mjs");
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "navigator.sendBeacon", "createChangeCandidate", "storeBuilderHandoff", "saveSession", "createSession", "storeExternalReview", "setActive", "updateDraft", "applyBuilderCandidates"]) {
  check(!moduleText.includes(forbidden) && !storeText.includes(forbidden) && !uiText.includes(forbidden), `ST-BOUNDARY no ${forbidden} in core / store / page`);
}
check(!/first_byte|初動/.test(uiText), "ST-UI page controller has no first-byte / 初動 column (N-4)");
check(uiText.includes("MANUAL_MEASUREMENT") && moduleText.includes("手動計測。コピー＆ペーストの時間を含む"), "ST-UI manual-measurement sentence is the one from the core");

// ── 5a. English (英語翻訳チーム 2026-09-24 via ライター&SNS, Wi-t_Site bb7c84d) ──
// ライター&SNS found three faults in the earlier English: Japanese mixed in, a
// clock hint that contradicted itself, and no 24-hour format. The only Japanese
// left in English is the labels the AI must copy back verbatim.
{
  const block = (text, name) => { const at = text.indexOf(`export const ${name} = Object.freeze(`); assert.ok(at >= 0, `${name} present`); const open = text.indexOf("(", at); let depth = 0, end = open; for (; end < text.length; end += 1) { if (text[end] === "(") depth += 1; if (text[end] === ")" && --depth === 0) break; } return Function(`return ${text.slice(open + 1, end)}`)(); };
  const tEnglish = [...uiText.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*\)/g)].map(match => JSON.parse(match[2]));
  const english = [...Object.values(block(uiText, "VERDICT_EN")), ...Object.values(block(uiText, "VERDICT_NOTE_EN")), ...Object.values(block(uiText, "MEASURE_EN")), ...Object.values(block(uiText, "SAVED_EN")), ...Object.values(block(uiText, "PENDING_EN")), block(uiText, "PROBE_LANGUAGE_NOTE").en, Core.CLOCK_TIME_INSTRUCTION.en, ...tEnglish];
  const PROTECTED = /開始時刻|終了時刻|処理時間|秒/g;
  const leaks = english.filter(text => /[぀-ヿ㐀-鿿]/.test(String(text ?? "").replace(PROTECTED, "")));
  check(tEnglish.length >= 30, `ST-EN the page's inline English was found (${tEnglish.length} strings)`);
  same(leaks, [], "ST-EN no Japanese in the English beyond the protected labels 開始時刻 / 終了時刻 / 処理時間: <秒>");
  check(typeof block(uiText, "PROBE_LANGUAGE_NOTE").en === "string" && block(uiText, "PROBE_LANGUAGE_NOTE").en.length > 0, "ST-EN the note on Japanese probes has its English");
  check(/24-hour/.test(Core.CLOCK_TIME_INSTRUCTION.en) && /開始時刻: HH:MM:SS/.test(Core.CLOCK_TIME_INSTRUCTION.en) && /終了時刻: HH:MM:SS/.test(Core.CLOCK_TIME_INSTRUCTION.en) && /do not translate/.test(Core.CLOCK_TIME_INSTRUCTION.en), "ST-EN the English clock instruction asks for 24-hour times and keeps the two labels untranslated");
  check(!/cannot be longer/.test(block(uiText, "MEASURE_EN").clockHint), "ST-EN the clock hint says what is flagged, not that it cannot happen");
  const app = await read("desktop/app.mjs");
  check(/export const WORKSPACE_WORDING_EN = Object\.freeze\(/.test(app) && !/WORKSPACE_WORDING_JA\.\w/.test(app) && (app.match(/workspaceWording\("(discardDraft|readOnly|writeFailed)"\)/g) || []).length === 3, "ST-EN the three Workspace sentences follow the locale (no Japanese-only use left)");
}

// ── 5b. AI 申告値 (Owner 2026-09-22): parsed from the last line, recorded apart, never mixed ──
{
  const split = Core.extractReportedTime("了解\n\n処理時間: 4.2秒");
  same({ answerText: split.answerText.trim(), reported_time_sec: split.reported_time_sec, reported_line: split.reported_line }, { answerText: "了解", reported_time_sec: 4.2, reported_line: "処理時間: 4.2秒" }, "ST-REPORTED last line 処理時間: 4.2秒 is split off the answer");
  equal(Core.extractReportedTime("処理時間: 3\n了解").reported_time_sec, null, "ST-REPORTED a 処理時間 line that is not last is not a report");
  equal(Core.extractReportedTime("了解").reported_time_sec, null, "ST-REPORTED no line → null");
  equal(Core.extractReportedTime("Processing time: 2.5 s").reported_time_sec, 2.5, "ST-REPORTED English form parses");
  equal(Core.extractReportedTime("処理時間: とても速い").reported_time_sec, null, "ST-REPORTED non-numeric claim → null");
  check(Core.probeCopyText(probe) === `${probe.text}\n\n${Core.REPORTED_TIME_INSTRUCTION.ja}` && Core.probeCopyText(probe).startsWith(probe.text), "ST-REPORTED copy text = pinned probe verbatim + blank line + fixed instruction");
  check(Core.REPORTED_TIME_INSTRUCTION.ja.includes("処理時間: <秒>") && Core.REPORTED_TIME_INSTRUCTION.ja.includes("回答の最後に"), "ST-REPORTED instruction asks for one final 処理時間 line");
  const both = await Core.makeRun({ ...base, at: "2026-09-22T00:00:00.000Z", measurement: { total_ms: 4200, reported_time_sec: 3.9, reported_line: "処理時間: 3.9" } });
  check(both.total_ms === 4200 && both.reported?.time_sec === 3.9 && both.reported.source === "AI_SELF_REPORT" && both.reported.verified === false && /^sha-256:[0-9a-f]{64}$/.test(both.reported.instruction_digest), "ST-REPORTED run keeps manual total_ms and the AI claim in separate fields, claim marked unverified");
  const claimOnly = await Core.makeRun({ ...base, at: "2026-09-22T00:00:01.000Z", measurement: { reported_time_sec: 3.9 } });
  check(claimOnly.reachable === true && claimOnly.total_ms === null && claimOnly.reported.time_sec === 3.9, "ST-REPORTED a run with only the AI claim is reachable with total_ms null");
  const plain = await Core.makeRun({ ...base, at: "2026-09-22T00:00:02.000Z" });
  check(!("reported" in plain), "ST-REPORTED a run without a claim has no reported block (AMU vector shape)");
  const agg = Core.aggregate([both, claimOnly, plain], { minRuns: 1 });
  check(agg.reachable_runs === 3 && agg.median_ms === 4200 && agg.reported?.runs === 2 && agg.reported.median_sec === 3.9 && agg.reported.verified === false, "ST-REPORTED aggregate: manual median from manual times only (4200), AI claims summarised beside (2 runs)");
  check(!("reported" in Core.aggregate([plain], { minRuns: 1 })), "ST-REPORTED aggregate without claims has no reported block");
  equal(Core.contractProjection().reported_time.feeds_manual_aggregate, false, "ST-REPORTED contract says the claim never feeds the manual aggregate");
  const stored = Store.recordRun(store, both, { sessionLabel: "gate" });
  check(stored.ok && JSON.parse(store.getItem(Store.speedTestRunKey(stored.record.run_id))).run.reported.time_sec === 3.9, "ST-REPORTED store keeps the reported block");
  check(uiText.includes("extractReportedTime") && uiText.includes("extractClockTimes"), "ST-REPORTED page uses the core's parsers — the clock pair, and the older 処理時間 line as a fallback");
  check(uiText.includes("CLOCK_TIME_INSTRUCTION") && !uiText.includes("REPORTED_TIME_INSTRUCTION"), "ST-CLOCK the page asks for the two clock readings, not for a duration");
  // Owner 2026-09-23 turned the reported value into the measurement, so the page
  // no longer uses REPORTED_TIME_MEANING — that AMU-shared sentence says the
  // value is held apart and cannot be checked, which is no longer how this
  // product uses it. The constant stays in the core untouched (AMU parity), and
  // the divergence is checked here so it is visible rather than silent.
  check(!uiText.includes("REPORTED_TIME_MEANING"), "ST-BASIS the page no longer shows the core's 「検証不能・別に扱う」 sentence");
  check(Core.REPORTED_TIME_MEANING.ja.includes("検証不能") && Core.REPORTED_TIME_MEANING.meaning.includes("never compared with or mixed into manual measurements"), "ST-BASIS the core constant is unchanged — it is shared with AMU and ERABAZU and is not edited from here");
  check(uiText.includes("export const MEASURE_APPROVED = true;"), "ST-BASIS the page's own wording is approved (ライター&SNS 2026-09-24)");
  check(!/検証済|検証しました|verified\s*[:=]\s*true/.test(uiText), "ST-BASIS and it never says the value was checked — nothing checked it");
}

// ── falsification ──────────────────────────────────────────────────────────
const falsifications = [
  ["ST-FALSIFY mode rule", CORE, 'if (mode !== PASTE_MODE) throw failure("SPEED_RUN_MODE_INVALID"', 'if (false) throw failure("SPEED_RUN_MODE_INVALID"', async mutated => { let code = "ACCEPTED"; try { await mutated.makeRun({ ...base, mode: "automatic" }); } catch (error) { code = error.code; } return code !== "SPEED_RUN_MODE_INVALID"; }],
  ["ST-FALSIFY provider/model rule", CORE, "if (!nonEmpty(provider_ref) || !nonEmpty(model_ref)) throw", "if (false) throw", async mutated => { try { await mutated.makeRun({ ...base, provider_ref: "" }); return true; } catch { return false; } }],
  ["ST-FALSIFY keep_text rule", CORE, "...(keepText ? { text } : {})", "text", async mutated => "text" in (await mutated.makeRun(base)).answer],
  ["ST-FALSIFY minRuns rule", CORE, "ok.length < minRuns || median === null", "median === null", async mutated => mutated.aggregate(vectors.aggregates.find(v => v.label === "below-minRuns").runs).speed !== "NOT_ASSESSED"],
  ["ST-FALSIFY reported-last-line rule", CORE, "const match = lines[last].match(REPORTED_TIME_LINE);", "const match = lines.map(line => line.match(REPORTED_TIME_LINE)).find(Boolean);", async mutated => mutated.extractReportedTime("処理時間: 3\n了解").reported_time_sec !== null],
  ["ST-FALSIFY reported-apart rule", CORE, "const ok = reached.filter(run => run.total_ms !== null);", "const ok = reached.map(run => run.total_ms === null && run.reported ? { ...run, total_ms: run.reported.time_sec * 1000 } : run).filter(run => run.total_ms !== null);", async mutated => mutated.aggregate([await mutated.makeRun({ ...base, measurement: { reported_time_sec: 3.9 } })], { minRuns: 1 }).median_ms !== null],
  ["ST-FALSIFY empty-answer rule", CORE, 'return normalized ? normalized.split("\\n") : [];', 'return normalized.split("\\n");', async mutated => mutated.diffAnswers("", "").ops.length !== 0],
];
for (const [label, file, from, to, probeFn] of falsifications) {
  const text = await read(file);
  check(text.includes(from), `${label}: target rule present`);
  const mutatedPath = path.join(ROOT, path.dirname(file), `__st_falsify_${cases.length}.mjs`);
  await writeFile(mutatedPath, text.replace(from, to), "utf8");
  try { check(await probeFn(await import(pathToFileURL(mutatedPath).href)), `${label}: disabling the rule changes the behaviour (rule is live)`); }
  finally { await rm(mutatedPath, { force: true }); }
}

// ── 6. browser ─────────────────────────────────────────────────────────────
const packagedPages = ["/tooling/builder/speed-test.html"];
try { await readFile(path.join(ROOT, ".desktop-dist/tools/saku-speed-test.html")); packagedPages.push("/.desktop-dist/tools/saku-speed-test.html"); }
catch { cases.push("ST-PACKAGED .desktop-dist not prepared in this run — desktop copy not loaded"); }
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const harness = `<!doctype html><meta charset="utf-8"><pre id="report">RUNNING</pre><script type="module">
const checks=[],check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<400;i++){if(fn())return;await wait(25);}throw new Error('TIMEOUT');};
let frame,doc,win;
const load=async()=>{if(frame)frame.remove();frame=document.createElement('iframe');frame.style.cssText='width:1280px;height:950px';frame.src='/tools/saku-speed-test.html';document.body.append(frame);await new Promise(resolve=>frame.onload=resolve);doc=frame.contentDocument;win=frame.contentWindow;await until(()=>doc.getElementById('st-probes'));};
const visible=el=>Boolean(el)&&el.offsetParent!==null&&el.getBoundingClientRect().height>0;
const set=(id,value)=>{const el=doc.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const manualEverywhere=()=>{const times=[...doc.querySelectorAll('[data-time]')];return times.length>0&&times.every(el=>{const card=el.closest('.st-probe, .st-group, #st-notice, #st-compare, .card');return card&&card.querySelector('[data-manual-measurement]');});};
try{
 localStorage.clear();await load();
 check(doc.querySelectorAll('.st-probe').length===4,'ST-UI four probe cards');
 check(visible(doc.querySelector('#st-boundary [data-manual-measurement]')),'ST-UI manual-measurement sentence visible at the top');
 check(!doc.body.innerText.includes('初動')&&!doc.body.innerText.includes('first_byte')&&!doc.body.innerText.toLowerCase().includes('first byte'),'ST-UI no first-byte / 初動 column (N-4)');
 check(manualEverywhere(),'ST-UI every time display sits in a card carrying the manual-measurement sentence (initial)');
 // Owner 2026-09-23: one stopwatch button that starts and stops, one 記録 button,
 // and no 「記録する（ストップウォッチなし）」 — 計測時間 holds the time either way.
 check(!doc.querySelector('[data-stop]')&&!doc.querySelector('[data-start]'),'ST-UI 「停止して記録」 and the separate start are gone');
 check(doc.querySelector('[data-stopwatch="decompose-1"]').textContent==='計測開始','ST-UI the stopwatch button reads 計測開始 before it runs');
 // Owner 2026-09-23: 「コピー」 looked as though it could not be pressed. A button
 // with no class took the card's own background, so only a 1px border told them
 // apart. Every enabled button on a card must have a surface of its own.
 {
  const surface=el=>win.getComputedStyle(el).backgroundColor;
  const card=doc.getElementById('st-probe-decompose-1');
  const plain=[...card.querySelectorAll('button:not(.primary)')].filter(b=>!b.disabled);
  check(plain.length>0,'ST-SURFACE the card has buttons that are not the primary one (saw '+plain.length+')');
  for(const button of plain) check(surface(button)!==surface(card),'ST-SURFACE 「'+button.textContent+'」 does not take the card colour, so it does not read as disabled');
  const disabled=[...card.querySelectorAll('button')].filter(b=>b.disabled);
  check(disabled.every(b=>Number(win.getComputedStyle(b).opacity)<1),'ST-SURFACE a button that really is disabled still looks it');
 }
 check(doc.querySelector('[data-record="decompose-1"]').textContent==='記録'&&!doc.querySelector('[data-record="decompose-1"]').disabled,'ST-UI 「記録」 is one button and is available without the stopwatch');
 check(doc.body.innerText.includes('計測時間')&&!doc.body.innerText.includes('手計測（秒・任意')&&!doc.body.innerText.includes('記録する（ストップウォッチなし）'),'ST-UI the field is 「計測時間」 and the retired labels are gone');
 // start without provider/model → measurement discarded
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(150);
 check(doc.getElementById('st-probe-decompose-1').dataset.running==='true','ST-UI stopwatch runs');
 check(doc.querySelector('[data-stopwatch="decompose-1"]').textContent==='計測終了','ST-UI while running the same button reads 計測終了');
 doc.querySelector('[data-record="decompose-1"]').click();await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_INVALID');
 check(win.__saku_speed_test.getRuns().length===0,'ST-UI missing provider/model → no run recorded');
 set('st-provider','external/chat-ui');set('st-model','gate-model');set('st-session','gate');
 // 計測終了 writes what the stopwatch measured into 計測時間 (Owner 2026-09-23)
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(350);
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(80);
 const transcribed=Number(doc.getElementById('st-manual-decompose-1').value);
 check(transcribed>=0.3&&transcribed<5,'ST-UI 計測終了 transcribes the stopwatch into 計測時間 (saw '+transcribed+')');
 check(doc.getElementById('st-probe-decompose-1').dataset.running==='false','ST-UI and the stopwatch has stopped');
 // a real paste run with text not kept — 記録 uses the time in 計測時間
 doc.getElementById('st-answer-decompose-1').value='了解';
 doc.querySelector('[data-record="decompose-1"]').click();await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_RECORDED');
 const runs=win.__saku_speed_test.getRuns();check(runs.length===1&&runs[0].run.mode==='paste'&&runs[0].run.reachable===true&&runs[0].run.total_ms>=300,'ST-UI paste run recorded with the stopwatch time');
 check(!('text' in runs[0].run.answer)&&runs[0].run.answer.line_digests.length===1&&runs[0].run.answer.conformance==='CONFORMS','ST-UI default keeps line digests, not text');
 check(!JSON.stringify(Object.entries(localStorage)).includes('"text":"了解"'),'ST-UI storage bytes hold no answer text by default');
 check(Object.keys(localStorage).every(key=>key.startsWith('saku.trainer.speedTest.v1.')),'ST-UI only the speed-test namespace was written');
 check(manualEverywhere(),'ST-UI every time display sits in a card carrying the manual-measurement sentence (with records)');
 check(doc.querySelector('#st-results .st-runs')&&doc.querySelectorAll('#st-results .st-runs tbody tr').length===1,'ST-UI run table shows the run');
 // no-answer run
 doc.querySelector('[data-stopwatch="ground-1"]').click();await wait(120);doc.querySelector('[data-noanswer="ground-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===2);
 check(win.__saku_speed_test.getRuns().some(r=>r.run.reachable===false&&r.run.total_ms===null),'ST-UI no-answer run recorded as unreachable');
 // keep text opt-in
 doc.getElementById('st-keep-text').checked=true;doc.getElementById('st-keep-text').dispatchEvent(new Event('change',{bubbles:true}));
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(120);doc.getElementById('st-answer-decompose-1').value='了解';doc.querySelector('[data-record="decompose-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===3);
 check(win.__saku_speed_test.getRuns().some(r=>r.run.answer.text==='了解'),'ST-UI explicit opt-in keeps the text for that run only');
 check(doc.querySelectorAll('#st-results .st-group').length===2,'ST-UI two groups (decompose-1, ground-1)');
 check(doc.querySelector('#st-results [data-v="NOT_ASSESSED"]')?.textContent==='判定なし','ST-UI below minRuns shows NOT_ASSESSED (判定なし), not a guess');
 // β.7 hands-on (2026-09-24): F3 the time is local, F4 no internal code or English on the Japanese screen
 const firstCell=doc.querySelector('#st-results .st-runs tbody tr td');
 check(/^\\d{4}\\/\\d{2}\\/\\d{2} \\d{1,2}:\\d{2}:\\d{2}/.test(firstCell.textContent)&&/T.*Z$/.test(firstCell.title),'ST-F3 a record shows its local time, with the stored instant in the title ('+firstCell.textContent+')');
 const codes=[...doc.querySelectorAll('#st-results .st-verdict[data-verdict]')];
 check(codes.length>0&&codes.every(el=>el.textContent!==el.dataset.v&&el.title.startsWith(el.dataset.v))&&codes.filter(el=>el.dataset.v==='NOT_ASSESSED').every(el=>el.title.includes('期待が決まっていない')),'ST-F4 every verdict shows its Japanese name and keeps the code in the title ('+codes.map(el=>el.textContent).join(',')+')');

 // thresholds editable and echoed
 set('st-min','1');await wait(100);check(doc.querySelector('#st-results').innerText.includes('min 1'),'ST-UI thresholds edited in UI are echoed with the aggregate');
 // AI 申告値: instruction visible, copy text = probe + instruction, last line parsed apart, both times labelled
 check(doc.querySelectorAll('[data-instruction]').length===4&&doc.getElementById('st-instruction-decompose-1').value.includes('開始時刻')&&doc.getElementById('st-instruction-decompose-1').value.includes('終了時刻'),'ST-CLOCK the instruction shown under every probe asks for both clock readings');
 check(win.__saku_speed_test.copyText('decompose-1')===win.__saku_speed_test.getPack().probes[0].text+'\\n\\n'+doc.getElementById('st-instruction-decompose-1').value,'ST-UI copy text is the pinned probe verbatim plus the instruction');
 check(doc.getElementById('st-text-decompose-1').value===win.__saku_speed_test.getPack().probes[0].text,'ST-UI probe field itself is unchanged (pinned text)');
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(320);doc.getElementById('st-answer-decompose-1').value='了解\\n処理時間: 3.9秒';doc.querySelector('[data-record="decompose-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===4);
 const withClaim=win.__saku_speed_test.getRuns().find(r=>r.run.reported);check(withClaim&&withClaim.run.total_ms>=300&&withClaim.run.reported.time_sec===3.9&&withClaim.run.answer.conformance==='CONFORMS'&&withClaim.run.answer.lines===1,'ST-UI stopwatch + claim: manual time kept, claim parsed, 処理時間 line excluded from the answer (CONFORMS, 1 line)');
 check(doc.getElementById('st-notice').innerText.includes('手計測')&&doc.getElementById('st-notice').innerText.includes('AI 申告値'),'ST-UI the notice names both times');
 const claimRow=[...doc.querySelectorAll('#st-results .st-runs tbody tr')].find(tr=>tr.dataset.runId===withClaim.run_id);check(claimRow&&/計測値（AI 申告・検証不能） 3\\.9 s/.test(claimRow.innerText)&&/手計測/.test(claimRow.innerText),'ST-BASIS the run row leads with the measurement and keeps the manual time beside it');
 check(doc.querySelector('#st-results [data-reported-meaning]')&&doc.querySelector('#st-boundary [data-reported-meaning]'),'ST-UI AI 申告値 meaning sentence at the top and with the records');
 check([...doc.querySelectorAll('[data-reported-time]')].every(el=>el.closest('.card, .st-group').querySelector('[data-reported-meaning]')),'ST-UI every AI-reported figure sits in a card carrying the AI 申告値 sentence');
 check(doc.querySelector('#st-results').innerText.includes('計測値（AI 申告・検証不能） median / p95 / min / max'),'ST-BASIS the aggregate reports the measurement from the AI-reported values');
 // …and the verdict comes from those values. The thresholds are chosen so the
 // two bases disagree: the manual times here are a few hundred ms (FAST), the
 // reported ones are seconds (SLOW). Reading the stopwatch would show FAST.
 {
  set('st-fast','900');set('st-slow','1500');set('st-min','1');await wait(150);
  const runs=win.__saku_speed_test.getRuns();
  const reported=runs.filter(r=>r.run.reported).map(r=>r.run.reported.time_sec);
  const manual=runs.filter(r=>r.run.total_ms!==null).map(r=>r.run.total_ms);
  check(reported.length>0&&manual.length>0,'ST-BASIS both bases have runs, so the verdict can tell them apart');
  const byReported=Math.min(...reported)*1000>1500;
  const byManual=Math.max(...manual)<=900;
  check(byReported&&byManual,'ST-BASIS the thresholds make the two bases disagree (reported SLOW, manual FAST) — otherwise this check would pass either way');
  const shown=[...doc.querySelectorAll('#st-results .st-verdict')].map(el=>el.dataset.v);
  check(shown.includes('SLOW')&&!shown.includes('FAST'),'ST-BASIS the verdict on screen follows the AI-reported values, not the stopwatch');
 }
 // no stopwatch: typed manual seconds
 doc.getElementById('st-answer-ground-1').value='1,2,3,4,5,6,7,8,9,10,11,12';set('st-manual-ground-1','5.5');doc.querySelector('[data-record="ground-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===5);
 check(win.__saku_speed_test.getRuns().some(r=>r.run.total_ms===5500&&!r.run.reported&&r.run.probe_id==='ground-1'),'ST-UI typed manual seconds recorded as total_ms 5500 without a claim');
 // no stopwatch, no typed time: claim only → reachable, total_ms null
 doc.getElementById('st-answer-ground-1').value='1,2,3,4,5,6,7,8,9,10,11,12\\n処理時間: 2';doc.querySelector('[data-record="ground-1"]').click();await until(()=>win.__saku_speed_test.getRuns().length===6);
 check(win.__saku_speed_test.getRuns().some(r=>r.run.total_ms===null&&r.run.reachable===true&&r.run.reported?.time_sec===2),'ST-UI claim-only run recorded reachable with total_ms null');
 // no time at all → refused
 doc.getElementById('st-answer-ground-1').value='1,2,3';doc.querySelector('[data-record="ground-1"]').click();await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_NO_TIME');
 check(win.__saku_speed_test.getRuns().length===6,'ST-UI a run with neither time is refused (SPEED_RUN_NO_TIME), nothing recorded');
 check(manualEverywhere(),'ST-UI manual sentence still everywhere with claims recorded');
 // pasting the answer is the same as pressing 記録 (Owner 2026-09-23)
 {
  const before=win.__saku_speed_test.getRuns().length;
  set('st-manual-decompose-1','2.5');
  const field=doc.getElementById('st-answer-decompose-1');
  field.value='貼り付けだけで記録される';
  field.dispatchEvent(new Event('paste',{bubbles:true}));
  await until(()=>win.__saku_speed_test.getRuns().length===before+1,1500);
  const pasted=win.__saku_speed_test.getRuns().at(-1);
  check(pasted.run.probe_id==='decompose-1'&&pasted.run.total_ms===2500,'ST-UI pasting the answer records the run, with the time from 計測時間');
  // Owner 2026-09-23 (β.5): the pasted answer used to vanish the instant it was
  // recorded, which read as "the paste did not work" — and only when the answer
  // carried a time, because one without a time was refused and therefore left
  // alone. What was recorded now stays where the person can see it.
  check(doc.getElementById('st-answer-decompose-1').value==='貼り付けだけで記録される','ST-PASTE the pasted answer stays on the card after it is recorded');
  check(doc.getElementById('st-manual-decompose-1').value==='2.5','ST-PASTE and so does the 計測時間 it was recorded with');
  // pressing 記録 on content that has not changed does not file the run twice
  doc.querySelector('[data-record="decompose-1"]').click();
  await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_ALREADY_RECORDED');
  check(win.__saku_speed_test.getRuns().length===before+1,'ST-PASTE 記録 on unchanged content is refused, and records nothing');
  // change the answer and it records again
  set('st-answer-decompose-1','直した回答');
  doc.querySelector('[data-record="decompose-1"]').click();
  await until(()=>win.__saku_speed_test.getRuns().length===before+2);
  check(win.__saku_speed_test.getRuns().at(-1).run.total_ms===2500,'ST-PASTE changing the answer makes it recordable again');
  check(doc.getElementById('st-answer-decompose-1').value===''&&doc.getElementById('st-manual-decompose-1').value==='','ST-PASTE pressing 記録 still clears the card for the next run');
  // a second paste does not carry the previous run's 計測時間 into the new answer
  // The card is re-drawn after every record, so the box is fetched again each time.
  const pasteInto=(id,value)=>{const box=doc.getElementById(id);box.value=value;box.dispatchEvent(new Event('paste',{bubbles:true}));};
  set('st-manual-decompose-1','7.5');
  pasteInto('st-answer-decompose-1','一回目の回答\\n処理時間: 1.5');
  await until(()=>win.__saku_speed_test.getRuns().length===before+3);
  check(win.__saku_speed_test.getRuns().at(-1).run.total_ms===7500,'ST-PASTE a time typed before the first paste is the one recorded');
  pasteInto('st-answer-decompose-1','二回目の回答\\n処理時間: 2.5');
  await until(()=>win.__saku_speed_test.getRuns().length===before+4);
  const fresh=win.__saku_speed_test.getRuns().at(-1);
  check(fresh.run.total_ms===null&&fresh.run.reported?.time_sec===2.5,'ST-PASTE the next paste is timed by its own claim, not by the recorded run 計測時間');
  // a paste with no time anywhere is refused the same way a press is
  doc.getElementById('st-answer-ground-1').value='時間のない回答';
  doc.getElementById('st-answer-ground-1').dispatchEvent(new Event('paste',{bubbles:true}));
  await until(()=>doc.getElementById('st-notice')?.dataset.code==='SPEED_RUN_NO_TIME',1500);
  check(win.__saku_speed_test.getRuns().length===before+4,'ST-PASTE a paste with neither time is refused, and records nothing');
 }
 // the clock pair on the real screen, and a claim the window cannot allow
 {
  const before=win.__saku_speed_test.getRuns().length;
  // a believable pair: copied a moment ago, claims 1 second
  win.__saku_speed_test.setCopiedAt('decompose-1',Date.now()-4000);
  const honest=doc.getElementById('st-answer-decompose-1');
  honest.value='開始時刻: 09:00:00'+String.fromCharCode(10)+'本文'+String.fromCharCode(10)+'終了時刻: 09:00:01';
  honest.dispatchEvent(new Event('paste',{bubbles:true}));
  await until(()=>win.__saku_speed_test.getRuns().length===before+1,1500);
  const kept=win.__saku_speed_test.getRuns().at(-1);
  check(kept.run.reported?.time_sec===1,'ST-CLOCK-UI the gap between the two clock readings becomes the measurement');
  check(!doc.querySelector('tr[data-over-window]'),'ST-WINDOW-UI a claim that fits the measured window carries no mark');
  // an impossible pair: copied a moment ago, claims an hour
  win.__saku_speed_test.setCopiedAt('decompose-1',Date.now()-2000);
  const tall=doc.getElementById('st-answer-decompose-1');
  tall.value='開始時刻: 09:00:00'+String.fromCharCode(10)+'本文'+String.fromCharCode(10)+'終了時刻: 10:00:00';
  tall.dispatchEvent(new Event('paste',{bubbles:true}));
  await until(()=>win.__saku_speed_test.getRuns().length===before+2,1500);
  const marked=win.__saku_speed_test.getRuns().at(-1);
  check(marked.run.reported?.time_sec===3600,'ST-WINDOW-UI the run is recorded, claim and all — nothing is discarded');
  const mark=win.__saku_speed_test.getWindowMarks()[marked.run_id];
  check(mark&&mark.state==='LONGER_THAN_WINDOW','ST-WINDOW-UI and it is marked as longer than the window this tool measured');
  check(Boolean(doc.querySelector('tr[data-over-window]')),'ST-WINDOW-UI the row says so on screen');
  check(doc.querySelector('#st-results').innerText.includes('実測より長い'),'ST-WINDOW-UI the aggregate says how many runs it left out');
  // the row keeps showing it — the record is not discarded — so the aggregate
 // is what must not contain it.
 check(/3600\.0 s/.test(doc.querySelector('tr[data-over-window]').innerText),'ST-WINDOW-UI the marked row still shows what was claimed');
 check(![...doc.querySelectorAll('.st-agg')].some(dl=>/3600\.0 s/.test(dl.innerText)),'ST-WINDOW-UI and no aggregate contains the impossible hour');
  check(doc.querySelector('[data-over-window]')?.textContent==='1','ST-WINDOW-UI the aggregate counts exactly one run left out');
 }
 // 03 on the screen: open a saved export, list it, compare it with the current runs
 {
  const exportedNow=win.__saku_speed_test.getRuns();
  check(exportedNow.length>0,'ST-SAVED-UI there are runs to save');
  const saved={schema:'saku.trainer.speed-test-export@1',exported_at:'2026-09-20T00:00:00.000Z',records:[{run_id:'r-old',run:{probe_id:'decompose-1',at:'2026-09-20T00:00:00Z',answer:{text:'むかしの回答',line_digests:[]}}}]};
  check(Boolean(doc.getElementById('st-saved-open')),'ST-SAVED-UI 03 offers to open a saved record');
  check(win.__saku_speed_test.openSaved(saved).ok,'ST-SAVED-UI a saved export opens');
  await wait(120);
  check(win.__saku_speed_test.getSaved().length===1,'ST-SAVED-UI it is listed');
  check(doc.querySelectorAll('.st-saved-list li').length===1,'ST-SAVED-UI the list is on the screen');
  const pick=(id,value)=>{const el=doc.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
  pick('st-compare-before','saved:'+win.__saku_speed_test.getSaved()[0].id);
  pick('st-compare-after','current');
  await wait(120);
  check(doc.querySelectorAll('[data-saved-diff]').length>0,'ST-SAVED-UI the saved one and the current runs are diffed by probe');
  check(!doc.getElementById('st-compare').innerText.includes('×'),'ST-SAVED-UI the comparison shows no speed ratio — only the answers');
  check(win.__saku_speed_test.openSaved({schema:'not.this@1',records:[]}).ok===false,'ST-SAVED-UI a JSON that is not an export is refused');
 }
 // EN
 check(doc.querySelector('#st-results').innerText.includes(' 回）')&&!doc.querySelector('#st-results').innerText.includes(' runs'),'ST-F4 the Japanese aggregate counts runs in Japanese');
 const noticeJa=doc.getElementById('st-notice')?.innerText||'';
 set('locale','en');await wait(120);check(doc.body.innerText.includes('Manual measurement. Times include the human copy & paste.'),'ST-UI EN sentence present');
 const noticeEn=doc.getElementById('st-notice')?.innerText||'';
 check(noticeJa&&noticeEn&&noticeEn!==noticeJa&&!/[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(win.__saku_speed_test.getPack().probes.reduce((text,probe)=>text.split(probe.title).join(''),noticeEn).replace(/開始時刻|終了時刻|処理時間/g,'')),'ST-F7 the notice shown before the switch follows the language ('+noticeEn.slice(0,80)+')');
 const verdictsEn=[...doc.querySelectorAll('#st-results .st-verdict[data-verdict]')];check(verdictsEn.length>0&&verdictsEn.every(el=>el.textContent!==el.dataset.v&&el.title.startsWith(el.dataset.v))&&verdictsEn.filter(el=>el.dataset.v==='NOT_ASSESSED').every(el=>el.title.includes('too few measurements')),'ST-F4 in English the verdicts carry the delivered names (O5–O19), the code and the O20 note stay in the title');
 check(!doc.querySelector('#st-results').innerText.includes('回）')&&doc.querySelector('#st-results').innerText.includes('(n = '),'ST-F4 …and the run count reads (n = N) (O21)');
check(manualEverywhere(),'ST-UI manual sentence everywhere in EN');
 // the English 英語翻訳チーム delivered for the three renamed labels (L1-L3, 2026-09-23)
 check(doc.querySelector('[data-stopwatch="decompose-1"]').textContent==='Start timing','ST-EN the stopwatch reads the approved Start timing');
 check(doc.querySelector('[data-record="decompose-1"]').textContent==='Record the result','ST-EN 記録 reads the approved Record the result');
 check([...doc.querySelectorAll('.st-manual-seconds span')].every(el=>el.textContent==='Measured time'),'ST-EN 計測時間 reads the approved Measured time');
 check(!/verif(y|ied)|validate|confirm/i.test(doc.body.innerText),'ST-EN none of the controls claims verification');
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(80);
 check(doc.querySelector('[data-stopwatch="decompose-1"]').textContent==='Stop timing','ST-EN while running it reads the approved Stop timing');
 doc.querySelector('[data-stopwatch="decompose-1"]').click();await wait(80);
 set('locale','ja');await wait(120);
 // controls: no automatic mode, no send
 const controls=[...doc.querySelectorAll('button, a.button-link')].map(el=>(el.id||el.dataset.copy||el.dataset.start||'')+'|'+el.textContent.trim());
 check(!controls.some(label=>/送信|send|automatic|自動|apply|適用/i.test(label)),'ST-UI no send / automatic / apply control ('+controls.length+' controls)');
 frame.style.width='390px';await wait(150);check(doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1,'ST-UI 390px no horizontal overflow');
 for(const packaged of ${JSON.stringify(packagedPages)}){const pframe=document.createElement('iframe');pframe.style.cssText='width:1280px;height:900px';pframe.src=packaged;document.body.append(pframe);await new Promise(resolve=>pframe.onload=resolve);const pdoc=pframe.contentDocument;await until(()=>pdoc.getElementById('st-probes'));check(pdoc.querySelectorAll('.st-probe').length===4&&pdoc.querySelector('#to-trainer').getAttribute('href').endsWith('trainer.html'),'ST-PACKAGED '+packaged+' boots with resolved imports');pframe.remove();}
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',passed:checks.length,checks});document.getElementById('report').dataset.status='PASS';
}catch(error){document.getElementById('report').textContent=JSON.stringify({status:'FAIL',passed:checks.length,error:String(error.stack||error),checks,body:doc?.body.innerText.slice(-2500)});document.getElementById('report').dataset.status='FAIL';}
</script>`;
const mime = { ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/__st__") { response.setHeader("Content-Type", "text/html;charset=utf-8"); response.end(harness); return; }
    const file = path.resolve(ROOT, decodeURIComponent(url.pathname).replace(/^\//, ""));
    if (!file.startsWith(ROOT + path.sep)) throw new Error("outside root");
    response.setHeader("Content-Type", `${mime[path.extname(file)] || "text/plain"};charset=utf-8`);
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end("not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(path.join(tmpdir(), "saku-st-browser-"));
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; let stderr = ""; let socket;
child.stderr.on("data", chunk => stderr += chunk);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port = 0;
  for (let i = 0; i < 200 && !port; i++) { const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (match) port = Number(match[1]); else await pause(100); }
  if (!port) throw new Error(`CHROME_NOT_READY ${stderr.slice(-500)}`);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.address().port}/__st__`)}`, { method: "PUT" })).json();
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
  server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(error => console.warn(`CLEANUP_SKIPPED browser profile left at ${profile}: ${error?.code || error}`));
}
const match = output.match(/<pre id="report" data-status="(PASS|FAIL)">([\s\S]*?)<\/pre>/);
if (!match) { console.error(output.slice(0, 2000), stderr.slice(-1000)); process.exit(1); }
const report = JSON.parse(match[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
if (report.status !== "PASS") { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
for (const label of report.checks) cases.push(label);

console.log(`SPEED_TEST_PASTE_MODE PASS ${cases.length}/${cases.length}`);
for (const label of cases) console.log(`  PASS ${label}`);
console.log("PROBE_PACK_PARITY AMU 944151e4 + ERABAZU 409b4a2 / VECTORS AMU 944151e4 / TEXT_DEFAULT NOT_KEPT (line_digests kept) / MODE paste only / NETWORK NONE");
