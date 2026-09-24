import { catalogFacets, compareCharacters, filterCatalog, packageSummary, parseViewerPayload, viewerCopy } from "./viewer.mjs";
import * as ActiveSaku from "../tools/unified-v1/active-saku.mjs";
import * as Library from "../tools/unified-v1/character-library.mjs";
import * as WorkspaceState from "../tools/unified-v1/workspace-state.mjs";
import { parseCharacterText, YamlLiteError } from "../tools/unified-v1/yaml-lite.mjs";
import { admit, checkManifestBinding, classify, labelFor, UNKNOWN } from "../tools/unified-v1/character-schema.mjs";
import { formatValidationIssue, loadAdoptedSchema } from "../tools/v1/adopted-schema-validator.mjs";
import { FIELDS as SEMANTIC_FIELDS } from "../tools/v1/semantic-registry.mjs";
import { OPERATION_CLASS_TEXT, assessPackSignatures, assessReturnSignature, compareReturnWithLibrary, packEntryMeta, packVerification, returnEntryMeta, returnRelationText, returnVerification, signatureStateText } from "../tools/unified-v1/character-pack-intake.mjs";
import { presentationTokens, absentAxes } from "../tools/unified-v1/axis-renderer.mjs";
import { diagnose as diagnoseLocators, repairLocators } from "../tools/unified-v1/locator-repair.mjs";
import { mountScreenHelp } from "../tools/unified-v1/screen-help.mjs";
import { HANDOFF_FORMAT, characterPromptText, loadBaseLayer, platformLaunchText } from "../tools/unified-v1/platform-prompt.mjs";
import { ECHO_CHECK_LABEL, ECHO_REQUEST, buildDirectiveLookup, compareEchoedDirectives, glossaryFallbackText } from "../tools/unified-v1/directive-glossary.mjs";
import { BASE_DIRECTIVES_UNUSABLE, handoffOptions } from "../tools/unified-v1/handoff-context.mjs";
import * as TuningUI from "./tuning-ui.mjs";
import * as Tuning from "../tools/unified-v1/tuning/tuning-projection.mjs";

const $ = id => document.getElementById(id);
const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
let viewerRecords = [];
let libraryEntries = [];
let latestBatch = "";
let selectedViewerId = "";
let currentImportResult = null;
let catalogView = "gallery";
const compareSelection = new Set();
let currentRecovery = null;
let latestRevisionEntryIds = new Set();

