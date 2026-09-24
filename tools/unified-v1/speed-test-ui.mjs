// AI スピードテスト（貼り付けモード）— page controller.
//
// Copy a fixed probe (with the fixed 処理時間 instruction appended) → paste the
// external AI's answer → record.  Pasting the answer records the run: the paste
// is the moment the answer came back, so asking for a second click afterwards
// only added a step and a chance to mistime it (Owner 2026-09-23).  The
// stopwatch is one button that starts and stops, and stopping writes what it
// measured into 計測時間 — one field holds the time however it was obtained.
// Two times can come out of one run and they
// are never mixed: the manual time (stopwatch or a typed number, optional,
// includes the human's own copy and paste) and the AI 申告値 parsed from the
// answer's last line (the model's own unverifiable claim).  Every place either
// appears says which it is.  No provider is called; the page has no network
// path.  Runs live in their own namespace and never touch a Character, a
// Trainer Session, a Change Candidate, or an intake record.
import {
  CLOCK_TIME_INSTRUCTION, DEFAULT_THRESHOLDS, DELIBERATE_PACK_ID, DELIBERATE_PACK_VERSION, DELIBERATE_PROBES, MANUAL_MEASUREMENT, buildProbePack, checkAgainstWindow, contractProjection, extractClockTimes, extractReportedTime, makeRun, reportedAggregate,
} from "../v1/speed-test.mjs";
import {
  compareSavedAnswers, deleteRun, diffAgainstPrevious, exportRuns, groupRuns, listRuns, readExport, recordRun, readWindowMarks, writeWindowMark,
} from "../v1/speed-test-store.mjs";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let language = "ja";
let pack = null;
let setup = { session_label: "", provider_ref: "", model_ref: "", keep_text: false, note: "" };
let thresholds = { ...DEFAULT_THRESHOLDS };
let answers = {};
let manualSeconds = {};
let timer = { probe_id: null, started_at: null, tick: null };
/**
 * What each card has already recorded, as answer + 計測時間. The pasted answer
 * now stays on screen after it is recorded (Owner 2026-09-23: clearing it read
 * as "the paste did not work" — the text vanished the instant it landed, and
 * only when the answer carried a time, because an answer without one was
 * refused and therefore left alone). Keeping it means 記録 could be pressed on
 * the same content again, so what was recorded is remembered and a second press
 * on unchanged content is refused instead of filing the run twice.
 */
let recorded = {};
/**
 * When each probe was last copied. The window between that press and the paste
 * is measured here, by this tool, and is what an AI's own elapsed time is
 * checked against (Owner 2026-09-23). It is an upper bound — it also contains
 * the person moving between two windows — so it can only ever show that a claim
 * is impossible, never that one is right.
 */
let copiedAt = {};
let notice = null;
let compareSelection = { before: "", after: "" };
/** Saved exports the person has opened in this session, newest kept as opened. */
let savedFiles = [];
let savedSeq = 0;
const t = (ja, en) => language === "en" ? en : ja;
/** Exactly what コピー puts on the clipboard: the probe, then the clock instruction. */
const copyTextFor = probe => `${String(probe?.text ?? "")}\n\n${t(CLOCK_TIME_INSTRUCTION.ja, CLOCK_TIME_INSTRUCTION.en)}`;
/**
 * The labels Owner renamed on 2026-09-23, in the English 英語翻訳チーム delivered
 * the same day (L1–L3, `SAKU-verify/saku-speedtest-terms-L_EN.json`, checked by
 * ライター&SNS). Start and Stop carry the object `timing` because they sit beside
 * コピー and 記録 on the same card and would otherwise not say what they act on;
 * 記録 carries one because `Record` alone can be read as recording continuously.
 * None of the three says verify / validate / confirm.
 */
export const EN = Object.freeze({ stopwatchStart: "Start timing", stopwatchStop: "Stop timing", measuredTime: "Measured time", record: "Record the result" });
export const EN_APPROVED = true;

/**
 * One sentence, needed because a recorded answer now stays on the card: pressing
 * 記録 again on content that has not changed would file the same run twice.
 * Japanese approved as written: ライター&SNS 様式チェック 2026-09-24（Wi-t_Site 7ffbaa0, site-content/manuals/reviews/2026-09-24_saku-builder-5groups-wording-check.md）. English: 英語翻訳チーム 2026-09-24（ライター&SNS 経由、Wi-t_Site bb7c84d, `SAKU-verify/saku-speedtest-workspace-M_EN.json`）.
 */
export const PENDING_JA = Object.freeze({ alreadyRecorded: "この回答はすでに記録しました。回答か計測時間を変えると、もう一度記録できます。" });
export const PENDING_EN = Object.freeze({ alreadyRecorded: "This answer has already been recorded. Change the answer or the measured time to record it again." });
export const PENDING_APPROVED = true;

/**
 * Japanese approved: ライター&SNS 様式チェック 2026-09-24（Wi-t_Site 7ffbaa0, site-content/manuals/reviews/2026-09-24_saku-builder-5groups-wording-check.md）. English: 英語翻訳チーム 2026-09-24（ライター&SNS 経由、Wi-t_Site bb7c84d, `SAKU-verify/saku-speedtest-workspace-M_EN.json`）. Owner asked
 * for the AI's own 処理時間 to be the measurement — 「その値で検証してください。
 * 早すぎてストップウォッチでは計測できないこと多いため」 — so the screen stops
 * framing it as a claim held apart and starts using it, while still saying
 * where the number comes from. It does not say the value was checked, because
 * nothing checked it.
 */
