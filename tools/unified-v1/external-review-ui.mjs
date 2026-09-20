// External review-only Trainer intake — page controller.
//
// One page, three things: receive a packet, list what was received, show one
// record in full.  There is no Apply, no bulk adoption, no "make a change
// proposal from this Diff", and no selection state; the only way onward is the
// link to the existing Trainer, which the Owner opens as a separate action.
import {
  archiveExternalReview,
  contractProjection,
  externalReviewView,
  listExternalReviews,
  storeExternalReview,
} from "../v1/external-review-intake.mjs";
import { TUNING_ITEMS } from "./tuning/tuning-projection.mjs";
import * as ActiveSaku from "./active-saku.mjs";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let language = "ja";
let selectedId = "";
let intakeResult = null;
let packetDraft = "";
let busy = false;
const t = (ja, en) => language === "en" ? en : ja;
const ITEM_ORDER = new Map(TUNING_ITEMS.map((item, index) => [item.id, index]));

const STATE_LABEL = {
  REVIEW_ONLY_STORED: ["閲覧専用で保存済み", "Stored, review only"],
  STALE_READ_ONLY: ["古い（現在の Character と不一致）・閲覧のみ", "Stale (current Character differs) · read only"],
  ARCHIVED: ["アーカイブ済み", "Archived"],
};
const STALE_LABEL = {
  NO_CURRENT_CHARACTER: ["Character が開かれていません。", "No Character is open."],
  CHARACTER_ID_DIFFERS: ["開いている Character が違います。", "A different Character is open."],
  CHARACTER_REVISION_DIFFERS: ["開いている Character の revision が違います。", "The open Character has a different revision."],
  BUILDER_LOCAL_DIGEST_DIFFERS: ["受け取り後に Character の内容が変わっています。", "The Character content changed after receipt."],
};
const CODE_LABEL = {
  REVIEW_ONLY_STORED: ["検証に通り、閲覧専用の記録として保存しました。Character は変更されていません。", "Verified and stored as a read-only record. The Character has not been changed."],
  PACKET_TEXT_REQUIRED: ["packet の JSON を貼り付けるかファイルを選んでください。", "Paste the packet JSON or choose a file."],
  PACKET_NOT_JSON: ["JSON として読めません。", "The text is not valid JSON."],
  PACKET_SCHEMA_INVALID: ["amu.trainer-return/1（宛先 SAKU_BUILDER）の packet ではありません。", "Not an amu.trainer-return/1 packet addressed to SAKU_BUILDER."],
  AUTOMATIC_APPLY_FORBIDDEN: ["automatic_apply が false ではないため拒否しました。", "Refused: automatic_apply is not exactly false."],
  CANONICAL_FIELDS_FORBIDDEN: ["canonical_fields_added が 0 ではないため拒否しました。", "Refused: canonical_fields_added is not 0."],
  RETURN_SUBJECT_MISMATCH: ["TRAINER_CANDIDATE_RETURN の確認参照がありません。", "No TRAINER_CANDIDATE_RETURN confirmation reference."],
  EDIT_PROPOSAL_IN_REVIEW_PACKET: ["変更案や選択状態を含むため、閲覧専用 packet として受け取れません。", "Contains an edit proposal or selection; not a review-only packet."],
  LEGACY_SCHEMA_TARGET_PROHIBITED: ["現行スキーマから除かれた項目を含むため拒否しました。", "Refused: contains a field removed from the active schema."],
  CHARACTER_IDENTITY_INVALID: ["Character の識別情報（id / revision / digest）が不完全です。", "Character identity (id / revision / digest) is incomplete."],
  KNOWLEDGE_PROVENANCE_MISMATCH: ["20 項目知識の出所がこの Builder の持つ知識と一致しません。", "The 20-item knowledge provenance does not match this Builder's carried knowledge."],
  MAPPING_VERSION_MISMATCH: ["mapping_version が一致しません。", "mapping_version does not match."],
  ITEM_SET_INVALID: ["20 項目の構成（件数・ID・state_model）が不正です。", "The 20-item set (count / ids / state_model) is invalid."],
  STATE_VOCABULARY_INVALID: ["state または diff が語彙外、または NOT_ASSESSED が既定値で埋められています。", "A state/diff is outside the vocabulary, or NOT_ASSESSED was coerced."],
  DIFF_NOT_DERIVED_FROM_STATES: ["diff が Expected / Observed から導かれた値と一致しません。", "diff is not the derivation of Expected / Observed."],
  CANDIDATE_DIGEST_MISMATCH: ["candidate_digest を再計算した値と一致しません。", "candidate_digest does not match the recomputed value."],
  NO_CURRENT_CHARACTER: ["packet が返された Character を先に開いてください。", "Open the Character this packet was returned for first."],
  CHARACTER_BINDING_MISMATCH: ["packet の Character / revision が、開いている Character と一致しません。", "The packet's Character / revision does not match the open Character."],
  DUPLICATE_INTAKE: ["同じ候補・digest・確認参照がすでにこの Builder に保存されています（Builder 内の重複防止）。", "The same candidate, digest, or confirmation is already stored here (Builder-side duplicate prevention)."],
  STORAGE_WRITE_FAILED: ["保存に失敗しました。部分的な書き込みは残していません。", "Storage failed. Nothing partial was written."],
  STORAGE_READ_FAILED: ["保存領域を読めません。", "Storage could not be read."],
  STORAGE_RECORD_INVALID: ["保存済み記録が壊れています。", "A stored record is corrupt."],
  ARCHIVED: ["アーカイブしました。記録は残ります。", "Archived. The record is kept."],
};
const codeText = code => { const pair = CODE_LABEL[code]; return pair ? t(pair[0], pair[1]) : code; };