function storeBoundCharacter(payloadKey, characterOrPayload) {
  const payload = typeof characterOrPayload === "string" ? characterOrPayload : JSON.stringify(structuredClone(characterOrPayload));
  const character = JSON.parse(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) { hash ^= payload.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  const bindingKey = payloadKey === "saku.desktop.pendingTrainerCharacter" ? "saku.desktop.pendingTrainerCharacterBinding" : "saku.desktop.pendingCharacterBinding";
  localStorage.setItem(payloadKey, payload);
  localStorage.setItem(bindingKey, JSON.stringify({
    character_id: character?.identity?.character_id || "",
    // The receiving screen compares this with the payload's own value, so a
    // substitute here made every Character without a revision fail its own
    // binding and arrive as a blank form.
    character_revision: String(character?.identity?.character_revision ?? ""),
    content_digest: (hash >>> 0).toString(16).padStart(8, "0"),
  }));
}

const locale = () => window.SAKU_DESKTOP_I18N?.getLocale() || "ja-JP";
const copy = () => viewerCopy(locale());
const revealShell = () => { window.__SAKU_DESKTOP_BOOTED = true; window.clearTimeout(window.__SAKU_DESKTOP_BOOT_FALLBACK); document.documentElement.classList.remove("boot-pending"); };

function renderRecovery() {
  const panel = $("host-recovery");
  if (!currentRecovery) { panel.hidden = true; return; }
  const english = locale() === "en-US";
  const messages = {
    workspace: english ? "Select or create a Workspace, then retry the Package import." : "Workspaceを選択または作成してから、Packageの読み込みを再試行してください。",
    package: english ? "Select the Package again, or use Help to check compatibility, format, and hash requirements." : "Packageを選び直すか、Helpで互換性・形式・hash要件を確認してください。",
    host: english ? "Check the app status, then retry. Help remains available without changing security settings." : "アプリの状態を確認してから再試行してください。Security設定を変更せずHelpを確認できます。",
  };
  $("host-recovery-message").textContent = `${messages[currentRecovery.kind] || messages.host}${currentRecovery.detail ? ` (${currentRecovery.detail})` : ""}`;
  panel.hidden = false;
}
function showRecovery(kind, detail = "") { currentRecovery = { kind, detail }; renderRecovery(); }
function clearRecovery() { currentRecovery = null; renderRecovery(); }

function setStatus(target, code, reason, kind = "info") {
  target.className = `status ${kind}`; target.replaceChildren();
  const strong = document.createElement("strong"); strong.textContent = code;
  target.append(strong);
  // A Character name must not be translated and the sentence beside it must be.
  // Holding both in one text node meant neither happened, so the sentence stayed
  // Japanese in English mode. Pass an array to keep them in separate nodes:
  // {data: ...} is Character content, a plain string is product copy.
  for (const part of (Array.isArray(reason) ? reason : [reason])) {
    const span = document.createElement("span");
    if (part && typeof part === "object" && part.data !== undefined) {
      span.textContent = part.data;
      span.dataset.runtimeValue = "";
    } else {
      span.textContent = String(part);
    }
    target.append(span);
  }
}
const showStatus = (code, reason, kind = "info") => setStatus($("host-status"), code, reason, kind);
const showViewerStatus = (code, reason, kind = "info") => setStatus($("viewer-status"), code, reason, kind);

function setNativeEnabled(enabled) {
  for (const id of ["choose-workspace", "viewer-import-package", "viewer-import-file", "host-retry-workspace", "host-retry-import"]) { const control = $(id); if (control) control.disabled = !enabled; }
  $("drop-zone").toggleAttribute("hidden", !enabled);
}

function localizePlaceholders() {
  const english = locale() === "en-US";
  for (const id of ["workspace-path", "workspace-path-detail"]) if (["未選択", "Not selected"].includes($(id).textContent)) $(id).textContent = english ? "Not selected" : "未選択";
  for (const id of ["install-path", "config-path", "log-path", "cache-path"]) if (["確認中", "Checking"].includes($(id).textContent)) $(id).textContent = english ? "Checking" : "確認中";
}

let workspaceReady = false;

// Wording for the workspace-scoped list (D-20260923-workspace-scoped-library).
// Japanese approved: ライター&SNS 様式チェック 2026-09-24（Wi-t_Site 7ffbaa0, site-content/manuals/reviews/2026-09-24_saku-builder-5groups-wording-check.md）.
// English: 英語翻訳チーム 2026-09-24（ライター&SNS 経由、Wi-t_Site bb7c84d, `SAKU-verify/saku-speedtest-workspace-M_EN.json`）.
export const WORKSPACE_WORDING_APPROVED = true;
export const WORKSPACE_WORDING_JA = Object.freeze({
  discardDraft: "編集中の内容が保存されていません。破棄して Workspace を切り替えますか？",
  readOnly: "この Workspace は別のウィンドウで開かれています。このウィンドウでは変更を保存しません。編集は、先に開いたウィンドウで行ってください。",
  writeFailed: "Workspace に書き込めませんでした。保存先の空き容量とアクセス権を確認してください。",
});
export const WORKSPACE_WORDING_EN = Object.freeze({
  discardDraft: "Your edits have not been saved. Discard them and switch the Workspace?",
  readOnly: "This Workspace is open in another window. Changes are not saved in this window. Make your edits in the window that opened it first.",
  writeFailed: "The Workspace could not be written. Check the free space and the access rights of the save location.",
});
const workspaceWording = key => (locale() === "en-US" ? WORKSPACE_WORDING_EN : WORKSPACE_WORDING_JA)[key];

function showWorkspaceBinding(result) {
  if (result.status === "READ_ONLY") {
    setNativeEnabled(false);
    showStatus("WORKSPACE_READ_ONLY", workspaceWording("readOnly"), "warning");
    return true;
  }
  if (result.status === "FAILED") { showWriteFailed(result.reason); return true; }
  return false;
}
// A write the workspace refused (or could not take) is said, not swallowed.
window.addEventListener("saku-workspace-state-error", event => showWriteFailed(event.detail?.error));
// The sentence says what to check; the host's technical reason is not user
// language, so it rides in the title attribute (ライター&SNS 2026-09-24 §5).
function showWriteFailed(reason) {
  showStatus("WORKSPACE_STATE_WRITE_FAILED", workspaceWording("writeFailed"), "error");
  const host = $("host-status"); if (host) host.title = String(reason || "");
}

function renderState(state) {
  const workspace = state.workspace || "未選択";
  $("workspace-path").textContent = workspace; $("workspace-path-detail").textContent = workspace;
  $("install-path").textContent = state.install_dir; $("config-path").textContent = state.config_dir; $("log-path").textContent = state.log_dir; $("cache-path").textContent = state.cache_dir;
  workspaceReady = !state.first_run;
  if (state.first_run) { showStatus("WORKSPACE_REQUIRED", "最初にWorkspaceを選択または作成してください。", "warning"); showRecovery("workspace"); }
  else clearRecovery();
  renderHomeGuidance(workspace);
}

// Three states, in the order the Owner moves through them. Each one names the
// single next thing to do, so the home screen is never just a status report.
function renderHomeGuidance(workspace) {
  if (!workspaceReady) return;
  // A read-only window keeps saying so: the guidance would replace that notice.
  if (WorkspaceState.isReadOnly()) return;
  const subject = ActiveSaku.summary();
  if (!subject) { showStatus("CHARACTER_REQUIRED", "「01 キャラクターを選択する」からキャラクターを選択してください。", "info"); return; }
  const name = subject.identity.display_name || subject.identity.character_id || "選択中のキャラクター";
  showStatus("CHARACTER_SELECTED", [{ data: name }, " — キャラクターの編集やトレーニングを選択してください。"], "success");
}

async function refreshState() {
  if (!invoke) { revealShell(); setNativeEnabled(false); showStatus("DESKTOP_HOST_REQUIRED", "この画面はbrowser previewです。Workspace選択とnative Package importはSAKUアプリで利用できます。", "warning"); showRecovery("host"); return; }
  try {
    const state = await invoke("get_runtime_state");
    // The working copy is made the open workspace's before anything is shown.
    const bound = await WorkspaceState.bindAtStartup(state);
    window.__saku_workspace_state_bound = bound;
    renderState(state); revealShell();
    // The views were drawn at load from the working copy as it was; draw them
    // again from what the binding left there (a restore or migration changes it),
    // and only then say how the binding went, so nothing drawn replaces that.
    renderImportHistory(); renderLibrary(); renderActiveSaku();
    showWorkspaceBinding(bound);
  } catch (error) { revealShell(); showStatus("HOST_STATE_FAILED", String(error), "error"); showRecovery("host", String(error)); }
}

async function applyStartupRoute() {
  if (!invoke) return false;
  try { if (await invoke("get_startup_route") === "GETTING_STARTED") { location.replace("./help/getting-started.html"); return true; } }
  catch (error) { showStatus("STARTUP_ROUTE_FAILED", String(error), "error"); }
  return false;
}

// Pick the folder, ask about an unsaved draft, then switch: the list, the
// import history and the selected Character become the new workspace's.
async function chooseWorkspace() {
  const result = await WorkspaceState.switchWorkspace({ confirm: () => window.confirm(workspaceWording("discardDraft")) });
  if (result.status === "SWITCHED") {
    renderState(result.runtime);
    renderImportHistory(); renderLibrary(); renderActiveSaku();
    showWorkspaceBinding({ status: result.adopted });
    return;
  }
  if (result.status === "KEPT_DRAFT") return;   // the Owner chose to stay with the draft
  if (showWorkspaceBinding(result)) return;
  const message = String(result.reason || result.status);
  showStatus(result.status === "CANCELLED" ? "WORKSPACE_SELECTION_CANCELLED" : "WORKSPACE_SELECTION_FAILED", message, result.status === "CANCELLED" ? "warning" : "error"); showRecovery("workspace", message);
}

function availabilityLabel(value) {
  const labels = copy();
  return value === "AVAILABLE" ? labels.available : value === "UNAVAILABLE" ? labels.unavailable : value === "LOCKED" ? labels.locked : labels.unverified;
}

// Nothing imported since the app started (β.7 hands-on F5, 2026-09-24): the
// panel listed UNKNOWN six times and an English reason. Approved: ライター&SNS
// 様式チェック 2026-09-24 (Wi-t_Site 59b31dd). English: 英語翻訳チーム via ライター&SNS 2026-09-24（Wi-t_Site 922d0b9, SAKU-verify/saku-beta7-findings-O_EN.json）.
export const PACKAGE_EMPTY_EN = "No Package has been imported since the app started. Select a row in the import history to show the result from that time.";
export const PACKAGE_EMPTY_JA = "アプリを起動してから、まだ Package を取り込んでいません。取り込み履歴の行を選ぶと、そのときの結果を表示します。";
function packageFields(summary) {
  const labels = copy();
  if (summary.status === "UNKNOWN" && summary.code === "NOT_PROVIDED") {
    const dl = $("viewer-package-fields"); dl.replaceChildren();
    const note = document.createElement("p"); note.className = "small"; note.dataset.packageEmpty = ""; note.textContent = locale() === "en-US" ? PACKAGE_EMPTY_EN : PACKAGE_EMPTY_JA;
    dl.append(note); return;
  }
  const values = [[labels.status, summary.status], [labels.product, summary.product], [labels.version, summary.version], [labels.compatibility, summary.compatibility], [labels.hash, summary.payload_hash], [labels.reason, `${summary.code}: ${summary.reason}`]];
  const dl = $("viewer-package-fields"); dl.replaceChildren();
  for (const [label, value] of values) { const row = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; dd.dataset.runtimeValue = ""; row.append(dt, dd); dl.append(row); }
}

function addDetailRow(dl, label, value, runtime = true) {
  const row = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value;
  if (runtime) dd.dataset.runtimeValue = ""; row.append(dt, dd); dl.append(row);
}

function handoffUrl(record, target) {
  const id = encodeURIComponent(record.character_id || record.id);
  // "UNKNOWN" is this screen's word for "the Character does not carry one"; the
  // route compares against the payload, which carries an empty value instead.
  const revision = encodeURIComponent(record.revision && record.revision !== "UNKNOWN" ? record.revision : "");
  if (target === "trainer") return `./tools/saku-trainer.html?desktop=viewer&character_id=${id}&character_revision=${revision}&source=viewer`;
  if (target === "review") return `./tools/saku-trainer.html?desktop=review-results&character_id=${id}&character_revision=${revision}&source=viewer`;
  // Authoring returns to the V1-baseline Builder, the same surface TOP entry 04
  // and 新規作成 already use. The legacy Unified V1 Builder is not an authoring
  // destination for the active contract and is not reachable from here.
  return `./tools/saku-builder.html?desktop=viewer-copy&character_id=${id}&character_revision=${revision}&source=viewer`;
}

function importRecovery(code, reason) {
  if (code === "MANIFEST_SCHEMA_ID_MISSING") {
    return `${reason} このPackageは内容からSchemaを推測せず拒否しました。Source Ownerから、Active Unified Schema identityと変換来歴をmanifestへ結び付けたReplacement Packageを取得してください。`;
  }
  if (code === "PAYLOAD_SCHEMA_NOT_DECLARED" || code === "SCHEMA_NOT_DECLARED") {
    return `${reason} Schema未宣言のCharacterを直接Unified Characterとして扱いません。Legacy Characterの場合はSAKU ConverterとConversion Receiptを経由してください。`;
  }
  if (code === "CONFORMANCE_LOCATOR_MISMATCH") {
    return `${reason} conformance_expectations の locator が requirement_id と別の要件を指しているため、このCharacterは取り込みません（Schema の規則: 参照不一致は fail closed）。Builder側では内容を書き換えず、作成元／配布元から修正版を入手してください。`;
  }
  if (code === "PACKAGE_FORMAT_UNRECOGNIZED" || code === "PACKAGE_JSON_INVALID") return reason;
  // Two files this route names but never imports: the AMU Character File
  // belongs to AMU Studio; a bare Character JSON/YAML belongs to 個別インポート.
  if (code === "PACKAGE_FORMAT_AMU_CHARACTER_FILE" || code === "PACKAGE_FORMAT_INDIVIDUAL_FILE") return reason;
  if (code === "LOCATOR_REPAIRED") return reason;
  if (String(code || "").startsWith("SAKU_RETURN_")) {
    return `${reason} AMU Studio の「この編集内容を SAKU へ戻す」で作った .saku-return.zip をそのまま（解凍・編集せずに）選んでください。中身が合わない場合は AMU Studio で作り直してください。`;
  }
  if (String(code || "").startsWith("CHARACTER_PACK_")) {
    return `${reason} SAKU Character Pack は ZIP のまま（解凍せずに）選んでください。ファイルが配布元のものと同じかは SHA256SUMS で確認できます。`;
  }
  return reason;
}

function renderV1Detail(record, detail) {
  const title = document.createElement("h3"); title.textContent = record.name; title.dataset.runtimeValue = "";
  const badge = document.createElement("p"); badge.className = "schema-badge"; badge.dataset.schemaKind = "V1_CHARACTER";
  badge.textContent = `${record.schema_label}（${record.schema_id} ${record.schema_version}）`;
  const overview = document.createElement("p"); overview.className = "viewer-summary"; overview.textContent = record.summary; overview.dataset.runtimeValue = "";
  const dl = document.createElement("dl");
  addDetailRow(dl, "役割", record.role);
  addDetailRow(dl, "運用区分", record.category);
  addDetailRow(dl, "1+7構造", record.one_plus_seven, false);
  addDetailRow(dl, "席7の役割", record.seat7_role);
  addDetailRow(dl, "人間席8", record.human_seat);
  addDetailRow(dl, "運営者", record.operator || "未記入");
  addDetailRow(dl, "黒子", record.charback_required === null ? "未記入" : record.charback_required ? "必要" : "不要", false);
  addDetailRow(dl, "第0層", record.expertise);
  addDetailRow(dl, "15軸", record.axes_summary, false);
  addDetailRow(dl, "Schema", `${record.technical.schema_id} ${record.technical.schema_version}`, false);
  // Trainer and the Unified V1 editor read the other schema. Offering them here
  // would hand v1 to a screen that cannot read it, so they are stated as
  // unavailable rather than shown and left to fail.
  const note = document.createElement("p"); note.className = "schema-note";
  note.textContent = "この Character は v1 Schema です。Unified V1 の Trainer / Builder では開けません。";
  detail.append(title, badge, overview, dl, note);
}

function renderDetail(record) {
  const labels = copy(); const detail = $("viewer-detail"); detail.replaceChildren(); detail.setAttribute("aria-label", labels.details);
  if (!record) { detail.hidden = true; return; }
  detail.hidden = false;
  if (record.schema_kind === UNKNOWN) {
    const title = document.createElement("h3"); title.textContent = record.name; title.dataset.runtimeValue = "";
    const badge = document.createElement("p"); badge.className = "schema-badge"; badge.dataset.schemaKind = UNKNOWN;
    badge.textContent = "Unsupported Character Schema";
    const why = document.createElement("p"); why.className = "schema-note"; why.textContent = `${record.unsupported_code}: ${record.summary}`;
    const dl = document.createElement("dl");
    addDetailRow(dl, "宣言されたSchema", `${record.technical.schema_id} ${record.technical.schema_version}`, false);
    addDetailRow(dl, "取り込み経路", record.technical.provenance, false);
    const note = document.createElement("p"); note.className = "schema-note";
    note.textContent = "この Character は表示・編集・トレーニングのいずれにも渡せません。一覧から削除できます。";
    detail.append(title, badge, why, dl, note);
    return;
  }
  if (record.schema_kind === "V1_CHARACTER") { renderV1Detail(record, detail); return; }
  const title = document.createElement("h3"); title.textContent = record.name; title.dataset.runtimeValue = "";
  const overview = document.createElement("p"); overview.className = "viewer-summary"; overview.textContent = record.summary; overview.dataset.runtimeValue = "";
  const dl = document.createElement("dl");
  addDetailRow(dl, labels.role, record.role); addDetailRow(dl, labels.category, record.category); addDetailRow(dl, labels.revision, record.revision);
  addDetailRow(dl, labels.availability, availabilityLabel(record.availability), false); addDetailRow(dl, labels.packageState, record.package_state, false);
  if (record.provenance && record.provenance.locator_repair) {
    const lang = locale() === "en-US" ? "en" : "ja";
    const repair = record.provenance.locator_repair;
    addDetailRow(dl, lang === "en" ? "Locator repair" : "locator 修復", lang === "en"
      ? `rev ${repair.from_revision} → ${repair.to_revision}, ${repair.rewritten} locator(s) re-pointed by id, ${repair.repaired_at}`
      : `rev ${repair.from_revision} → ${repair.to_revision}、locator ${repair.rewritten}件を id で再計算、${repair.repaired_at}`, false);
    addDetailRow(dl, lang === "en" ? "Content digest" : "内容 digest", `${String(repair.digest_before || "").slice(0, 16)}… → ${String(repair.digest_after || "").slice(0, 16)}…（本文は不変・locator と revision のみ）`, false);
  } else if (record.provenance && record.provenance.edit_request) {
    const lang = locale() === "en-US" ? "en" : "ja";
    const request = record.provenance.edit_request;
    addDetailRow(dl, lang === "en" ? "Edit request from AMU" : "AMU からの編集依頼", request.note || "", true);
    addDetailRow(dl, lang === "en" ? "Fields to revise" : "依頼フィールド", (request.fields || []).length ? request.fields.join("、") : (lang === "en" ? "not specified" : "指定なし"), false);
    if (request.from_instance) addDetailRow(dl, lang === "en" ? "From Instance" : "元の Instance", `${request.from_instance.amu_instance_ref || ""}${request.from_instance.instance_config_digest ? ` · ${String(request.from_instance.instance_config_digest).slice(0, 23)}…` : ""}`, false);
    addDetailRow(dl, lang === "en" ? "Requested at" : "依頼日時", request.created_at || "", false);
    addDetailRow(dl, lang === "en" ? "Signature" : "署名", signatureStateText(record.provenance.signature_state, lang, record.provenance.publisher_fingerprint), false);
  } else if (record.provenance) {
    const lang = locale() === "en-US" ? "en" : "ja";
    const classText = OPERATION_CLASS_TEXT[record.provenance.operation_class];
    addDetailRow(dl, lang === "en" ? "Operation class" : "運用区分", classText ? classText[lang] : String(record.provenance.operation_class || "UNKNOWN"), false);
    addDetailRow(dl, "Character Pack", `${record.provenance.pack_id} ${record.provenance.pack_version}${record.provenance.catalog_release_version ? ` · ${record.provenance.catalog_release_version}` : ""}`, false);
    addDetailRow(dl, lang === "en" ? "Signature" : "署名", signatureStateText(record.provenance.signature_state, lang, record.provenance.publisher_fingerprint), false);
  }
  addDetailRow(dl, labels.composition, record.one_plus_seven); addDetailRow(dl, labels.expertise, record.expertise); addDetailRow(dl, labels.expected, record.expected_profile);
  const technical = document.createElement("details"); const technicalTitle = document.createElement("summary"); technicalTitle.textContent = labels.technical; const technicalList = document.createElement("dl");
  addDetailRow(technicalList, labels.schema, `${record.technical.schema_id} @ ${record.technical.schema_version}`);
  addDetailRow(technicalList, labels.digest, record.technical.digest); addDetailRow(technicalList, labels.provenance, record.technical.provenance);
  addDetailRow(technicalList, labels.compatibility, record.technical.compatibility, false); addDetailRow(technicalList, labels.verification, record.technical.verification_state, false);
  technical.append(technicalTitle, technicalList);
  // This is the screen for choosing a Character, so it shows what helps you
  // choose: what it is for, what work suits it, what it will not do, and when it
  // hands over to a person. The fifteen axes and the expression rendering belong
  // to authoring and adjustment, not to picking one Character out of many.
  //
  // Every row below comes from the Character itself. Suitability that the
  // Character does not record is not shown and is not guessed.
  const character = record.source_character || {};
  const purpose = character.purpose || {};
  const core = character.character_core || {};
  const seat8 = (character.assistant_composition || {}).seat8 || {};
  const selection = document.createElement("dl");
  selection.className = "selection-info";
  const listRow = (label, value) => {
    const text = Array.isArray(value) ? value.filter(Boolean).join(" / ") : String(value || "").trim();
    if (!text) return;
    addDetailRow(selection, label, text);
  };
  listRow("このキャラクターの目的", purpose.summary);
  listRow("提供する価値", purpose.primary_value);
  listRow("向いている働き方", purpose.work_modes);
  listRow("想定する相手", purpose.target_users);
  listRow("引き受けない仕事", purpose.non_goals);
  listRow("大切にすること", core.values);
  listRow("人間に期待する寄与", seat8.expected_human_contribution);
  const handoffs = (core.human_handoff_conditions || []).map(item => item && item.trigger).filter(Boolean);
  listRow("人間へ渡す場面", handoffs);
  const selectionSection = document.createElement("section");
  selectionSection.className = "selection-info-block";
  const selectionTitle = document.createElement("h4");
  selectionTitle.textContent = "選ぶための情報";
  selectionSection.append(selectionTitle);
  if (selection.children.length) {
    selectionSection.append(selection);
  } else {
    const none = document.createElement("p");
    none.className = "schema-note";
    none.textContent = "このキャラクターは、選ぶ手がかりになる項目をまだ記録していません。";
    selectionSection.append(none);
  }
  const groundNote = document.createElement("p");
  groundNote.className = "schema-note";
  groundNote.textContent = "ここに出るのはキャラクターに書かれている内容だけです。向き不向きを推測して足すことはしません。";
  selectionSection.append(groundNote);

  const actions = document.createElement("div"); actions.className = "actions viewer-handoff";
  const trainer = document.createElement("a"); trainer.className = "button"; trainer.href = handoffUrl(record, "trainer"); trainer.dataset.trainerHandoff = record.id; trainer.textContent = "トレーニングする";
  const platform = document.createElement("button"); platform.type = "button"; platform.className = "button"; platform.dataset.platformFrom = record.id; platform.textContent = "AIプラットフォームで動作確認";
  const builder = document.createElement("button"); builder.type = "button"; builder.className = "primary"; builder.dataset.builderCopy = record.id; builder.textContent = "編集する";
  actions.append(builder, platform, trainer); detail.append(title, overview, dl, selectionSection, technical, actions);
}

function createCompareToggle(record) {
  const label = document.createElement("label"); label.className = "compare-toggle";
  const input = document.createElement("input"); input.type = "checkbox"; input.dataset.compareId = record.id; input.checked = compareSelection.has(record.id); input.setAttribute("aria-label", `${copy().selectCompare}: ${record.name}`);
  const span = document.createElement("span"); span.textContent = "選択"; label.append(input, span); return label;
}

function createCatalogCard(record) {
  const card = document.createElement("article"); card.className = "catalog-card"; card.dataset.availability = record.availability;
  if (record.deleted) card.dataset.deleted = "true";
  if (latestBatch && record.batch === latestBatch) card.dataset.new = "true";
  if (compareSelection.has(record.id)) card.dataset.checked = "true";
  const open = document.createElement("button"); open.type = "button"; open.className = "catalog-open"; open.dataset.openId = record.id;
  const title = document.createElement("strong"); title.textContent = record.deleted ? `${record.name}（削除済み）` : record.name; title.dataset.runtimeValue = "";
  const role = document.createElement("span"); role.className = "catalog-role"; role.textContent = record.role; role.dataset.runtimeValue = "";
  const summary = document.createElement("span"); summary.className = "catalog-summary"; summary.textContent = record.summary; summary.dataset.runtimeValue = "";
  const meta = document.createElement("span"); meta.className = "catalog-meta"; meta.textContent = `${record.category} · ${record.one_plus_seven}`; meta.dataset.runtimeValue = "";
  const schema = document.createElement("span"); schema.className = "catalog-schema"; schema.dataset.schemaKind = record.schema_kind || "UNKNOWN_CHARACTER"; schema.textContent = record.schema_label || "";
  card.dataset.schemaKind = record.schema_kind || "UNKNOWN_CHARACTER";
  open.append(title, role, summary, meta, schema);
  card.append(open, createCompareToggle(record));
  const badges = document.createElement("span"); badges.className = "catalog-badges";
  if (record.latest_revision && !record.deleted) {
    const badge = document.createElement("span"); badge.className = "catalog-badge catalog-latest-badge"; badge.textContent = "最新 revision"; badges.append(badge);
  }
  if (latestBatch && record.batch === latestBatch && !record.deleted) {
    const badge = document.createElement("span"); badge.className = "catalog-badge"; badge.textContent = "新規追加"; badges.append(badge);
  }
  if (badges.children.length) card.append(badges);
  return card;
}

function renderTable(records) {
  const labels = copy();
  const table = document.createElement("table"); table.className = "catalog-table";
  const head = document.createElement("thead"); const headerRow = document.createElement("tr");
  for (const value of [labels.compareColumn, "Character", labels.role, labels.category, labels.revision, labels.availability]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = value; headerRow.append(th); } head.append(headerRow);
  const body = document.createElement("tbody");
  for (const record of records) {
    const row = document.createElement("tr");
    const compareCell = document.createElement("td"); compareCell.append(createCompareToggle(record));
    const nameCell = document.createElement("td"); const open = document.createElement("button"); open.type = "button"; open.className = "table-open"; open.dataset.openId = record.id; open.textContent = record.name; open.dataset.runtimeValue = ""; nameCell.append(open);
    const values = [record.role, record.category, record.revision, availabilityLabel(record.availability)];
    row.append(compareCell, nameCell, ...values.map(value => { const td = document.createElement("td"); td.textContent = value; td.dataset.runtimeValue = ""; return td; })); body.append(row);
  }
  table.append(head, body); return table;
}

function catalogOptions() {
  return { query: $("catalog-search").value, availability: $("catalog-availability").value, packageState: $("catalog-package-state").value, category: $("catalog-category").value, workMode: $("catalog-work-mode").value, sort: $("catalog-sort").value };
}

function updateFacetSelect(id, values) {
  const select = $(id); const current = select.value; const all = document.createElement("option"); all.value = "ALL"; all.textContent = copy().all; select.replaceChildren(all);
  for (const value of values) { const option = document.createElement("option"); option.value = value; option.textContent = value; option.dataset.runtimeValue = ""; select.append(option); }
  select.value = values.includes(current) ? current : "ALL";
}

function updateCompareStatus() {
  const labels = copy(); $("compare-selection-status").textContent = labels.selectedCount(compareSelection.size); $("compare-open").disabled = compareSelection.size < 2; $("compare-open").textContent = labels.compare; $("compare-clear").textContent = labels.clear;
}

function renderCatalog() {
  const labels = copy();
  const deletedMode = $("catalog-deleted")?.value || "HIDE";
  const visible = viewerRecords.filter(record => deletedMode === "ONLY" ? record.deleted : deletedMode === "SHOW" ? true : !record.deleted);
  const records = filterCatalog(visible, catalogOptions());
  $("viewer-empty").hidden = viewerRecords.length > 0; $("viewer-catalog").hidden = viewerRecords.length === 0;
  $("catalog-no-results").hidden = records.length > 0 || viewerRecords.length === 0; $("catalog-result-status").textContent = labels.resultCount(records.length);
  const results = $("viewer-results"); results.replaceChildren(); results.className = `catalog-results ${catalogView}`; results.setAttribute("aria-label", labels.characters);
  if (records.length) {
    if (catalogView === "table") results.append(renderTable(records)); else for (const record of records) results.append(createCatalogCard(record));
    if (!records.some(record => record.id === selectedViewerId)) selectedViewerId = records[0].id;
    renderDetail(records.find(record => record.id === selectedViewerId));
  } else renderDetail(null);
  document.querySelectorAll("[data-catalog-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.catalogView === catalogView)));
  updateCompareStatus();
}

function updateFacets() {
  const facets = catalogFacets(viewerRecords); updateFacetSelect("catalog-category", facets.categories); updateFacetSelect("catalog-package-state", facets.package_states); updateFacetSelect("catalog-work-mode", facets.work_modes);
}

function renderComparison() {
  const labels = copy(); const selected = viewerRecords.filter(record => compareSelection.has(record.id)); const rows = compareCharacters(selected); const output = $("compare-output"); output.replaceChildren();
  if (selected.length < 2) { const p = document.createElement("p"); p.textContent = labels.compareNeedsTwo; output.append(p); return; }
  const table = document.createElement("table"); table.className = "compare-table"; const head = document.createElement("thead"); const headRow = document.createElement("tr");
  for (const value of [labels.stateField, ...selected.map(record => record.name)]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = value; if (value !== labels.stateField) th.dataset.runtimeValue = ""; headRow.append(th); } head.append(headRow);
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr"); const label = document.createElement("th"); label.scope = "row"; label.innerHTML = `<span class="compare-state ${row.state.toLowerCase()}">${row.state}</span><span>${row.field}</span>`; tr.append(label);
    row.cells.forEach((cell, index) => { const td = document.createElement("td"); td.textContent = row.field === "axes" && cell.state === "VALUE" ? selected[index].axes_summary : cell.value; td.dataset.runtimeValue = ""; tr.append(td); }); body.append(tr);
  }
  const actions = document.createElement("tr"); const actionLabel = document.createElement("th"); actionLabel.scope = "row"; actionLabel.textContent = labels.handoff; actions.append(actionLabel);
  for (const record of selected) { const td = document.createElement("td"); const group = document.createElement("div"); group.className = "compare-handoff"; const trainer = document.createElement("a"); trainer.href = handoffUrl(record, "trainer"); trainer.dataset.trainerHandoff = record.id; trainer.textContent = labels.test; const review = document.createElement("a"); review.href = handoffUrl(record, "review"); review.dataset.trainerHandoff = record.id; review.textContent = labels.review; const builder = document.createElement("button"); builder.type = "button"; builder.dataset.builderCopy = record.id; builder.textContent = labels.edit; group.append(trainer, review, builder); td.append(group); actions.append(td); } body.append(actions);
  table.append(head, body); output.append(table);
}

// Characters carry no package evidence of their own; the entry records how it
// arrived, so the list can say "verified package" or "file, not package
// verified" instead of implying validation that never happened.
function stateOfEntry(entry) {
  if (entry.draft) return { package_state: "DRAFT", availability: "UNKNOWN" };
  const verification = entry.verification || null;
  if (verification && verification.status === "IMPORTED") return { package_state: verification.code || "IMPORTED", availability: "AVAILABLE" };
  if (entry.source === "FILE") return { package_state: "FILE_NOT_PACKAGE_VERIFIED", availability: "UNKNOWN" };
  return { package_state: verification?.status || "UNVERIFIED", availability: "UNKNOWN" };
}

// v1 has no catalog, no 15 axes and six AI seats rather than seven functions.
// Projecting it through the Unified V1 reader would render those absences as UNKNOWN
// — the Character would look broken when it is simply a different schema — so
// v1 gets its own projection and says NOT_APPLICABLE where the concept does not
// exist. Nothing here renames a seat: seat7 stays the persona guard.
const NOT_APPLICABLE = "この Schema には存在しません";

function v1Record(character) {
  const front = character.front_character || {};
  const assistants = Array.isArray(character.assistants) ? character.assistants : [];
  const aiSeats = assistants.filter(item => item && item.kind === "ai").length;
  const human = assistants.find(item => item && item.kind === "human");
  const guard = assistants.find(item => item && item.key === "seat7_persona_guard");
  return {
    id: front.slug || "",
    name: front.name || "Unnamed Character",
    role: front.role || "UNKNOWN",
    summary: front.persona || front.public_profile || "UNKNOWN",
    category: character.operation_class ? `運用区分 ${character.operation_class}` : "UNKNOWN",
    revision: NOT_APPLICABLE,
    one_plus_seven: `${aiSeats}/6 AI席 + 人間席8`,
    seat7_role: guard ? (guard.name || "seat7_persona_guard") : "NOT_PRESENT",
    axes: [],
    axes_summary: NOT_APPLICABLE,
    expertise: character.layer0_version ? `第0層 ${character.layer0_version}` : NOT_APPLICABLE,
    expected_profile: NOT_APPLICABLE,
    human_seat: human ? (human.scope || human.name || "") : "NOT_PRESENT",
    operator: (character.operator || {}).company || "",
    charback_required: character.charback_policy ? Boolean(character.charback_policy.required) : null,
    technical: {
      schema_id: "SAKU-CHARACTER",
      schema_version: String(character.version || ""),
      digest: "NOT_PROVIDED",
      provenance: character.generated_by || "NOT_PROVIDED",
      compatibility: "V1_CHARACTER",
      verification_state: "V1_CHARACTER",
    },
    source_character: structuredClone(character),
  };
}

// A row that cannot be projected must still be visible. Dropping it silently
// would leave the count saying 66 and the list showing none, and would hide a
// Character the Owner still owns. UNKNOWN is its own state — not v1, not Unified V1,
// not a default — so it gets its own row and its own reason.
function unsupportedRecord(entry, verdict) {
  const character = entry.character || {};
  const name = Library.displayNameOf(character) || (character.front_character || {}).name || "名称不明";
  return {
    id: "", name, role: "Unsupported Character Schema",
    summary: verdict.reason || "この Character の Schema は判定できません。",
    category: "UNSUPPORTED", revision: NOT_APPLICABLE,
    one_plus_seven: NOT_APPLICABLE, axes: [], axes_summary: NOT_APPLICABLE,
    expertise: NOT_APPLICABLE, expected_profile: NOT_APPLICABLE,
    unsupported_code: verdict.code || "SCHEMA_NOT_DECLARED",
    technical: {
      schema_id: verdict.schema_id || "NOT_DECLARED",
      schema_version: verdict.schema_version || "NOT_DECLARED",
      digest: "NOT_PROVIDED", provenance: entry.source || "NOT_PROVIDED",
      compatibility: "UNSUPPORTED", verification_state: "UNSUPPORTED",
    },
    source_character: structuredClone(character),
  };
}

// Rows stored before intake recorded a schema still declare one inside the
// Character itself. Reading that declaration is identification, not inference,
// so it is used — and when there is none, the row becomes unsupported rather
// than disappearing.
function kindOfEntry(entry) {
  const stored = (entry.schema || {}).kind;
  if (stored) return { kind: stored, schema_id: (entry.schema || {}).schema_id || "", schema_version: (entry.schema || {}).schema_version || "" };
  const verdict = classify(entry.character);
  return verdict.supported ? verdict : { kind: UNKNOWN, ...verdict };
}

function recordsFromLibrary(entries) {
  if (!entries.length) return [];
  // Dispatch on the schema each entry was admitted as. There is no shared
  // projection and no fallback: an entry with no supported kind cannot be here,
  // because intake would not have stored it.
  const resolved = new Map(entries.map(entry => [entry.entry_id, kindOfEntry(entry)]));
  const projectedEntries = entries.filter(entry => ["UNIFIED_V1_CHARACTER", "LEGACY_SCHEMA_CHARACTER"].includes(resolved.get(entry.entry_id).kind));
  const projected = projectedEntries.length
    ? parseViewerPayload(JSON.stringify({ characters: projectedEntries.map(entry => entry.character) }), {})
    : { records: [] };
  const projectedByEntry = new Map(projectedEntries.map((entry, index) => [entry.entry_id, projected.records[index]]));

  return entries.map(entry => {
    const verdict = resolved.get(entry.entry_id);
    const kind = verdict.kind;
    const base = ["UNIFIED_V1_CHARACTER", "LEGACY_SCHEMA_CHARACTER"].includes(kind) ? projectedByEntry.get(entry.entry_id)
      : kind === "V1_CHARACTER" ? v1Record(entry.character)
      : unsupportedRecord(entry, verdict);
    if (!base) return null;
    const state = kind === UNKNOWN ? { package_state: "UNSUPPORTED_SCHEMA", availability: "UNAVAILABLE" } : stateOfEntry(entry);
    // The list may legitimately hold two Characters with the same character_id
    // (「両方残す」), so the row is keyed by its entry, not by the content.
    return {
      ...base,
      schema_kind: kind,
      schema_label: labelFor(kind),
      schema_id: verdict.schema_id || "",
      schema_version: verdict.schema_version || "",
      id: entry.entry_id, entry_id: entry.entry_id, character_id: base.id,
      deleted: Boolean(entry.deleted), draft: Boolean(entry.draft),
      batch: entry.batch || "", source: entry.source || "", ...state,
      provenance: entry.provenance || null,
      pack: entry.verification?.pack || null,
    };
  }).filter(Boolean);
}

function renderLibraryCount() {
  const totals = Library.summary();
  const slot = $("library-count");
  if (slot) slot.textContent = totals.total ? `一覧 ${totals.active}件（削除済み ${totals.deleted}件）` : "一覧はまだ空です。Packageインポート・個別インポート・新規作成から追加できます。";
}

function renderLibrary() {
  libraryEntries = Library.list({ includeDeleted: true });
  latestBatch = Library.latestBatch();
  // Saving creates another revision instead of overwriting the source. Mark
  // the newest live entry only when the same character_id has multiple live
  // rows. This is presentation derived from existing timestamps; the Library
  // data model and revision values remain unchanged.
  const revisionGroups = new Map();
  libraryEntries.forEach((entry, index) => {
    if (entry.deleted) return;
    const characterId = String(entry.character?.identity?.character_id || "").trim();
    if (!characterId) return;
    if (!revisionGroups.has(characterId)) revisionGroups.set(characterId, []);
    revisionGroups.get(characterId).push({ entry, index, at: entry.updated_at || entry.added_at || entry.batch || "" });
  });
  latestRevisionEntryIds = new Set([...revisionGroups.values()].filter(group => group.length > 1).map(group =>
    [...group].sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index).at(-1).entry.entry_id));
  viewerRecords = recordsFromLibrary(libraryEntries).map(record => ({ ...record, latest_revision: latestRevisionEntryIds.has(record.entry_id) }));
  for (const id of [...compareSelection]) if (!viewerRecords.some(record => record.id === id)) compareSelection.delete(id);
  if (!viewerRecords.some(record => record.id === selectedViewerId)) selectedViewerId = viewerRecords[0]?.id || "";
  packageFields(packageSummary(currentImportResult || {}));
  updateFacets(); renderCatalog(); renderLibraryCount(); renderActiveSaku();
  // The screen adds and removes rows; it never edits a Character's content.
  // Editing happens in the Builder, which is a different screen on purpose.
  const totals = Library.summary();
  if (totals.active) showViewerStatus("LIBRARY_READY", `一覧 ${totals.active}件 — この画面でCharacter dataは変更しません（Viewer data mutation: 0）`, "success");
}

