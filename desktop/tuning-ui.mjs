// 調整 / チューニング — the 20 items, reached from the Character you are editing.
//
// This sits beside the V1 workflow rather than replacing it: TOP → 01 選択 →
// 04 編集 is untouched, and tuning is one more thing you can do to the
// Character you already chose. Nothing here is a Canonical field, and the
// screen never writes to a Character without the Owner pressing Apply.
//
// The Owner navigates by symptom, not by schema. "同じ検討を何度も繰り返す" is
// how the problem is noticed; T01 is only how it is filed.

import * as Tuning from "../tools/unified-v1/tuning/tuning-projection.mjs";
import * as Unified from "../tools/unified-v1/unified-schema-v1.mjs";
import { exampleFor, tabFills, TUNING_EXAMPLE_WORDS } from "../tools/unified-v1/tuning/tuning-examples.mjs";

const $ = id => document.getElementById(id);

// Symptoms in the Owner's words. These are navigation, not stored values, so
// each one only needs to point at the item it helps you find.
export const SYMPTOMS = [
  { id: "T01", ja: "同じ検討を何度も繰り返す", en: "Repeatedly revisits the same consideration" },
  { id: "T02", ja: "結論を急ぎすぎる", en: "Concludes too quickly" },
  { id: "T03", ja: "慎重すぎて進まない", en: "Becomes too cautious to proceed" },
  { id: "T08", ja: "利用者に同意しすぎる", en: "Agrees with the user too readily" },
  { id: "T13", ja: "確認が多すぎる", en: "Asks too many confirmations" },
  { id: "T16", ja: "一つ問題があると全部止まる", en: "Stops everything because of one issue" },
  { id: "T20", ja: "説明が長すぎる", en: "Explanation becomes unnecessarily long" },
];

const STATE_LABEL_JA = {
  LOW: "低い", MEDIUM: "中くらい", HIGH: "高い",
  PROTECTED: "保護されている", AT_RISK: "崩れかけている", OBSERVED: "観察された",
  DISTINCT: "個性が保たれている", FLATTENED: "個性が薄れている",
  NOT_ASSESSED: "未評価",
};
const stateLabel = value => STATE_LABEL_JA[value] || value;

let currentCharacter = null;
let currentItemId = "";
let observed = {};
let onApply = null;
// A sample pack Character is for reading (Owner 結果 188 Q27; L12 D-5): the button stays off and says why beside it.
let sampleSubject = false;

/** The Character being tuned, and what to do when the Owner applies a change. */
export function setSubject(character, { observedStates = {}, apply = null, sample = false } = {}) {
  currentCharacter = character || null;
  observed = observedStates || {};
  onApply = apply;
  sampleSubject = sample === true;
  renderSymptoms();
  renderDetail(currentItemId);
}

function row(dl, label, value, tone = "") {
  const wrap = document.createElement("div");
  const dt = document.createElement("dt"); dt.textContent = label;
  const dd = document.createElement("dd"); dd.textContent = value; dd.dataset.runtimeValue = "";
  if (tone) dd.dataset.tone = tone;
  wrap.append(dt, dd); dl.append(wrap);
}

