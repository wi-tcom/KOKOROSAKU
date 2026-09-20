// AI スピードテスト（貼り付けモード）— page controller.
//
// Copy a fixed probe → start the stopwatch → paste the external AI's answer →
// stop and record.  Everything measured includes the human's own copy and
// paste, and every place a time appears says so.  No provider is called; the
// page has no network path.  Runs live in their own namespace and never touch
// a Character, a Trainer Session, a Change Candidate, or an intake record.
import {
  DEFAULT_THRESHOLDS, MANUAL_MEASUREMENT, buildProbePack, contractProjection, makeRun,
} from "./speed-test.mjs";
import {
  compareGroups, deleteRun, diffAgainstPrevious, exportRuns, groupRuns, listRuns, recordRun,
} from "./speed-test-store.mjs";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let language = "ja";
let pack = null;
let setup = { session_label: "", provider_ref: "", model_ref: "", keep_text: false, note: "" };
let thresholds = { ...DEFAULT_THRESHOLDS };
let answers = {};
let timer = { probe_id: null, started_at: null, tick: null };
let notice = null;
let compareSelection = { before: "", after: "" };
const t = (ja, en) => language === "en" ? en : ja;
const manual = () => `<span class="st-manual" data-manual-measurement>${esc(t(MANUAL_MEASUREMENT.ja, MANUAL_MEASUREMENT.en))}</span>`;
const ms = value => value === null || value === undefined ? "—" : `${(value / 1000).toFixed(1)} s (${Math.round(value)} ms)`;
const clock = value => `${Math.floor(value / 60000)}:${String(Math.floor((value % 60000) / 1000)).padStart(2, "0")}.${Math.floor((value % 1000) / 100)}`;
const verdict = value => `<span class="st-verdict" data-v="${esc(value)}">${esc(value)}</span>`;
const shortDigest = value => value ? String(value).replace(/^sha-256:/, "").slice(0, 12) : "—";

function readSetup() {
  if (!$("st-provider")) return;
  setup = { session_label: $("st-session").value.trim(), provider_ref: $("st-provider").value.trim(), model_ref: $("st-model").value.trim(), keep_text: $("st-keep-text").checked, note: $("st-note").value.trim() };
  const num = (id, fallback) => { const value = Number($(id).value); return Number.isFinite(value) && value > 0 ? value : fallback; };
  thresholds = { fastMs: num("st-fast", DEFAULT_THRESHOLDS.fastMs), slowMs: num("st-slow", DEFAULT_THRESHOLDS.slowMs), minRuns: Math.max(1, Math.round(num("st-min", DEFAULT_THRESHOLDS.minRuns))) };
  for (const probe of pack.probes) { const field = $(`st-answer-${probe.id}`); if (field) answers[probe.id] = field.value; }
}

function header() {
  return `<header><div class="brand">SAKU <strong>SPEED TEST</strong></div><div class="header-actions"><a id="to-home" class="button-link" href="../index.html?stay=1">${t("ホーム", "Home")}</a><a id="to-trainer" class="button-link" href="./trainer.html">${t("Trainer を開く", "Open the Trainer")}</a><label>${t("表示言語", "Interface language")}<select id="locale"><option value="ja" ${language === "ja" ? "selected" : ""}>日本語</option><option value="en" ${language === "en" ? "selected" : ""}>English</option></select></label></div></header>`;
}

function boundary() {
  return `<section class="card" id="st-boundary"><h1>${t("AI スピードテスト（貼り付けモード）", "AI speed test (paste mode)")}</h1>${manual()}<p class="intro">${t(
    "固定の質問（probe）をコピーして外部 AI に貼り付け、ストップウォッチを動かし、返ってきた回答を貼り付けて止めます。記録されるのは所要時間・回答の digest・文字数・期待どおりかの 3 値だけです。回答本文は、この run について明示的にチェックした場合にのみ保存します。Character の評価ではありません。何も送信しません。",
    "Copy a fixed probe into an external AI, run the stopwatch, paste the answer back and stop. What is recorded is the elapsed time, the answer's digest, its length and whether it conforms. The answer text itself is kept only when you tick the box for that run. This is not a Character evaluation and nothing is sent anywhere.")}</p></section>`;
}