/** The per-Character glossaries the host carried out of the pack, keyed by character_id. */
function directivesOf(payloadJson) {
  let payload;
  try { payload = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson; }
  catch { return null; }
  return payload && typeof payload.directives === "object" && payload.directives ? payload.directives : null;
}

function charactersOf(payloadJson) {
  let payload;
  try { payload = typeof payloadJson === "string" ? JSON.parse(payloadJson) : payloadJson; }
  catch { return []; }
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === "object");
  if (payload && Array.isArray(payload.characters)) return payload.characters.filter(item => item && typeof item === "object");
  return payload && typeof payload === "object" ? [payload] : [];
}

// The Owner decides what happens to a name that is already in the list. Two
// outcomes, because those are the two the spec asks for; cancelling the prompt
// keeps both rather than dropping the import on the floor.
function resolveConflicts(characters) {
  const conflicts = Library.nameConflicts(characters);
  if (!conflicts.length) return { onConflict: "KEEP_BOTH", conflicts };
  const names = [...new Set(conflicts.map(item => item.name))];
  const shown = names.slice(0, 5).join("、") + (names.length > 5 ? ` ほか${names.length - 5}件` : "");
  const replace = window.confirm(`同じ名前のキャラクターが既にあります: ${shown}\n\nOK = 置き換える / キャンセル = 両方残す`);
  return { onConflict: replace ? "REPLACE" : "KEEP_BOTH", conflicts };
}