function currentCharacter() { try { return ActiveSaku.getWorkingCharacter(); } catch { return null; } }
function records() { return listExternalReviews(localStorage); }
function selected(list) { return list.find(record => record.candidate_id === selectedId) || null; }

function header() {
  return `<header><div class="brand">SAKU <strong>EXTERNAL REVIEW</strong></div><div class="header-actions"><a id="to-home" class="button-link" href="../index.html?stay=1">${t("ホーム", "Home")}</a><a id="open-existing-trainer" class="button-link" href="./saku-trainer.html">${t("既存の Trainer を開く（別操作）", "Open the existing Trainer (separate action)")}</a><label>${t("表示言語", "Interface language")}<select id="locale"><option value="ja" ${language === "ja" ? "selected" : ""}>日本語</option><option value="en" ${language === "en" ? "selected" : ""}>English</option></select></label></div></header>`;
}

function boundary() {
  return `<section class="card xr-boundary" id="xr-boundary"><h1>${t("外部 Review Candidate の受け取り（閲覧専用）", "External Review Candidate intake (read only)")}</h1><p class="intro">${t(
    "AMU Trainer が返した Review Candidate（20 項目の Expected / Observed / Diff）を検証し、そのまま保存して読むための画面です。ここでは Character を変更しません。変更案を作りません。選択も適用もありません。変更が必要だと判断した場合は、既存の Trainer を別操作で開き、その中の人間の手順で進めてください。",
    "Verifies a Review Candidate returned by the AMU Trainer (20 items of Expected / Observed / Diff), stores it verbatim, and shows it. This screen changes no Character, prepares no change proposal, and has no selection or apply. If you decide a change is needed, open the existing Trainer as a separate action and follow its human steps there.")}</p></section>`;
}

function characterCard() {
  const character = currentCharacter();
  const identity = character ? ActiveSaku.identityOf(character) : null;
  return `<section class="card" id="xr-current-character"><h2>${t("いま開いている Character", "Character currently open")}</h2>${identity
    ? `<p><strong>${esc(identity.display_name || identity.character_id)}</strong> · ${esc(identity.character_id)} · revision ${esc(identity.character_revision)}</p>`
    : `<p class="warning">${t("Character が開かれていません。packet が返された Character をホームから開いてから受け取ってください。", "No Character is open. Open the Character the packet was returned for from Home before receiving.")}</p>`}</section>`;
}