export const MEASURE_JA = Object.freeze({
  basis: "計測値（AI 申告・検証不能）",
  note: "応答が速すぎて手では計れないため、AI が回答に書いた開始時刻と終了時刻の差を計測値として使います。これらの時刻は AI 自身が書いたもので、こちらでは確かめられません。",
  manualAside: "手計測（参考。コピー＆ペーストの時間を含みます）",
  probeNote: "設問は固定です。数段階の手順を求めるので、応答に数秒から数十秒かかります。",
  clockHint: "回答の最初と最後に書かれた開始時刻・終了時刻の差を計測値にします。この差がコピーから貼り付けまでの実測時間より長いときは、印を付けます。",
  overWindow: "実測より長い",
  overWindowNote: "この計測は、コピーから貼り付けまでの実測時間より長い時間を申告しています。記録は残し、集計からは外しています。",
});
export const MEASURE_EN = Object.freeze({
  basis: "Measured value (AI self-reported, unverifiable)",
  note: "Responses are too fast to time by hand, so the measured value is the difference between the 開始時刻 and the 終了時刻 the AI writes in its answer. The AI writes these times itself, and they cannot be checked here.",
  manualAside: "Manual timing (for reference; includes the time to copy and paste)",
  probeNote: "The questions are fixed. They ask for several steps, so a response takes from a few seconds to several tens of seconds.",
  clockHint: "The measured value is the difference between the 開始時刻 and the 終了時刻 written at the beginning and the end of the answer. When that difference is longer than the actual time from copy to paste, the measurement is flagged.",
  overWindow: "Longer than the actual time",
  overWindowNote: "This measurement reports a time longer than the actual time from copy to paste. The record is kept, and it is left out of the totals.",
});
export const MEASURE_APPROVED = true;

/**
 * Shown above the probe text in English only: the probes stay Japanese so every
 * run compares the same text (ライター&SNS 2026-09-24, 6841be8 ⑧). English:
 * 英語翻訳チーム 2026-09-24（ライター&SNS 経由、Wi-t_Site bb7c84d, `SAKU-verify/saku-speedtest-workspace-M_EN.json`）.
 */
export const PROBE_LANGUAGE_NOTE = Object.freeze({ ja: "設問は日本語のまま送ります。同じ設問で比べるためです。", en: "The questions are sent in Japanese so that every measurement uses the same text." });
const measure = key => (language === "en" ? MEASURE_EN : MEASURE_JA)[key];

/**
 * The wording for comparing against a saved export. Japanese approved:
 * ライター&SNS 様式チェック 2026-09-24（Wi-t_Site 7ffbaa0, site-content/manuals/reviews/2026-09-24_saku-builder-5groups-wording-check.md）. English: 英語翻訳チーム 2026-09-24（ライター&SNS 経由、Wi-t_Site bb7c84d, `SAKU-verify/saku-speedtest-workspace-M_EN.json`）.
 */
export const SAVED_JA = Object.freeze({
  title: "04 保存したものと比べる",
  intro: "「05 書き出し」で保存したファイルを読み込み、回答がどう変わったかを比べます。速さの数値は「03 記録」で見ます。",
  load: "保存した記録を読み込む",
  current: "現在",
  drop: "比較から外す",
  runs: "計測回数",
  probe: "設問",
  answerDiff: "回答の違い",
  pickTwo: "比べる 2 つを選んでください。",
  onlyBefore: "読み込んだ記録にだけあります",
  onlyAfter: "現在にだけあります",
  loaded: "読み込みました",
  notAnExport: "この JSON はスピードテストの書き出しではありません。「05 書き出し」で保存したファイルを選んでください。",
});
export const SAVED_EN = Object.freeze({
  title: "04 Compare with a saved record",
  intro: "Open a file saved from \"05 Export\" and compare how the answers changed. The speed figures are shown in \"03 Records\".",
  load: "Open a saved record",
  current: "Current",
  drop: "Remove from the comparison",
  runs: "Measurements",
  probe: "Question",
  answerDiff: "Answer differences",
  pickTwo: "Choose the two to compare.",
  onlyBefore: "Only in the record you opened",
  onlyAfter: "Only in the current one",
  loaded: "Opened",
  notAnExport: "This JSON is not a speed test export. Choose a file saved from \"05 Export\".",
});
const saved = key => (language === "en" ? SAVED_EN : SAVED_JA)[key];
const manual = () => `<span class="st-manual" data-manual-measurement>${esc(t(MANUAL_MEASUREMENT.ja, MANUAL_MEASUREMENT.en))}</span>`;
const reportedNote = () => `<span class="st-reported-note" data-reported-meaning>${esc(measure("note"))}</span>`;
const sec = value => value === null || value === undefined ? "—" : `${Number(value).toFixed(1)} s`;
// One cell that names both times.  Manual first (what this tool measured), then the AI's claim, each labelled.
const timeCell = run => {
  if (!run.reachable) return t("応答なし", "no answer");
  const parts = [];
  if (run.reported) parts.push(`<span class="st-reported" data-reported-time>${esc(measure("basis"))} ${esc(sec(run.reported.time_sec))}</span>`);
  if (run.total_ms !== null && run.total_ms !== undefined) parts.push(`<span class="small">${t("手計測", "manual")} ${esc(ms(run.total_ms))}</span>`);
  return parts.length ? parts.join("<br>") : t("時間なし（回答のみ）", "no time (answer only)");
};
const ms = value => value === null || value === undefined ? "—" : `${(value / 1000).toFixed(1)} s (${Math.round(value)} ms)`;
const clock = value => `${Math.floor(value / 60000)}:${String(Math.floor((value % 60000) / 1000)).padStart(2, "0")}.${Math.floor((value % 1000) / 100)}`;
/**
 * The verdicts in Japanese (β.7 hands-on F4, 2026-09-24): the screen showed the
 * internal codes. The code stays in data-v and in the title. English: 英語翻訳チーム via ライター&SNS 2026-09-24（Wi-t_Site 922d0b9, SAKU-verify/saku-beta7-findings-O_EN.json）.
 * Japanese approved: ライター&SNS 様式チェック
 * 2026-09-24（Wi-t_Site 59b31dd, site-content/manuals/reviews/2026-09-24_beta7-findings-5groups-check.md）.
 */