// Package integrity is settled before this point. Whether the Character inside
// is a schema this application can read is a separate question, asked here, and
// nothing that fails it reaches the list.
//
// The question is asked of the adopted schema — the same file, loaded the same
// way, as the edit screen's save (Owner 2026-09-23). If the schema cannot be
// read, the gate refuses every Unified V1 Character instead of falling back to
// the hand checks, and the refusal carries the loader's reason.
async function admitCharacters(characters) {
  const accepted = new Map();   // schema kind -> characters
  const refused = [];
  let schema = null, schemaProblem = "";
  try { schema = await loadAdoptedSchema(); } catch (error) { schemaProblem = String(error?.message || error); }
  const describe = issue => formatValidationIssue(issue, SEMANTIC_FIELDS, locale() === "en-US" ? "en" : "ja");
  for (const [index, character] of characters.entries()) {
    const verdict = admit(character, { schema, describe });
    if (!verdict.accepted && schemaProblem && verdict.code === "ADOPTED_SCHEMA_REQUIRED") verdict.reason = `${verdict.reason} ${schemaProblem}`;
    const name = Library.displayNameOf(character) || `#${index + 1}`;
    if (!verdict.accepted) { refused.push({ name, code: verdict.code, reason: verdict.reason }); continue; }
    const key = JSON.stringify({ kind: verdict.kind, schema_id: verdict.schema_id, schema_version: verdict.schema_version });
    if (!accepted.has(key)) accepted.set(key, []);
    accepted.get(key).push(character);
  }
  return { accepted, refused };
}

function reportRefusals(refused, admittedCount) {
  if (!refused.length) return;
  const shown = refused.slice(0, 3).map(item => `${item.name}（${item.code}）`).join(" / ");
  const more = refused.length > 3 ? ` ほか${refused.length - 3}件` : "";
  showViewerStatus("UNSUPPORTED_CHARACTER_SCHEMA",
    `${refused.length}件は取り込めませんでした: ${shown}${more} — ${importRecovery(refused[0].code, refused[0].reason)}`,
    admittedCount ? "warning" : "error");
}

// ── Durable Character store ──────────────────────────────────────────────────
//
// The Library index is WebView2 Local Storage under %LOCALAPPDATA%, which the
// uninstaller removes when "delete app data" is ticked. Treat it as the working
// index and the workspace as the durable record: every Character that enters
// the Library is mirrored to the workspace, and an empty index is rebuilt from
// there rather than being reported as "you have no Characters".

const tauriInvoke = () => window.__TAURI__?.core?.invoke || null;

async function mirrorToWorkspace(characters) {
  const invoke = tauriInvoke();
  if (!invoke || !characters?.length) return { mirrored: 0, failed: 0 };
  let mirrored = 0, failed = 0;
  for (const character of characters) {
    const id = String(character?.identity?.character_id || "").trim();
    if (!id) { failed += 1; continue; }
    try {
      await invoke("save_workspace_character", { characterId: id, characterJson: JSON.stringify(character) });
      mirrored += 1;
    } catch { failed += 1; }
  }
  return { mirrored, failed };
}

function charactersFromArtifact(artifact) {
  let parsed = null;
  try { parsed = JSON.parse(artifact.payload_json); } catch { return []; }
  if (Array.isArray(parsed)) return parsed.filter(item => item && typeof item === "object");
  if (parsed && Array.isArray(parsed.characters)) return parsed.characters.filter(item => item && typeof item === "object");
  return parsed && typeof parsed === "object" ? [parsed] : [];
}

// Rebuild only when the index is empty. A populated index is the Owner's
// current working state and is never overwritten from disk behind their back.
async function reconstructFromWorkspace() {
  const invoke = tauriInvoke();
  if (!invoke) return { status: "NO_HOST", recovered: 0 };
  if (Library.summary().total) return { status: "INDEX_NOT_EMPTY", recovered: 0 };
  let durable = null;
  try { durable = await invoke("list_workspace_characters"); }
  catch (error) { return { status: "SCAN_FAILED", recovered: 0, reason: String(error) }; }
  if (durable.status === "NO_WORKSPACE") return { status: "NO_WORKSPACE", recovered: 0 };
  // Something may have entered the list while the workspace was being read (an
  // import the Owner started right away). The list is no longer empty, so there
  // is nothing to rebuild — and nothing to report as empty.
  if (Library.summary().total) return { status: "INDEX_NOT_EMPTY", recovered: 0 };
  const characters = [];
  for (const artifact of durable.artifacts || []) characters.push(...charactersFromArtifact(artifact));
  if (!characters.length) return { status: "NOTHING_DURABLE", recovered: 0, workspace: durable.workspace };
  const { accepted } = await admitCharacters(characters);
  if (Library.summary().total) return { status: "INDEX_NOT_EMPTY", recovered: 0 };
  let recovered = 0;
  for (const [key, group] of accepted) {
    const outcome = Library.importCharacters(group, "WORKSPACE_RECOVERY", { onConflict: "KEEP_BOTH", verification: null, schema: JSON.parse(key) });
    if (outcome.saved) recovered += outcome.added;
  }
  renderLibrary();
  return { status: recovered ? "RECOVERED" : "NOTHING_RECOVERED", recovered, workspace: durable.workspace };
}

async function addToLibrary(characters, source, verification, entryMeta = null) {
  if (!characters.length) { showViewerStatus("NOTHING_TO_IMPORT", "読み込めるCharacterがファイルに含まれていません。", "warning"); return null; }
  const { accepted, refused } = await admitCharacters(characters);
  let added = 0, replaced = 0, failure = "";
  for (const [key, group] of accepted) {
    const schema = JSON.parse(key);
    const { onConflict } = resolveConflicts(group);
    const outcome = Library.importCharacters(group, source, { onConflict, verification, schema, entryMeta });
    if (!outcome.saved) { failure = outcome.reason; continue; }
    added += outcome.added; replaced += outcome.replaced;
  }
  renderLibrary();
  if (failure) { showViewerStatus("LIBRARY_SAVE_FAILED", `一覧に保存できませんでした: ${failure}`, "error"); return { added, replaced, saved: false, refused }; }
  if (refused.length) { reportRefusals(refused, added); return { added, replaced, saved: true, refused }; }
  const detail = replaced ? `${added}件を追加、${replaced}件を置き換えました。` : `${added}件を一覧に追加しました。`;
  showViewerStatus("CHARACTERS_ADDED", detail, "success");
  mirrorToWorkspace(characters);
  return { added, replaced, saved: true, refused };
}