function setupCard() {
  return `<section class="card" id="st-setup"><h2>${t("01 計測の条件", "01 Measurement conditions")}</h2><div class="st-setup"><label><span>${t("セッション名（任意）", "Session label (optional)")}</span><input id="st-session" type="text" value="${esc(setup.session_label)}" placeholder="${esc(t("例: 9/20 昼", "e.g. 20 Sep noon"))}"></label><label><span>${t("プロバイダ（必須・手入力）", "Provider (required, typed)")}</span><input id="st-provider" type="text" value="${esc(setup.provider_ref)}" placeholder="external/chat-ui"></label><label><span>${t("モデル（必須・手入力）", "Model (required, typed)")}</span><input id="st-model" type="text" value="${esc(setup.model_ref)}" placeholder="${esc(t("例: gpt-5 / unknown", "e.g. gpt-5 / unknown"))}"></label></div><label class="menu-choice" style="margin-top:12px"><input id="st-keep-text" type="checkbox" ${setup.keep_text ? "checked" : ""}><span>${t("この run の回答本文も保存する（既定はオフ。オフでも行ごとの digest は保存され、本文なしで差分を出せます）", "Also keep this run's answer text (default off; line digests are always kept, so a diff works without the text)")}</span></label><label style="margin-top:12px"><span>${t("メモ（任意）", "Note (optional)")}</span><input id="st-note" type="text" value="${esc(setup.note)}"></label><h3>${t("しきい値（集計ごとに記録されます）", "Thresholds (recorded with every aggregate)")}</h3><div class="st-thresholds"><label><span>fastMs</span><input id="st-fast" type="number" min="1" value="${thresholds.fastMs}"></label><label><span>slowMs</span><input id="st-slow" type="number" min="1" value="${thresholds.slowMs}"></label><label><span>minRuns</span><input id="st-min" type="number" min="1" value="${thresholds.minRuns}"></label></div></section>`;
}

function probeCard(probe) {
  const running = timer.probe_id === probe.id;
  const elapsed = running ? performance.now() - timer.started_at : 0;
  return `<article class="st-probe" id="st-probe-${esc(probe.id)}" data-probe="${esc(probe.id)}" data-running="${running}"><h3>${esc(probe.title)} <span class="small st-small-mono">${esc(probe.id)} · ${esc(shortDigest(probe.digest))}</span></h3><label><span>${t("外部 AI に貼り付ける文（そのまま）", "Text to paste into the external AI (verbatim)")}</span><textarea class="st-probe-text" id="st-text-${esc(probe.id)}" readonly>${esc(probe.text)}</textarea></label><div class="actions"><button type="button" data-copy="${esc(probe.id)}">${t("コピー", "Copy")}</button><button type="button" class="primary" data-start="${esc(probe.id)}" ${timer.probe_id && !running ? "disabled" : ""}>${running ? t("計測中…", "Running…") : t("計測開始", "Start")}</button><span class="st-clock" id="st-clock-${esc(probe.id)}" data-time>${clock(elapsed)}</span></div>${manual()}<label><span>${t("外部 AI の回答を貼り付け", "Paste the external AI's answer")}</span><textarea id="st-answer-${esc(probe.id)}" spellcheck="false">${esc(answers[probe.id] || "")}</textarea></label><div class="actions"><button type="button" class="primary" data-stop="${esc(probe.id)}" ${running ? "" : "disabled"}>${t("停止して記録", "Stop and record")}</button><button type="button" data-noanswer="${esc(probe.id)}" ${running ? "" : "disabled"}>${t("応答なしとして記録", "Record as no answer")}</button></div></article>`;
}