export const VERDICT_JA = Object.freeze({
  FAST: "速い", NORMAL: "標準", SLOW: "遅い", NOT_ASSESSED: "判定なし",
  REACHABLE: "すべて到達", INTERMITTENT: "一部だけ到達", UNREACHABLE: "到達なし",
  CONFORMS: "期待どおり", DEVIATES: "期待と違う",
  STABLE: "回答が一定", DRIFTED: "回答が変わった", NOT_COMPARABLE: "比べられない",
  FASTER: "速くなった", SIMILAR: "同程度", SLOWER: "遅くなった",
});
export const VERDICT_EN = Object.freeze({
  FAST: "Fast",
  NORMAL: "Normal",
  SLOW: "Slow",
  NOT_ASSESSED: "Not assessed",
  REACHABLE: "All reached",
  INTERMITTENT: "Partly reached",
  UNREACHABLE: "Not reached",
  CONFORMS: "Conforms",
  DEVIATES: "Deviates",
  STABLE: "Consistent",
  DRIFTED: "Changed",
  NOT_COMPARABLE: "Not comparable",
  FASTER: "Faster",
  SIMILAR: "Similar",
  SLOWER: "Slower",
});
/** One verdict name stands for three reasons, so it says which in its tooltip (59b31dd; English O20). */
export const VERDICT_NOTE_EN = Object.freeze({ NOT_ASSESSED: "This question has too few measurements, has no measurement, or has no expectation set." });
export const VERDICT_NOTE_JA = Object.freeze({ NOT_ASSESSED: "計測回数が足りない、計測がない、または期待が決まっていない設問です。" });
const verdictLabel = value => (language === "en" ? VERDICT_EN : VERDICT_JA)[value] || value;
const verdictTitle = value => { const note = (language === "en" ? VERDICT_NOTE_EN : VERDICT_NOTE_JA)[value]; return note ? `${value} — ${note}` : value; };
const verdict = value => `<span class="st-verdict" data-verdict data-v="${esc(value)}" title="${esc(verdictTitle(value))}">${esc(verdictLabel(value))}</span>`;
/** The record's time as the import history shows it: local, with the zone (F3). */
const localTime = value => {
  const instant = new Date(value);
  if (!value || Number.isNaN(instant.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(instant);
};
/** A notice's text is built when it is shown, so it follows the language (F7). */
const noticeText = value => (typeof value?.detail === "function" ? value.detail() : value?.detail);
const shortDigest = value => value ? String(value).replace(/^sha-256:/, "").slice(0, 12) : "—";

function readSetup() {
  if (!$("st-provider")) return;
  setup = { session_label: $("st-session").value.trim(), provider_ref: $("st-provider").value.trim(), model_ref: $("st-model").value.trim(), keep_text: $("st-keep-text").checked, note: $("st-note").value.trim() };
  const num = (id, fallback) => { const value = Number($(id).value); return Number.isFinite(value) && value > 0 ? value : fallback; };
  thresholds = { fastMs: num("st-fast", DEFAULT_THRESHOLDS.fastMs), slowMs: num("st-slow", DEFAULT_THRESHOLDS.slowMs), minRuns: Math.max(1, Math.round(num("st-min", DEFAULT_THRESHOLDS.minRuns))) };
  for (const probe of pack.probes) {
    const field = $(`st-answer-${probe.id}`); if (field) answers[probe.id] = field.value;
    const typed = $(`st-manual-${probe.id}`); if (typed) manualSeconds[probe.id] = typed.value;
  }
}

function header() {
  return `<header><div class="brand">SAKU <strong>SPEED TEST</strong></div><div class="header-actions"><a id="to-home" class="button-link" href="../index.html?stay=1">${t("ホーム", "Home")}</a><a id="to-trainer" class="button-link" href="./saku-trainer.html">${t("Trainer を開く", "Open the Trainer")}</a><label>${t("表示言語", "Interface language")}<select id="locale"><option value="ja" ${language === "ja" ? "selected" : ""}>日本語</option><option value="en" ${language === "en" ? "selected" : ""}>English</option></select></label></div></header>`;
}

function boundary() {
  return `<section class="card" id="st-boundary"><h1>${t("AI スピードテスト（貼り付けモード）", "AI speed test (paste mode)")}</h1>${manual()}<p class="intro">${t(
    "設問に定型の指示（回答の最初と最後に「開始時刻」「終了時刻」を書くこと）を添えてコピーし、外部 AI に貼り付けます。返ってきた回答をここに貼り付けると、その時点で記録されます（「記録」を押したのと同じです）。計測値には、回答に書かれた開始時刻と終了時刻の差を使います。この 2 つが無いときは、回答末尾の「処理時間: <秒>」を予備として読みます。手計測（計測時間の欄）はコピー＆ペーストの時間を含むため、参考として別に記録します。ほかに記録するのは、照合用の値（digest）・文字数・期待どおりかの 3 つだけです。回答本文は、この計測でチェックを入れたときだけ保存します。Character の評価ではありません。何も送信しません。",
    "Copy a question together with the standard instruction (to write 開始時刻 and 終了時刻 at the beginning and the end of the answer) and paste it into an external AI. When you paste the answer back here, it is recorded at that moment (the same as pressing \"Record the result\"). The measured value is the difference between the 開始時刻 and the 終了時刻 written in the answer. When those two are missing, the 処理時間: <秒> at the end of the answer is read as a fallback. Manual timing (the \"Measured time\" field) includes the time to copy and paste, so it is recorded separately for reference. The only other things recorded are the check value (digest), the character count, and whether the answer was as expected. The text of the answer is saved only when you tick the box for that measurement. This is not an evaluation of the Character. Nothing is sent.")}</p>${reportedNote()}</section>`;
}

function setupCard() {
  return `<section class="card" id="st-setup"><h2>${t("01 計測の条件", "01 Measurement conditions")}</h2><div class="st-setup"><label><span>${t("セッション名（任意）", "Session label (optional)")}</span><input id="st-session" type="text" value="${esc(setup.session_label)}" placeholder="${esc(t("例: 9/20 昼", "e.g. 20 Sep noon"))}"></label><label><span>${t("プロバイダ（必須・手入力）", "Provider (required, typed)")}</span><input id="st-provider" type="text" value="${esc(setup.provider_ref)}" placeholder="external/chat-ui"></label><label><span>${t("モデル（必須・手入力）", "Model (required, typed)")}</span><input id="st-model" type="text" value="${esc(setup.model_ref)}" placeholder="${esc(t("例: gpt-5 / unknown", "e.g. gpt-5 / unknown"))}"></label></div><label class="menu-choice" style="margin-top:12px"><input id="st-keep-text" type="checkbox" ${setup.keep_text ? "checked" : ""}><span>${t("この計測の回答本文も保存する（既定はオフ。オフでも行ごとの照合用の値は保存され、本文なしで違いを出せます）", "Also save the text of the answer for this measurement (off by default; even when off, a check value is saved for each line, so differences can be shown without the text)")}</span></label><label style="margin-top:12px"><span>${t("メモ（任意）", "Note (optional)")}</span><input id="st-note" type="text" value="${esc(setup.note)}"></label><h3>${t("しきい値（集計ごとに記録されます）", "Thresholds (recorded with every aggregate)")}</h3><div class="st-thresholds"><label><span>fastMs</span><input id="st-fast" type="number" min="1" value="${thresholds.fastMs}"></label><label><span>slowMs</span><input id="st-slow" type="number" min="1" value="${thresholds.slowMs}"></label><label><span>minRuns</span><input id="st-min" type="number" min="1" value="${thresholds.minRuns}"></label></div></section>`;
}

function probeCard(probe) {
  const running = timer.probe_id === probe.id;
  const elapsed = running ? performance.now() - timer.started_at : 0;
  return `<article class="st-probe" id="st-probe-${esc(probe.id)}" data-probe="${esc(probe.id)}" data-running="${running}"><h3>${esc(probe.title)} <span class="small st-small-mono">${esc(probe.id)} · ${esc(shortDigest(probe.digest))}</span></h3>${language === "en" ? `<p class="small" data-probe-language-note>${esc(PROBE_LANGUAGE_NOTE.en || PROBE_LANGUAGE_NOTE.ja)}</p>` : ""}<label><span>${t("外部 AI に貼り付ける文（設問そのまま）", "Text to paste into the external AI (the question as it is)")}</span><textarea class="st-probe-text" id="st-text-${esc(probe.id)}" readonly>${esc(probe.text)}</textarea></label><label><span>${t("末尾に添える定型指示（コピーに含まれます）", "Fixed instruction appended on copy")}</span><textarea class="st-probe-text st-instruction" id="st-instruction-${esc(probe.id)}" data-instruction readonly>${esc(t(CLOCK_TIME_INSTRUCTION.ja, CLOCK_TIME_INSTRUCTION.en))}</textarea></label><div class="actions"><button type="button" data-copy="${esc(probe.id)}">${t("コピー", "Copy")}</button><button type="button" class="primary" data-stopwatch="${esc(probe.id)}" ${timer.probe_id && !running ? "disabled" : ""}>${running ? t("計測終了", EN.stopwatchStop) : t("計測開始", EN.stopwatchStart)}</button><span class="st-clock" id="st-clock-${esc(probe.id)}" data-time>${clock(elapsed)}</span></div>${manual()}<label><span>${t("外部 AI の回答を貼り付け", "Paste the external AI's answer")}</span><textarea id="st-answer-${esc(probe.id)}" spellcheck="false">${esc(answers[probe.id] || "")}</textarea></label><label class="st-manual-seconds"><span>${t("計測時間", EN.measuredTime)}</span><input type="number" min="0" step="0.1" id="st-manual-${esc(probe.id)}" value="${esc(manualSeconds[probe.id] || "")}" ${running ? "disabled" : ""}></label><p class="small" data-reported-hint>${esc(measure("clockHint"))}</p><div class="actions"><button type="button" class="primary" data-record="${esc(probe.id)}">${t("記録", EN.record)}</button><button type="button" data-noanswer="${esc(probe.id)}" ${running ? "" : "disabled"}>${t("応答なしとして記録", "Record as no answer")}</button></div></article>`;
}

function aggregateBlock(group) {
  const a = group.aggregate;
  // The measurement, from the AI's own 処理時間 (Owner 2026-09-23). Computed
  // beside the manual aggregate, never added into it: one includes the person's
  // copy and paste, the other is what the model said about itself.
  const counted = group.records.filter(record => !overWindow(record.run_id));
  const r = reportedAggregate(counted.map(record => record.run), thresholds);
  const cell = (label, value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  return `<dl class="st-agg" data-time>${cell(t("計測回数 / 到達", "Measurements / Reached"), `${a.runs} / ${a.reachable_runs}`)}${cell(`${esc(measure("manualAside"))} median`, esc(ms(a.median_ms)))}${cell(`${t("手計測", "manual")} p95`, esc(ms(a.p95_ms)))}${cell(`${t("手計測", "manual")} min / max`, `${esc(ms(a.min_ms))} / ${esc(ms(a.max_ms))}`)}${cell(t("ばらつき", "spread"), esc(a.spread_ratio ?? "—"))}${cell(`${t("速さ", "speed")} (≤${a.thresholds.fastMs} / ≤${a.thresholds.slowMs} ms, min ${a.thresholds.minRuns})`, verdict(r.runs ? r.speed : a.speed))}${cell(t("到達性", "reachability"), verdict(a.reachability))}${group.records.length !== counted.length ? cell(esc(measure("overWindow")), `<span data-over-window>${group.records.length - counted.length}</span>`) : ""}${r.runs ? cell(`${esc(measure("basis"))} median / p95 / min / max`, `<span data-reported-time>${esc(sec(r.median_sec))} / ${esc(sec(r.p95_sec))} / ${esc(sec(r.min_sec))} / ${esc(sec(r.max_sec))} ${t(`（${r.runs} 回）`, ` (n = ${r.runs})`)}</span>`) : ""}${cell(t("回答の種類数", "answer variants"), esc(a.answer_variants))}${cell(t("適合率", "conformance"), a.conformance === null ? "—" : `${a.conformance}%`)}${cell(t("安定性", "stability"), verdict(a.stability))}</dl>`;
}

function runsTable(group) {
  const rows = group.records.map((record, index) => {
    const run = record.run;
    const diff = diffAgainstPrevious(record, group.records[index - 1]);
    const diffText = !diff.available ? (diff.reason === "NO_PREVIOUS_RUN" ? "—" : esc(diff.reason)) : diff.identical ? t("同一", "identical") : `${t("類似度", "similarity")} ${diff.similarity} · +${diff.added} −${diff.removed}${diff.basis === "LINE_DIGESTS_ONLY" ? ` <span class="small">(${t("行 digest", "line digests")})</span>` : ""}`;
    return `<tr data-run-id="${esc(record.run_id)}" ${overWindow(record.run_id) ? 'data-over-window="1"' : ""}><td title="${esc(run.at)}">${esc(localTime(run.at))}</td><td data-time>${timeCell(run)}${overWindow(record.run_id) ? `<br><span class="st-verdict" data-v="DEVIATES" title="${esc(measure("overWindowNote"))}">${esc(measure("overWindow"))}</span>` : ""}</td><td>${esc(run.answer.chars)} / ${esc(run.answer.lines)}</td><td>${verdict(run.answer.conformance)}</td><td class="st-small-mono">${esc(shortDigest(run.answer.digest))}</td><td>${typeof run.answer.text === "string" ? t("あり", "kept") : t("なし", "not kept")}</td><td>${diffText}</td><td><button type="button" class="danger" data-delete="${esc(record.run_id)}">${t("削除", "Delete")}</button></td></tr>`;
  }).join("");
  return `<table class="st-runs"><thead><tr><th>${t("日時", "At")}</th><th>${esc(measure("basis"))} / ${t("手計測", "manual")}</th><th>${t("文字 / 行", "chars / lines")}</th><th>${t("適合", "Conformance")}</th><th>digest</th><th>${t("本文", "Text")}</th><th>${t("前回との差分", "Diff vs previous")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function resultsSection(groups) {
  if (!groups.length) return `<section class="card" id="st-results"><h2>${t("03 記録", "03 Records")}</h2><p class="small">${t("まだ記録はありません。", "No runs recorded yet.")}</p></section>`;
  return `<section class="card" id="st-results"><h2>${t("03 記録", "03 Records")}</h2>${manual()}${reportedNote()}${groups.map(group => `<section class="st-group" data-group="${esc(groupKey(group))}"><h3>${esc(probeTitle(group.probe_id))} · ${esc(group.provider_ref)} / ${esc(group.model_ref)}${group.session_label ? ` · ${esc(group.session_label)}` : ""}</h3>${manual()}${group.aggregate.reported ? reportedNote() : ""}${aggregateBlock(group)}${runsTable(group)}</section>`).join("")}</section>`;
}

const groupKey = group => `${group.session_label}|${group.provider_ref}|${group.model_ref}|${group.probe_id}`;
const probeTitle = id => pack.probes.find(probe => probe.id === id)?.title || id;

// 03 — what changed in the answers since something that was saved.
// The saved thing is the JSON 04 writes; a file is read back, listed, and
// compared. Only the answers are diffed: whether it got faster is the
// aggregate's question, and mixing the two would blur both (Owner 2026-09-23).
const savedKey = entry => `saved:${entry.id}`;
const savedSides = () => [{ key: "current", label: saved("current"), records: listRuns(localStorage).records || [] },
  ...savedFiles.map(entry => ({ key: savedKey(entry), label: entry.name, records: entry.records }))];

function savedList() {
  if (!savedFiles.length) return "";
  return `<ul class="st-saved-list">${savedFiles.map(entry => `<li data-saved="${esc(entry.id)}"><strong>${esc(entry.name)}</strong><span class="small"> · ${esc(entry.exported_at || "—")} · ${entry.records.length} ${esc(saved("runs"))}</span> <button type="button" data-saved-drop="${esc(entry.id)}">${esc(saved("drop"))}</button></li>`).join("")}</ul>`;
}

function savedDiffTable(rows) {
  const cell = row => {
    if (!row.available) return `<span class="st-verdict" data-v="NOT_COMPARABLE">${esc(row.reason === "ONLY_IN_BEFORE" ? saved("onlyBefore") : row.reason === "ONLY_IN_AFTER" ? saved("onlyAfter") : row.reason)}</span>`;
    if (row.identical) return t("同一", "identical");
    return `${t("類似度", "similarity")} ${esc(row.similarity)} · +${esc(row.added)} −${esc(row.removed)}${row.basis === "LINE_DIGESTS_ONLY" ? ` <span class="small">(${t("行 digest", "line digests")})</span>` : ""}`;
  };
  return `<table class="st-runs"><thead><tr><th>${esc(saved("probe"))}</th><th>${esc(saved("answerDiff"))}</th></tr></thead><tbody>${rows.map(row => `<tr data-saved-diff="${esc(row.probe_id)}"><td>${esc(probeTitle(row.probe_id))}</td><td>${cell(row)}</td></tr>`).join("")}</tbody></table>`;
}

function compareSection() {
  const sides = savedSides();
  const options = selected => sides.map(side => `<option value="${esc(side.key)}" ${side.key === selected ? "selected" : ""}>${esc(side.label)} · ${side.records.length} ${esc(saved("runs"))}</option>`).join("");
  const before = sides.find(side => side.key === compareSelection.before);
  const after = sides.find(side => side.key === compareSelection.after);
  const rows = before && after && before.key !== after.key ? compareSavedAnswers(before.records, after.records) : null;
  return `<section class="card" id="st-compare"><h2>${esc(saved("title"))}</h2><p class="small">${esc(saved("intro"))}</p>
    <div class="actions"><button type="button" id="st-saved-open">${esc(saved("load"))}</button><input type="file" id="st-saved-file" accept=".json,application/json" multiple hidden></div>
    ${savedList()}
    <div class="paired"><label><span>${t("前", "Before")}</span><select id="st-compare-before"><option value="">—</option>${options(compareSelection.before)}</select></label><label><span>${t("後", "After")}</span><select id="st-compare-after"><option value="">—</option>${options(compareSelection.after)}</select></label></div>
    ${rows ? savedDiffTable(rows) : `<p class="small" id="st-compare-hint">${esc(saved("pickTwo"))}</p>`}</section>`;
}

/** Runs whose claim the measured window cannot allow. Kept, but not counted. */
let windowMarks = {};
const overWindow = runId => windowMarks[runId]?.state === "LONGER_THAN_WINDOW";

function render() {
  windowMarks = readWindowMarks(localStorage);
  const listed = listRuns(localStorage);
  const groups = groupRuns(listed.records || [], thresholds);
  const contract = contractProjection();
  $("speed-test-root").innerHTML = `${header()}<div class="layout st-layout">${boundary()}${notice ? `<div id="st-notice" class="${notice.ok ? "status" : "error"}" role="${notice.ok ? "status" : "alert"}" data-code="${esc(notice.code)}"><strong>${esc(notice.code)}</strong>${noticeText(notice) ? ` — ${esc(noticeText(notice))}` : ""}${notice.time ? `<span data-time></span>${manual()}${reportedNote()}` : ""}</div>` : ""}${setupCard()}<section class="card" id="st-probes"><h2>${t("02 計測する（設問 4 種）", "02 Measure (4 questions)")}</h2><p class="small" data-probe-note>${esc(measure("probeNote"))}</p>${pack.probes.map(probeCard).join("")}</section>${resultsSection(groups)}${compareSection()}<section class="card" id="st-export"><h2>${t("05 書き出し", "05 Export")}</h2><div class="actions"><button type="button" id="st-export-json">${t("記録を JSON で保存", "Save records as JSON")}</button></div>${listed.problems?.length ? `<p class="error">${t("読めない記録: ", "Unreadable records: ")}${listed.problems.map(item => `${esc(item.run_id)} (${esc(item.code)})`).join(", ")}</p>` : ""}</section><p class="small" id="st-contract">${esc(contract.run_schema)} · mode ${esc(contract.modes.join(","))} · network ${esc(contract.network)} · text_default ${esc(contract.text_default)} · line_digests ${esc(contract.line_digests)} · probe pack ${esc(contract.erabazu_probe_pack_id)}</p></div>`;
  bind();
}

function startTicking() {
  clearInterval(timer.tick);
  timer.tick = setInterval(() => { const el = timer.probe_id && $(`st-clock-${timer.probe_id}`); if (el) el.textContent = clock(performance.now() - timer.started_at); }, 100);
}

/**
 * 計測終了: stop the stopwatch and write what it measured into 計測時間, to one
 * decimal as the field takes it. The value is then visible and editable before
 * it is recorded — the stopwatch fills the field, it is not a second place a
 * time can hide.
 */
function stopStopwatch(probeId) {
  if (timer.probe_id !== probeId) return null;
  const totalMs = Math.round(performance.now() - timer.started_at);
  clearInterval(timer.tick);
  timer = { probe_id: null, started_at: null, tick: null };
  manualSeconds[probeId] = (totalMs / 1000).toFixed(1);
  return totalMs;
}

/** The content a run is made of, so an unchanged card is not recorded twice. */
const recordKey = probeId => `${answers[probeId] ?? ""}\u0000${manualSeconds[probeId] ?? ""}`;

async function stopAndRecord(probeId, { noAnswer = false, fromPaste = false } = {}) {
  readSetup();
  if (!noAnswer && !fromPaste && recorded[probeId] !== undefined && recorded[probeId] === recordKey(probeId)) {
    notice = { ok: false, code: "SPEED_RUN_ALREADY_RECORDED", detail: () => t(PENDING_JA.alreadyRecorded, PENDING_EN.alreadyRecorded) };
    render(); return;
  }
  let totalMs = null;
  if (noAnswer) {
    if (timer.probe_id !== probeId) { notice = { ok: false, code: "SPEED_RUN_NOT_STARTED", detail: () => t("先に「計測開始」を押してください。", "Press Start first.") }; render(); return; }
    totalMs = stopStopwatch(probeId);
  } else {
    // Pressing 記録 while the stopwatch runs stops it first: that press is the
    // end of the measurement, so asking for 計測終了 as well would only add a
    // step. Stopping writes the time into 計測時間, which is read back here.
    if (timer.probe_id === probeId) stopStopwatch(probeId);
    const typed = Number(String(manualSeconds[probeId] ?? "").trim());
    totalMs = String(manualSeconds[probeId] ?? "").trim() && Number.isFinite(typed) && typed >= 0 ? Math.round(typed * 1000) : null;
  }
  if (!setup.provider_ref || !setup.model_ref) { notice = { ok: false, code: "SPEED_RUN_INVALID", detail: () => t("プロバイダとモデルを入力してください。この計測は記録されませんでした。", "Enter provider and model. This measurement was not recorded.") }; render(); return; }
  const probe = pack.probes.find(item => item.id === probeId);
  // The AI's own 処理時間 line is split off first: it is a claim about the run, not part of the answer.
  // Two clock readings first (Owner 2026-09-23); an answer that still carries
  // the older 「処理時間: <秒>」 line is read the way it always was.
  const clock = noAnswer ? { answerText: "", started_at: null, finished_at: null, elapsed_sec: null, problem: null } : extractClockTimes(answers[probeId] || "");
  const split = noAnswer
    ? { answerText: "", reported_time_sec: null, reported_line: null }
    : clock.elapsed_sec !== null
      ? { answerText: clock.answerText, reported_time_sec: clock.elapsed_sec, reported_line: `${clock.started_at} → ${clock.finished_at}` }
      : extractReportedTime(answers[probeId] || "");
  const window = noAnswer ? { state: "NO_WINDOW" } : checkAgainstWindow(split.reported_time_sec, copiedAt[probeId] ? Date.now() - copiedAt[probeId] : null);
  if (!noAnswer && totalMs === null && split.reported_time_sec === null) { notice = { ok: false, code: "SPEED_RUN_NO_TIME", detail: () => t("時間がありません。回答に「開始時刻」と「終了時刻」があるか、「計測時間」の欄に値を入れてください。回答末尾の「処理時間: <秒>」でも記録できます。記録しませんでした。", "No time value. Check that the answer contains 開始時刻 and 終了時刻, or enter a value in the \"Measured time\" field. The 処理時間: <秒> at the end of the answer also works. Nothing was recorded.") }; render(); return; }
  try {
    const measurement = noAnswer ? { reachable: false } : { ...(totalMs !== null ? { total_ms: totalMs } : {}), ...(split.reported_time_sec !== null ? { reported_time_sec: split.reported_time_sec, reported_line: split.reported_line, instruction: t(CLOCK_TIME_INSTRUCTION.ja, CLOCK_TIME_INSTRUCTION.en) } : {}) };
    const run = await makeRun({ probe, provider_ref: setup.provider_ref, model_ref: setup.model_ref, measurement, answerText: split.answerText, at: new Date().toISOString(), keepText: setup.keep_text, note: setup.note });
    const outcome = recordRun(localStorage, run, { sessionLabel: setup.session_label });
    // The run is kept either way (Owner 2026-09-23: 「記録はするが、矛盾を印として
    // 残す」). The mark lives in its own namespace because the run's own fields
    // are pinned against AMU vectors and are not widened from here.
    if (outcome.ok && window.state !== "NO_WINDOW") writeWindowMark(localStorage, outcome.record?.run_id, { ...window, clock_problem: clock.problem || null });
    const timeText = () => noAnswer ? t("応答なし", "no answer") : [totalMs !== null ? `${t("手計測", "manual")} ${ms(totalMs)}` : "", split.reported_time_sec !== null ? `${t("AI 申告値", "AI-reported")} ${sec(split.reported_time_sec)}（${t("検証不能", "unverifiable")}）` : ""].filter(Boolean).join(" / ");
    notice = outcome.ok ? { ok: true, code: outcome.code, time: !noAnswer, detail: () => `${probe.title} · ${timeText()} · ${t("本文", "text")}: ${setup.keep_text ? t("保存", "kept") : t("未保存（行 digest のみ）", "not kept (line digests only)")}` } : outcome;
    if (outcome.ok) {
      delete copiedAt[probeId];
      // A pasted answer stays where the person can see it; 記録 clears the card
      // for the next run as it always did.
      if (fromPaste) recorded[probeId] = recordKey(probeId);
      else { answers[probeId] = ""; manualSeconds[probeId] = ""; delete recorded[probeId]; }
    }
  } catch (error) { notice = { ok: false, code: error?.code || "SPEED_RUN_FAILED", detail: String(error?.message || error) }; }
  render();
}

function bind() {
  $("locale").onchange = () => { readSetup(); language = $("locale").value; render(); };
  for (const id of ["st-session", "st-provider", "st-model", "st-note", "st-fast", "st-slow", "st-min"]) $(id).onchange = () => { readSetup(); render(); };
  $("st-keep-text").onchange = () => readSetup();
  for (const button of document.querySelectorAll("[data-copy]")) button.onclick = async () => {
    readSetup();
    const probe = pack.probes.find(item => item.id === button.dataset.copy);
    try {
      await navigator.clipboard.writeText(copyTextFor(probe));
      copiedAt[probe.id] = Date.now();
      notice = { ok: true, code: "PROBE_COPIED", detail: () => t("設問と定型指示をコピーしました。送信はしていません。", "The question and the standard instruction were copied. Nothing was sent.") };
    }
    catch { notice = { ok: false, code: "PROBE_COPY_FAILED", detail: () => t("コピーできませんでした。上の欄から手動でコピーしてください。", "Copy failed. Copy manually from the field above.") }; }
    render();
  };
  // 計測開始 / 計測終了 are the same button: it starts, and pressing it again
  // stops and writes the time into 計測時間. Recording is a separate press.
  for (const button of document.querySelectorAll("[data-stopwatch]")) button.onclick = () => {
    readSetup();
    const probeId = button.dataset.stopwatch;
    if (timer.probe_id === probeId) { stopStopwatch(probeId); notice = null; render(); return; }
    if (timer.probe_id) return;
    timer = { probe_id: probeId, started_at: performance.now(), tick: null };
    notice = null; render(); startTicking();
  };
  for (const button of document.querySelectorAll("[data-record]")) button.onclick = () => stopAndRecord(button.dataset.record);
  // Pasting the answer is the same as pressing 記録 (Owner 2026-09-23): the paste
  // is the moment the answer came back. The value is read after the browser has
  // put it in the field, so what is recorded is what the person actually pasted.
  for (const probe of pack.probes) {
    const field = $(`st-answer-${probe.id}`);
    if (!field) continue;
    field.onpaste = () => setTimeout(() => {
      readSetup();
      // A paste begins a new run. If this card is showing a run that was already
      // recorded, the 計測時間 in the box belongs to that one, so it does not
      // travel to the new answer. A time typed before the first paste is kept,
      // and a running stopwatch is this run's own and is left to 記録 to stop.
      if (recorded[probe.id] !== undefined && timer.probe_id !== probe.id) {
        // The field too, not only the state: stopAndRecord reads the card back
        // from the DOM, so a value left in the box would return.
        manualSeconds[probe.id] = "";
        const box = $(`st-manual-${probe.id}`);
        if (box) box.value = "";
      }
      delete recorded[probe.id];
      stopAndRecord(probe.id, { fromPaste: true });
    }, 0);
  }
  for (const button of document.querySelectorAll("[data-noanswer]")) button.onclick = () => stopAndRecord(button.dataset.noanswer, { noAnswer: true });
  for (const button of document.querySelectorAll("[data-delete]")) button.onclick = () => { readSetup(); const outcome = deleteRun(localStorage, button.dataset.delete); notice = outcome.ok ? { ok: true, code: outcome.code } : outcome; render(); };
  for (const id of ["st-compare-before", "st-compare-after"]) $(id).onchange = () => { readSetup(); compareSelection = { before: $("st-compare-before").value, after: $("st-compare-after").value }; render(); };
  // Opening a saved export: anything that is not one is refused by name, so a
  // wrong file cannot read as "nothing changed".
  if ($("st-saved-open")) $("st-saved-open").onclick = () => $("st-saved-file").click();
  if ($("st-saved-file")) $("st-saved-file").onchange = async event => {
    readSetup();
    const opened = [];
    for (const file of [...(event.target.files || [])]) {
      let parsed = null;
      try { parsed = JSON.parse(await file.text()); }
      catch { notice = { ok: false, code: "SAVED_EXPORT_NOT_JSON", detail: () => `${file.name}: ${saved("notAnExport")}` }; continue; }
      const read = readExport(parsed);
      if (!read.ok) { notice = { ok: false, code: read.code, detail: () => `${file.name}: ${saved("notAnExport")}` }; continue; }
      savedSeq += 1;
      const entry = { id: `saved-${savedSeq}`, name: file.name, exported_at: read.exported_at, records: read.records };
      savedFiles = [...savedFiles.filter(item => item.name !== entry.name), entry];
      opened.push(entry);
    }
    if (opened.length) {
      notice = { ok: true, code: "SAVED_EXPORT_OPENED", detail: () => `${saved("loaded")}: ${opened.map(entry => `${entry.name} (${entry.records.length} ${saved("runs")})`).join(", ")}` };
      if (!compareSelection.before) compareSelection.before = savedKey(opened[0]);
      if (!compareSelection.after) compareSelection.after = "current";
    }
    event.target.value = "";
    render();
  };
  for (const button of document.querySelectorAll("[data-saved-drop]")) button.onclick = () => {
    readSetup();
    const key = `saved:${button.dataset.savedDrop}`;
    savedFiles = savedFiles.filter(entry => entry.id !== button.dataset.savedDrop);
    if (compareSelection.before === key) compareSelection.before = "";
    if (compareSelection.after === key) compareSelection.after = "";
    render();
  };
  $("st-export-json").onclick = () => {
    const payload = JSON.stringify(exportRuns(localStorage), null, 2);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    anchor.download = `saku-speed-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(anchor); anchor.click(); anchor.remove();
  };
  if (timer.probe_id) startTicking();
}

async function init() {
  // The deliberate pack (Owner 2026-09-23: the canon probes come back in 0.1 s,
  // which no stopwatch and no median can do anything with). ERABAZU canon is
  // left untouched in the module and stays pinned by the parity gate.
  pack = await buildProbePack({ probes: DELIBERATE_PROBES, pack_id: DELIBERATE_PACK_ID });
  render();
  window.__saku_speed_test = { contract: contractProjection, getPack: () => pack, getRuns: () => listRuns(localStorage).records, getNotice: () => notice, getTimer: () => ({ ...timer, tick: undefined }), copyText: id => copyTextFor(pack.probes.find(probe => probe.id === id)),
    getWindowMarks: () => readWindowMarks(localStorage),
    setCopiedAt: (id, when) => { copiedAt[id] = when; },
    openSaved: value => { const read = readExport(value); if (!read.ok) return read; savedSeq += 1; savedFiles = [...savedFiles, { id: `saved-${savedSeq}`, name: `saved-${savedSeq}.json`, exported_at: read.exported_at, records: read.records }]; render(); return { ok: true, id: `saved-${savedSeq}` }; },
    getSaved: () => savedFiles.map(entry => ({ id: entry.id, name: entry.name, runs: entry.records.length })) };
}
init().catch(error => { $("speed-test-root").textContent = `SPEED_TEST_INIT_FAILED: ${String(error?.message || error)}`; });