// A one-shot handoff left over from an older flow is adopted into the list once,
// so an Owner who imported before this screen existed does not lose it.
async function adoptPendingHandoff() {
  if (Library.summary().total) return;
  const pending = localStorage.getItem("saku.desktop.pendingPack") || localStorage.getItem("saku.desktop.pendingCharacter");
  const characters = pending ? charactersOf(pending) : [];
  // A handoff is intake like any other: it passes the same schema gate, so a
  // Character left behind by an older flow cannot enter unclassified.
  const adopt = async list => {
    const { accepted } = await admitCharacters(list);
    for (const [key, group] of accepted) Library.importCharacters(group, "HANDOFF", { onConflict: "KEEP_BOTH", schema: JSON.parse(key) });
    return [...accepted.values()].reduce((total, group) => total + group.length, 0);
  };
  if (characters.length && await adopt(characters)) return;
  // A handoff is consumed once, so an Owner who already has a subject would
  // otherwise arrive at an empty list and wonder where it went.
  const subject = ActiveSaku.getWorkingCharacter();
  if (subject) await adopt([subject]);
}

function showTuning(record) {
  $("home-content").hidden = true;
  $("viewer-panel").hidden = true;
  $("tuning-panel").hidden = false;
  setStatus($("tuning-subject"), "TUNING_SUBJECT", `${record.name} — 推奨は適用するまでCharacterを変更しません。`, "info");
  TuningUI.setSubject(record.source_character, {
    observedStates: readObservedStates(record),
    apply: (character, detail) => {
      // An explicit Apply produces a Character revision through the same
      // workspace path as any other edit; Trainer never writes here.
      ActiveSaku.setActive(character, { source: "tuning-apply" });
      const entry = libraryEntries.find(item => item.entry_id === record.entry_id);
      if (entry) Library.update(entry.entry_id, character);
      mirrorToWorkspace([character]);
      renderLibrary();
      setStatus($("tuning-subject"), "TUNING_APPLIED", `${record.name} — ${detail.item_id} の内容を適用しました。`, "success");
    },
  });
  $("tuning-back").focus();
}

// Observed states come from a recorded Trainer review, never from this screen.
function readObservedStates(record) {
  try {
    const raw = localStorage.getItem("saku.trainer.observedTuning");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const key = record.character_id || record.id;
    return (parsed && parsed[key]) || {};
  } catch { return {}; }
}

async function showViewer() {
  $("home-content").hidden = true; $("viewer-panel").hidden = false;
  renderLibrary(); $("viewer-back").focus();
  // Both of these fill an empty list, and both ask "is the list empty?" first.
  // The handoff is adopted before the workspace is read; run together, each
  // would see an empty list and the same Character would be imported twice.
  await adoptPendingHandoff(); renderLibrary();
  // An empty index after an uninstall that removed app data is a recoverable
  // state, not an empty Library. Rebuild from the workspace and say so.
  const result = await reconstructFromWorkspace();
  if (result.status === "RECOVERED") {
    showViewerStatus("LIBRARY_RECOVERED_FROM_WORKSPACE", `${result.recovered}件をworkspaceから復元しました（${result.workspace}）。Character dataは変更していません。`, "success");
  } else if (result.status === "NOTHING_DURABLE") {
    showViewerStatus("LIBRARY_EMPTY_NO_DURABLE_COPY", `一覧は空です。workspace（${result.workspace}）にも復元できるCharacterがありません。`, "info");
  }
}
function renderActiveSaku() {
  const host = $("selected-character");
  if (!host) return;
  const summary = ActiveSaku.summary();
  const clear = $("active-saku-clear");
  if (!summary) {
    $("selected-character-name").textContent = "未選択";
    $("active-saku-state").textContent = "";
    clear.hidden = true;
    host.dataset.selected = "false"; host.dataset.dirty = "false";
  } else {
    $("selected-character-name").textContent = summary.identity.display_name || summary.identity.character_id || "未命名";
    $("active-saku-state").textContent = summary.dirty ? "編集中 · 未保存の変更あり" : "保存済み";
    clear.hidden = false;
    host.dataset.selected = "true"; host.dataset.dirty = String(summary.dirty);
  }
  renderHomeGuidance();
}
// TOP returns to the workspace and keeps the subject. 「最初から」 is the
// separate operation that leaves it.
// ── Screen 01 accordion ─────────────────────────────────────────────────────
function wireAccordion() {
  for (const toggle of document.querySelectorAll(".acc-toggle")) {
    toggle.addEventListener("click", () => {
      const body = document.getElementById(toggle.getAttribute("aria-controls"));
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      if (body) body.hidden = open;
    });
  }
}

// ── Import history ──────────────────────────────────────────────────────────
//
// The Owner needs to see what was imported and from where, and to bring any one
// of those imports back into the status area. The history records the import,
// never the Character content, so re-reading it cannot alter a Character.

const IMPORT_HISTORY_KEY = "saku.workspace.importHistory";

function readImportHistory() {
  try { const raw = JSON.parse(localStorage.getItem(IMPORT_HISTORY_KEY) || "[]"); return Array.isArray(raw) ? raw : []; }
  catch { return []; }
}

function recordImport(entry) {
  // The history belongs to the open workspace; a window that does not hold it writes nothing.
  if (WorkspaceState.isReadOnly()) return;
  const history = readImportHistory();
  history.unshift({ ...entry, at: new Date().toISOString() });
  try { localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); WorkspaceState.noteChanged(IMPORT_HISTORY_KEY); } catch { /* full or blocked */ }
  renderImportHistory();
}

function renderImportHistory() {
  const host = $("import-history");
  if (!host) return;
  const history = readImportHistory();
  host.replaceChildren();
  if (!history.length) {
    const note = document.createElement("p");
    note.className = "acc-note";
    note.textContent = "まだ読み込み履歴はありません。";
    host.append(note);
    return;
  }
  const list = document.createElement("ul");
  list.className = "import-history-list";
  history.forEach((entry, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.importHistory = String(index);
    const kind = document.createElement("strong");
    kind.textContent = entry.kind === "PACKAGE" ? "キャラクターパッケージ" : "個別キャラクター";
    const path = document.createElement("span");
    path.className = "import-history-path";
    path.textContent = entry.source_path || "(パス不明)";
    path.dataset.runtimeValue = "";
    const when = document.createElement("span");
    when.className = "import-history-when";
    when.textContent = formatLocalTimestamp(entry.at);
    when.dataset.runtimeValue = "";
    button.append(kind, path, when);
    item.append(button);
    list.append(item);
  });
  host.append(list);
}

function formatLocalTimestamp(value) {
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return String(value);
  const targetLocale = locale() === "en-US" ? "en-US" : "ja-JP";
  return new Intl.DateTimeFormat(targetLocale, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

function showImportHistoryEntry(index) {
  const entry = readImportHistory()[index];
  if (!entry) return;
  // The history keeps the same summary shape the status area renders, so a
  // stored row can be shown again without reconstructing anything.
  if (entry.fields && typeof entry.fields === "object" && !Array.isArray(entry.fields)) packageFields(entry.fields);
  showViewerStatus("IMPORT_HISTORY_SELECTED", [{ data: entry.source_path || "(パス不明)" }, " — この読み込みの内容を表示しています。"], "info");
}

// ── Occupation CSV ──────────────────────────────────────────────────────────
//
// Occupation information is PART of a Character, never the whole of it, and it
// is not an authority, a credential or a permission. Only the columns with an
// authorised Canonical destination are handed to the Builder as applicable; the
// rest travel as context, visibly, so nothing is silently dropped or invented.

const OCCUPATION_KEY = "saku.desktop.pendingOccupation";
let occupationRecords = [];
let occupationSelected = -1;
let occupationSource = "";

function parseOccupationCsv(text) {
  const rows = [];
  let row = [], cur = "", quoted = false;
  const QUOTE = String.fromCharCode(34);
  const NEWLINE = String.fromCharCode(10);
  const RETURN = String.fromCharCode(13);
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === QUOTE) {
        if (text[index + 1] === QUOTE) { cur += QUOTE; index += 1; }
        else quoted = false;
      } else cur += character;
    } else if (character === QUOTE) quoted = true;
    else if (character === ",") { row.push(cur); cur = ""; }
    else if (character === NEWLINE) { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (character !== RETURN) cur += character;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const cleaned = rows.filter(item => item.some(cell => String(cell).trim()));
  if (!cleaned.length) return [];
  const first = cleaned[0].map(cell => String(cell).trim());
  // The generator writes one occupation as path,value pairs. A sheet of several
  // occupations arrives with a header row instead. Support both.
  const pathShaped = first[0] === "path" || cleaned.some(item => String(item[0] || "").startsWith("role_source."));
  if (pathShaped) {
    const record = {};
    for (const item of cleaned) {
      const key = String(item[0] || "").trim();
      if (!key.startsWith("role_source.")) continue;
      record[key.slice("role_source.".length)] = String(item[1] || "").trim();
    }
    return Object.keys(record).length ? [record] : [];
  }
  const header = first.map(name => name.replace("role_source.", ""));
  return cleaned.slice(1).map(item => {
    const record = {};
    header.forEach((name, column) => { record[name] = String(item[column] || "").trim(); });
    return record;
  }).filter(record => Object.values(record).some(Boolean));
}

// The only occupation column with an authorised Canonical destination. The
// adopted schema has no occupation fields at all; character_role is the role the
// Character holds, which is what 職能名 states. Everything else travels as
// context. Licences never map: an occupation is not a credential.
const OCCUPATION_CANONICAL_MAP = Object.freeze([
  { column: "role", path: "character_core.character_role", status: "DIRECT" },
]);
const OCCUPATION_NEVER_MAPPED = Object.freeze(["license_jp", "license_world"]);

function occupationMapping(record) {
  const mapped = [];
  const unmapped = [];
  for (const [column, value] of Object.entries(record || {})) {
    if (!String(value).trim()) continue;
    const entry = OCCUPATION_CANONICAL_MAP.find(item => item.column === column);
    if (entry) mapped.push({ column, path: entry.path, value, status: entry.status });
    else unmapped.push({ column, value, status: OCCUPATION_NEVER_MAPPED.includes(column) ? "NOT_MAPPABLE" : "NON_CANONICAL_CONTEXT" });
  }
  return { mapped, unmapped };
}

function renderOccupation() {
  const wrap = $("occupation-table-wrap");
  const rows = $("occupation-rows");
  const source = $("occupation-source");
  if (!wrap || !rows) return;
  rows.replaceChildren();
  wrap.hidden = occupationRecords.length === 0;
  if (source) {
    source.hidden = !occupationSource;
    source.textContent = occupationSource ? "読み込み元: " + occupationSource : "";
  }
  occupationRecords.forEach((record, index) => {
    const tr = document.createElement("tr");
    const pick = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.occupationRow = String(index);
    button.textContent = index === occupationSelected ? "選択中" : "選択";
    button.setAttribute("aria-pressed", String(index === occupationSelected));
    pick.append(button);
    tr.append(pick);
    for (const key of ["category", "role", "work_summary"]) {
      const td = document.createElement("td");
      td.textContent = record[key] || "";
      td.dataset.runtimeValue = "";
      tr.append(td);
    }
    rows.append(tr);
  });
  renderOccupationPairing();
}

function renderOccupationPairing() {
  const host = $("occupation-pairing");
  const fields = $("occupation-pairing-fields");
  if (!host || !fields) return;
  const record = occupationRecords[occupationSelected];
  const subject = ActiveSaku.summary();
  host.hidden = !(record && subject);
  if (host.hidden) return;
  fields.replaceChildren();
  const add = (label, value, runtime = true) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd"); dd.textContent = value;
    if (runtime) dd.dataset.runtimeValue = "";
    row.append(dt, dd); fields.append(row);
  };
  add("キャラクター", subject.identity.display_name || subject.identity.character_id || "(名称未設定)");
  add("職能情報", record.role || "(職能名なし)");
  add("読み込み元", occupationSource || "(パス不明)");
  const mapping = occupationMapping(record);
  add("反映される項目", mapping.mapped.map(item => item.column + " → " + item.path).join(" / ") || "なし", false);
  add("反映されない項目", mapping.unmapped.map(item => item.column).join(" / ") || "なし", false);
}

async function loadOccupationFile(file) {
  if (!file) return;
  let text = "";
  try { text = await file.text(); }
  catch (error) { setStatus($("occupation-status"), "OCCUPATION_READ_FAILED", String(error), "error"); return; }
  const records = parseOccupationCsv(text);
  if (!records.length) {
    setStatus($("occupation-status"), "OCCUPATION_CSV_EMPTY", "職能情報が読み取れませんでした。列の形式を確認してください。", "error");
    return;
  }
  occupationRecords = records;
  occupationSelected = records.length === 1 ? 0 : -1;
  occupationSource = file.name || "";
  renderOccupation();
  setStatus($("occupation-status"), "OCCUPATION_CSV_LOADED", [{ data: String(records.length) }, "件の職能情報を読み込みました。キャラクターと組み合わせる行を選んでください。"], "success");
}