function intakeCard() {
  const result = intakeResult;
  const tone = !result ? "" : result.ok ? "status" : "error";
  return `<section class="card" id="xr-intake"><h2>${t("01 packet を受け取る", "01 Receive a packet")}</h2><p class="small">${t("amu.trainer-return/1 の JSON をそのまま貼り付けるか、ファイルを選びます。検証に通ったものだけを保存します。", "Paste the amu.trainer-return/1 JSON as is, or choose the file. Only a packet that passes verification is stored.")}</p><label><span>${t("packet JSON", "Packet JSON")}</span><textarea id="packet-text" spellcheck="false" placeholder='{"schema":"amu.trainer-return/1", ...}'>${esc(packetDraft)}</textarea></label><div class="actions"><label class="button-link" for="packet-file">${t("ファイルを選ぶ", "Choose file")}<input id="packet-file" type="file" accept="application/json,.json" hidden></label><button id="store-packet" class="primary" ${busy ? "disabled" : ""}>${t("検証して保存（閲覧専用）", "Verify and store (read only)")}</button></div>${result ? `<p id="intake-result" class="${tone}" role="${result.ok ? "status" : "alert"}" data-code="${esc(result.code)}"><strong>${esc(result.code)}</strong> — ${esc(codeText(result.code))}${result.detail && !result.ok ? `<br><span class="small">${esc(result.detail)}</span>` : ""}</p>` : `<p id="intake-result" class="small" role="status" data-code="">${t("まだ受け取っていません。", "Nothing received yet.")}</p>`}</section>`;
}

function listCard(list, problems) {
  const character = currentCharacter();
  const rows = list.map(record => {
    const view = externalReviewView(record, character);
    const label = STATE_LABEL[view.state];
    return `<button type="button" data-review-id="${esc(record.candidate_id)}" aria-pressed="${record.candidate_id === selectedId}"><span>${esc(record.character_binding.character_id)} · rev ${esc(record.character_binding.character_revision)}<br><span class="small">${esc(record.received_at)}</span></span><span class="xr-state" data-state="${esc(view.state)}">${esc(t(label[0], label[1]))}</span></button>`;
  }).join("");
  return `<section class="card" id="xr-list"><h2>${t("02 受け取った Review Candidate", "02 Received Review Candidates")}</h2>${list.length ? `<div class="xr-list" id="review-list">${rows}</div>` : `<p class="small" id="review-list-empty">${t("保存された記録はありません。", "No stored records.")}</p>`}${problems.length ? `<p class="error">${t("読めない記録があります: ", "Unreadable records: ")}${problems.map(item => `${esc(item.candidate_id)} (${esc(item.code)})`).join(", ")}</p>` : ""}</section>`;
}

function digestRows(record) {
  const binding = record.character_binding;
  return `<dl class="xr-digests"><dt>${t("Character", "Character")}</dt><dd>${esc(binding.character_id)} · revision ${esc(binding.character_revision)}</dd><dt>${t("AMU 署名 Pack digest（出所の識別・Builder では検証しない）", "AMU signed-Pack digest (provenance identity · not verified by Builder)")}</dt><dd id="digest-signed-pack">${esc(binding.signed_pack_digest)}</dd><dt>${t("Builder ローカル binding digest（受け取り時に Builder が計算）", "Builder local binding digest (computed by Builder at receipt)")}</dt><dd id="digest-builder-local">${esc(binding.builder_local_digest)}</dd></dl><p class="small">${t("2 つの digest は役割が違い、別々に保持します。どちらも真正性の証明ではありません。", "The two digests have different roles and are kept apart. Neither is proof of authenticity.")}</p>`;
}

