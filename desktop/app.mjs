import { catalogFacets, compareCharacters, filterCatalog, packageSummary, parseViewerPayload, viewerCopy } from "./viewer.mjs";
import * as ActiveSaku from "../tools/unified-v1/active-saku.mjs";
import * as Library from "../tools/unified-v1/character-library.mjs";
import { parseCharacterText, YamlLiteError } from "../tools/unified-v1/yaml-lite.mjs";
import { admit, checkManifestBinding, classify, labelFor, UNKNOWN } from "../tools/unified-v1/character-schema.mjs";
import { presentationTokens, absentAxes } from "../tools/unified-v1/axis-renderer.mjs";
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
  const subject = ActiveSaku.summary();
  if (!subject) { showStatus("CHARACTER_REQUIRED", "「01 キャラクターを選択する」からキャラクターを選択してください。", "info"); return; }
  const name = subject.identity.display_name || subject.identity.character_id || "選択中のキャラクター";
  showStatus("CHARACTER_SELECTED", [{ data: name }, " — キャラクターの編集やトレーニングを選択してください。"], "success");
}

async function refreshState() {
  if (!invoke) { revealShell(); setNativeEnabled(false); showStatus("DESKTOP_HOST_REQUIRED", "この画面はbrowser previewです。Workspace選択とnative Package importはSAKUアプリで利用できます。", "warning"); showRecovery("host"); return; }
  try { renderState(await invoke("get_runtime_state")); revealShell(); } catch (error) { revealShell(); showStatus("HOST_STATE_FAILED", String(error), "error"); showRecovery("host", String(error)); }
}

async function applyStartupRoute() {
  if (!invoke) return false;
  try { if (await invoke("get_startup_route") === "GETTING_STARTED") { location.replace("./help/getting-started.html"); return true; } }
  catch (error) { showStatus("STARTUP_ROUTE_FAILED", String(error), "error"); }
  return false;
}

async function chooseWorkspace() {
  try { renderState(await invoke("choose_workspace")); }
  catch (error) { const message = String(error); showStatus(message.includes("CANCELLED") ? "WORKSPACE_SELECTION_CANCELLED" : "WORKSPACE_SELECTION_FAILED", message, message.includes("CANCELLED") ? "warning" : "error"); showRecovery("workspace", message); }
}

function availabilityLabel(value) {
  const labels = copy();
  return value === "AVAILABLE" ? labels.available : value === "UNAVAILABLE" ? labels.unavailable : value === "LOCKED" ? labels.locked : labels.unverified;
}