function clearOccupation() {
  occupationRecords = []; occupationSelected = -1; occupationSource = "";
  try { localStorage.removeItem(OCCUPATION_KEY); } catch { /* blocked */ }
  renderOccupation();
  setStatus($("occupation-status"), "OCCUPATION_READY", "職能CSVはまだ読み込まれていません。", "info");
}

// Character and occupation travel to the Builder as two named things. They are
// never merged here: the Builder decides what may be applied, and asks first.
function handOffCharacterAndOccupation() {
  const record = occupationRecords[occupationSelected];
  const subject = ActiveSaku.getWorkingCharacter();
  if (!record || !subject) return;
  const mapping = occupationMapping(record);
  try {
    localStorage.setItem(OCCUPATION_KEY, JSON.stringify({
      source_path: occupationSource,
      record,
      mapped: mapping.mapped,
      unmapped: mapping.unmapped,
      character_id: subject.identity ? subject.identity.character_id : "",
    }));
  } catch { /* blocked */ }
  storeBoundCharacter("saku.desktop.pendingCharacter", subject);
  location.href = "./tools/saku-builder.html?desktop=character-and-occupation";
}

function showHome() { $("viewer-panel").hidden = true; $("tuning-panel").hidden = true; $("platform-panel").hidden = true; $("home-content").hidden = false; renderActiveSaku(); $("view-characters").focus(); }

// ── 03 AIプラットホームでキャラクターを動作 ────────────────────────────────
//
// SAKU is a Character definition, not a runtime. This screen hands the Owner
// the exact text to paste into whichever AI they use, and says plainly what a
// general AI service does not give them. Copying never changes the Character.

// The Library entry for the Character 03 is about. Its provenance carries the
// two things that are not in the Character: the operation class, which comes
// from the signed catalog (統制卓 2026-09-23 ②), and the pack's own glossary.
// 03 hands over the operation class's directive lines so that 「使う前に人の確認」
// reaches the external AI too. This is not the regulated passthrough, which
// stays closed on this path.
function libraryEntryForPlatform() {
  const id = String(ActiveSaku.getActive()?.character?.identity?.character_id || "").trim();
  if (!id) return null;
  return libraryEntries.find(item => !item.deleted && String(item?.character?.identity?.character_id || "") === id) || null;
}

function activeCharacterForPlatform() {
  const active = ActiveSaku.getActive();
  // getActive() returns the session envelope. The prompt and JSON/YAML choices
  // must receive its Character payload, not the envelope itself. Passing the
  // envelope exposed only envelope.identity to the prompt formatter and left
  // purpose/core/expression nested under envelope.character.
  return active?.character && typeof active.character === "object" ? active.character : null;
}

// The 03 prompt hands each selected value over with its Directive Glossary
// lines (L2); the glossary is the field guide, loaded once per page. Until it
// is loaded (or if it cannot be) the text says so instead of passing bare
// tokens quietly.
let platformDirectives = null;
let platformGlossaryDigest = null;
let platformDirectivesLoad = null;
function ensurePlatformDirectives() {
  if (platformDirectivesLoad) return platformDirectivesLoad;
  platformDirectivesLoad = (async () => {
    for (const url of ["./help/saku-field-guide.data.json", "../manual/saku-field-guide.data.json"]) {
      try { const response = await fetch(url); if (!response.ok) continue; const guide = await response.json(); platformDirectives = buildDirectiveLookup(guide); platformGlossaryDigest = guide?.directive_glossary?.sha256 || null; break; }
      catch { /* try the next location */ }
    }
    if (platformDirectives && !$("platform-panel")?.hidden) renderPlatform();
    return platformDirectives;
  })();
  return platformDirectivesLoad;
}

// The shared base layer B, read once per page and checked against the digest the
// product was built with. If it does not check out, 03 hands over nothing at all
// (設計 2026-09-23 §9) — so the screen has to say why, plainly.
let baseLayer = null;
let baseLayerProblems = [];
let baseLayerLoad = null;
function ensureBaseLayer() {
  if (baseLayerLoad) return baseLayerLoad;
  baseLayerLoad = (async () => {
    const read = async name => {
      for (const url of [`./help/${name}`, `../desktop/resources/${name}`]) {
        try { const response = await fetch(url); if (response.ok) return await response.text(); } catch { /* try the next location */ }
      }
      return null;
    };
    const result = await loadBaseLayer(read);
    baseLayer = result.layer;
    baseLayerProblems = result.problems;
    if (!$("platform-panel")?.hidden) renderPlatform();
    return result;
  })();
  return baseLayerLoad;
}

function renderPlatform() {
  ensurePlatformDirectives();
  ensureBaseLayer();
  const character = activeCharacterForPlatform();
  const nameSlot = $("platform-active");
  const launch = $("platform-launch");
  if (!character) {
    setStatus($("platform-subject"), "CHARACTER_REQUIRED", "「01 キャラクターを選択する」からキャラクターを選んでください。", "warning");
    if (nameSlot) nameSlot.textContent = "未選択";
    if (launch) launch.value = "";
    // Nothing to copy: the button says so by not being pressable (it used to accept the click and do nothing).
    if ($("platform-copy")) $("platform-copy").disabled = true;
    return;
  }
  const name = String(character?.identity?.display_name || "").trim() || "(display_name 未設定)";
  const revision = String(character?.identity?.character_revision || "").trim() || "revision 未設定";
  setStatus($("platform-subject"), "PLATFORM_SUBJECT", [{ data: name }, " — 貼り付けてもCharacterは変更されません。"], "info");
  if (nameSlot) nameSlot.textContent = `${name}（${revision}）`;
  const { options, glossaryProblems } = handoffOptions({ baseLayer, directives: platformDirectives, glossaryDigest: platformGlossaryDigest }, libraryEntryForPlatform());
  if (launch) launch.value = platformLaunchText(character, HANDOFF_FORMAT, options);
  // A base layer that does not check out yields no text (fail closed): nothing to copy then either.
  if ($("platform-copy")) $("platform-copy").disabled = !launch?.value;
  if (baseLayerProblems.length) {
    // Nothing is handed over in this state, so the message says that first.
    // The wording is the approved one, shared with 04 Trainer (handoff-context.mjs).
    setStatus($("platform-subject"), "BASE_DIRECTIVES_UNUSABLE", [
      ...BASE_DIRECTIVES_UNUSABLE,
    ].join(""), "error");
    $("platform-subject").title = baseLayerProblems.join(" / ");
  }
  if (glossaryProblems.length) {
    // Warning, not error: nothing is lost and the paste still works (ライター&SNS 2026-09-23).
    setStatus($("platform-subject"), "GLOSSARY_FROM_APP", glossaryFallbackText(glossaryProblems), "warning");
    $("platform-subject").title = glossaryProblems.map(problem => problem.detail).join(" / ");   // the internal reason, for support
  }
  renderEchoRequest();
  if (platformHelp) platformHelp.refresh();
}

// U4: the shared help tree beside 03. The platform guide explains each step.
// The step headings carried a 「同期」 button as well; Owner removed it on
// 2026-09-23 as a duplicate — the pane is already beside the steps, and the
// tree's 「入力欄へ」 still walks back to the step it explains.
let platformHelp = null;
async function ensurePlatformHelp() {
  if (platformHelp !== null) return platformHelp;
  platformHelp = false;   // one attempt per page load
  const aside = $("platform-help"); if (!aside) return false;
  const help = await mountScreenHelp({ aside, guideUrls: ["./help/platform-guide.data.json", "../manual/platform-guide.data.json"], locale: locale() === "en-US" ? "en" : "ja" });
  if (!help) return false;
  platformHelp = help; help.fromHash();
  window.__saku_platform_help = help;
  return help;
}

function showPlatform() {
  $("home-content").hidden = true;
  $("viewer-panel").hidden = true;
  $("tuning-panel").hidden = true;
  $("platform-panel").hidden = false;
  renderPlatform();
  $("platform-back").focus();
  void ensurePlatformHelp();
}

function handOffImport(result) {
  currentImportResult = result;
  const summary = packageSummary(result);
  packageFields(summary);
  // Record the import itself, not the Character. Re-reading history can show
  // what happened without touching any Character.
  recordImport({
    kind: "PACKAGE",
    source_path: result.source_path || result.imported_path || "",
    status: result.status,
    code: result.code || "",
    fields: summary,
  });
  if (result.status !== "IMPORTED") {
    const reason = importRecovery(result.code || result.status, result.reason);
    showStatus(result.code || result.status, reason, result.status === "NOT_CONFIGURED" ? "warning" : "error");
    showRecovery(result.status === "NOT_CONFIGURED" ? "workspace" : "package", result.reason || result.status);
    showViewerStatus(result.code || result.status, `${reason || "Package is not available."} Packageを選び直すかHelpを確認してください。`, "error");
    return;
  }
  // The host binds manifest to payload too; re-asking here keeps the browser
  // path honest and means the binding is testable without the native host.
  const characters = charactersOf(result.payload_json);
  const binding = checkManifestBinding(result.manifest, characters);
  if (!binding.ok) {
    showStatus(binding.code, binding.reason, "error");
    showViewerStatus(binding.code, `${binding.reason} 取り込みは行いませんでした。`, "error");
    showRecovery("package", binding.code);
    return;
  }
  if (result.pack) { handOffCharacterPack(result, characters, binding); return; }
  if (result.saku_return) { handOffSakuReturn(result, characters); return; }
  // Since 2026-09-21 the host imports SAKU Character Packs only (the two-file
  // Builder package is retired), so an IMPORTED result without a pack summary
  // is a host/page mismatch, not a Character to adopt.
  showStatus("PACKAGE_RESULT_UNEXPECTED", "取り込み結果に Character Pack の情報がありません。アプリを更新してから読み込み直してください。", "error");
  showViewerStatus("PACKAGE_RESULT_UNEXPECTED", "取り込み結果に Character Pack の情報がありません。取り込みは行いませんでした。", "error");
}

// A sold SAKU Character Pack. The host recomputed every digest; the signatures
// are checked here with the pinned publisher keys. FAIL refuses the whole pack.
// DIGEST_ONLY (no Ed25519 in this WebView) imports, but the label says so.
/** The sentence the host writes about signatures (main.rs import_character_pack). */
const HOST_SIGNATURE_NOT_VERIFIED = "署名（Ed25519）はこのホストでは未検証です。";

async function handOffCharacterPack(result, characters, binding) {
  const pack = result.pack;
  const signatures = await assessPackSignatures(pack);
  if (signatures.signature_state === "FAIL") {
    const reason = `署名検証に失敗したため取り込みませんでした: ${signatures.detail}`;
    showStatus("CHARACTER_PACK_SIGNATURE_INVALID", reason, "error");
    showViewerStatus("CHARACTER_PACK_SIGNATURE_INVALID", `${reason} 配布元から入手し直してください。`, "error");
    showRecovery("package", "CHARACTER_PACK_SIGNATURE_INVALID");
    recordImport({ kind: "PACKAGE", source_path: result.source_path || "", status: "REFUSED", code: "CHARACTER_PACK_SIGNATURE_INVALID", fields: [] });
    return;
  }
  // The host does not verify signatures and says so in its reason; this page
  // just did. Leaving the host's sentence in the 理由 row put 「未検証」 beside
  // 「署名検証 PASS」 in the detail row (β.6 hands-on, 2026-09-23). The row now
  // carries what the page verified, in the detail row's own words.
  if (currentImportResult === result && typeof result.reason === "string" && result.reason.includes(HOST_SIGNATURE_NOT_VERIFIED)) {
    const verified = signatureStateText(signatures.signature_state, "ja", signatures.fingerprints?.[pack.pack_publisher_key_id] || null);
    currentImportResult = { ...result, reason: result.reason.replace(HOST_SIGNATURE_NOT_VERIFIED, `${verified}。`) };
    packageFields(packageSummary(currentImportResult));
  }
  const verification = packVerification(result, signatures);
  const meta = packEntryMeta(pack, signatures, directivesOf(result.payload_json));
  const classes = [...meta.values()].reduce((acc, item) => { acc[item.operation_class] = (acc[item.operation_class] || 0) + 1; return acc; }, {});
  const classText = Object.entries(classes).sort().map(([cls, count]) => `${cls}:${count}`).join(" / ");
  clearRecovery();
  showStatus("CHARACTER_PACK_IMPORTED", `${pack.pack_id} ${pack.pack_version}: ${pack.character_count}体（運用区分 ${classText}）。${signatureStateText(signatures.signature_state, "ja", signatures.fingerprints?.[pack.pack_publisher_key_id] || null)}。保存先: ${result.imported_path}`, signatures.signature_state === "PASS" ? "success" : "warning");
  await addToLibrary(characters, "PACKAGE", verification, character => meta.get(String(character?.identity?.character_id || "")) || null);
  void binding;
}