function renderSymptoms() {
  const host = $("tuning-symptoms");
  if (!host) return;
  host.replaceChildren();
  const projection = currentCharacter ? Tuning.projectAll(currentCharacter, observed) : [];
  const byId = new Map(projection.map(item => [item.id, item]));
  for (const symptom of SYMPTOMS) {
    const item = byId.get(symptom.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tuning-symptom";
    button.dataset.tuningItem = symptom.id;
    if (symptom.id === currentItemId) button.dataset.active = "true";
    const text = document.createElement("strong"); text.textContent = symptom.ja;
    const state = document.createElement("span"); state.className = "tuning-symptom-state";
    state.textContent = item ? `現在の状態: ${stateLabel(item.expected_state)}` : "キャラクター未選択";
    state.dataset.runtimeValue = "";
    button.append(text, state);
    host.append(button);
  }
  // The other thirteen are reachable too; the seven above are the ones the
  // Owner is most likely to notice first, not the whole list.
  const more = document.createElement("details"); more.className = "tuning-more";
  const summary = document.createElement("summary"); summary.textContent = `ほかの項目も見る（全${Tuning.TUNING_ITEMS.length}項目）`;
  const list = document.createElement("div"); list.className = "tuning-more-list";
  for (const item of Tuning.TUNING_ITEMS) {
    if (SYMPTOMS.some(symptom => symptom.id === item.id)) continue;
    const button = document.createElement("button");
    button.type = "button"; button.className = "tuning-symptom compact"; button.dataset.tuningItem = item.id;
    const text = document.createElement("strong"); text.textContent = item.symptom; text.dataset.runtimeValue = "";
    button.append(text); list.append(button);
  }
  more.append(summary, list); host.append(more);
}

function renderDetail(itemId) {
  const host = $("tuning-detail");
  if (!host) return;
  host.replaceChildren();
  if (!itemId) {
    const hint = document.createElement("p"); hint.className = "tuning-hint";
    hint.textContent = "気になる症状を選ぶと、現在の状態と推奨される調整を表示します。";
    host.append(hint); return;
  }
  if (!currentCharacter) {
    const hint = document.createElement("p"); hint.className = "tuning-hint";
    hint.textContent = "先にキャラクターを選択してください。";
    host.append(hint); return;
  }

  const item = Tuning.itemById(itemId);
  const projected = Tuning.projectAll(currentCharacter, observed).find(row => row.id === itemId);
  const recommendation = Tuning.recommend(itemId, "DOWN", currentCharacter);

  const title = document.createElement("h4");
  title.textContent = `${item.symptom}`;
  const filed = document.createElement("p"); filed.className = "tuning-filed";
  filed.textContent = `${item.id} · ${item.name}`;

  const dl = document.createElement("dl"); dl.className = "tuning-facts";
  // Expected is what the Character says. The Trainer's observation and the difference from it are not shown
  // since the Trainer left the screens (β.9); the actual responses are checked on the AI platform.
  row(dl, "現在の状態（Character の期待）", stateLabel(projected.expected_state));
  row(dl, "推奨変更", recommendation.change);
  row(dl, "期待効果", recommendation.expected_effect);
  row(dl, "副作用", recommendation.side_effects, "caution");
  row(dl, "職種による違い", recommendation.profession_dependency);
  if (item.tuning_up_if_legitimate) row(dl, "上げてよい場合", item.tuning_up_if_legitimate);

  // T10 and T15 are protections. Saying "raise it to HIGH" would turn an
  // integrity requirement into a taste, so the screen says so instead.
  const protection = document.createElement("p"); protection.className = "tuning-protection";
  if (item.state_model === "PROTECTION") {
    protection.textContent = "この項目は「守る／守れていない」で見るもので、強さを上げ下げする設定ではありません。";
  }

  // The SAKU half names real fields. The AMU half is shown as AMU's, not as a
  // Character change, because it is not one.
  const saku = document.createElement("div"); saku.className = "tuning-lane"; saku.dataset.lane = "SAKU";
  const sakuTitle = document.createElement("h5"); sakuTitle.textContent = "[SAKU] Character として設定する内容";
  const sakuText = document.createElement("p"); sakuText.textContent = recommendation.saku.guidance; sakuText.dataset.runtimeValue = "";
  const fields = document.createElement("ul"); fields.className = "tuning-fields";
  for (const field of recommendation.saku.fields) { const li = document.createElement("li"); li.textContent = field; fields.append(li); }
  saku.append(sakuTitle, sakuText, fields);

  const lanes = [saku];
  if (recommendation.amu) {
    const amu = document.createElement("div"); amu.className = "tuning-lane"; amu.dataset.lane = "AMU";
    const amuTitle = document.createElement("h5"); amuTitle.textContent = "[AMU] AMU で設定する内容";
    const amuText = document.createElement("p"); amuText.textContent = recommendation.amu.guidance; amuText.dataset.runtimeValue = "";
    const note = document.createElement("p"); note.className = "tuning-hint"; note.textContent = "これは Character の変更ではありません。ここでは適用しません。";
    amu.append(amuTitle, amuText, note); lanes.push(amu);
  }

  // Write it, see the difference, then decide. Preview never stores anything.
  const editor = document.createElement("div"); editor.className = "tuning-editor";
  const label = document.createElement("label");
  label.textContent = "追記する内容（この文言がそのまま Character に入ります）";
  const select = document.createElement("select"); select.id = "tuning-field";
  for (const field of recommendation.saku.fields) { const option = document.createElement("option"); option.value = field; option.textContent = field; select.append(option); }
  const input = document.createElement("textarea"); input.id = "tuning-value"; input.rows = 2;
  // 結果 420 ①②: the example of the chosen symptom and field (refreshExample); Tab on the empty input puts it in.
  const tabHint = document.createElement("p"); tabHint.id = "tuning-example-hint"; tabHint.className = "tuning-hint"; tabHint.hidden = true;
  tabHint.textContent = TUNING_EXAMPLE_WORDS.tabHint.ja;
  const noText = document.createElement("p"); noText.id = "tuning-example-none"; noText.className = "tuning-hint"; noText.setAttribute("role", "note"); noText.hidden = true;
  noText.textContent = TUNING_EXAMPLE_WORDS.noText.ja;
  const actions = document.createElement("div"); actions.className = "actions";
  const preview = document.createElement("button"); preview.type = "button"; preview.id = "tuning-preview"; preview.textContent = "Before / After を見る";
  // L12 (Owner 結果 364): the button opens ② with this content; nothing changes until ② saves (D-1〜D-3, T-9).
  const apply = document.createElement("button"); apply.type = "button"; apply.id = "tuning-apply"; apply.className = "primary"; apply.textContent = "この内容でキャラクター編集を開く";
  apply.disabled = true;
  actions.append(preview, apply);
  if (sampleSubject) {
    const sample = document.createElement("span"); sample.id = "tuning-sample-note"; sample.className = "tuning-hint"; sample.setAttribute("role", "note");
    sample.textContent = "見本（サンプル）のキャラクターは読むだけで、調整を適用できません。自分のキャラクターは「新規作成」から作れます。";
    apply.setAttribute("aria-describedby", "tuning-sample-note");
    actions.append(sample);
  }
  const note = document.createElement("p"); note.id = "tuning-apply-note"; note.className = "tuning-hint"; note.hidden = sampleSubject;
  note.textContent = "押すと「②キャラクター編集」に移り、この内容が入力欄に入ります。保存するまで、キャラクターは変わりません。";
  label.append(select, input);
  editor.append(label, tabHint, noText, actions, note);

  const diff = document.createElement("div"); diff.className = "tuning-diff"; diff.id = "tuning-diff"; diff.hidden = true;
  const status = document.createElement("p"); status.className = "tuning-status"; status.id = "tuning-status"; status.hidden = true;

  host.append(title, filed, dl, ...(item.state_model === "PROTECTION" ? [protection] : []), ...lanes, editor, diff, status);
  refreshExample();
}

// 結果 420 ①: the example and how the chosen field takes a text. A field that cannot take one (NONE) says so; its button
// opens ② without a change (統括 2026-10-24), where ③ moves to that field.
function currentExample() {
  const select = $("tuning-field");
  return select ? exampleFor(currentItemId, select.value, window.SAKU_DESKTOP_I18N?.getLocale?.() || "ja-JP") : { kind: "UNKNOWN", text: "" };
}
function refreshExample() {
  const input = $("tuning-value");
  if (!input) return;
  const example = currentExample();
  const none = example.kind === "NONE";
  input.placeholder = example.text;
  input.dataset.example = example.text;
  input.disabled = none;
  if (none) input.value = "";
  $("tuning-preview").disabled = none;
  $("tuning-example-hint").hidden = none || !example.text;
  $("tuning-example-none").hidden = !none;
  $("tuning-diff").hidden = true;
  $("tuning-apply").disabled = sampleSubject || !none;
}

function showDiff(entries) {
  const preview = Tuning.previewApply(currentCharacter, currentItemId, entries);
  const host = $("tuning-diff");
  host.replaceChildren();
  host.hidden = false;
  if (!preview.ok) {
    const message = document.createElement("p"); message.textContent = `プレビューできません（${preview.code}）`;
    host.append(message); return false;
  }
  const table = document.createElement("table"); table.className = "tuning-diff-table";
  const head = document.createElement("thead");
  head.innerHTML = "<tr><th>項目</th><th>Before</th><th>After</th></tr>";
  const body = document.createElement("tbody");
  for (const change of preview.diff) {
    const tr = document.createElement("tr");
    for (const value of [change.field, Array.isArray(change.before) ? change.before.join(" / ") || "（なし）" : String(change.before ?? "（なし）"), Array.isArray(change.after) ? change.after.join(" / ") : String(change.after)]) {
      const td = document.createElement("td"); td.textContent = value; td.dataset.runtimeValue = ""; tr.append(td);
    }
    body.append(tr);
  }
  table.append(head, body);
  host.append(table);
  // D-7: the button turns on only when something would change (an equal value set again is no change).
  return preview.diff.some(change => change.result === "APPENDED" || (change.result === "SET" && JSON.stringify(change.before) !== JSON.stringify(change.after)));
}

export function wire() {
  const symptoms = $("tuning-symptoms");
  if (!symptoms) return;
  symptoms.addEventListener("click", event => {
    const button = event.target.closest("[data-tuning-item]");
    if (!button) return;
    currentItemId = button.dataset.tuningItem;
    renderSymptoms();
    renderDetail(currentItemId);
  });
  const detail = $("tuning-detail");
  detail.addEventListener("change", event => { if (event.target.id === "tuning-field") refreshExample(); });
  // 結果 420 ②: Tab on the empty input puts the example in, as it is (no 「例：」); otherwise Tab and Shift+Tab move on.
  detail.addEventListener("keydown", event => {
    if (event.target.id !== "tuning-value") return;
    const input = event.target;
    if (!tabFills({ key: event.key, shiftKey: event.shiftKey, value: input.value, example: input.dataset.example })) return;
    event.preventDefault();
    input.value = input.dataset.example;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  window.addEventListener("saku-ui-locale-changed", () => refreshExample());
  detail.addEventListener("click", event => {
    if (event.target.id === "tuning-preview") {
      const field = $("tuning-field").value;
      const value = $("tuning-value").value.trim();
      const status = $("tuning-status");
      if (!value) { status.hidden = false; status.textContent = "追記する内容を入力してください。"; return; }
      // Apply stays closed until a preview has been seen.
      $("tuning-apply").disabled = !showDiff([{ field, value }]) || sampleSubject;
      status.hidden = true;
      return;
    }
    if (event.target.id === "tuning-apply") {
      const field = $("tuning-field").value;
      const value = $("tuning-value").value.trim();
      const status = $("tuning-status");
      if (sampleSubject) return;
      // NONE: nothing is written here; ② opens on the row's own Character at that field (open_only).
      if (currentExample().kind === "NONE") {
        if (typeof onApply !== "function") return;
        $("tuning-apply").disabled = true;
        void Promise.resolve(onApply(structuredClone(currentCharacter), { item_id: currentItemId, field, diff: [], openOnly: true })).then(outcome => {
          if (outcome && outcome.ok === false) { status.hidden = false; status.textContent = `適用できません（${outcome.code}）`; $("tuning-apply").disabled = false; }
        });
        return;
      }
      if (!value) return;
      const result = Tuning.applyRecommendation(currentCharacter, currentItemId, [{ field, value }], { confirmed: true });
      if (!result.applied) { status.hidden = false; status.textContent = `適用できません（${result.code}）`; return; }
      const before = Unified.sentinelViolations(result.character).length + Unified.runtimeValueViolations(result.character).length;
      if (before > 0) { status.hidden = false; status.textContent = "分類ラベルや実行時の値は Character に保存できません。"; return; }
      if (typeof onApply !== "function") return;
      // The page checks the tuned Character against the adopted Schema and opens ② (L12 D-10, D-2). It writes nothing here.
      $("tuning-apply").disabled = true;
      void Promise.resolve(onApply(result.character, { item_id: currentItemId, field, diff: result.diff })).then(outcome => {
        if (outcome && outcome.ok === false) {
          const words = window.SAKU_DESKTOP_I18N?.format ? window.SAKU_DESKTOP_I18N.format("この欄（{field}）には、決まった値か決まった形のものしか入らないため、この文では適用できません。キャラクターは変えていません。", { field }) : "この欄（{field}）には、決まった値か決まった形のものしか入らないため、この文では適用できません。キャラクターは変えていません。".replace("{field}", field);
          status.hidden = false; status.textContent = outcome.code === "TUNING_SCHEMA_REFUSED" ? `${words}（${outcome.code}）` : `適用できません（${outcome.code}）`;
          $("tuning-apply").disabled = false;
        }
      });
    }
  });
}

export function selectedItemId() { return currentItemId; }