function itemRows(record) {
  const items = [...record.items].sort((a, b) => (ITEM_ORDER.get(a.id) ?? 99) - (ITEM_ORDER.get(b.id) ?? 99));
  return items.map(item => `<tr data-item="${esc(item.id)}"><th scope="row">${esc(item.id)}</th><td>${esc(item.name)}<span class="xr-missing">${esc(item.state_model)}</span></td><td data-state="${esc(item.expected.state)}">${esc(item.expected.state)}<span class="xr-missing">${esc(item.expected.source)}${Array.isArray(item.expected.fields_missing) && item.expected.fields_missing.length ? ` · ${t("未記入", "missing")}: ${esc(item.expected.fields_missing.join(", "))}` : ""}</span></td><td data-state="${esc(item.observed.state)}">${esc(item.observed.state)}<span class="xr-missing">${esc(item.observed.source)}${Array.isArray(item.observed.probe_ids) && item.observed.probe_ids.length ? ` · ${esc(item.observed.probe_ids.join(", "))}` : ""}</span></td><td data-diff="${esc(item.diff)}">${esc(item.diff)}</td></tr>`).join("");
}

function detailCard(record) {
  if (!record) return `<section class="card" id="xr-detail"><h2>${t("03 内容", "03 Contents")}</h2><p class="small">${t("左の一覧から記録を選ぶと、ここに全文を表示します。", "Choose a record from the list to show it in full here.")}</p></section>`;
  const view = externalReviewView(record, currentCharacter());
  const label = STATE_LABEL[view.state];
  const stale = view.stale_reason ? STALE_LABEL[view.stale_reason] : null;
  const confirmation = record.return_confirmation;
  const knowledge = record.knowledge;
  return `<section class="card" id="xr-detail" data-state="${esc(view.state)}"><h2>${t("03 内容", "03 Contents")} <span class="xr-state" id="detail-state" data-state="${esc(view.state)}">${esc(t(label[0], label[1]))}</span></h2>${stale ? `<p class="warning" id="detail-stale">${esc(t(stale[0], stale[1]))} ${t("記録は変更していません。閲覧のみ可能です。", "The record is unchanged and can only be read.")}</p>` : ""}
  <h3>${t("識別と 2 つの digest", "Identity and the two digests")}</h3>${digestRows(record)}
  <h3>${t("返却の人間確認（provenance）", "Human confirmation of the return (provenance)")}</h3><dl class="xr-digests"><dt>${t("確認の種類", "Confirmation subject")}</dt><dd id="detail-confirmation-subject">${esc(confirmation.confirmation_subject)}</dd><dt>confirmation_id</dt><dd>${esc(confirmation.confirmation_id)}</dd><dt>subject_digest</dt><dd>${esc(confirmation.subject_digest)}</dd><dt>chain_head</dt><dd>${esc(confirmation.chain_head || "—")}</dd></dl><p class="small" id="detail-confirmation-meaning">${t("この記録は「この Trainer 結果を Review Candidate として SAKU Builder へ返す」ことを AMU 側で人間が確認したという事実だけを示します。承認・選択・採用・適用の意味はありません。", "This shows only that, on the AMU side, a human confirmed returning this Trainer result to SAKU Builder as a Review Candidate. It does not mean approval, selection, adoption, or apply.")}</p>
  <h3>${t("20 項目の Expected / Observed / Diff（受け取ったまま）", "20 items: Expected / Observed / Diff (as received)")}</h3><table class="xr-items" id="review-items"><thead><tr><th>ID</th><th>${t("項目", "Item")}</th><th>Expected</th><th>Observed</th><th>Diff</th></tr></thead><tbody>${itemRows(record)}</tbody></table><p class="small">${t("NOT_ASSESSED と NOT_COMPARABLE はそのまま表示します。既定値で埋めたり推測したりしません。", "NOT_ASSESSED and NOT_COMPARABLE are shown as received. Nothing is filled in or inferred.")}</p>
  ${record.seat_proposals.length ? `<h3>${t("席の所見（seat_proposals）", "Seat proposals")}</h3><ul id="review-seat-proposals">${record.seat_proposals.map(item => `<li>${esc(item.seat)} · ${esc((item.item_ids || []).join(", "))} · ${esc(item.evidence_ref)}${item.note ? ` · ${esc(item.note)}` : ""}</li>`).join("")}</ul>` : ""}
  <details><summary>${t("知識の出所と mapping", "Knowledge provenance and mapping")}</summary><dl class="xr-digests"><dt>knowledge_id</dt><dd>${esc(knowledge.knowledge_id)} ${esc(knowledge.version)}</dd><dt>carried sha256</dt><dd>${esc(knowledge.knowledge_sha256)}</dd><dt>provenance sha256</dt><dd>${esc(knowledge.provenance_sha256)}</dd><dt>carried_from</dt><dd>${esc(knowledge.carried_from.repository)} @ ${esc(knowledge.carried_from.main_revision)}</dd><dt>mapping_version</dt><dd>${esc(record.mapping_version)}</dd><dt>candidate_digest</dt><dd>${esc(record.candidate_digest)}</dd><dt>packet sha256</dt><dd>${esc(record.packet_sha256)}</dd></dl></details>
  <details><summary>${t("packet 原文", "Raw packet")}</summary><pre id="review-raw">${esc(record.packet_text)}</pre></details>
  <section class="card" id="xr-next"><h3>${t("次にすること", "What to do next")}</h3><p class="small">${t("この画面からは何も変更できません。変更が必要なら、既存の Trainer を開き、そこで Evidence を確認して自分で候補を作ってください。この記録は Trainer に引き継がれません。", "Nothing can be changed from this screen. If a change is needed, open the existing Trainer, review the evidence there, and prepare a candidate yourself. This record is not carried into the Trainer.")}</p><div class="actions"><a class="button-link" id="detail-open-trainer" href="./saku-trainer.html">${t("既存の Trainer を開く（別操作）", "Open the existing Trainer (separate action)")}</a>${record.state === "ARCHIVED" ? "" : `<button id="archive-review" class="danger">${t("この記録をアーカイブ", "Archive this record")}</button>`}</div></section></section>`;
}

