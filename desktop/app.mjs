import { catalogFacets, compareCharacters, filterCatalog, packageSummary, parseViewerPayload, viewerCopy } from "./viewer.mjs";
import * as ActiveSaku from "../tools/unified-v1/active-saku.mjs";
import * as Library from "../tools/unified-v1/character-library.mjs";
import * as WorkspaceState from "../tools/unified-v1/workspace-state.mjs";
import { parseCharacterText, YamlLiteError } from "../tools/unified-v1/yaml-lite.mjs";
import { admit, checkManifestBinding, classify, labelFor, UNKNOWN } from "../tools/unified-v1/character-schema.mjs";
import { formatValidationIssue, loadAdoptedSchema, validateCompleteAdoptedCharacter } from "../tools/v1/adopted-schema-validator.mjs";
import { FIELDS as SEMANTIC_FIELDS } from "../tools/v1/semantic-registry.mjs";
import { OPERATION_CLASS_TEXT, assessPackSignatures, assessReturnSignature, compareReturnWithLibrary, packEntryMeta, packVerification, returnEntryMeta, returnRelationText, returnVerification, signatureStateText } from "../tools/unified-v1/character-pack-intake.mjs";
import { presentationTokens, absentAxes } from "../tools/unified-v1/axis-renderer.mjs";
import { diagnose as diagnoseLocators, repairLocators } from "../tools/unified-v1/locator-repair.mjs";
import { mountScreenHelp } from "../tools/unified-v1/screen-help.mjs";
import { confirmDialog } from "../tools/unified-v1/confirm-dialog.mjs";
import { confirmWording, fill } from "../tools/unified-v1/confirm-wording.mjs";
import { FOLLOW_LINE, HANDOFF_FORMAT, characterPromptText, loadBaseLayer, platformLaunchText } from "../tools/unified-v1/platform-prompt.mjs";
import * as SkillExport from "../tools/unified-v1/character-export.mjs";
import { verifyStandardAttachment } from "../tools/unified-v1/agent-skills-attachment.mjs";
import * as StandardSave from "../tools/unified-v1/standard-save.mjs";
import { nameplateTrustIndex } from "../tools/unified-v1/pinned-trust.mjs";
import * as TuningHandoff from "../tools/unified-v1/tuning-handoff.mjs";
import * as ExportOrigin from "../tools/unified-v1/export-origin.mjs";
import * as LegacyOrigin from "../tools/unified-v1/legacy-origin.mjs";
import * as DeclaredOrigin from "../tools/unified-v1/declared-origin.mjs";
import { buildSelfMadeCharacterZip, checkSelfMadeCharacterZip, storedZip } from "../tools/unified-v1/self-made-character-zip.mjs";
import { mountFrame } from "../tools/unified-v1/app-frame.mjs";
import { badgeFor, badgeLabel, badgeDescription } from "../tools/unified-v1/origin-badges.mjs";
import { codeSignatureView } from "../tools/unified-v1/code-signature.mjs";
import { characterJsonText, characterYamlText, outputFilename, outputGate, contactGuard, packTermsNotice } from "../tools/unified-v1/character-output.mjs";
import { referenceRefusalKind, verifyReferenceExport } from "../tools/unified-v1/reference-material.mjs";
import { ECHO_CHECK_LABEL, ECHO_REQUEST, buildDirectiveLookup, compareEchoedDirectives, glossaryFallbackText } from "../tools/unified-v1/directive-glossary.mjs";
import { BASE_DIRECTIVES_UNUSABLE, handoffOptions } from "../tools/unified-v1/handoff-context.mjs";
import * as TuningUI from "./tuning-ui.mjs";
import * as Tuning from "../tools/unified-v1/tuning/tuning-projection.mjs";