function aggregateBlock(group) {
  const a = group.aggregate;
  const cell = (label, value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  return `<dl class="st-agg" data-time>${cell(t("run 数 / 到達", "runs / reachable"), `${a.runs} / ${a.reachable_runs}`)}${cell("median", esc(ms(a.median_ms)))}${cell("p95", esc(ms(a.p95_ms)))}${cell("min / max", `${esc(ms(a.min_ms))} / ${esc(ms(a.max_ms))}`)}${cell(t("ばらつき", "spread"), esc(a.spread_ratio ?? "—"))}${cell(`${t("速さ", "speed")} (≤${a.thresholds.fastMs} / ≤${a.thresholds.slowMs} ms, min ${a.thresholds.minRuns})`, verdict(a.speed))}${cell(t("到達性", "reachability"), verdict(a.reachability))}${cell(t("回答の種類数", "answer variants"), esc(a.answer_variants))}${cell(t("適合率", "conformance"), a.conformance === null ? "—" : `${a.conformance}%`)}${cell(t("安定性", "stability"), verdict(a.stability))}</dl>`;
}

function runsTable(group) {
  const rows = group.records.map((record, index) => {
    const run = record.run;
    const diff = diffAgainstPrevious(record, group.records[index - 1]);
    const diffText = !diff.available ? (diff.reason === "NO_PREVIOUS_RUN" ? "—" : esc(diff.reason)) : diff.identical ? t("同一", "identical") : `${t("類似度", "similarity")} ${diff.similarity} · +${diff.added} −${diff.removed}${diff.basis === "LINE_DIGESTS_ONLY" ? ` <span class="small">(${t("行 digest", "line digests")})</span>` : ""}`;
    return `<tr data-run-id="${esc(record.run_id)}"><td>${esc(run.at)}</td><td data-time>${run.reachable ? esc(ms(run.total_ms)) : t("応答なし", "no answer")}</td><td>${esc(run.answer.chars)} / ${esc(run.answer.lines)}</td><td>${verdict(run.answer.conformance)}</td><td class="st-small-mono">${esc(shortDigest(run.answer.digest))}</td><td>${typeof run.answer.text === "string" ? t("あり", "kept") : t("なし", "not kept")}</td><td>${diffText}</td><td><button type="button" class="danger" data-delete="${esc(record.run_id)}">${t("削除", "Delete")}</button></td></tr>`;
  }).join("");
  return `<table class="st-runs"><thead><tr><th>${t("日時", "At")}</th><th>${t("所要時間", "Elapsed")}</th><th>${t("文字 / 行", "chars / lines")}</th><th>${t("適合", "Conformance")}</th><th>digest</th><th>${t("本文", "Text")}</th><th>${t("前回との差分", "Diff vs previous")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function resultsSection(groups) {
  if (!groups.length) return `<section class="card" id="st-results"><h2>${t("02 記録", "02 Records")}</h2><p class="small">${t("まだ記録はありません。", "No runs recorded yet.")}</p></section>`;
  return `<section class="card" id="st-results"><h2>${t("02 記録", "02 Records")}</h2>${manual()}${groups.map(group => `<section class="st-group" data-group="${esc(groupKey(group))}"><h3>${esc(probeTitle(group.probe_id))} · ${esc(group.provider_ref)} / ${esc(group.model_ref)}${group.session_label ? ` · ${esc(group.session_label)}` : ""}</h3>${manual()}${aggregateBlock(group)}${runsTable(group)}</section>`).join("")}</section>`;
}

const groupKey = group => `${group.session_label}|${group.provider_ref}|${group.model_ref}|${group.probe_id}`;
const probeTitle = id => pack.probes.find(probe => probe.id === id)?.title || id;

function compareSection(groups) {
  const options = selected => `<option value="">—</option>${groups.map(group => `<option value="${esc(groupKey(group))}" ${groupKey(group) === selected ? "selected" : ""}>${esc(probeTitle(group.probe_id))} · ${esc(group.provider_ref)}/${esc(group.model_ref)} · ${esc(group.session_label || t("(無題)", "(no label)"))} · ${group.records.length} runs</option>`).join("")}`;
  const before = groups.find(group => groupKey(group) === compareSelection.before);
  const after = groups.find(group => groupKey(group) === compareSelection.after);
  const comparable = before && after && before.probe_id === after.probe_id && before.provider_ref === after.provider_ref && before.model_ref === after.model_ref;
  const result = comparable ? compareGroups(before, after) : null;
  return `<section class="card" id="st-compare"><h2>${t("03 セッション比較", "03 Compare sessions")}</h2><p class="small">${t("同じ probe・プロバイダ・モデルの 2 つの集計を比べます。", "Compare two aggregates of the same probe, provider and model.")}</p><div class="paired"><label><span>${t("前", "Before")}</span><select id="st-compare-before">${options(compareSelection.before)}</select></label><label><span>${t("後", "After")}</span><select id="st-compare-after">${options(compareSelection.after)}</select></label></div>${before && after && !comparable ? `<p class="warning">${t("probe・プロバイダ・モデルが同じ集計同士だけ比較できます。", "Only aggregates with the same probe, provider and model can be compared.")}</p>` : ""}${result ? `<div data-time>${manual()}<p id="st-compare-result">${t("速さ", "speed")}: ${verdict(result.speed_change)}${result.ratio !== undefined ? ` (×${esc(result.ratio)})` : ""} · ${t("回答", "answers")}: ${verdict(result.answer_change)}</p></div>` : ""}</section>`;
}

function render() {
  const listed = listRuns(localStorage);
  const groups = groupRuns(listed.records || [], thresholds);
  const contract = contractProjection();
  $("speed-test-root").innerHTML = `${header()}<div class="layout st-layout">${boundary()}${notice ? `<div id="st-notice" class="${notice.ok ? "status" : "error"}" role="${notice.ok ? "status" : "alert"}" data-code="${esc(notice.code)}"><strong>${esc(notice.code)}</strong>${notice.detail ? ` — ${esc(notice.detail)}` : ""}${notice.time ? `<span data-time></span>${manual()}` : ""}</div>` : ""}${setupCard()}<section class="card" id="st-probes"><h2>${t("02 計測する（probe 4 種）", "02 Measure (4 probes)")}</h2>${pack.probes.map(probeCard).join("")}</section>${resultsSection(groups)}${compareSection(groups)}<section class="card" id="st-export"><h2>${t("04 書き出し", "04 Export")}</h2><div class="actions"><button type="button" id="st-export-json">${t("記録を JSON で保存", "Save records as JSON")}</button></div>${listed.problems?.length ? `<p class="error">${t("読めない記録: ", "Unreadable records: ")}${listed.problems.map(item => `${esc(item.run_id)} (${esc(item.code)})`).join(", ")}</p>` : ""}</section><p class="small" id="st-contract">${esc(contract.run_schema)} · mode ${esc(contract.modes.join(","))} · network ${esc(contract.network)} · text_default ${esc(contract.text_default)} · line_digests ${esc(contract.line_digests)} · probe pack ${esc(contract.erabazu_probe_pack_id)}</p></div>`;
  bind();
}

function startTicking() {
  clearInterval(timer.tick);
  timer.tick = setInterval(() => { const el = timer.probe_id && $(`st-clock-${timer.probe_id}`); if (el) el.textContent = clock(performance.now() - timer.started_at); }, 100);
}

async function stopAndRecord(probeId, { noAnswer = false } = {}) {
  readSetup();
  if (timer.probe_id !== probeId) { notice = { ok: false, code: "SPEED_RUN_NOT_STARTED", detail: t("先に「計測開始」を押してください。", "Press Start first.") }; render(); return; }
  const totalMs = Math.round(performance.now() - timer.started_at);
  clearInterval(timer.tick); timer = { probe_id: null, started_at: null, tick: null };
  if (!setup.provider_ref || !setup.model_ref) { notice = { ok: false, code: "SPEED_RUN_INVALID", detail: t("プロバイダとモデルを入力してください。この計測は記録されませんでした。", "Enter provider and model. This measurement was not recorded.") }; render(); return; }
  const probe = pack.probes.find(item => item.id === probeId);
  try {
    const run = await makeRun({ probe, provider_ref: setup.provider_ref, model_ref: setup.model_ref, measurement: noAnswer ? { reachable: false } : { total_ms: totalMs }, answerText: noAnswer ? "" : answers[probeId] || "", at: new Date().toISOString(), keepText: setup.keep_text, note: setup.note });
    const outcome = recordRun(localStorage, run, { sessionLabel: setup.session_label });
    notice = outcome.ok ? { ok: true, code: outcome.code, time: !noAnswer, detail: `${probe.title} · ${noAnswer ? t("応答なし", "no answer") : ms(totalMs)} · ${t("本文", "text")}: ${setup.keep_text ? t("保存", "kept") : t("未保存（行 digest のみ）", "not kept (line digests only)")}` } : outcome;
    if (outcome.ok) answers[probeId] = "";
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
    try { await navigator.clipboard.writeText(probe.text); notice = { ok: true, code: "PROBE_COPIED", detail: t("コピーしました。送信はしていません。", "Copied. Nothing was sent.") }; }
    catch { notice = { ok: false, code: "PROBE_COPY_FAILED", detail: t("コピーできませんでした。上の欄から手動でコピーしてください。", "Copy failed. Copy manually from the field above.") }; }
    render();
  };
  for (const button of document.querySelectorAll("[data-start]")) button.onclick = () => {
    readSetup();
    if (timer.probe_id) return;
    timer = { probe_id: button.dataset.start, started_at: performance.now(), tick: null };
    notice = null; render(); startTicking();
  };
  for (const button of document.querySelectorAll("[data-stop]")) button.onclick = () => stopAndRecord(button.dataset.stop);
  for (const button of document.querySelectorAll("[data-noanswer]")) button.onclick = () => stopAndRecord(button.dataset.noanswer, { noAnswer: true });
  for (const button of document.querySelectorAll("[data-delete]")) button.onclick = () => { readSetup(); const outcome = deleteRun(localStorage, button.dataset.delete); notice = outcome.ok ? { ok: true, code: outcome.code } : outcome; render(); };
  for (const id of ["st-compare-before", "st-compare-after"]) $(id).onchange = () => { readSetup(); compareSelection = { before: $("st-compare-before").value, after: $("st-compare-after").value }; render(); };
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
  pack = await buildProbePack();
  render();
  window.__saku_speed_test = { contract: contractProjection, getPack: () => pack, getRuns: () => listRuns(localStorage).records, getNotice: () => notice, getTimer: () => ({ ...timer, tick: undefined }) };
}
init().catch(error => { $("speed-test-root").textContent = `SPEED_TEST_INIT_FAILED: ${String(error?.message || error)}`; });