// AMU Studio 「この編集内容を SAKU へ戻す」. The host cross-checked request,
// character.json, the signed manifest and the enclosed archive; the signature
// is checked here with the pinned keys (FAIL refuses). The Character enters the
// list once with the edit request as its provenance, and the status says how it
// relates to what the list already holds. Nothing is written to the workspace
// by the host; the Library mirror behaves as for any other Character.
async function handOffSakuReturn(result, characters) {
  const ret = result.saku_return;
  const signatures = await assessReturnSignature(ret);
  if (signatures.signature_state === "FAIL") {
    const reason = `署名検証に失敗したため取り込みませんでした: ${signatures.detail}`;
    showStatus("SAKU_RETURN_SIGNATURE_INVALID", reason, "error");
    showViewerStatus("SAKU_RETURN_SIGNATURE_INVALID", `${reason} AMU Studio で作り直すか、元のパックを取り込み直してください。`, "error");
    showRecovery("package", "SAKU_RETURN_SIGNATURE_INVALID");
    recordImport({ kind: "PACKAGE", source_path: result.source_path || "", status: "REFUSED", code: "SAKU_RETURN_SIGNATURE_INVALID", fields: [] });
    return;
  }
  const comparison = compareReturnWithLibrary(ret, Library.list());
  const lang = locale() === "en-US" ? "en" : "ja";
  const verification = returnVerification(result, signatures);
  const meta = returnEntryMeta(ret, signatures, comparison);
  clearRecovery();
  const noteHead = String(ret.note || "").replace(/\s+/g, " ").slice(0, 80) + (String(ret.note || "").length > 80 ? "…" : "");
  const fieldsText = (ret.fields || []).length ? `対象: ${ret.fields.join("、")}` : "対象フィールドの指定なし";
  showStatus("SAKU_RETURN_IMPORTED", `AMU Studio からの戻し: ${ret.display_name || ret.character_id} rev ${ret.character_revision}。編集依頼: ${noteHead}（${fieldsText}）。${returnRelationText(comparison, ret, lang)} ${signatureStateText(signatures.signature_state, lang, signatures.fingerprints?.[ret.publisher_key_id] || null)}。workspace には保存していません。`, signatures.signature_state === "PASS" ? "success" : "warning");
  const outcome = await addToLibrary(characters, "SAKU_RETURN", verification, () => meta);
  if (outcome?.saved && outcome.added + outcome.replaced > 0) {
    showViewerStatus("SAKU_RETURN_IMPORTED", `${ret.display_name || ret.character_id}（rev ${ret.character_revision}）を一覧に追加しました（workspace には保存していません）。${returnRelationText(comparison, ret, lang)} 詳細の「AMU からの編集依頼」を確認してから編集してください。`, "success");
  }
}

// Individual import: a Character authored as JSON or YAML, with no package
// around it. It is added and labelled as such — never as package-verified.
async function importCharacterFiles(files) {
  const characters = []; const failures = []; const notes = [];
  for (const file of files) {
    try {
      const parsed = parseCharacterText(await file.text(), file.name);
      const items = Array.isArray(parsed.value) ? parsed.value : (parsed.value && Array.isArray(parsed.value.characters) ? parsed.value.characters : [parsed.value]);
      const usable = items.filter(item => item && typeof item === "object");
      if (!usable.length) { failures.push(`${file.name}: Characterが見つかりません`); continue; }
      characters.push(...usable);
      for (const warning of parsed.warnings || []) notes.push(`${file.name}: ${warning.message}`);
    } catch (error) {
      failures.push(`${file.name}: ${error instanceof YamlLiteError ? error.message : String(error && error.message || error)}`);
    }
  }
  // A Character whose only fault is a shifted locator (saved by the edit screen
  // before 2026-09-22) is not imported as it is; it is set aside and the
  // screen offers the one repair that is safe: re-pointing locators by id.
  // Only on this route — a pack's character.json is signed and is never edited here.
  // (Classified by the locator check itself, not by the schema verdict:
  // admitCharacters stays the one gate, and a repaired Character still passes through it.)
  const repairable = characters.filter(character => diagnoseLocators(character).repairable);
  const clean = characters.filter(character => !repairable.includes(character));
  const outcome = clean.length ? await addToLibrary(clean, "FILE", null) : null;
  // The record says what the verdict was. A file that was read but whose
  // Characters were all refused is REFUSED, not IMPORTED (β.6: a refused file
  // sat in the history looking exactly like a successful one).
  const entered = outcome ? outcome.added + outcome.replaced : 0;
  const refusal = outcome?.refused?.[0]?.code || (repairable.length ? "CONFORMANCE_LOCATOR_MISMATCH" : "");
  for (const file of files) {
    recordImport({ kind: "FILE", source_path: file.name || "", status: entered ? "IMPORTED" : (refusal ? "REFUSED" : "FAILED"), code: entered ? "" : refusal, fields: [] });
  }
  if (repairable.length) offerLocatorRepair(repairable, files.map(file => file.name || "").join(", "));
  // Say what did not work as plainly as what did.
  if (failures.length) showViewerStatus("FILE_IMPORT_FAILED", failures.join(" / "), clean.length ? "warning" : "error");
  else if (notes.length && !repairable.length) showViewerStatus("FILE_IMPORT_WARNING", notes.join(" / "), "warning");
}

// The refusal names each shifted locator, and one button repairs them: every
// `locator` is recomputed from `id == requirement_id`, nothing else changes,
// the revision is bumped, and the repair record travels with the Character
// as provenance. A Character whose requirement_id exists nowhere stays refused.
function offerLocatorRepair(repairable, sourceNames) {
  const lines = repairable.flatMap(character => {
    const name = Library.displayNameOf(character) || String(character?.identity?.character_id || "");
    return diagnoseLocators(character).lines.slice(0, 3).map(line => `${name}: ${line}`);
  });
  showViewerStatus("CONFORMANCE_LOCATOR_MISMATCH", `${repairable.length}件は取り込めませんでした（locator＝参照位置が要件とずれています）: ${lines.join(" / ")}${lines.length < repairable.length * 3 ? "" : " …"} 「locator を修復して読み込む」は requirement_id から参照位置を計算し直すだけで、本文は変えません（修復後は新しい revision になります）。`, "warning");
  const button = document.createElement("button");
  button.type = "button"; button.className = "btn-sm"; button.id = "viewer-repair-locators";
  button.textContent = `locator を修復して読み込む（${repairable.length}件）`;
  button.addEventListener("click", async () => {
    button.disabled = true;
    const repaired = []; const meta = new Map(); const stillRefused = [];
    for (const character of repairable) {
      const outcome = await repairLocators(character, { bumpRevision: true });
      if (outcome.remaining.length) { stillRefused.push(`${Library.displayNameOf(character) || character?.identity?.character_id}: ${outcome.remaining.length}件は requirement_id が見つからず修復できません`); continue; }
      repaired.push(outcome.character);
      meta.set(outcome.character, { source: "FILE_REPAIRED", locator_repair: outcome.record });
    }
    const result = repaired.length ? await addToLibrary(repaired, "FILE_REPAIRED", null, character => meta.get(character) || null) : null;
    recordImport({ kind: "FILE", source_path: sourceNames, status: repaired.length ? "IMPORTED" : "REFUSED", code: repaired.length ? "LOCATOR_REPAIRED" : "CONFORMANCE_LOCATOR_MISMATCH", fields: [] });
    if (result?.saved && repaired.length) {
      const detail = repaired.map(character => `${Library.displayNameOf(character)}（rev ${meta.get(character).locator_repair.from_revision} → ${character.identity.character_revision}、locator ${meta.get(character).locator_repair.rewritten}件）`).join(" / ");
      showViewerStatus("LOCATOR_REPAIRED", `${repaired.length}件の locator を修復して一覧に追加しました: ${detail}。${stillRefused.length ? ` 修復できなかったもの: ${stillRefused.join(" / ")}` : ""} 詳細の「locator 修復」行に記録があります。`, stillRefused.length ? "warning" : "success");
    } else if (stillRefused.length) {
      showViewerStatus("CONFORMANCE_LOCATOR_MISMATCH", stillRefused.join(" / "), "error");
    }
  });
  $("viewer-status").append(button);
}

async function choosePackage() {
  try { handOffImport(await invoke("choose_and_import_package")); }
  catch (error) { const message = String(error); showStatus(message.includes("CANCELLED") ? "PACKAGE_SELECTION_CANCELLED" : "PACKAGE_IMPORT_FAILED", message, message.includes("CANCELLED") ? "warning" : "error"); showRecovery("package", message); }
}
async function importPath(path) { if (!path) { showRecovery("package", "FILE_NOT_PROVIDED"); return; } try { handOffImport(await invoke("import_package_path", { path })); } catch (error) { showStatus("PACKAGE_IMPORT_FAILED", String(error), "error"); showRecovery("package", String(error)); } }

// The editor requires an identity and a revision and fails closed without them.
// Name the missing field here rather than sending the Owner into an opaque
// rejection on the next screen.
function missingForEditing(record) {
  if (!record.character_id) return "character_id";
  if (!record.revision || record.revision === "UNKNOWN") return "character_revision";
  return "";
}

function openBuilderCopy(id) {
  const record = viewerRecords.find(item => item.id === id); if (!record) { showViewerStatus("HANDOFF_SOURCE_NOT_FOUND", "Character could not be opened. Return to the Catalog and select it again.", "error"); return; }
  const missing = missingForEditing(record);
  if (missing) { showViewerStatus("CHARACTER_NOT_EDITABLE", `${record.name} は ${missing} が未設定のため編集画面へ渡せません。取り込んだファイルに ${missing} を追加してください。`, "warning"); return; }
  // The active contract is SAKU_UNIFIED_SCHEMA_V1 and the UI baseline is V1, so
  // editing goes to the V1-baseline Builder. That surface authors the v1
  // migration-source schema, which shares no field path with Unified V1, so it
  // does not fill itself from the handed-off Character: it names what it
  // received and leaves the Character untouched rather than reinterpreting it.
  ActiveSaku.setActive(record.source_character, { source: "library-edit" });
  storeBoundCharacter("saku.desktop.pendingCharacter", record.source_character);
  location.href = handoffUrl(record, "builder");
}

// Choosing a Character is what makes it the subject; every route out of the
// list goes through here so TOP and the Trainer cannot disagree about who is
// selected.
function selectSubject(record, source) {
  if (!record) return false;
  ActiveSaku.setActive(record.source_character, { source });
  renderActiveSaku();
  return true;
}

function openActionsFor(recordId) {
  const record = viewerRecords.find(item => item.id === recordId);
  if (!record) return;
  const dialog = $("character-actions");
  dialog.dataset.entryId = record.id;
  // Two revisions of one Character share a name; the revision tells them apart.
  const revision = record.revision && !["UNKNOWN", NOT_APPLICABLE].includes(record.revision) ? record.revision : "";
  $("character-actions-title").textContent = revision ? `${record.name}（${revision}）` : record.name;
  $("character-actions-summary").textContent = record.summary === "UNKNOWN" ? record.role : record.summary;
  dialog.querySelector('[data-character-action="delete"]').textContent = record.deleted ? "削除を取り消す" : "削除する";
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
}

function closeActions() {
  const dialog = $("character-actions");
  if (typeof dialog.close === "function" && dialog.open) dialog.close(); else dialog.removeAttribute("open");
}

function runCharacterAction(action) {
  const dialog = $("character-actions");
  const record = viewerRecords.find(item => item.id === dialog.dataset.entryId);
  if (!record) { closeActions(); return; }
  if (record.schema_kind === UNKNOWN && action !== "delete") {
    closeActions();
    showViewerStatus("UNSUPPORTED_CHARACTER_SCHEMA",
      `${record.name} は Schema が判定できないため開けません（${record.unsupported_code}）。一覧から削除できます。`, "warning");
    return;
  }
  if (record.schema_kind === "V1_CHARACTER" && (action === "edit" || action === "train")) {
    closeActions();
    showViewerStatus("SCHEMA_ROUTE_UNAVAILABLE",
      `${record.name} は v1 Schema（SAKU-CHARACTER）です。Unified V1 の Builder / Trainer は別 Schema のため開けません。`, "warning");
    return;
  }
  if (action === "view") {
    selectedViewerId = record.id; selectSubject(record, "library-view"); closeActions(); renderCatalog();
    showViewerStatus("CHARACTER_SELECTED", `${record.name} を選択しました。`, "success");
    // The notice sits at the top of the list; bring it into view from wherever the card was.
    $("viewer-status").scrollIntoView({ block: "center" });
    return;
  }
  if (action === "tune") { closeActions(); selectSubject(record, "library-tune"); showTuning(record); return; }
  if (action === "edit") { closeActions(); openBuilderCopy(record.id); return; }
  if (action === "train") {
    selectSubject(record, "library-train");
    storeBoundCharacter("saku.desktop.pendingTrainerCharacter", record.source_character);
    closeActions(); location.href = handoffUrl(record, "trainer"); return;
  }
  if (action === "delete") {
    const outcome = Library.setDeleted([record.id], !record.deleted);
    closeActions(); renderLibrary();
    showViewerStatus(record.deleted ? "CHARACTER_RESTORED" : "CHARACTER_DELETED",
      record.deleted ? `${record.name} を一覧に戻しました。` : `${record.name} を削除しました。「削除済み」フィルタで元に戻せます。`,
      outcome.saved ? "success" : "error");
  }
}