const $ = id => document.getElementById(id);
const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
// The shared frame (app-frame.mjs), mounted once the screens below are defined.
let frame = null;
let viewerRecords = [];
let libraryEntries = [];
// The saved list as it is now. ③ and ④ read it, not the copy ① keeps for drawing: opened straight after a start, ①
// had not been drawn and ④ said 「一覧の行が分からない」 (2026-10-14 keying round 2).
const liveEntries = () => Library.list({ includeDeleted: true });
// ④ パック標準を保存 (L19): the attachment the host opened, for this session only (design v4 §3.3). Declared here because
// renderExport may run before the section's code further down.
// L10 (00A C06-5): the host's answer on the imported packs, read fresh before each export decision; never kept as the
// set itself between decisions.
let legacyImported = null;
// L11 (d): the content digests of the rows a person confirmed, read with K2 (refreshLegacyImported).
let declaredDigests = new Map();
let standardAttachment = null;
let standardReadCode = null;
let standardTarget = null;
let standardRun = 0;
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
  // The code stays in the line for the gates and for support, but a person does not read it (2026-10-14 keying F2).
  const strong = document.createElement("strong"); strong.textContent = code; strong.className = "status-code"; strong.setAttribute("aria-hidden", "true");
  target.append(strong);
  // A Character name must not be translated and the sentence beside it must be.
  // Holding both in one text node meant neither happened, so the sentence stayed
  // Japanese in English mode. Pass an array to keep them in separate nodes:
  // {data: ...} is Character content, a plain string is product copy.
  for (const part of (Array.isArray(reason) ? reason : [reason])) {
    // {details: ...}: the technical detail behind the sentence, folded under 「くわしく」 and kept for support
    // (2026-10-15 keying round 2 m2: twenty English reasons followed the refusal on the screen).
    if (part && typeof part === "object" && part.details !== undefined) {
      if (!String(part.details)) continue;
      const box = document.createElement("details"); box.className = "status-details";
      const summary = document.createElement("summary"); summary.textContent = "くわしく";
      const pre = document.createElement("pre"); pre.textContent = String(part.details); pre.dataset.runtimeValue = "";
      box.append(summary, pre); target.append(box);
      continue;
    }
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
// O-11: the app's own confirmation (the WebView's confirm() is titled 「tauri.localhost の内容」).
// A message with run-time values, as one sentence the dictionary can translate (desktop/i18n.mjs EN_FORMAT).
const tr = (template, params = {}) => window.SAKU_DESKTOP_I18N?.format
  ? window.SAKU_DESKTOP_I18N.format(template, params)
  : template.replace(/\{(\w+)\}/g, (all, name) => Object.hasOwn(params, name) ? String(params[name]) : all);
const ask = (key, message, vars) => { const w = confirmWording(key, locale() === "en-US" ? "en" : "ja"); return confirmDialog({ title: w.title, message: message ?? fill(w.body, vars), confirmLabel: w.confirm, cancelLabel: w.cancel }); };
const showStatus = (code, reason, kind = "info") => setStatus($("host-status"), code, reason, kind);
const showViewerStatus = (code, reason, kind = "info") => setStatus($("viewer-status"), code, reason, kind);

// Owner 2026-09-24: the installer carries AMU Studio's sample pack (saku-pack-sample
// 1.1.0) in place of the retired OSS samples. The button stays off unless the host
// finds the pinned file, and off whenever the other import controls are off.
// Why the button is off is said in text right under it, not only in a tooltip
// (ライター&SNS 2026-09-24, 8e14189). A read-only Workspace says so in the status
// line, as for the other import buttons, and adds nothing here.
const SAMPLE_PACK_WORDING_JA = Object.freeze({
  SAMPLE_PACK_NOT_BUNDLED: "サンプルがこのインストールに入っていないため、読み込めません。インストールし直すと戻ります。（SAMPLE_PACK_UNAVAILABLE / SAMPLE_PACK_NOT_BUNDLED）",
  SAMPLE_PACK_DIGEST_MISMATCH: "同梱のサンプルの中身が同梱時と違うため、読み込みませんでした。インストールし直してください。（SAMPLE_PACK_UNAVAILABLE / SAMPLE_PACK_DIGEST_MISMATCH）",
});
// English: 英語翻訳チーム, request S (S2, S3), via ライター&SNS e442352.
const SAMPLE_PACK_WORDING_EN = Object.freeze({
  SAMPLE_PACK_NOT_BUNDLED: "The samples are not part of this installation, so they cannot be loaded. Reinstalling brings them back. (SAMPLE_PACK_UNAVAILABLE / SAMPLE_PACK_NOT_BUNDLED)",
  SAMPLE_PACK_DIGEST_MISMATCH: "The contents of the bundled samples are not the same as when they were bundled, so they were not loaded. Reinstall the app. (SAMPLE_PACK_UNAVAILABLE / SAMPLE_PACK_DIGEST_MISMATCH)",
});
const sampleWording = reason => { const table = locale() === "en-US" ? SAMPLE_PACK_WORDING_EN : SAMPLE_PACK_WORDING_JA; return table[reason] || table.SAMPLE_PACK_NOT_BUNDLED; };
let nativeEnabled = true;
let samplesAvailable = false;
let samplesReason = null;
function applySampleButton() {
  const button = $("viewer-import-samples"); if (button) button.disabled = !(nativeEnabled && samplesAvailable);
  const note = $("viewer-samples-note"); if (!note) return;
  const say = Boolean(invoke) && !samplesAvailable;
  note.hidden = !say; note.textContent = say ? sampleWording(samplesReason) : "";
}
async function refreshSampleButton() {
  if (!invoke) { samplesAvailable = false; applySampleButton(); return; }
  try { const state = await invoke("bundled_sample_pack"); samplesAvailable = Boolean(state?.available); samplesReason = state?.reason || null; }
  catch { samplesAvailable = false; samplesReason = null; }
  applySampleButton();
}
async function importSamples() {
  try { handOffImport(await invoke("import_bundled_sample_pack")); }
  catch (error) { showStatus("SAMPLE_PACK_UNAVAILABLE", sampleWording(String(error)), "error"); }
}

function setNativeEnabled(enabled) {
  nativeEnabled = enabled; applySampleButton();
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
  if (!subject) { showStatus("CHARACTER_REQUIRED", "①キャラクター選択でキャラクターを選んでください。", "info"); return; }
  const name = subject.identity.display_name || subject.identity.character_id || "";
  // A blank new Character is not a chosen one (2026-10-14 keying F2): it read as 「選択中のキャラクター」 with nothing chosen.
  if (!name) { showStatus("CHARACTER_DRAFT", "新規作成中のキャラクター（名前未入力）です。②キャラクター編集で名前と中身を書いてください。", "info"); return; }
  showStatus("CHARACTER_SELECTED", [{ data: name }, " — 次に、②キャラクター編集か③実行（プロンプト）へ進んでください。"], "success");
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
    // The imported packs (K2) for the marks, once the Workspace is bound (L10, 統括 照らし NG-4).
    void refreshLegacyImported().then(() => { renderLibrary(); void frame?.refresh(); });
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
  const result = await WorkspaceState.switchWorkspace({ confirm: () => ask("discardDraftAndSwitch", workspaceWording("discardDraft")) });
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

// The state codes a person reads in the detail rows (2026-10-14 keying F2: IMPORTED, CHARACTER_PACK_IMPORTED were shown raw).
const STATE_WORDS = Object.freeze({
  IMPORTED: ["取り込み済み", "Imported"], CHARACTER_PACK_IMPORTED: ["パックから取り込み済み", "Imported from a pack"],
  SELF_MADE_ZIP_READY: ["自作の ZIP から取り込み済み", "Imported from a self-made ZIP"],
  SAKU_RETURN_IMPORTED: ["AMU Studio からの戻しを取り込み済み", "Imported as a return from AMU Studio"],
  FILE_NOT_PACKAGE_VERIFIED: ["個別ファイル（パックの確かめなし）", "Single file (no pack check)"],
  DRAFT: ["新規作成（未保存）", "New (not saved)"], UNVERIFIED: ["確かめていない", "Not checked"],
  UNSUPPORTED_SCHEMA: ["この版では読めない形式", "A form this version cannot read"], CHECKING: ["確認中", "Checking"],
  REFUSED: ["取り込まなかった", "Not imported"], FAILED: ["失敗", "Failed"], UNKNOWN: ["不明", "Unknown"],
});
function stateWords(code) {
  const words = STATE_WORDS[String(code || "")];
  return words ? words[locale() === "en-US" ? 1 : 0] : String(code || "");
}

// A pack catalog without a group (the sold 1.0.0 packs carry none) shows 「未分類」, not the internal UNKNOWN (keying F5).
function categoryLabel(value) {
  return !value || value === "UNKNOWN" ? (locale() === "en-US" ? "Uncategorized" : "未分類") : value;
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
  // 2026-10-15 keying round 2 m1: a self-made ZIP names no pack, so its Package row says so instead of UNKNOWN.
  const notPack = summary.product === "UNKNOWN" && currentImportResult && currentImportResult.self_made;
  const product = notPack ? (locale() === "en-US" ? "— (not a pack)" : "—（パックではありません）") : summary.product;
  const values = [[labels.status, stateWords(summary.status)], [labels.product, product], [labels.version, summary.version], [labels.compatibility, summary.compatibility], [labels.hash, summary.payload_hash], [labels.reason, summary.reason]];
  const dl = $("viewer-package-fields"); dl.replaceChildren();
  for (const [label, value] of values) {
    const row = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; dd.dataset.runtimeValue = "";
    // m1: the reason's code (CHARACTER_PACK_IMPORTED, SELF_MADE_ZIP_READY, ...) stays in the row for support but is not shown.
    if (label === labels.reason) { const code = document.createElement("strong"); code.className = "status-code"; code.setAttribute("aria-hidden", "true"); code.textContent = summary.code; dd.prepend(code); dd.classList.add("package-reason"); }
    row.append(dt, dd); dl.append(row);
  }
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

// A v1 (SAKU-CHARACTER) Character cannot be opened here (ライター&SNS 2026-09-27).
const V1_RECREATE_NOTE = "この Character は旧形式（SAKU-CHARACTER）で作られているため、この SAKU Builder では開けません。使う場合は、「②キャラクター編集」で新しく作り直してください。";

function importRecovery(code, reason) {
  if (code === "MANIFEST_SCHEMA_ID_MISSING") {
    return tr("{reason} このPackageは内容からSchemaを推測せず拒否しました。Source Ownerから、Active Unified Schema identityと変換来歴をmanifestへ結び付けたReplacement Packageを取得してください。", { reason });
  }
  if (code === "PAYLOAD_SCHEMA_NOT_DECLARED" || code === "SCHEMA_NOT_DECLARED") {
    return `${reason} このファイルには Schema の宣言がないため、取り込めません。使う場合は、「②キャラクター編集」で新しく作り直してください。`;
  }
  if (code === "CONFORMANCE_LOCATOR_MISMATCH") {
    return tr("{reason} conformance_expectations の locator が requirement_id と別の要件を指しているため、このCharacterは取り込みません（Schema の規則: 参照不一致は fail closed）。Builder側では内容を書き換えず、作成元／配布元から修正版を入手してください。", { reason });
  }
  if (code === "PACKAGE_FORMAT_UNRECOGNIZED" || code === "PACKAGE_JSON_INVALID") return reason;
  // Two files this route names but never imports: the AMU Character File
  // belongs to AMU Studio; a bare Character JSON/YAML belongs to 個別インポート.
  if (code === "PACKAGE_FORMAT_AMU_CHARACTER_FILE" || code === "PACKAGE_FORMAT_INDIVIDUAL_FILE") return reason;
  if (code === "LOCATOR_REPAIRED") return reason;
  if (String(code || "").startsWith("SAKU_RETURN_")) {
    return tr("{reason} AMU Studio の「この編集内容を SAKU へ戻す」で作った .saku-return.zip をそのまま（解凍・編集せずに）選んでください。中身が合わない場合は AMU Studio で作り直してください。", { reason });
  }
  if (String(code || "").startsWith("CHARACTER_PACK_")) {
    return tr("{reason} SAKU Character Pack は ZIP のまま（解凍せずに）選んでください。ファイルが配布元のものと同じかは SHA256SUMS で確認できます。", { reason });
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
  addDetailRow(dl, "席 8（論理上の人）", record.human_seat);
  addDetailRow(dl, "運営者", record.operator || "未記入");
  addDetailRow(dl, "黒子", record.charback_required === null ? "未記入" : record.charback_required ? "必要" : "不要", false);
  addDetailRow(dl, "第0層", record.expertise);
  addDetailRow(dl, "15軸", record.axes_summary, false);
  addDetailRow(dl, "Schema", `${record.technical.schema_id} ${record.technical.schema_version}`, false);
  // The editor reads the other schema. Offering it here would hand v1 to a
  // screen that cannot read it, so it is stated as unavailable, with the way
  // on: recreate it in 02 (ライター&SNS 2026-09-27; the converter is not in
  // this product, so it is not named).
  const note = document.createElement("p"); note.className = "schema-note";
  note.textContent = V1_RECREATE_NOTE;
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
    note.textContent = "この Character は採択済み Schema に合わないため、02 でも 03 でも開けません。一覧から削除できます。";
    detail.append(title, badge, why, dl, note);
    return;
  }
  if (record.schema_kind === "V1_CHARACTER") { renderV1Detail(record, detail); return; }
  const title = document.createElement("h3"); title.textContent = record.name; title.dataset.runtimeValue = "";
  const overview = document.createElement("p"); overview.className = "viewer-summary"; overview.textContent = record.summary; overview.dataset.runtimeValue = "";
  const dl = document.createElement("dl");
  addDetailRow(dl, labels.role, record.role); addDetailRow(dl, labels.category, categoryLabel(record.category)); addDetailRow(dl, labels.revision, record.revision);
  addDetailRow(dl, labels.availability, availabilityLabel(record.availability), false); addDetailRow(dl, labels.packageState, stateWords(record.package_state), false);
  // Where it came from, in words, in the detail itself (2026-10-14 keying 3-14: it was only in the badge's hover title,
  // which the app's window does not show reliably). The same badge and description as the card.
  {
    const entry = liveEntries().find(item => item.entry_id === record.entry_id) || null;
    const origin = originBadgeFor(entry);
    const description = badgeDescription(origin.id, locale(), { pack: entry?.provenance?.edited_from?.pack_id || origin.pack_id || "" });
    addDetailRow(dl, locale() === "en-US" ? "Origin" : "出どころ", `${badgeLabel(origin.id, locale())}${description ? ` — ${description}` : ""}`, false);
  }
  if (record.provenance && record.provenance.locator_repair) {
    const lang = locale() === "en-US" ? "en" : "ja";
    const repair = record.provenance.locator_repair;
    addDetailRow(dl, lang === "en" ? "Locator repair" : "locator 修復", lang === "en"
      ? `rev ${repair.from_revision} → ${repair.to_revision}, ${repair.rewritten} locator(s) re-pointed by id, ${repair.repaired_at}`
      : `rev ${repair.from_revision} → ${repair.to_revision}、locator ${repair.rewritten}件を id で再計算、${repair.repaired_at}`, false);
    addDetailRow(dl, lang === "en" ? "Content digest" : "内容 digest", tr("{before}… → {after}…（本文は不変・locator と revision のみ）", { before: String(repair.digest_before || "").slice(0, 16), after: String(repair.digest_after || "").slice(0, 16) }), false);
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
  const platform = document.createElement("button"); platform.type = "button"; platform.className = "button"; platform.dataset.platformFrom = record.id; platform.textContent = "③実行（プロンプト）へ";
  const builder = document.createElement("button"); builder.type = "button"; builder.className = "primary"; builder.dataset.builderCopy = record.id; builder.textContent = "編集する";
  // Owner 2026-09-27: 04 Trainer left the screens (AMU DECISION 2026-09-27-11), so no 「トレーニングする」 here.
  actions.append(builder, platform);
  // L11-4: 「自分で作ったキャラクターとして確かめる」, only on a row it may be offered for (not on a known pack Character's ID,
  // not while K2 cannot be read, not on a repaired file that is a pack's Character).
  {
    const entry = liveEntries().find(item => item.entry_id === record.entry_id) || null;
    const declared = DeclaredOrigin.declaredOrigin(entry, liveEntries(), originContext());
    if (declared.state === "HOLD" && declared.offer) {
      const own = document.createElement("button"); own.type = "button"; own.className = "button"; own.dataset.confirmOwn = record.entry_id;
      own.textContent = DeclaredOrigin.CONFIRM_WORDS.action.ja;
      actions.append(own);
    }
  }
  const sampleLine = isSampleRecord(record) ? (() => { const line = document.createElement("p"); line.className = "catalog-badges"; line.append(sampleBadge()); return line; })() : null;
  detail.append(title, ...(sampleLine ? [sampleLine] : []), overview, dl, selectionSection, technical, actions);
}

function createCompareToggle(record) {
  const label = document.createElement("label"); label.className = "compare-toggle";
  const input = document.createElement("input"); input.type = "checkbox"; input.dataset.compareId = record.id; input.checked = compareSelection.has(record.id); input.setAttribute("aria-label", `${copy().selectCompare}: ${record.name}`);
  const span = document.createElement("span"); span.textContent = "選択"; label.append(input, span); return label;
}

// Owner 2026-09-24: the sample-mode Characters carry AMU's 「サンプル」 badge. A
// Character is a sample when it came from the signed pack saku-pack-sample (the
// pack id is part of what the signature covers), not from its name's 「※」.
const SAMPLE_PACK_ID = "saku-pack-sample";
const isSampleRecord = record => record?.provenance?.pack_id === SAMPLE_PACK_ID;
function sampleBadge(tag = "span") { const badge = document.createElement(tag); badge.className = "catalog-badge catalog-sample-badge"; badge.dataset.sample = "true"; badge.textContent = "サンプル"; return badge; }

function createCatalogCard(record) {
  const card = document.createElement("article"); card.className = "catalog-card"; card.dataset.availability = record.availability;
  if (record.deleted) card.dataset.deleted = "true";
  if (latestBatch && record.batch === latestBatch) card.dataset.new = "true";
  if (compareSelection.has(record.id)) card.dataset.checked = "true";
  const open = document.createElement("button"); open.type = "button"; open.className = "catalog-open"; open.dataset.openId = record.id;
  const title = document.createElement("strong"); title.textContent = record.deleted ? tr("{name}（削除済み）", { name: record.name }) : record.name; title.dataset.runtimeValue = "";
  const role = document.createElement("span"); role.className = "catalog-role"; role.textContent = record.role; role.dataset.runtimeValue = "";
  const summary = document.createElement("span"); summary.className = "catalog-summary"; summary.textContent = record.summary; summary.dataset.runtimeValue = "";
  const meta = document.createElement("span"); meta.className = "catalog-meta"; meta.textContent = `${categoryLabel(record.category)} · ${record.one_plus_seven}`; meta.dataset.runtimeValue = "";
  const schema = document.createElement("span"); schema.className = "catalog-schema"; schema.dataset.schemaKind = record.schema_kind || "UNKNOWN_CHARACTER"; schema.textContent = record.schema_label || "";
  card.dataset.schemaKind = record.schema_kind || "UNKNOWN_CHARACTER";
  open.append(title, role, summary, meta, schema);
  card.append(open, createCompareToggle(record));
  const badges = document.createElement("span"); badges.className = "catalog-badges";
  // The signature and origin badge (B1–B9, Owner 2026-10-14): one axis, the WI-T.COM signature.
  const entry = libraryEntries.find(item => item.entry_id === record.entry_id) || null;
  const origin = originBadgeFor(entry);
  const originBadge = document.createElement("span");
  originBadge.className = `catalog-badge catalog-origin-badge catalog-origin-${String(origin.class).toLowerCase()}`;
  originBadge.dataset.originBadge = origin.id || "";
  originBadge.textContent = badgeLabel(origin.id, locale());
  originBadge.title = badgeDescription(origin.id, locale(), { pack: entry?.provenance?.edited_from?.pack_id || origin.pack_id || "" });
  badges.append(originBadge);
  if (record.latest_revision && !record.deleted) {
    const badge = document.createElement("span"); badge.className = "catalog-badge catalog-latest-badge"; badge.textContent = "最新 revision"; badges.append(badge);
  }
  if (latestBatch && record.batch === latestBatch && !record.deleted) {
    const badge = document.createElement("span"); badge.className = "catalog-badge"; badge.textContent = "新規追加"; badges.append(badge);
  }
  if (isSampleRecord(record) && origin.id !== "B2") badges.append(sampleBadge());
  card.append(badges);
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
    const values = [record.role, categoryLabel(record.category), record.revision, availabilityLabel(record.availability)];
    row.append(compareCell, nameCell, ...values.map(value => { const td = document.createElement("td"); td.textContent = value; td.dataset.runtimeValue = ""; return td; })); body.append(row);
  }
  table.append(head, body); return table;
}

function catalogOptions() {
  return { query: $("catalog-search").value, availability: $("catalog-availability").value, packageState: $("catalog-package-state").value, category: $("catalog-category").value, workMode: $("catalog-work-mode").value, sort: $("catalog-sort").value };
}

function updateFacetSelect(id, values, label = value => value) {
  const select = $(id); const current = select.value; const all = document.createElement("option"); all.value = "ALL"; all.textContent = copy().all; select.replaceChildren(all);
  // The value stays the code; what a person reads is words (2026-10-14 keying F2 / F5).
  for (const value of values) { const option = document.createElement("option"); option.value = value; option.textContent = label(value); option.dataset.runtimeValue = ""; select.append(option); }
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
  const facets = catalogFacets(viewerRecords); updateFacetSelect("catalog-category", facets.categories, categoryLabel); updateFacetSelect("catalog-package-state", facets.package_states, stateWords); updateFacetSelect("catalog-work-mode", facets.work_modes);
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
  for (const record of selected) { const td = document.createElement("td"); const group = document.createElement("div"); group.className = "compare-handoff"; const builder = document.createElement("button"); builder.type = "button"; builder.dataset.builderCopy = record.id; builder.textContent = labels.edit; group.append(builder); td.append(group); actions.append(td); } body.append(actions);
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
    one_plus_seven: tr("席 2〜7：{count}/6 ＋ 席 8（論理上の人）", { count: aiSeats }),
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
  if (slot) slot.textContent = totals.total ? tr("一覧 {active}件（削除済み {deleted}件）", { active: totals.active, deleted: totals.deleted }) : "一覧はまだ空です。Packageインポート・個別インポート・新規作成から追加できます。";
}

function renderLibrary() {
  libraryEntries = Library.list({ includeDeleted: true });
  latestBatch = Library.latestBatch();
  // Saving creates another revision instead of overwriting the source. Mark
  // the newest live entry only when the same character_id has multiple live
  // rows. This is presentation derived from existing timestamps; the Library
  // data model and revision values remain unchanged.
  // G5 (2026-10-14): a line is one character_id within one origin (Library.revisionGroupKey) — a pack's
  // versions, the edits of one pack's Character, or the Owner's own rows. A newer pack is not the "latest" of an edit.
  const revisionGroups = new Map();
  libraryEntries.forEach((entry, index) => {
    if (entry.deleted) return;
    const key = Library.revisionGroupKey(entry);
    if (!key) return;
    if (!revisionGroups.has(key)) revisionGroups.set(key, []);
    revisionGroups.get(key).push({ entry, index, at: entry.updated_at || entry.added_at || entry.batch || "" });
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
  if (totals.active) showViewerStatus("LIBRARY_READY", tr("一覧 {active}件 — この画面ではキャラクターの中身を変えません。", { active: totals.active }), "success");
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
async function resolveConflicts(characters, source, entryMeta) {
  const conflicts = Library.replaceableConflicts(characters, source, entryMeta);
  if (!conflicts.length) return { onConflict: "KEEP_BOTH", conflicts };
  const names = [...new Set(conflicts.map(item => item.name))];
  const shown = names.slice(0, 5).join("、") + (names.length > 5 ? tr(" ほか{count}件", { count: names.length - 5 }) : "");
  // The buttons now say 「置き換える」 / 「両方残す」, so the body no longer spells out what OK and Cancel mean.
  const replace = await ask("replaceSameName", undefined, { names: shown });
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
  const more = refused.length > 3 ? tr(" ほか{count}件", { count: refused.length - 3 }) : "";
  showViewerStatus("UNSUPPORTED_CHARACTER_SCHEMA",
    tr("{count}件は取り込めませんでした: {names}{more} — {recovery}", { count: refused.length, names: shown, more, recovery: importRecovery(refused[0].code, refused[0].reason) }),
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
    const { onConflict } = await resolveConflicts(group, source, entryMeta);
    const outcome = Library.importCharacters(group, source, { onConflict, verification, schema, entryMeta });
    if (!outcome.saved) { failure = outcome.reason; continue; }
    added += outcome.added; replaced += outcome.replaced;
  }
  renderLibrary();
  if (failure) { showViewerStatus("LIBRARY_SAVE_FAILED", tr("一覧に保存できませんでした: {failure}", { failure }), "error"); return { added, replaced, saved: false, refused }; }
  if (refused.length) { reportRefusals(refused, added); return { added, replaced, saved: true, refused }; }
  const detail = replaced ? tr("{added}件を追加、{replaced}件を置き換えました。", { added, replaced }) : tr("{added}件を一覧に追加しました。", { added });
  showViewerStatus("CHARACTERS_ADDED", detail, "success");
  // G5/G7: only the Owner's own rows go to characters/ (a pack is in imports/, a return is a candidate).
  if (Library.mirrorsToWorkspace(source)) mirrorToWorkspace(characters);
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

// Owner 結果 188 (Q27): a sample pack Character is for reading — the same reading as ② (saku-builder.html openedIsSample).
const isSampleEntry = entry => {
  const from = entry?.provenance?.edited_from || entry?.provenance || null;
  return Boolean(from && (from.pack_id === SAMPLE_PACK_ID || /^LicenseRef-WIT-Sample-/.test(String(from.license || ""))));
};

function showTuning(record) {
  showPanel("tuning");
  setStatus($("tuning-subject"), "TUNING_SUBJECT", tr("{name} — 推奨は、②で保存するまでキャラクターを変えません。", { name: record.name }), "info");
  const entry = libraryEntries.find(item => item.entry_id === record.entry_id) || null;
  TuningUI.setSubject(record.source_character, {
    observedStates: readObservedStates(record),
    sample: isSampleEntry(entry),
    // L12 (Owner 結果 364, D-1〜D-11): the tuning writes nothing — not the list, not the Workspace. A Character the tuning
    // made wrong against the adopted Schema stops here with its field (D-10); otherwise ② opens with the row's own Character
    // as the opened one and the tuned content beside it, and only ②'s save writes, through ②'s own path (D-1, D-2).
    apply: async (character, detail) => {
      let schema;
      try { schema = await loadAdoptedSchema(); } catch { return { ok: false, code: "ADOPTED_SCHEMA_UNAVAILABLE" }; }
      const refusal = TuningHandoff.tuningSchemaRefusal(validateCompleteAdoptedCharacter(record.source_character, schema).errors, validateCompleteAdoptedCharacter(character, schema).errors);
      if (refusal) return { ok: false, code: refusal.code };
      ActiveSaku.setActive(record.source_character, { source: "tuning-apply", entry_id: record.entry_id });
      storeBoundCharacter("saku.desktop.pendingCharacter", record.source_character);
      TuningHandoff.storeTuningHandoff(localStorage, { original: record.source_character, tuned: character, itemId: detail.item_id, fields: [detail.field], openOnly: detail.openOnly === true });
      location.href = handoffUrl(record, "builder");
      return { ok: true };
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
  showPanel("select");
  renderLibrary();
  // Both of these fill an empty list, and both ask "is the list empty?" first.
  // The handoff is adopted before the workspace is read; run together, each
  // would see an empty list and the same Character would be imported twice.
  await adoptPendingHandoff(); renderLibrary();
  // An empty index after an uninstall that removed app data is a recoverable
  // state, not an empty Library. Rebuild from the workspace and say so.
  const result = await reconstructFromWorkspace();
  if (result.status === "RECOVERED") {
    showViewerStatus("LIBRARY_RECOVERED_FROM_WORKSPACE", tr("{count}件をworkspaceから復元しました（{workspace}）。Character dataは変更していません。", { count: result.recovered, workspace: result.workspace }), "success");
  } else if (result.status === "NOTHING_DURABLE") {
    showViewerStatus("LIBRARY_EMPTY_NO_DURABLE_COPY", tr("一覧は空です。workspace（{workspace}）にも復元できるCharacterがありません。", { workspace: result.workspace }), "info");
  }
}
function renderActiveSaku() {
  frame?.refresh();
  const host = $("selected-character");
  if (!host) { renderHomeGuidance(); return; }
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
      if (open === false) requestAnimationFrame(refitImportHistory);
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
  if (WorkspaceState.isReadOnly()) return null;
  const history = readImportHistory();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  history.unshift({ ...entry, id, at: new Date().toISOString() });
  writeImportHistory(history);
  return id;
}

function writeImportHistory(history) {
  try { localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); WorkspaceState.noteChanged(IMPORT_HISTORY_KEY); } catch { /* full or blocked */ }
  renderImportHistory();
}

// One row per import, written with the outcome after the page's own checks (2026-10-14 keying 3-8 / 3-12): the host's
// staged result is the row's start; the signature check, the commit and the self-made rules then settle it. A refused
// or failed import no longer leaves a second row, and the row's reason is the checked one, not the host's 「未検証」.
function finishImport(id, entry) {
  if (WorkspaceState.isReadOnly()) return;
  const history = readImportHistory();
  const at = id ? history.findIndex(row => row && row.id === id) : -1;
  if (at < 0) { recordImport(entry); return; }
  history[at] = { ...history[at], ...entry, id, at: history[at].at };
  writeImportHistory(history);
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
    // The outcome shows on the row (2026-10-14 keying 3-8): a refused or failed import must not look like a success.
    const outcome = document.createElement("span");
    const status = String(entry.status || "");
    outcome.className = `import-history-outcome import-history-${status === "IMPORTED" ? "ok" : status === "CHECKING" ? "checking" : "refused"}`;
    outcome.textContent = status === "IMPORTED" ? "取り込み済み" : status === "CHECKING" ? "確認中" : "取り込まなかった";
    kind.append(document.createElement("br"), outcome);
    button.append(kind, path, when);
    item.append(button);
    list.append(item);
  });
  host.append(list);
  // The newest three show; the rest scroll (Owner 2026-10-14). Measured, so it holds in either language. The list is
  // usually drawn while ① is hidden (nothing to measure), so it is measured again when it shows.
  fitImportHistory(list);
}
// Measured again when ① shows (showPanel), when its accordion opens, and when the window changes size (rows rewrap).
if (typeof window !== "undefined") window.addEventListener("resize", () => refitImportHistory());

function refitImportHistory() {
  const list = document.querySelector(".import-history-list");
  if (list) fitImportHistory(list);
}

function fitImportHistory(list) {
  const third = list.children[2];
  if (!third || list.children.length <= 3) { list.style.maxHeight = ""; list.style.overflowY = ""; return; }
  if (!list.offsetParent) return;
  const height = Math.ceil(third.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop);
  if (height <= 0) return;
  if (list.style.maxHeight !== `${height}px`) list.style.maxHeight = `${height}px`;
  list.style.overflowY = "auto";
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

// ── Screens (Owner 2026-10-14 画面改修) ─────────────────────────────────────────
// The menu bar (app-frame.mjs) names six screens; this page holds four of them and the tuning screen,
// which is opened from ⑤. The address keeps the screen (#prep, #select, #run, #out, #tuning).
const PANELS = Object.freeze({ prep: "home-content", select: "viewer-panel", run: "platform-panel", out: "export-panel", tuning: "tuning-panel" });
let currentScreen = "prep";
function showPanel(name) {
  for (const [key, id] of Object.entries(PANELS)) { const panel = $(id); if (panel) panel.hidden = key !== name; }
  currentScreen = name;
  const hash = `#${name}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  frame?.render();
  window.scrollTo(0, 0);
  // ① was hidden while its import history was drawn; measure the history now that it shows (Owner 2026-10-14).
  if (name === "select") requestAnimationFrame(refitImportHistory);
}
function showHome() { showPanel("prep"); renderActiveSaku(); }
async function showScreen(name) {
  if (name === "select") return showViewer();
  if (name === "run") return showPlatform();
  if (name === "out") return showExport();
  if (name === "tuning") return showTuningForActive();
  return showHome();
}
function activeRecord() {
  const entry = Library.entryForActive(libraryEntries, ActiveSaku.getActive());
  return entry ? viewerRecords.find(record => record.entry_id === entry.entry_id) || null : null;
}
async function showTuningForActive() {
  const record = activeRecord();
  // ① is drawn first and its list sets its own status; the reason is said after that, so it is not overwritten
  // (2026-10-14 keying 7-1: ⑤ moved to ① with no word).
  if (!record) { await showViewer(); showViewerStatus("CHARACTER_REQUIRED", "AI動作の調整をするキャラクターを選んでから、⑤の「AI動作の調整を開く」を押してください。", "warning"); return; }
  showTuning(record);
}

// The footer's signature line, from the host's on-the-spot check (2026-10-14 keying F1, Owner 結果 190 対策 D). Fail-closed:
// no host, an error or no answer within the wait all read 「確かめられない」; the build's SAKU_CODE_SIGNING is not used.
const CODE_SIGNATURE_WAIT_TRIES = 40;
let codeSignatureFacts = undefined;
let codeSignatureTimedOut = false;
function renderCodeSignature() {
  const slot = typeof document !== "undefined" ? document.getElementById("code-signature-view") : null;
  if (!slot) return;
  const view = codeSignatureView(codeSignatureFacts, { locale: locale(), timedOut: codeSignatureTimedOut });
  slot.textContent = view.text;
  slot.dataset.codeSignature = view.state;
}
async function watchCodeSignature() {
  const invoke = tauriInvoke();
  if (!invoke) { codeSignatureFacts = undefined; renderCodeSignature(); return; }
  codeSignatureFacts = null;
  for (let tries = 0; tries < CODE_SIGNATURE_WAIT_TRIES; tries += 1) {
    try { codeSignatureFacts = await invoke("get_code_signature"); }
    catch { codeSignatureFacts = undefined; break; }
    if (codeSignatureFacts !== null) break;
    renderCodeSignature();
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (codeSignatureFacts === null) codeSignatureTimedOut = true;
  renderCodeSignature();
}
if (typeof window !== "undefined") {
  // after the first paint, so the check never holds up the screen
  requestAnimationFrame(() => setTimeout(() => { void watchCodeSignature(); }, 0));
  window.addEventListener("saku-ui-locale-changed", renderCodeSignature);
}

// The host asks before closing (2026-10-14 keying 4-16); these screens hold no unsaved edits, so the answer is close.
if (typeof window !== "undefined" && window.__TAURI__?.event?.listen && tauriInvoke()) {
  void window.__TAURI__.event.listen("saku-close-requested", () => {
    const invoke = tauriInvoke();
    void invoke("close_request_seen").catch(() => {});
    void invoke("close_main_window").catch(() => {});
  });
}

frame = typeof document !== "undefined" && document.getElementById("saku-frame") ? mountFrame({
  page: "desktop",
  current: () => (currentScreen === "tuning" ? "svc" : currentScreen),
  read: () => { const active = ActiveSaku.getActive(); return { active, entry: Library.entryForActive(Library.list(), active) }; },
  check: async character => { const schema = await loadAdoptedSchema(); return validateCompleteAdoptedCharacter(character, schema).errors; },
  getLocale: () => locale(),
  setLocale: next => window.SAKU_DESKTOP_I18N?.setLocale(next),
  onNavigate: screen => { if (!Object.hasOwn(PANELS, screen)) return false; void showScreen(screen); return true; },
  onClear: () => clearSelection(),
  badgeOf: entry => originBadgeFor(entry),
}) : null;
if (typeof window !== "undefined") window.addEventListener("hashchange", () => { const name = location.hash.slice(1); if (Object.hasOwn(PANELS, name) && name !== currentScreen) void showScreen(name); });

// ── ④ 出力 (Owner 2026-10-14: the three exports on one screen) ─────────────────
//
// .zip and .json/.yaml leave through the same gate as ②'s tab downloads: the save check, ContactGuard and a
// person's confirmation of this exact text (character-output.mjs). A changed pack Character carries the pack's
// terms: the notice says so, and the .zip's manifest names the pack and its license id (00A 2026-10-14).
let exportConfirmedText = null;
function exportSubject() {
  const active = ActiveSaku.getActive();
  const character = active?.character && typeof active.character === "object" ? active.character : null;
  return { character, entry: exportEntryFor(Library.entryForActive(liveEntries(), active)) };
}
async function exportCheck() {
  // L11: the row is read (exportEntryFor) with K2 and the content digests read fresh, so the refresh comes first.
  await refreshLegacyImported();
  const { character, entry } = exportSubject();
  if (!character) return { character: null, entry: null, text: "", gate: null };
  const text = characterJsonText(character);
  let schemaOk = false;
  try { schemaOk = validateCompleteAdoptedCharacter(character, await loadAdoptedSchema()).ok; } catch { schemaOk = false; }
  return { character, entry, text, gate: outputGate({ text, schemaOk, confirmedText: exportConfirmedText }) };
}
async function renderExport() {
  const { character, entry, text, gate } = await exportCheck();
  const lang = locale() === "en-US" ? "en" : "ja";
  if (!character) setStatus($("export-subject"), "EXPORT_READY", "書き出すキャラクターを選んでください。", "info");
  else setStatus($("export-subject"), "EXPORT_SUBJECT", [{ data: character.identity?.display_name || character.identity?.character_id || "" }, ` rev ${character.identity?.character_revision || "?"}`], "info");
  await refreshLegacyImported();
  renderExportPermissions(entry, character);
  void evaluateStandard();
  const terms = packTermsNotice(entry);
  const termsSlot = $("export-terms");
  termsSlot.hidden = !terms;
  if (terms) termsSlot.textContent = tr("パックのキャラクターを編集したものです（元：{pack} {version}）。パックの使用条件が続きます。再配布はできません。改変ありとして扱われます。", { pack: terms.pack_id, version: terms.pack_version || "?" });
  const confirm = $("export-confirm");
  if (confirm.checked && exportConfirmedText !== text) { confirm.checked = false; exportConfirmedText = null; }
  const guard = character ? contactGuard(text) : { safe: true, hits: [] };
  // What the person confirms is shown beside the box (2026-10-14 keying, Owner 5): the exact text that would be written.
  const preview = $("export-preview-text");
  if (preview) preview.textContent = character ? text : "";
  $("export-guard-status").textContent = !character ? "ContactGuard（連絡先の紛れ込みの検査）：待機中"
    : !guard.safe ? tr("ContactGuard（連絡先の紛れ込みの検査）：{hits}を検知。書き出しを止めます", { hits: guard.hits.join("、") })
    : gate && !gate.schemaOk ? "採択済みSchemaに合わないため、書き出しを止めます。②キャラクター編集で直してください"
    : gate?.confirmed ? "ContactGuard（連絡先の紛れ込みの検査）：検知なし・確かめ済み"
    : "ContactGuard（連絡先の紛れ込みの検査）：検知なし。上の中身を確かめて、下のチェックを入れてください";
  void lang;
}
async function showExport() {
  showPanel("out");
  await renderExport();
}
function saveExportBytes({ filename, bytes, text, slot, savedLabel }) {
  const say = (code, message, kind) => setStatus(slot, code, message, kind);
  slot.hidden = false;
  if (invoke) {
    const call = bytes
      ? invoke("save_self_made_zip", { filename, bytes: Array.from(bytes), dialogTitle: locale() === "en-US" ? "Save the SAKU Character" : "SAKU キャラクターを書き出す" })
      : invoke("save_builder_file", { filename, content: text, dialogTitle: locale() === "en-US" ? "Save the Character definition" : "キャラクター定義を書き出す" });
    return call.then(result => {
      if (result?.status === "SAVED") say("EXPORT_SAVED", tr("{label}を保存しました: {path}", { label: savedLabel, path: result.path }), "success");
      else if (result?.status === "CANCELLED") say("EXPORT_CANCELLED", "保存をやめました。", "info");
      else say("EXPORT_FAILED", tr("保存できませんでした: {reason}", { reason: result?.reason || "UNKNOWN" }), "error");
    }).catch(error => say("EXPORT_FAILED", tr("保存できませんでした: {reason}", { reason: String(error) }), "error"));
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes || text], { type: bytes ? "application/zip" : "application/octet-stream" }));
  link.download = filename; link.click(); URL.revokeObjectURL(link.href);
  say("EXPORT_REQUESTED", tr("ブラウザへダウンロードを要求しました: {filename}", { filename }), "info");
  return Promise.resolve();
}
// Owner 結果 188 (00A QA13 Q27–Q30): what a list row may be exported as, decided once, before any bytes are made.
// The refusals of every export (ライター&SNS; the English is in i18n.mjs): one table, shared with ②'s 「ダウンロード」「コピー」.
const EXPORT_REFUSAL_WORDS = Object.freeze(Object.fromEntries(Object.entries(ExportOrigin.EXPORT_REFUSAL_WORDS).map(([code, words]) => [code, words.ja])));
// L10 (00A C06-1〜6): before the kit's table, a row saved with no record of where it came from is checked against the
// known pack Character IDs (the list's pack rows and the Workspace's imported packs). The kit is not changed.
async function refreshLegacyImported() {
  if (!invoke) legacyImported = { status: "NO_HOST", ids: [] };
  else { try { legacyImported = await invoke("list_imported_pack_ids"); } catch { legacyImported = { status: "UNREADABLE", ids: [] }; } }
  declaredDigests = await DeclaredOrigin.currentDigests(liveEntries());
  return legacyImported;
}
const originContext = () => ({ imported: legacyImported, digests: declaredDigests });
// L10 (統括 照らし NG-4, 00A C06-3): the marks of ① and the frame read an unrecorded row that carries a known pack
// Character ID as 出どころ不明, as its exports do; before the host has answered, the list's pack rows alone.
// L11-6: a row a person may confirm is marked as it is read for an export (declared-origin.mjs); a held one stays 出どころ不明.
const originBadgeFor = entry => LegacyOrigin.originBadge(DeclaredOrigin.declaredOrigin(entry, liveEntries(), originContext()).entry || entry, liveEntries(), legacyImported, badgeFor);
function exportRefusal(entry, kind) {
  // L11: a row of unknown origin a person may confirm is held by declared-origin.mjs before the kit is asked.
  if (entry && entry.export_hold) return { code: entry.export_hold, message: EXPORT_REFUSAL_WORDS[entry.export_hold] || tr("書き出せませんでした（{code}）。", { code: entry.export_hold }) };
  const legacy = LegacyOrigin.legacyExportRefusal(entry, liveEntries(), legacyImported);
  if (legacy) return { code: legacy.code, message: EXPORT_REFUSAL_WORDS[legacy.code] || tr("書き出せませんでした（{code}）。", { code: legacy.code }) };
  const verdict = SkillExport.exportPermission(entry, kind);
  return verdict.ok ? null : { code: verdict.code, message: EXPORT_REFUSAL_WORDS[verdict.code] || tr("書き出せませんでした（{code}）。", { code: verdict.code }) };
}
// Each export section says up front whether it applies to the chosen row (its button cannot be pressed when not).
function renderExportPermissions(entry, character) {
  for (const [kind, buttons, slotId] of [["zip", ["export-zip-save"], "export-zip-state"], ["skill", ["platform-skill-export-save"], "platform-skill-export-state"], ["text", ["export-json-save", "export-yaml-save"], "export-text-state"]]) {
    const refusal = character ? exportRefusal(entry, kind) : null;
    for (const id of buttons) { const button = $(id); if (button) button.dataset.policyBlocked = refusal ? refusal.code : ""; }
    const slot = $(slotId);
    if (!slot) continue;
    if (refusal) { slot.hidden = false; setStatus(slot, refusal.code, refusal.message, "info"); }
    else if (slot.dataset.policyShown === "1") { slot.hidden = true; slot.replaceChildren(); }
    slot.dataset.policyShown = refusal ? "1" : "";
    for (const id of buttons) { const button = $(id); if (button && kind !== "skill") button.disabled = Boolean(refusal); }
  }
}

async function exportGuarded(slot) {
  const checked = await exportCheck();
  if (!checked.character) { slot.hidden = false; setStatus(slot, "EXPORT_NO_CHARACTER", "書き出すキャラクターを選んでください。", "warning"); return null; }
  if (!checked.gate.ok) {
    slot.hidden = false;
    const reason = !checked.gate.schemaOk ? "採択済みSchemaに合わないため、書き出しませんでした。②キャラクター編集で直してください。"
      : checked.gate.hits.length ? tr("ContactGuard が {hits} を検知したため、書き出しませんでした。", { hits: checked.gate.hits.join("、") })
      : "「書き出す中身を見る」で中身を確かめてから、「書き出す中身（上の定義）と、ContactGuard の結果を確かめました」にチェックを入れてください。";
    setStatus(slot, "EXPORT_GATE_BLOCKED", reason, "warning");
    return null;
  }
  return checked;
}
$("export-confirm").addEventListener("change", async event => {
  const { character } = exportSubject();
  exportConfirmedText = event.target.checked && character ? characterJsonText(character) : null;
  // A stop notice from before the box was ticked no longer applies (2026-10-14 keying 6-4).
  for (const id of ["export-zip-state", "platform-skill-export-state", "export-text-state"]) {
    const slot = $(id);
    if (slot && /EXPORT_GATE_BLOCKED/.test(slot.textContent || "")) { slot.hidden = true; slot.replaceChildren(); }
  }
  await renderExport();
});
$("export-zip-save").addEventListener("click", async () => {
  const slot = $("export-zip-state");
  const checked = await exportGuarded(slot);
  if (!checked) return;
  await refreshLegacyImported();
  const zipRefusal = exportRefusal(checked.entry, "zip");
  if (zipRefusal) { slot.hidden = false; setStatus(slot, zipRefusal.code, zipRefusal.message, "warning"); return; }
  // The file that goes back to AMU Studio (signed round trip) comes after β.5 (Owner 結果 172); a return is not
  // written as a SAKU Character ZIP until then. .json / .yaml and Agent Skills export it (00A 2026-10-14).
  if (checked.entry?.provenance?.via === "AMU_STUDIO_RETURN" || Library.originOf(checked.entry || {}).kind === "AMU_RETURN") {
    slot.hidden = false;
    setStatus(slot, "EXPORT_RETURN_ZIP_LATER", "AMU Studio から戻ってきたキャラクターは、いまは .zip にしません（AMU Studio へ戻すファイルは β.5 の後に作ります）。.json／.yaml と Agent Skills では書き出せます。", "info");
    return;
  }
  const terms = packTermsNotice(checked.entry);
  let editedFrom = checked.entry?.provenance?.edited_from || null;
  // 00A QA10: the manifest's edited_from carries the pack's license id in the current form. A changed pack row may hold the
  // stale id the sold packs state; it is mapped from the kept LICENSE.md, as the Agent Skills export does, or the ZIP stops.
  if (terms && checked.entry?.provenance?.kind === "PACK_EDITED") {
    try {
      const { source } = SkillExport.exportSourceFor(checked.entry, sha => SkillExport.packLicenseText(window.localStorage, sha));
      editedFrom = { ...(editedFrom?.character_digest ? { character_digest: editedFrom.character_digest } : {}), ...source.derived_from };
    } catch (error) {
      slot.hidden = false;
      setStatus(slot, error?.code || "EXPORT_ZIP_INVALID", tr("ZIP を作れませんでした: {codes}", { codes: error?.code || String(error) }), "error");
      return;
    }
  }
  let appVersion = null;
  if (invoke) { try { appVersion = (await invoke("get_runtime_state"))?.app_version || null; } catch { /* stays null */ } }
  let built;
  try {
    built = await buildSelfMadeCharacterZip({ slug: checked.character.identity?.character_id, characterText: checked.text, appVersion, exportChecks: { adopted_schema: "PASS", contact_guard: "PASS", human_confirmation: true }, editedFrom: terms ? editedFrom : null });
  } catch (error) {
    slot.hidden = false; setStatus(slot, "EXPORT_ZIP_INVALID", tr("ZIP を作れませんでした: {codes}", { codes: error?.message || String(error) }), "error"); return;
  }
  const verdict = await checkSelfMadeCharacterZip(built.bytes);
  if (!verdict.ok) { slot.hidden = false; setStatus(slot, "EXPORT_ZIP_INVALID", tr("ZIP を作れませんでした: {codes}", { codes: verdict.errors.join(", ") }), "error"); return; }
  await saveExportBytes({ filename: built.filename, bytes: built.bytes, slot, savedLabel: "SAKU キャラクター（.zip）" });
});
for (const [id, kind] of [["export-json-save", "json"], ["export-yaml-save", "yaml"]]) {
  $(id).addEventListener("click", async () => {
    const slot = $("export-text-state");
    const checked = await exportGuarded(slot);
    if (!checked) return;
    await refreshLegacyImported();
    const textRefusal = exportRefusal(checked.entry, "text");
    if (textRefusal) { slot.hidden = false; setStatus(slot, textRefusal.code, textRefusal.message, "warning"); return; }
    const text = kind === "json" ? checked.text : characterYamlText(checked.character);
    await saveExportBytes({ filename: outputFilename(checked.character, kind), text, slot, savedLabel: kind === "json" ? ".json" : ".yaml" });
  });
}
if (typeof window !== "undefined") window.addEventListener("saku-ui-locale-changed", () => { if (currentScreen === "out") void renderExport(); });

// ── 03 AI プラットフォームでキャラクターを動作 ────────────────────────────────
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
// G4 (2026-10-14): the row the Character was chosen from, by its entry_id — never the first row that
// happens to share the character_id (a pack row and an edited copy carry the same id).
function libraryEntryForPlatform() {
  return Library.entryForActive(liveEntries(), ActiveSaku.getActive());
}

// A return from AMU Studio is exported with its pack's terms (00A 2026-10-14): traced to the pack row in the list.
// Untraced, it stays as it is and the export stops (RETURN_PACK_UNKNOWN).
// S-7 (設計 v4 §8.3): a return reads as the pack it is traced to by its digest, never the newest version (export-origin.mjs).
function exportEntryFor(entry) {
  return ExportOrigin.exportEntryFor(entry, liveEntries(), originContext());
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
// Reference material attached on 03 (DECISION 2026-09-27-04, -08): held here for this hand-over only.
// It is never written to the Workspace, localStorage or the library, and opening 03 again starts empty.
let platformReference = null;
const REFERENCE_FILE_MAX_BYTES = 1024 * 1024;
// What the person is told (ライター&SNS 2026-09-27, 324dc60). The digests only show the file is intact:
// they are compared with values in the same file, so nothing is said about who made it or whether it
// was changed after export. English: 英語翻訳チーム 依頼 AH4–AH11 (Wi-t_Site 101e3d8).
const REFERENCE_TEXT_EN = Object.freeze({
  attached: count => `Reference material attached: ${count}. The file was checked for damage; who made it, and whether it was changed after it was exported, were not checked.`,
  refused: "This material could not be attached (nothing was attached). ",
  reasons: Object.freeze({
    a: "This is not in the form of a reference-material file. Choose a reference-material file.",
    b: "The contents of the file do not match what is recorded in the file. Make the file again.",
    c: "The material is over the limit (up to 12,000 characters in total, 20 items, and 3,000 characters per item). Use a file with less material.",
    d: "The file contains material that is not in the shared folder with Seat 8 (AMU's memory). Use a file with only the material from the shared folder with Seat 8.",
    e: "The material contains a line that is the same as the line used as a separator, or a title that is two or more lines long. Use a file in which that material has been corrected.",
    f: "The file is too large (up to about 1 MB). Use a file with less material.",
  }),
});
const REFERENCE_TEXT = Object.freeze({
  attached: count => `参考資料 ${count} 件を添付しました。ファイルが壊れていないことは確かめましたが、作った人や、書き出した後に手が加えられていないかは確かめていません。`,
  refused: "この資料は添付できませんでした（何も添付していません）。",
  reasons: Object.freeze({
    a: "参考資料のファイルの形ではありません。参考資料のファイルを選んでください。",
    b: "ファイルの中身が、ファイルに記録された内容と食い違っています。ファイルを作り直してください。",
    c: "資料が上限を超えています（合計 12,000 字・20 件・1 件 3,000 字まで）。資料を絞ったファイルにしてください。",
    d: "8 席との共有フォルダーにない資料（AMU の記憶）が入っています。8 席との共有フォルダーの資料だけのファイルにしてください。",
    e: "資料の中に、区切りに使う行と同じ行があるか、題名が 2 行以上あります。その資料を直したファイルにしてください。",
    f: "ファイルが大きすぎます（約 1 MB まで）。資料を絞ったファイルにしてください。",
  }),
});
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
    setStatus($("platform-subject"), "CHARACTER_REQUIRED", "「①キャラクター選択」からキャラクターを選んでください。", "warning");
    if (nameSlot) nameSlot.textContent = "未選択";
    if (launch) launch.value = "";
    // Nothing to copy: the button says so by not being pressable (it used to accept the click and do nothing).
    if ($("platform-copy")) $("platform-copy").disabled = true;
    if ($("platform-skill-export-save")) $("platform-skill-export-save").disabled = true;
    return;
  }
  const name = String(character?.identity?.display_name || "").trim() || "(display_name 未設定)";
  const revision = String(character?.identity?.character_revision || "").trim() || "revision 未設定";
  setStatus($("platform-subject"), "PLATFORM_SUBJECT", [{ data: name }, " — 貼り付けてもCharacterは変更されません。"], "info");
  if (nameSlot) nameSlot.textContent = `${name}（${revision}）`;
  const { options, glossaryProblems } = handoffOptions({ baseLayer, directives: platformDirectives, glossaryDigest: platformGlossaryDigest }, libraryEntryForPlatform());
  // handoffOptions builds a new object each time, so the attachment rides on this hand-over only.
  if (platformReference) options.reference = platformReference;
  if (launch) launch.value = platformLaunchText(character, HANDOFF_FORMAT, options);
  // A base layer that does not check out yields no text (fail closed): nothing to copy then either.
  if ($("platform-copy")) $("platform-copy").disabled = !launch?.value;
  // The skill carries the same layers as the text above: no text (a base layer that does not check out), no export.
  if ($("platform-skill-export-save")) $("platform-skill-export-save").disabled = !launch?.value;
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
  showPanel("run");
  clearPlatformReference();
  renderPlatform();
  void ensurePlatformHelp();
}

// The text in the display language; a notice already shown is shown again when the language changes.
const referenceText = () => (window.SAKU_DESKTOP_I18N?.getLocale?.() === "en-US" ? REFERENCE_TEXT_EN : REFERENCE_TEXT);
let referenceNotice = null;   // { kind: "attached", count } | { kind: "refused", reason }
function renderReferenceNotice() {
  const t = referenceText();
  if (!referenceNotice) return showReferenceState("info", "");
  if (referenceNotice.kind === "attached") return showReferenceState("info", t.attached(referenceNotice.count));
  return showReferenceState("error", `${t.refused}${t.reasons[referenceNotice.reason]}`);
}
if (typeof window !== "undefined") window.addEventListener("saku-ui-locale-changed", renderReferenceNotice);

function showReferenceState(kind, message) {
  const slot = $("platform-reference-state");
  if (!slot) return;
  slot.hidden = !message;
  slot.className = `status ${kind}`;
  slot.textContent = message || "";
}

function clearPlatformReference() {
  platformReference = null;
  if ($("platform-reference-file")) $("platform-reference-file").value = "";
  if ($("platform-reference-clear")) $("platform-reference-clear").hidden = true;
  referenceNotice = null;
  showReferenceState("info", "");
}

async function attachPlatformReference(file) {
  platformReference = null;
  if ($("platform-reference-clear")) $("platform-reference-clear").hidden = true;
  if (!file) { showReferenceState("info", ""); renderPlatform(); return; }
  let verdict;
  if (file.size > REFERENCE_FILE_MAX_BYTES) verdict = { ok: false, errors: [`REFERENCE_FILE_TOO_LARGE: ${file.size} bytes`] };
  else {
    try { verdict = await verifyReferenceExport(await file.text()); }
    catch (error) { verdict = { ok: false, errors: [`REFERENCE_UNREADABLE: ${error?.message || error}`] }; }
  }
  if (verdict.ok) {
    platformReference = verdict.reference;
    if ($("platform-reference-clear")) $("platform-reference-clear").hidden = false;
    referenceNotice = { kind: "attached", count: verdict.reference.excerpts.length };
    renderReferenceNotice();
  } else {
    if ($("platform-reference-file")) $("platform-reference-file").value = "";
    // The technical reason stays out of the text; it is kept on the element for support.
    referenceNotice = { kind: "refused", reason: referenceRefusalKind(verdict.errors) };
    renderReferenceNotice();
    if ($("platform-reference-state")) $("platform-reference-state").dataset.reason = verdict.errors[0] || "";
  }
  renderPlatform();
}

function handOffImport(result) {
  currentImportResult = result;
  const summary = packageSummary(result);
  packageFields(summary);
  // Record the import itself, not the Character. Re-reading history can show
  // what happened without touching any Character.
  const historyId = recordImport({
    kind: "PACKAGE",
    source_path: result.source_path || result.imported_path || "",
    status: result.status === "IMPORTED" ? "CHECKING" : result.status,
    code: result.code || "",
    fields: summary,
  });
  result = { ...result, history_id: historyId };
  currentImportResult = result;
  if (result.status !== "IMPORTED") {
    const reason = importRecovery(result.code || result.status, result.reason);
    showStatus(result.code || result.status, reason, result.status === "NOT_CONFIGURED" ? "warning" : "error");
    showRecovery(result.status === "NOT_CONFIGURED" ? "workspace" : "package", result.reason || result.status);
    showViewerStatus(result.code || result.status, tr("{reason} Packageを選び直すかHelpを確認してください。", { reason: reason || "Package is not available." }), "error");
    return;
  }
  if (result.self_made) { handOffSelfMadeZip(result); return; }
  // The host binds manifest to payload too; re-asking here keeps the browser
  // path honest and means the binding is testable without the native host.
  const characters = charactersOf(result.payload_json);
  const binding = checkManifestBinding(result.manifest, characters);
  if (!binding.ok) {
    showStatus(binding.code, binding.reason, "error");
    showViewerStatus(binding.code, tr("{reason} 取り込みは行いませんでした。", { reason: binding.reason }), "error");
    showRecovery("package", binding.code);
    finishImport(result.history_id, { status: "REFUSED", code: binding.code });
    return;
  }
  if (result.pack) { handOffCharacterPack(result, characters, binding); return; }
  if (result.saku_return) { handOffSakuReturn(result, characters); return; }
  // Since 2026-09-21 the host imports SAKU Character Packs only (the two-file
  // Builder package is retired), so an IMPORTED result without a pack summary
  // is a host/page mismatch, not a Character to adopt.
  showStatus("PACKAGE_RESULT_UNEXPECTED", "取り込み結果に Character Pack の情報がありません。アプリを更新してから読み込み直してください。", "error");
  showViewerStatus("PACKAGE_RESULT_UNEXPECTED", "取り込み結果に Character Pack の情報がありません。取り込みは行いませんでした。", "error");
  finishImport(result.history_id, { status: "REFUSED", code: "PACKAGE_RESULT_UNEXPECTED" });
}

// A sold SAKU Character Pack. The host recomputed every digest; the signatures
// are checked here with the pinned publisher keys. FAIL refuses the whole pack.
// DIGEST_ONLY (no Ed25519 in this WebView) imports, but the label says so.
/** The sentence the host writes about signatures (main.rs import_character_pack). */
const HOST_SIGNATURE_NOT_VERIFIED = "署名（Ed25519）はこのホストでは未検証です。";

// G1 (2026-10-14): the host stages a pack under imports/.pending; the page commits it after the
// signature check or discards it. A result without pending_id (a host before this change) has
// nothing staged and is passed through.
async function commitStagedPack(result) {
  if (!result.pending_id) return { ok: true, path: result.imported_path || "" };
  const invoke = tauriInvoke();
  if (!invoke) return { ok: false, reason: "NATIVE_HOST_UNAVAILABLE" };
  try {
    const path = await invoke("commit_pack_import", { pendingId: result.pending_id, payloadSha256: result.manifest?.payload_hash || "" });
    return { ok: true, path: String(path || "") };
  } catch (error) { return { ok: false, reason: String(error) }; }
}

async function discardStagedPack(result) {
  if (!result.pending_id) return;
  const invoke = tauriInvoke();
  if (!invoke) return;
  try { await invoke("discard_pack_import", { pendingId: result.pending_id }); } catch { /* the next workspace scan removes it */ }
}

// A self-made Character ZIP (<id>.saku-character.zip), SAKU Builder's own export. The host hands the
// bytes over; the rules are AMU Studio's (format_version 1, signature NONE, two entries, digests).
// It is never signed: the row is 「WI-T.COM署名無し・自作」, or 「WI-T.COM署名無効・改変あり」 when the manifest
// names the pack it was edited from (self-reported).
async function handOffSelfMadeZip(result) {
  const bytes = new Uint8Array(result.self_made.bytes || []);
  const verdict = await checkSelfMadeCharacterZip(bytes);
  if (!verdict.ok) {
    const reason = tr("SAKU のキャラクターの ZIP の決まりに合わないため、取り込みませんでした（{codes}）。", { codes: verdict.errors.slice(0, 3).join(", ") });
    showStatus("SELF_MADE_ZIP_INVALID", reason, "error");
    showViewerStatus("SELF_MADE_ZIP_INVALID", reason, "error");
    showRecovery("package", "SELF_MADE_ZIP_INVALID");
    finishImport(result.history_id, { kind: "PACKAGE", source_path: result.source_path || "", status: "REFUSED", code: "SELF_MADE_ZIP_INVALID" });
    return;
  }
  const editedFrom = verdict.manifest.edited_from || null;
  const meta = { kind: "SELF_MADE_ZIP", ...(editedFrom ? { edited_from: { ...editedFrom } } : {}), zip_sha256: result.self_made.sha256 || "", manifest_digest: verdict.manifest.manifest_digest || "" };
  clearRecovery();
  showStatus("SELF_MADE_ZIP_READY", tr("自作のキャラクターの ZIP: {name}（rev {revision}）。", { name: verdict.character?.identity?.display_name || "", revision: verdict.character?.identity?.character_revision || "" }), "success");
  await addToLibrary([verdict.character], "SELF_MADE_ZIP", { status: "IMPORTED", code: "SELF_MADE_ZIP_READY" }, () => meta);
  finishImport(result.history_id, { status: "IMPORTED", code: "SELF_MADE_ZIP_READY" });
}

async function handOffCharacterPack(result, characters, binding) {
  const pack = result.pack;
  const signatures = await assessPackSignatures(pack);
  if (signatures.signature_state === "FAIL") {
    // G1 (2026-10-14): the staged copy goes too, so the workspace rebuild cannot bring it back.
    await discardStagedPack(result);
    const detail = { details: signatures.detail || "" };
    showStatus("CHARACTER_PACK_SIGNATURE_INVALID", ["署名検証に失敗したため取り込みませんでした。", detail], "error");
    showViewerStatus("CHARACTER_PACK_SIGNATURE_INVALID", ["署名検証に失敗したため取り込みませんでした。配布元から入手し直してください。", detail], "error");
    showRecovery("package", "CHARACTER_PACK_SIGNATURE_INVALID");
    finishImport(result.history_id, { kind: "PACKAGE", source_path: result.source_path || "", status: "REFUSED", code: "CHARACTER_PACK_SIGNATURE_INVALID" });
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
  // The pack's LICENSE.md is kept once per text for the Agent Skills export (ADR-0026 §11); each entry keeps its SHA-256.
  if (typeof pack.license_md === "string" && pack.license_md) {
    const sha = await SkillExport.sha256Hex(pack.license_md);
    if (SkillExport.rememberPackLicense(window.localStorage, sha, pack.license_md)) pack.license_md_sha256 = sha;
  }
  // G1: the pack reaches imports/ only now that its signatures were accepted (PASS or DIGEST_ONLY).
  const committed = await commitStagedPack(result);
  if (!committed.ok) {
    await discardStagedPack(result);
    const reason = tr("取り込みを確定できなかったため、一覧には加えませんでした: {detail}", { detail: committed.reason });
    showStatus("CHARACTER_PACK_COMMIT_FAILED", reason, "error");
    showViewerStatus("CHARACTER_PACK_COMMIT_FAILED", reason, "error");
    showRecovery("package", "CHARACTER_PACK_COMMIT_FAILED");
    finishImport(result.history_id, { kind: "PACKAGE", source_path: result.source_path || "", status: "FAILED", code: "CHARACTER_PACK_COMMIT_FAILED" });
    return;
  }
  if (committed.path) { result = { ...result, imported_path: committed.path }; if (currentImportResult && currentImportResult.pending_id === result.pending_id) currentImportResult = { ...currentImportResult, imported_path: committed.path }; }
  const verification = packVerification(result, signatures);
  const meta = packEntryMeta(pack, signatures, directivesOf(result.payload_json));
  const classes = [...meta.values()].reduce((acc, item) => { acc[item.operation_class] = (acc[item.operation_class] || 0) + 1; return acc; }, {});
  const classText = Object.entries(classes).sort().map(([cls, count]) => `${cls}:${count}`).join(" / ");
  clearRecovery();
  showStatus("CHARACTER_PACK_IMPORTED", tr("{pack} {version}: {count}体（運用区分 {classes}）。{signature}。保存先: {path}", { pack: pack.pack_id, version: pack.pack_version, count: pack.character_count, classes: classText, signature: signatureStateText(signatures.signature_state, "ja", signatures.fingerprints?.[pack.pack_publisher_key_id] || null), path: result.imported_path }), signatures.signature_state === "PASS" ? "success" : "warning");
  await addToLibrary(characters, "PACKAGE", verification, character => meta.get(String(character?.identity?.character_id || "")) || null);
  // The row keeps the checked outcome: the reason says what the page verified (3-12), the same value the badge shows.
  finishImport(result.history_id, { status: "IMPORTED", code: "CHARACTER_PACK_IMPORTED", fields: packageSummary(currentImportResult && currentImportResult.history_id === result.history_id ? currentImportResult : result) });
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
    const detail = { details: signatures.detail || "" };
    showStatus("SAKU_RETURN_SIGNATURE_INVALID", ["署名検証に失敗したため取り込みませんでした。", detail], "error");
    showViewerStatus("SAKU_RETURN_SIGNATURE_INVALID", ["署名検証に失敗したため取り込みませんでした。AMU Studio で作り直すか、元のパックを取り込み直してください。", detail], "error");
    showRecovery("package", "SAKU_RETURN_SIGNATURE_INVALID");
    finishImport(result.history_id, { kind: "PACKAGE", source_path: result.source_path || "", status: "REFUSED", code: "SAKU_RETURN_SIGNATURE_INVALID" });
    return;
  }
  const comparison = compareReturnWithLibrary(ret, Library.list());
  const lang = locale() === "en-US" ? "en" : "ja";
  const verification = returnVerification(result, signatures);
  const meta = returnEntryMeta(ret, signatures, comparison);
  clearRecovery();
  const noteHead = String(ret.note || "").replace(/\s+/g, " ").slice(0, 80) + (String(ret.note || "").length > 80 ? "…" : "");
  const fieldsText = (ret.fields || []).length ? tr("対象: {fields}", { fields: ret.fields.join("、") }) : tr("対象フィールドの指定なし");
  showStatus("SAKU_RETURN_IMPORTED", tr("AMU Studio からの戻し: {name} rev {revision}。編集依頼: {note}（{fields}）。{relation} {signature}。workspace には保存していません。", { name: ret.display_name || ret.character_id, revision: ret.character_revision, note: noteHead, fields: fieldsText, relation: returnRelationText(comparison, ret, lang), signature: signatureStateText(signatures.signature_state, lang, signatures.fingerprints?.[ret.publisher_key_id] || null) }), signatures.signature_state === "PASS" ? "success" : "warning");
  const outcome = await addToLibrary(characters, "SAKU_RETURN", verification, () => meta);
  finishImport(result.history_id, { status: "IMPORTED", code: "SAKU_RETURN_IMPORTED" });
  if (outcome?.saved && outcome.added + outcome.replaced > 0) {
    showViewerStatus("SAKU_RETURN_IMPORTED", tr("{name}（rev {revision}）を一覧に追加しました（workspace には保存していません）。{relation} 詳細の「AMU からの編集依頼」を確認してから編集してください。", { name: ret.display_name || ret.character_id, revision: ret.character_revision, relation: returnRelationText(comparison, ret, lang) }), "success");
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
      if (!usable.length) { failures.push(tr("{filename}: Characterが見つかりません", { filename: file.name })); continue; }
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
  showViewerStatus("CONFORMANCE_LOCATOR_MISMATCH", tr("{count}件は取り込めませんでした（locator＝参照位置が要件とずれています）: {lines}{more} 「locator を修復して読み込む」は requirement_id から参照位置を計算し直すだけで、本文は変えません（修復後は新しい revision になります）。", { count: repairable.length, lines: lines.join(" / "), more: lines.length < repairable.length * 3 ? "" : " …" }), "warning");
  const button = document.createElement("button");
  button.type = "button"; button.className = "btn-sm"; button.id = "viewer-repair-locators";
  button.textContent = tr("locator を修復して読み込む（{count}件）", { count: repairable.length });
  button.addEventListener("click", async () => {
    button.disabled = true;
    const repaired = []; const meta = new Map(); const stillRefused = [];
    for (const character of repairable) {
      const outcome = await repairLocators(character, { bumpRevision: true });
      if (outcome.remaining.length) { stillRefused.push(tr("{name}: {count}件は requirement_id が見つからず修復できません", { name: Library.displayNameOf(character) || character?.identity?.character_id, count: outcome.remaining.length })); continue; }
      repaired.push(outcome.character);
      meta.set(outcome.character, { source: "FILE_REPAIRED", locator_repair: outcome.record });
    }
    const result = repaired.length ? await addToLibrary(repaired, "FILE_REPAIRED", null, character => meta.get(character) || null) : null;
    recordImport({ kind: "FILE", source_path: sourceNames, status: repaired.length ? "IMPORTED" : "REFUSED", code: repaired.length ? "LOCATOR_REPAIRED" : "CONFORMANCE_LOCATOR_MISMATCH", fields: [] });
    if (result?.saved && repaired.length) {
      const detail = repaired.map(character => `${Library.displayNameOf(character)}（rev ${meta.get(character).locator_repair.from_revision} → ${character.identity.character_revision}、locator ${meta.get(character).locator_repair.rewritten}件）`).join(" / ");
      showViewerStatus("LOCATOR_REPAIRED", tr("{count}件の locator を修復して一覧に追加しました: {detail}。{unrepaired} 詳細の「locator 修復」行に記録があります。", { count: repaired.length, detail, unrepaired: stillRefused.length ? tr(" 修復できなかったもの: {list}", { list: stillRefused.join(" / ") }) : "" }), stillRefused.length ? "warning" : "success");
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
  if (missing) { showViewerStatus("CHARACTER_NOT_EDITABLE", tr("{name} は {field} が未設定のため編集画面へ渡せません。取り込んだファイルに {field} を追加してください。", { name: record.name, field: missing }), "warning"); return; }
  // The active contract is SAKU_UNIFIED_SCHEMA_V1 and the UI baseline is V1, so
  // editing goes to the V1-baseline Builder. That surface authors the v1
  // migration-source schema, which shares no field path with Unified V1, so it
  // does not fill itself from the handed-off Character: it names what it
  // received and leaves the Character untouched rather than reinterpreting it.
  ActiveSaku.setActive(record.source_character, { source: "library-edit", entry_id: record.entry_id });
  storeBoundCharacter("saku.desktop.pendingCharacter", record.source_character);
  location.href = handoffUrl(record, "builder");
}

// Choosing a Character is what makes it the subject; every route out of the
// list goes through here so TOP and the Trainer cannot disagree about who is
// selected.
function selectSubject(record, source) {
  if (!record) return false;
  ActiveSaku.setActive(record.source_character, { source, entry_id: record.entry_id });
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
      tr("{name} は Schema が判定できないため開けません（{code}）。一覧から削除できます。", { name: record.name, code: record.unsupported_code }), "warning");
    return;
  }
  if (record.schema_kind === "V1_CHARACTER" && (action === "edit" || action === "train")) {
    closeActions();
    showViewerStatus("SCHEMA_ROUTE_UNAVAILABLE",
      V1_RECREATE_NOTE, "warning");
    return;
  }
  if (action === "view") {
    selectedViewerId = record.id; selectSubject(record, "library-view"); closeActions(); renderCatalog();
    showViewerStatus("CHARACTER_SELECTED", tr("{name} を選択しました。", { name: record.name }), "success");
    // The notice sits at the top of the list; bring it into view from wherever the card was.
    $("viewer-status").scrollIntoView({ block: "center" });
    return;
  }
  if (action === "run") { closeActions(); if (selectSubject(record, "library-platform")) showPlatform(); return; }
  if (action === "edit") { closeActions(); openBuilderCopy(record.id); return; }
  if (action === "delete") {
    const outcome = Library.setDeleted([record.id], !record.deleted);
    closeActions(); renderLibrary();
    showViewerStatus(record.deleted ? "CHARACTER_RESTORED" : "CHARACTER_DELETED",
      record.deleted ? tr("{name} を一覧に戻しました。", { name: record.name }) : tr("{name} を削除しました。「削除済み」フィルタで元に戻せます。", { name: record.name }),
      outcome.saved ? "success" : "error");
  }
}

$("choose-workspace").addEventListener("click", chooseWorkspace); $("viewer-import-package").addEventListener("click", choosePackage);
$("viewer-import-samples").addEventListener("click", importSamples); refreshSampleButton();
$("host-retry-workspace").addEventListener("click", chooseWorkspace); $("host-retry-import").addEventListener("click", choosePackage);
document.addEventListener("click", event => {
  const go = event.target.closest("[data-guide-go]");
  if (!go) return;
  const target = go.dataset.guideGo;
  if (target === "workspace") { chooseWorkspace(); return; }
  if (target === "edit") { location.href = "./tools/saku-builder.html?desktop=app"; return; }
  void showScreen(target);
});
$("platform-to-skills").addEventListener("click", () => { void showExport().then(() => $("platform-skill-export").scrollIntoView({ block: "start" })); });
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
});
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

$("platform-reference-file")?.addEventListener("change", event => { void attachPlatformReference(event.target.files?.[0] || null); });
$("platform-reference-clear")?.addEventListener("click", () => { clearPlatformReference(); renderPlatform(); });
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
// 03: the Agent Skills export (ADR-0026; Owner 2026-10-03, β.12). One skill folder in a ZIP, saved through the host's
// own narrow door (save_skill_export_zip). The layer is unsigned; a pack entry is NOT_VERIFIED (00A 2026-10-04).
// Wording: ライター&SNS 2026-10-04 (the lead in index.html rewritten, the rest approved as drafted).
// ── ④ パック標準を保存 (SAKU β.13 L19; ADR-0027 §4.3, design v4 §7.2 and §3.3) ───────────────────────────────────
// The attachment the host opened is kept for this session only, never written. The kit checks it against the facts of
// the pack row the Character was chosen from; only a VALID nameplate is saved, with the inner ZIP's bytes as they are.
// The nameplate mark sits in its own line, apart from the Character, pack and .amupkg marks (ALIGN W-2).
// S-4 (2026-10-22): the name tag is checked against the trust the app carries, kokoroamu-trust gen 11, read at each check
// and verified by its root signature, the pinned generation and digest, its revocations and its next_update
// (pinned-trust.mjs). When it cannot be read, no index is given and the name tag reads 未確認: nothing is saved.
const STANDARD_TRUST_FILES = new URL("../tools/vendor/kokoroamu-trust-42013dc/trust/v1/", import.meta.url);
const standardTrustIndex = () => nameplateTrustIndex(async name => {
  const response = await fetch(new URL(name, STANDARD_TRUST_FILES));
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.text();
});
// Texts: ライター&SNS 2026-10-22 (FROM_WRITER_2026-10-22_SAKU_L19_texts.md; the UNVERIFIED and INVALID marks
// fixed at 11:19 to the Character marks' form, ALIGN §3 L-2). INVALID: Owner 結果 416 (2026-10-24, 法務の続き 5 §3-1).
const STANDARD_TEXT = Object.freeze({
  plate: Object.freeze({ VALID: "名札：WI-T.COM署名有効", NONE: "名札：WI-T.COM署名無し", UNVERIFIED: "名札：WI-T.COM署名未確認", INVALID: "名札：WI-T.COM署名検証不成立" }),
  plateNote: Object.freeze({
    VALID: "名札の署名を、このアプリの信頼の一覧で確かめられました。名札の署名が有効であることは、署名対象データが当社の対応する鍵で署名され、署名後に変更されていないことを示します。内容の正確性、安全性、法令適合性、当社による承認又は権限付与を示すものではありません。",
    NONE: "この名札には署名がありません。",
    UNVERIFIED: "この環境では、WI-T.COM の名札の署名を確かめられませんでした（このアプリの信頼の一覧が古いときや、新しい形の署名のときなど）。変えられたという意味ではありません。",
    INVALID: "名札の署名の検証が成り立ちませんでした。変更・破損その他の検証不一致を含みます（署名の鍵の失効・引退を含みます）。",
  }),
  NOT_A_PACK_ROW: "標準のスキルがあるのは、パックから取り込んで編集していないキャラクターだけです。①でパックのキャラクターを選んでください。",
  NEEDS_REIMPORT: "このパックは前の版で取り込まれたため、標準のスキルを確かめるための情報がありません。パックを取り込み直してください。",
  MEMBER_INCOMPLETE: "パックの情報が足りないため、確かめられません。パックを取り込み直してください。",
  CHARACTER_NOT_IN_ATTACHMENT: "この別添には、選んでいるキャラクターの標準のスキルが入っていません。",
  PACK_NOT_VERIFIED: "元のパックの署名を確かめられていないため、別添を読みませんでした。",
  NO_SHA: "この環境では、別添を確かめられませんでした。",
  PACK_MISMATCH: "この別添は、選んでいるパックのものではありません。同じパック・同じ版の別添を選んでください。",
  ZIP_INVALID: "別添の ZIP を読めませんでした。パックと一緒に配られた別添の ZIP を、そのまま選んでください。",
  NOT_PACK_MEMBER: "この名札のキャラクターは、選んでいるパックに入っていません。",
  saved: "標準のスキルを保存しました：{path}",
});
const STANDARD_PACK_MISMATCH = new Set(["ATTACHMENT_PACK_MISMATCH", "ATTACHMENT_PACKAGE_DIGEST_WRONG_KIND", "ATTACHMENT_PACKAGE_DIGEST_MISSING"]);
function standardRefusalText(code, pack) {
  if (code === "CHARACTER_NOT_IN_ATTACHMENT") return STANDARD_TEXT.CHARACTER_NOT_IN_ATTACHMENT;
  // Two cases share ATTACHMENT_PACK_NOT_SELECTED (後の一覧 L18): the pack checked by digest only, or no SHA-256 here.
  if (code === "ATTACHMENT_PACK_NOT_SELECTED") return pack && pack.verification === "DIGEST_ONLY" ? STANDARD_TEXT.PACK_NOT_VERIFIED : STANDARD_TEXT.NO_SHA;
  if (STANDARD_PACK_MISMATCH.has(code)) return STANDARD_TEXT.PACK_MISMATCH;
  return STANDARD_TEXT.ZIP_INVALID;
}
async function evaluateStandard() {
  const run = ++standardRun;
  const slot = $("export-standard-state"), plate = $("export-standard-plate"), note = $("export-standard-plate-note"), save = $("export-standard-save");
  if (!slot || !plate || !note || !save) return;
  standardTarget = null; save.disabled = true; plate.hidden = true; note.hidden = true; slot.hidden = true;
  plate.textContent = ""; note.textContent = "";
  delete plate.dataset.nameplate;
  const say = (code, message) => { slot.hidden = false; setStatus(slot, code, message, "warning"); };
  // A read the host refused stays said until another companion ZIP is chosen (a redraw must not drop it).
  if (!standardAttachment) { if (standardReadCode) say(standardReadCode, STANDARD_TEXT.ZIP_INVALID); return; }
  const entry = Library.entryForActive(liveEntries(), ActiveSaku.getActive());
  const character = activeCharacterForPlatform();
  // The facts come from the row the Character was chosen from; nothing is read before they are known (no 「名札：無し」).
  const { pack, reason } = StandardSave.packFactsFromRows(liveEntries(), entry);
  if (!pack) { say(`STANDARD_${reason}`, STANDARD_TEXT[reason]); return; }
  const result = await verifyStandardAttachment({ outerEntries: standardAttachment.outerEntries, innerEntries: standardAttachment.innerEntries, pack, trustIndex: await standardTrustIndex() });
  if (run !== standardRun) return;
  const target = StandardSave.standardSaveTarget(result, standardAttachment.outerEntries, String(character?.identity?.character_id || ""));
  if (target.nameplate) {
    const state = target.nameplate.state;
    plate.hidden = false; plate.dataset.nameplate = state; plate.textContent = STANDARD_TEXT.plate[state] || STANDARD_TEXT.plate.UNVERIFIED;
    note.hidden = false; note.textContent = STANDARD_TEXT.plateNote[state] || STANDARD_TEXT.plateNote.UNVERIFIED;
    if (target.nameplate.result?.code === "ATTACHMENT_NOT_PACK_MEMBER") say("ATTACHMENT_NOT_PACK_MEMBER", STANDARD_TEXT.NOT_PACK_MEMBER);
  }
  if (target.saveable) { standardTarget = target; save.disabled = false; return; }
  if (target.code) say(target.code, standardRefusalText(target.code, pack));
}
if (!invoke && $("export-standard")) $("export-standard").hidden = true;
$("export-standard-choose")?.addEventListener("click", async () => {
  if (!invoke) return;
  let read = null;
  try { read = await invoke("choose_standard_attachment"); } catch (error) { if (/CANCELLED/.test(String(error))) return; }
  const decoded = StandardSave.decodeAttachmentRead(read);
  standardAttachment = decoded.ok ? { outerEntries: decoded.outerEntries, innerEntries: decoded.innerEntries } : null;
  standardReadCode = decoded.ok ? null : decoded.code;
  await evaluateStandard();
});
$("export-standard-save")?.addEventListener("click", async () => {
  const target = standardTarget;
  if (!invoke || !target || !target.saveable) return;
  const slot = $("export-standard-state");
  const say = (code, message, kind) => { slot.hidden = false; setStatus(slot, code, message, kind); };
  const result = await invoke("save_skill_export_zip", { filename: target.file, bytes: Array.from(target.bytes), dialogTitle: locale() === "en-US" ? "Save the pack standard" : "パック標準を保存" }) || { status: "ERROR", reason: "NO_RESULT" };
  if (result.status === "SAVED") say("STANDARD_SAVED", tr(STANDARD_TEXT.saved, { path: result.path }), "success");
  else if (result.status === "CANCELLED") say("STANDARD_SAVE_CANCELLED", SKILL_EXPORT_TEXT.cancelled, "info");
  else say("STANDARD_SAVE_FAILED", tr(SKILL_EXPORT_TEXT.failed, { reason: result.reason || "UNKNOWN" }), "error");
});

const SKILL_EXPORT_TEXT = Object.freeze({
  saved: "保存しました: {path}",
  cancelled: "保存をキャンセルしました。",
  requested: "ブラウザへダウンロードを要求しました: {filename}",
  failed: "保存できませんでした（{reason}）。",
  PACK_LICENSE_UNKNOWN: "このキャラクターは前の版で取り込んだため、書き出しに必要なライセンスの情報がありません。「①キャラクター選択」から、パックをもう一度取り込んでください。",
  LICENSE_TEXT_MISSING: "このキャラクターのパックのライセンス（LICENSE.md）が残っていません。「①キャラクター選択」から、パックをもう一度取り込んでください。",
  LICENSE_VERSION_UNREADABLE: "パックのライセンス（LICENSE.md）の版を読み取れないため、書き出しませんでした。",
  PACK_SIGNATURE_FAILED: "このキャラクターのパックは署名の確かめに通っていないため、書き出せません。",
  SKILL_NAME_TOO_LONG: "キャラクターの ID が 64 文字を超えるため、スキルの名前にできません。",
  SKILL_NAME_INVALID: "キャラクターの ID がスキルの名前の決まりに合わないため、書き出せません。",
  other: "書き出せませんでした（{code}）。",
});
let skillExportAppVersion = null;
$("platform-skill-export-save").addEventListener("click", async () => {
  const slot = $("platform-skill-export-state");
  const say = (code, message, kind) => { if (slot) { slot.hidden = false; setStatus(slot, code, message, kind); } };
  const character = activeCharacterForPlatform();
  if (!character) return;
  await refreshLegacyImported();
  const skillRefusal = exportRefusal(exportEntryFor(libraryEntryForPlatform()), "skill");
  if (skillRefusal) { say(skillRefusal.code, skillRefusal.message, "warning"); return; }
  const { options } = handoffOptions({ baseLayer, directives: platformDirectives, glossaryDigest: platformGlossaryDigest }, libraryEntryForPlatform());
  const body = baseLayerProblems.length ? "" : characterPromptText(character, options);
  try {
    if (!skillExportAppVersion && invoke) { try { skillExportAppVersion = (await invoke("get_runtime_state"))?.app_version || null; } catch { /* stays null */ } }
    const { source, licenseText } = SkillExport.exportSourceFor(exportEntryFor(libraryEntryForPlatform()), sha => SkillExport.packLicenseText(window.localStorage, sha));
    const out = await SkillExport.buildAgentSkillExport({ character, body, followLine: FOLLOW_LINE, source, licenseText, generatorVersion: skillExportAppVersion || "browser-preview", createdAt: new Date().toISOString() });
    const checked = await SkillExport.verifyAgentSkillExport({ overlay: out.overlay, files: out.files });
    if (checked.status !== "valid") throw Object.assign(new Error(checked.code), { code: checked.code });
    const encoder = new TextEncoder();
    const bytes = storedZip(Object.keys(out.files).sort().map(path => ({ name: `${out.name}/${path}`, bytes: encoder.encode(out.files[path]) })));
    const filename = `${out.name}.agent-skill.zip`;
    if (invoke) {
      const result = await invoke("save_skill_export_zip", { filename, bytes: Array.from(bytes), dialogTitle: locale() === "en-US" ? "Save as a skill" : "スキルとして保存" }) || { status: "ERROR", reason: "NO_RESULT" };
      if (result.status === "SAVED") say("SKILL_EXPORT_SAVED", tr(SKILL_EXPORT_TEXT.saved, { path: result.path }), "success");
      else if (result.status === "CANCELLED") say("SKILL_EXPORT_CANCELLED", SKILL_EXPORT_TEXT.cancelled, "info");
      else say("SKILL_EXPORT_FAILED", tr(SKILL_EXPORT_TEXT.failed, { reason: result.reason || "UNKNOWN" }), "error");
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    link.download = filename; link.click(); URL.revokeObjectURL(link.href);
    say("SKILL_EXPORT_REQUESTED", tr(SKILL_EXPORT_TEXT.requested, { filename }), "info");
  } catch (error) {
    const code = error?.code || "SKILL_EXPORT_FAILED";
    say(code, Object.hasOwn(SKILL_EXPORT_TEXT, code) ? SKILL_EXPORT_TEXT[code] : tr(SKILL_EXPORT_TEXT.other, { code }), "error");
  }
});
// 03 → 04 (O-9) is gone with 04 Trainer (Owner 2026-09-27, AMU DECISION 2026-09-27-11).
TuningUI.wire();

// In the app the host opens the picker over the window (2026-10-14 keying F3: the WebView's own picker opened small and
// folded at the bottom right); in a browser the page's file input stays.
$("viewer-import-file").addEventListener("click", async () => {
  const invoke = tauriInvoke();
  if (!invoke) { $("viewer-file-input").click(); return; }
  let picked;
  try { picked = await invoke("choose_character_files"); }
  catch (error) {
    const reason = String(error?.message || error);
    if (reason.includes("CANCELLED")) return;
    showViewerStatus("FILE_IMPORT_FAILED", tr("ファイルを読めませんでした: {reason}", { reason }), "error");
    return;
  }
  const files = (picked || []).map(item => ({ name: String(item.name || ""), text: async () => String(item.text || "") }));
  if (files.length) await importCharacterFiles(files);
});
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
  showViewerStatus("CHARACTERS_DELETED", tr("{count}件を削除しました。「削除済み」を「含めて表示」にすると元に戻せます。", { count: outcome.changed }), outcome.saved ? "success" : "error");
});

// The one destructive action on this screen, so it asks first.
$("viewer-clear-list").addEventListener("click", async () => {
  const totals = Library.summary();
  if (!totals.total) { showViewerStatus("LIST_ALREADY_EMPTY", "一覧は既に空です。", "info"); return; }
  if (!await ask("clearList", undefined, { count: totals.total })) return;
  const outcome = Library.clear();
  compareSelection.clear(); selectedViewerId = ""; renderLibrary();
  showViewerStatus("LIST_CLEARED", tr("{count}件を消去しました。", { count: outcome.removed }), outcome.saved ? "success" : "error");
});

$("viewer-new-character").addEventListener("click", () => {
  const created = Library.createDraft("NEW");
  if (!created.saved) { showViewerStatus("LIBRARY_SAVE_FAILED", `一覧に保存できませんでした: ${created.reason}`, "error"); return; }
  ActiveSaku.setActive(created.entry.character, { source: "new", entry_id: created.entry.entry_id });
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
// 「選択を解除」 (the frame's selected-Character line; it was on the old Home card).
async function clearSelection() {
  const summary = ActiveSaku.summary();
  if (summary && summary.dirty && !await ask("clearSelection")) return;
  ActiveSaku.clearActive();
  renderActiveSaku();
}
renderActiveSaku();
$("catalog-search").addEventListener("input", renderCatalog); for (const id of ["catalog-availability", "catalog-package-state", "catalog-category", "catalog-work-mode", "catalog-sort", "catalog-deleted"]) $(id).addEventListener("change", renderCatalog);
document.querySelectorAll("[data-catalog-view]").forEach(button => button.addEventListener("click", () => { catalogView = button.dataset.catalogView; renderCatalog(); }));
$("catalog-reset").addEventListener("click", () => { $("catalog-search").value = ""; $("catalog-availability").value = "ALL"; $("catalog-package-state").value = "ALL"; $("catalog-category").value = "ALL"; $("catalog-work-mode").value = "ALL"; $("catalog-deleted").value = "HIDE"; renderCatalog(); $("catalog-search").focus(); });
$("viewer-results").addEventListener("click", event => { const open = event.target.closest("[data-open-id]"); if (open) openActionsFor(open.dataset.openId); });
$("viewer-results").addEventListener("change", event => { const input = event.target.closest("[data-compare-id]"); if (!input) return; if (input.checked) compareSelection.add(input.dataset.compareId); else compareSelection.delete(input.dataset.compareId); const card = input.closest(".catalog-card"); if (card) card.dataset.checked = input.checked ? "true" : "false"; updateCompareStatus(); if (!$("compare-panel").hidden) renderComparison(); });
$("viewer-panel").addEventListener("click", event => {
  const button = event.target.closest("[data-builder-copy]"); if (button) openBuilderCopy(button.dataset.builderCopy);
  const own = event.target.closest("[data-confirm-own]"); if (own) void confirmOwnCharacter(own.dataset.confirmOwn);
});
// L11-2: the person's confirmation, asked in the app's dialog (N-4 by the row's kind). Read fresh first: a row that may no
// longer be offered (its ID is now a known pack Character's, K2 cannot be read) is not asked about.
async function confirmOwnCharacter(entryId) {
  await refreshLegacyImported();
  const entry = liveEntries().find(item => item.entry_id === entryId) || null;
  const declared = DeclaredOrigin.declaredOrigin(entry, liveEntries(), originContext());
  if (!(declared.state === "HOLD" && declared.offer)) { renderLibrary(); return; }
  const kind = DeclaredOrigin.rowKind(entry).kind;
  const words = DeclaredOrigin.CONFIRM_WORDS.body[kind];
  if (!await ask("confirmOwnCharacter", (locale() === "en-US" && words.en) || words.ja)) return;
  const written = DeclaredOrigin.writeRecord(entryId, await DeclaredOrigin.confirmationRecord(entry));
  if (!written.ok) showViewerStatus("LIBRARY_SAVE_FAILED", tr("一覧に保存できませんでした: {failure}", { failure: written.reason }), "error");
  await refreshLegacyImported();
  renderLibrary();
  void frame?.refresh();
}
$("compare-open").addEventListener("click", () => { renderComparison(); $("compare-panel").hidden = false; $("compare-close").focus(); });
$("compare-close").addEventListener("click", () => { $("compare-panel").hidden = true; $("compare-open").focus(); });
$("compare-clear").addEventListener("click", () => { compareSelection.clear(); $("compare-panel").hidden = true; renderCatalog(); });
window.addEventListener("saku-ui-locale-changed", () => { localizePlaceholders(); applySampleButton(); renderRecovery(); packageFields(packageSummary(currentImportResult || {})); updateFacets(); renderCatalog(); renderLibraryCount(); renderImportHistory(); if (!$("compare-panel").hidden) renderComparison(); });

const dropZone = $("drop-zone");
for (const name of ["dragenter", "dragover"]) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add("active"); });
for (const name of ["dragleave", "drop"]) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove("active"); });
dropZone.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePackage(); } });
if (tauri?.event?.listen) tauri.event.listen("tauri://drag-drop", event => importPath(event.payload?.paths?.[0]));
// Wait for the working copy to be bound before a screen reads the list.
localizePlaceholders(); if (!await applyStartupRoute()) await refreshState();
// The Builder's 「キャラクターを選択」 asks for the selection screen, not Home;
// its メニュー行の「③実行（プロンプト）」 asks for 03 with the Active SAKU it just set.
{
  const open = new URLSearchParams(location.search).get("open");
  const fromHash = location.hash.slice(1);
  const start = Object.hasOwn(PANELS, fromHash) ? fromHash : open === "select" ? "select" : open === "platform" ? "run" : "prep";
  await showScreen(start);
}



// A seam for the readiness gate: the three-state announcement depends on the
// native host reporting a Workspace, which a browser harness cannot provide.
// Exposing the render entry point lets the states be exercised for real rather
// than asserted from the source text.
if (typeof window !== "undefined") window.__saku_workspace_state = WorkspaceState;
if (typeof window !== "undefined") window.__saku_home = { renderState, renderActiveSaku, renderHomeGuidance, importCharacterFiles, renderLibrary, platformLaunchText, characterPromptText, formatLocalTimestamp, showScreen };

// Build provenance, shown so the Owner can confirm which Candidate is installed.
// Technical identity only: not a version, not Canonical, not a Release.
// O-5 (2026-09-24 regression): an unstamped build no longer says 「BUILD UNSTAMPED」.
// The app version from the host is always shown; a build revision, when a build
// stamps one, is added beside it.
{
  const meta = document.querySelector('meta[name="saku-build-revision"]');
  const revision = meta ? (meta.getAttribute("content") || "") : "";
  const paint = version => {
    const label = [version ? "v" + version : "", revision ? "BUILD " + revision.slice(0, 12) : ""].filter(Boolean).join(" · ");
    for (const id of ["build-revision-prep", "build-revision-view"]) { const slot = $(id); if (slot) { slot.textContent = label; slot.hidden = !label; } }
  };
  paint("");
  if (invoke) invoke("get_runtime_state").then(state => paint(state?.app_version || "")).catch(() => {});
}