function packageFields(summary) {
  const labels = copy();
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
  if (latestBatch && record.batch === latestBatch && !record.deleted) {
    const badge = document.createElement("span"); badge.className = "catalog-badge"; badge.textContent = "新規追加"; card.append(badge);
  }
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
  viewerRecords = recordsFromLibrary(libraryEntries);
  for (const id of [...compareSelection]) if (!viewerRecords.some(record => record.id === id)) compareSelection.delete(id);
  if (!viewerRecords.some(record => record.id === selectedViewerId)) selectedViewerId = viewerRecords[0]?.id || "";
  packageFields(packageSummary(currentImportResult || {}));
  updateFacets(); renderCatalog(); renderLibraryCount(); renderActiveSaku();
  // The screen adds and removes rows; it never edits a Character's content.
  // Editing happens in the Builder, which is a different screen on purpose.
  const totals = Library.summary();
  if (totals.active) showViewerStatus("LIBRARY_READY", `一覧 ${totals.active}件 — この画面でCharacter dataは変更しません（Viewer data mutation: 0）`, "success");
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
function admitCharacters(characters) {
  const accepted = new Map();   // schema kind -> characters
  const refused = [];
  for (const [index, character] of characters.entries()) {
    const verdict = admit(character);
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
  const characters = [];
  for (const artifact of durable.artifacts || []) characters.push(...charactersFromArtifact(artifact));
  if (!characters.length) return { status: "NOTHING_DURABLE", recovered: 0, workspace: durable.workspace };
  const { accepted } = admitCharacters(characters);
  let recovered = 0;
  for (const [key, group] of accepted) {
    const outcome = Library.importCharacters(group, "WORKSPACE_RECOVERY", { onConflict: "KEEP_BOTH", verification: null, schema: JSON.parse(key) });
    if (outcome.saved) recovered += outcome.added;
  }
  renderLibrary();
  return { status: recovered ? "RECOVERED" : "NOTHING_RECOVERED", recovered, workspace: durable.workspace };
}

function addToLibrary(characters, source, verification) {
  if (!characters.length) { showViewerStatus("NOTHING_TO_IMPORT", "読み込めるCharacterがファイルに含まれていません。", "warning"); return null; }
  const { accepted, refused } = admitCharacters(characters);
  let added = 0, replaced = 0, failure = "";
  for (const [key, group] of accepted) {
    const schema = JSON.parse(key);
    const { onConflict } = resolveConflicts(group);
    const outcome = Library.importCharacters(group, source, { onConflict, verification, schema });
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
function adoptPendingHandoff() {
  if (Library.summary().total) return;
  const pending = localStorage.getItem("saku.desktop.pendingPack") || localStorage.getItem("saku.desktop.pendingCharacter");
  const characters = pending ? charactersOf(pending) : [];
  // A handoff is intake like any other: it passes the same schema gate, so a
  // Character left behind by an older flow cannot enter unclassified.
  const adopt = list => {
    const { accepted } = admitCharacters(list);
    for (const [key, group] of accepted) Library.importCharacters(group, "HANDOFF", { onConflict: "KEEP_BOTH", schema: JSON.parse(key) });
    return [...accepted.values()].reduce((total, group) => total + group.length, 0);
  };
  if (characters.length && adopt(characters)) return;
  // A handoff is consumed once, so an Owner who already has a subject would
  // otherwise arrive at an empty list and wonder where it went.
  const subject = ActiveSaku.getWorkingCharacter();
  if (subject) adopt([subject]);
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

function showViewer() {
  $("home-content").hidden = true; $("viewer-panel").hidden = false;
  adoptPendingHandoff(); renderLibrary(); $("viewer-back").focus();
  // An empty index after an uninstall that removed app data is a recoverable
  // state, not an empty Library. Rebuild from the workspace and say so.
  reconstructFromWorkspace().then(result => {
    if (result.status === "RECOVERED") {
      showViewerStatus("LIBRARY_RECOVERED_FROM_WORKSPACE", `${result.recovered}件をworkspaceから復元しました（${result.workspace}）。Character dataは変更していません。`, "success");
    } else if (result.status === "NOTHING_DURABLE") {
      showViewerStatus("LIBRARY_EMPTY_NO_DURABLE_COPY", `一覧は空です。workspace（${result.workspace}）にも復元できるCharacterがありません。`, "info");
    }
  });
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
  const history = readImportHistory();
  history.unshift({ ...entry, at: new Date().toISOString() });
  try { localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); } catch { /* full or blocked */ }
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
    when.textContent = entry.at ? entry.at.replace("T", " ").slice(0, 19) : "";
    when.dataset.runtimeValue = "";
    button.append(kind, path, when);
    item.append(button);
    list.append(item);
  });
  host.append(list);
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

let platformFormat = "prompt";

function activeCharacterForPlatform() {
  const active = ActiveSaku.getActive();
  return active && typeof active === "object" ? active : null;
}

function platformLaunchText(character, format) {
  if (!character) return "";
  const name = String(character?.identity?.display_name || "").trim() || "(display_name 未設定)";
  const body = format === "json"
    ? JSON.stringify(character, null, 2)
    : format === "yaml"
      ? toPlainYaml(character)
      : characterPromptText(character);
  const instruction = [
    "以下はあなたが演じるキャラクターの定義です。",
    "1. この定義に従って振る舞ってください。",
    "2. 定義に書かれていない必要な情報を、勝手に作って埋めないでください。分からないことは分からないと言ってください。",
    "3. まずキャラクターとして短いあいさつをしてください。",
    "",
    `--- ${name} のキャラクター定義 ここから ---`,
    body,
    `--- ${name} のキャラクター定義 ここまで ---`,
  ];
  return instruction.join("\n");
}

// A readable YAML rendering of the Character. Authoring output only.
function toPlainYaml(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (!value.length) return " []";
    return "\n" + value.map(item => (item && typeof item === "object")
      ? `${pad}  -${toPlainYaml(item, indent + 2)}`
      : `${pad}  - ${String(item)}`).join("\n");
  }
  if (typeof value === "object") {
    const lines = Object.entries(value).map(([key, item]) => {
      const rendered = (item && typeof item === "object") ? toPlainYaml(item, indent + 1) : ` ${String(item)}`;
      return `${pad}${key}:${rendered}`;
    });
    return (indent === 0 ? "" : "\n") + lines.join("\n");
  }
  return ` ${String(value)}`;
}

function characterPromptText(character) {
  const identity = character?.identity || {};
  const purpose = character?.purpose || {};
  const core = character?.character_core || {};
  const expression = character?.expression_semantics || {};
  const seat8 = character?.assistant_composition?.seat8 || {};
  const lines = [];
  const add = (label, value) => { if (value !== undefined && value !== null && String(value).trim()) lines.push(`${label}: ${value}`); };
  const addList = (label, list) => { if (Array.isArray(list) && list.length) lines.push(`${label}: ${list.join(" / ")}`); };
  add("名前", identity.display_name);
  add("役割", core.character_role);
  add("目的", purpose.summary);
  add("提供価値", purpose.primary_value);
  addList("対象", purpose.target_users);
  addList("対応しない領域", purpose.non_goals);
  addList("価値観", core.values);
  for (const invariant of core.hard_invariants || []) add("守ること", invariant.statement);
  addList("ゆらいでよい範囲", core.expressive_range?.allowed_variation);
  addList("ゆらいではいけない範囲", core.expressive_range?.prohibited_drift);
  add("一人称", expression.first_person);
  add("口調", expression.address_style);
  add("声", expression.voice);
  add("不確実性の表し方", expression.uncertainty_expression);
  add("誤りの正し方", expression.error_correction_rule);
  add("会話の閉じ方", expression.closing_rule);
  addList("好む問い方", expression.preferred_questions);
  for (const condition of core.human_handoff_conditions || []) add("人間へ渡す条件", `${condition.trigger} → ${condition.boundary_statement}`);
  addList("人間に期待する寄与", seat8.expected_human_contribution);
  lines.push("席8は人間です。AIがこの席を埋めることはできません。");
  return lines.join("\n");
}

function renderPlatform() {
  const character = activeCharacterForPlatform();
  const nameSlot = $("platform-active");
  const launch = $("platform-launch");
  if (!character) {
    setStatus($("platform-subject"), "CHARACTER_REQUIRED", "「01 キャラクターを選択する」からキャラクターを選んでください。", "warning");
    if (nameSlot) nameSlot.textContent = "未選択";
    if (launch) launch.value = "";
    return;
  }
  const name = String(character?.identity?.display_name || "").trim() || "(display_name 未設定)";
  const revision = String(character?.identity?.character_revision || "").trim() || "revision 未設定";
  setStatus($("platform-subject"), "PLATFORM_SUBJECT", [{ data: name }, " — 貼り付けてもCharacterは変更されません。"], "info");
  if (nameSlot) nameSlot.textContent = `${name}（${revision}）`;
  if (launch) launch.value = platformLaunchText(character, platformFormat);
  for (const button of document.querySelectorAll("[data-platform-format]")) {
    button.setAttribute("aria-pressed", String(button.dataset.platformFormat === platformFormat));
  }
}

function showPlatform() {
  $("home-content").hidden = true;
  $("viewer-panel").hidden = true;
  $("tuning-panel").hidden = true;
  $("platform-panel").hidden = false;
  renderPlatform();
  $("platform-back").focus();
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
  const key = result.manifest?.content_type === "CHARACTER" ? "saku.desktop.pendingCharacter" : "saku.desktop.pendingPack";
  if (key === "saku.desktop.pendingCharacter") storeBoundCharacter(key, result.payload_json); else localStorage.setItem(key, result.payload_json);
  clearRecovery(); showStatus("PACKAGE_IMPORTED", `${result.reason} 保存先: ${result.imported_path}`, "success");
  addToLibrary(characters, "PACKAGE", { status: result.status, code: result.code, product: result.manifest?.product || "", schema_id: binding.schema_id, schema_version: binding.schema_version });
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
  if (characters.length) addToLibrary(characters, "FILE", null);
  for (const file of files) {
    recordImport({ kind: "FILE", source_path: file.name || "", status: characters.length ? "IMPORTED" : "FAILED", code: "", fields: [] });
  }
  // Say what did not work as plainly as what did.
  if (failures.length) showViewerStatus("FILE_IMPORT_FAILED", failures.join(" / "), characters.length ? "warning" : "error");
  else if (notes.length) showViewerStatus("FILE_IMPORT_WARNING", notes.join(" / "), "warning");
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
  $("character-actions-title").textContent = record.name;
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
    showViewerStatus("CHARACTER_SELECTED", `${record.name} を選択しました。`, "success"); return;
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
for (const button of document.querySelectorAll("[data-platform-format]")) {
  button.addEventListener("click", () => { platformFormat = button.dataset.platformFormat; renderPlatform(); });
}
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
window.addEventListener("saku-ui-locale-changed", () => { localizePlaceholders(); renderRecovery(); packageFields(packageSummary(currentImportResult || {})); updateFacets(); renderCatalog(); renderLibraryCount(); if (!$("compare-panel").hidden) renderComparison(); });

const dropZone = $("drop-zone");
for (const name of ["dragenter", "dragover"]) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add("active"); });
for (const name of ["dragleave", "drop"]) dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove("active"); });
dropZone.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePackage(); } });
if (tauri?.event?.listen) tauri.event.listen("tauri://drag-drop", event => importPath(event.payload?.paths?.[0]));
localizePlaceholders(); if (!await applyStartupRoute()) refreshState();
// The Builder's 「キャラクターを選択」 asks for the selection screen, not Home.
if (new URLSearchParams(location.search).get("open") === "select") showViewer();



// A seam for the readiness gate: the three-state announcement depends on the
// native host reporting a Workspace, which a browser harness cannot provide.
// Exposing the render entry point lets the states be exercised for real rather
// than asserted from the source text.
if (typeof window !== "undefined") window.__saku_home = { renderState, renderActiveSaku, renderHomeGuidance, importCharacterFiles, renderLibrary, loadOccupationFile, handOffCharacterAndOccupation, occupationMapping, parseOccupationCsv };

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