$("choose-workspace").addEventListener("click", chooseWorkspace); $("viewer-import-package").addEventListener("click", choosePackage);
$("host-retry-workspace").addEventListener("click", chooseWorkspace); $("host-retry-import").addEventListener("click", choosePackage);
$("view-characters").addEventListener("click", showViewer); $("viewer-back").addEventListener("click", showHome);
$("tuning-back").addEventListener("click", () => { $("tuning-panel").hidden = true; showViewer(); });
wireAccordion();
renderImportHistory();
document.addEventListener("click", event => {
  const historyRow = event.target.closest("[data-import-history]");
  if (historyRow) { showImportHistoryEntry(Number(historyRow.dataset.importHistory)); return; }
  const platformFrom = event.target.closest("[data-platform-from]");
  if (platformFrom) {
    const record = viewerRecords.find(item => item.id === platformFrom.dataset.platformFrom);
    if (record && selectSubject(record, "library-platform")) showPlatform();
    return;
  }
  const occupationRow = event.target.closest("[data-occupation-row]");
  if (occupationRow) { occupationSelected = Number(occupationRow.dataset.occupationRow); renderOccupation(); }
});
$("occupation-import").addEventListener("click", () => $("occupation-file-input").click());
$("occupation-file-input").addEventListener("change", async event => {
  await loadOccupationFile(event.target.files && event.target.files[0]);
  event.target.value = "";
});
$("occupation-clear").addEventListener("click", clearOccupation);
$("occupation-to-builder").addEventListener("click", handOffCharacterAndOccupation);
$("run-on-ai-platform").addEventListener("click", showPlatform);
$("platform-back").addEventListener("click", showHome);
// 「読み込めたか AI に聞く」 (Owner-approved wording, 2026-09-23). A hand-pasted
// prompt cannot be verified: the AI's answer is its own report, so the result
// never says 「検証」 — it says 「AI 申告値（検証不能）」, as the speed test does.
function echoLocale() { return locale() === "en-US" ? "en" : "ja"; }
function renderEchoRequest() {
  const slot = $("platform-echo-request");
  if (slot) slot.value = ECHO_REQUEST[echoLocale()];
}
/** The directive lines 03 actually handed over, which is what the AI is asked to echo. */
function sentDirectiveLines() {
  const text = $("platform-launch")?.value || "";
  const from = text.indexOf("## Character directives");
  if (from < 0) return [];
  const rest = text.slice(from).split(/\r?\n/);
  return rest.filter(line => /^ {2}(ALWAYS|NEVER|PREFER|IF|HANDOFF WHEN|OUTPUT)\b/.test(line)).map(line => line.trim());
}
function showEchoResult(result) {
  const slot = $("platform-echo-result");
  if (!slot) return;
  slot.hidden = false;
  const english = echoLocale() === "en";
  const label = ECHO_CHECK_LABEL[echoLocale()];
  const complete = result.state === "REPORTED_COMPLETE";
  const body = complete
    ? (english ? "This AI reports that it loaded all of the instructions above. (This is a report, not verification.)" : "この AI は上の指示をすべて読み込んだと申告しています。（申告であって検証ではありません）")
    : (english ? "This AI's report does not include part of the instructions above. Paste them again, or use AMU." : "この AI の申告には、上の指示の一部が含まれていません。貼り直すか、AMU をお使いください。");
  setStatus(slot, label, [" ", body], complete ? "info" : "warning");
  slot.dataset.echoState = result.state;
  slot.title = `sent ${result.sent} / reported ${result.matched}${result.missing.length ? ` / missing ${result.missing.length}` : ""}${result.extra.length ? ` / extra ${result.extra.length}` : ""}`;
}
// The shell's language buttons only translate text nodes; a textarea's value is
// not one, so the request is re-rendered when the shell switches language.
if (typeof MutationObserver === "function") {
  new MutationObserver(() => renderEchoRequest()).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}

$("platform-echo-copy")?.addEventListener("click", async () => {
  const text = $("platform-echo-request")?.value;
  if (!text) return;
  const say = message => { const slot = $("platform-echo-copy-state"); if (slot) slot.textContent = message; };
  try { await navigator.clipboard.writeText(text); say("コピーしました。AIの入力欄に貼り付けてください。"); }
  catch { say("コピーできませんでした。依頼文を選んでコピーしてください。"); }
});
$("platform-echo-check")?.addEventListener("click", () => {
  showEchoResult(compareEchoedDirectives(sentDirectiveLines(), $("platform-echo-answer")?.value || ""));
});

$("platform-copy").addEventListener("click", async () => {
  const text = $("platform-launch").value;
  if (!text) return;
  const say = message => { const slot = $("platform-copy-state"); if (slot) slot.textContent = message; };
  try {
    await navigator.clipboard.writeText(text);
    say("コピーしました。AIの入力欄に貼り付けてください。");
  } catch {
    // Report what actually happened. The box is selected so the Owner can copy
    // it by hand rather than being told it worked when it did not.
    $("platform-launch").select();
    say("コピーできませんでした。選択したので、手動でコピーしてください。");
  }
});
$("platform-to-trainer").addEventListener("click", () => { location.href = "./tools/saku-trainer.html"; });
TuningUI.wire();

$("viewer-import-file").addEventListener("click", () => $("viewer-file-input").click());
$("viewer-file-input").addEventListener("change", async event => {
  const files = [...(event.target.files || [])];
  event.target.value = "";
  if (files.length) await importCharacterFiles(files);
});

$("viewer-delete-selected").addEventListener("click", () => {
  const ids = [...compareSelection];
  if (!ids.length) { showViewerStatus("NOTHING_SELECTED", "削除するキャラクターを一覧のチェックボックスで選択してください。", "warning"); return; }
  const outcome = Library.setDeleted(ids, true);
  compareSelection.clear(); renderLibrary();
  showViewerStatus("CHARACTERS_DELETED", `${outcome.changed}件を削除しました。「削除済み」を「含めて表示」にすると元に戻せます。`, outcome.saved ? "success" : "error");
});

// The one destructive action on this screen, so it asks first.
$("viewer-clear-list").addEventListener("click", () => {
  const totals = Library.summary();
  if (!totals.total) { showViewerStatus("LIST_ALREADY_EMPTY", "一覧は既に空です。", "info"); return; }
  if (!window.confirm(`一覧の${totals.total}件をすべて消去します。クリアーしてよいですか？\n\nこの操作は元に戻せません。`)) return;
  const outcome = Library.clear();
  compareSelection.clear(); selectedViewerId = ""; renderLibrary();
  showViewerStatus("LIST_CLEARED", `${outcome.removed}件を消去しました。`, outcome.saved ? "success" : "error");
});

$("viewer-new-character").addEventListener("click", () => {
  const created = Library.createDraft("NEW");
  if (!created.saved) { showViewerStatus("LIBRARY_SAVE_FAILED", `一覧に保存できませんでした: ${created.reason}`, "error"); return; }
  ActiveSaku.setActive(created.entry.character, { source: "new" });
  storeBoundCharacter("saku.desktop.pendingCharacter", created.entry.character);
  mirrorToWorkspace([created.entry.character]);
  renderLibrary();
  location.href = "./tools/saku-builder.html?desktop=new";
});

$("character-actions").addEventListener("click", event => {
  const action = event.target.closest("[data-character-action]");
  if (action) runCharacterAction(action.dataset.characterAction);
});
$("character-actions-close").addEventListener("click", closeActions);
$("character-actions").addEventListener("cancel", closeActions);
const clearButton = $("active-saku-clear");
if (clearButton) clearButton.addEventListener("click", () => {
  const summary = ActiveSaku.summary();
  if (summary && summary.dirty && !window.confirm("未保存の変更があります。最初からやり直しますか？")) return;
  ActiveSaku.clearActive();
  renderActiveSaku();
});
renderActiveSaku();
$("catalog-search").addEventListener("input", renderCatalog); for (const id of ["catalog-availability", "catalog-package-state", "catalog-category", "catalog-work-mode", "catalog-sort", "catalog-deleted"]) $(id).addEventListener("change", renderCatalog);
document.querySelectorAll("[data-catalog-view]").forEach(button => button.addEventListener("click", () => { catalogView = button.dataset.catalogView; renderCatalog(); }));
$("catalog-reset").addEventListener("click", () => { $("catalog-search").value = ""; $("catalog-availability").value = "ALL"; $("catalog-package-state").value = "ALL"; $("catalog-category").value = "ALL"; $("catalog-work-mode").value = "ALL"; $("catalog-deleted").value = "HIDE"; renderCatalog(); $("catalog-search").focus(); });
$("viewer-results").addEventListener("click", event => { const open = event.target.closest("[data-open-id]"); if (open) openActionsFor(open.dataset.openId); });
$("viewer-results").addEventListener("change", event => { const input = event.target.closest("[data-compare-id]"); if (!input) return; if (input.checked) compareSelection.add(input.dataset.compareId); else compareSelection.delete(input.dataset.compareId); const card = input.closest(".catalog-card"); if (card) card.dataset.checked = input.checked ? "true" : "false"; updateCompareStatus(); if (!$("compare-panel").hidden) renderComparison(); });
$("viewer-panel").addEventListener("click", event => {
  const trainer = event.target.closest("[data-trainer-handoff]");
  if (trainer) {
    const record = viewerRecords.find(item => item.id === trainer.dataset.trainerHandoff);
    if (record) storeBoundCharacter("saku.desktop.pendingTrainerCharacter", record.source_character);
  }
  const button = event.target.closest("[data-builder-copy]"); if (button) openBuilderCopy(button.dataset.builderCopy);
});
$("compare-open").addEventListener("click", () => { renderComparison(); $("compare-panel").hidden = false; $("compare-close").focus(); });
$("compare-close").addEventListener("click", () => { $("compare-panel").hidden = true; $("compare-open").focus(); });
$("compare-clear").addEventListener("click", () => { compareSelection.clear(); $("compare-panel").hidden = true; renderCatalog(); });
window.addEventListener("saku-ui-locale-changed", () => { localizePlaceholders(); renderRecovery(); packageFields(packageSummary(currentImportResult || {})); updateFacets(); renderCatalog(); renderLibraryCount(); renderImportHistory(); if (!$("compare-panel").hidden) renderComparison(); });

const dropZone = $("drop-zone");
for (const name of ["dragenter", "dragover"]) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add("active"); });
for (const name of ["dragleave", "drop"]) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove("active"); });
dropZone.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePackage(); } });
if (tauri?.event?.listen) tauri.event.listen("tauri://drag-drop", event => importPath(event.payload?.paths?.[0]));
// Wait for the working copy to be bound before a screen reads the list.
localizePlaceholders(); if (!await applyStartupRoute()) await refreshState();
// The Builder's 「キャラクターを選択」 asks for the selection screen, not Home;
// its 「AIプラットフォームで動作確認」 asks for 03 with the Active SAKU it just set.
{
  const open = new URLSearchParams(location.search).get("open");
  if (open === "select") showViewer();
  else if (open === "platform") showPlatform();
}



// A seam for the readiness gate: the three-state announcement depends on the
// native host reporting a Workspace, which a browser harness cannot provide.
// Exposing the render entry point lets the states be exercised for real rather
// than asserted from the source text.
if (typeof window !== "undefined") window.__saku_workspace_state = WorkspaceState;
if (typeof window !== "undefined") window.__saku_home = { renderState, renderActiveSaku, renderHomeGuidance, importCharacterFiles, renderLibrary, loadOccupationFile, handOffCharacterAndOccupation, occupationMapping, parseOccupationCsv, platformLaunchText, characterPromptText, formatLocalTimestamp };

// Build provenance, shown so the Owner can confirm which Candidate is installed.
// Technical identity only: not a version, not Canonical, not a Release.
{
  const meta = document.querySelector('meta[name="saku-build-revision"]');
  const revision = meta ? (meta.getAttribute("content") || "") : "";
  const label = revision ? "BUILD " + revision.slice(0, 12) : "BUILD UNSTAMPED";
  for (const id of ["build-revision-head", "build-revision-view"]) {
    const slot = $(id);
    if (slot) slot.textContent = label;
  }
}

if (typeof window !== "undefined") { window.loadOccupationFile = loadOccupationFile; window.handOffCharacterAndOccupation = handOffCharacterAndOccupation; }