function render() {
  const listed = records();
  const list = listed.records || [];
  if (selectedId && !selected(list)) selectedId = "";
  const contract = contractProjection();
  $("external-review-root").innerHTML = `${header()}<div class="layout">${boundary()}${characterCard()}${intakeCard()}<div class="xr-intake-grid"><div>${detailCard(selected(list))}</div>${listCard(list, listed.problems || [])}</div><p class="small" id="xr-contract">${esc(contract.contract_id)} · apply_path ${esc(contract.apply_path)} · handoff_eligible ${String(contract.handoff_eligible)} · produces_change_candidate ${String(contract.produces_change_candidate)}</p></div>`;
  bind();
}

function bind() {
  $("locale").onchange = () => { packetDraft = $("packet-text").value; language = $("locale").value; render(); };
  $("packet-text").oninput = () => { packetDraft = $("packet-text").value; };
  $("packet-file").onchange = () => {
    const file = $("packet-file").files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { packetDraft = String(reader.result || ""); $("packet-text").value = packetDraft; };
    reader.readAsText(file);
  };
  $("store-packet").onclick = async () => {
    if (busy) return;
    busy = true;
    packetDraft = $("packet-text").value;
    try {
      intakeResult = await storeExternalReview(localStorage, packetDraft, currentCharacter());
      if (intakeResult.ok) { selectedId = intakeResult.record.candidate_id; packetDraft = ""; }
    } catch (error) {
      intakeResult = { ok: false, code: "INTAKE_FAILED", detail: String(error?.message || error) };
    } finally { busy = false; }
    render();
    const notice = $("intake-result"); if (notice) { notice.tabIndex = -1; notice.focus({ preventScroll: false }); }
  };
  for (const button of document.querySelectorAll("[data-review-id]")) button.onclick = () => { selectedId = button.dataset.reviewId; packetDraft = $("packet-text").value; render(); };
  const archive = $("archive-review");
  if (archive) archive.onclick = () => {
    const outcome = archiveExternalReview(localStorage, selectedId);
    intakeResult = outcome.ok ? { ok: true, code: outcome.code } : outcome;
    render();
  };
}

render();
window.__saku_external_review = {
  contract: contractProjection,
  getRecords: () => records().records || [],
  getSelectedId: () => selectedId,
  getLastResult: () => intakeResult,
};
