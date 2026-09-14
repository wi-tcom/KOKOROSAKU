import {
  CHAPTERS, FIELDS, FIELD_BY_PATH, FORM_PATH_BY_CANONICAL,
  HANDOFF_REASON_OPTIONS, TUNING_ITEMS, EFFECT_STATES, localized,
} from "./semantic-registry.mjs";
import {
  TRAINER_BUILDER_CONTEXT_KEY,
  applyBuilderCandidates,
  beginBuilderSave,
  builderRouteMatchesContext,
  cancelBuilderSave,
  contentDigest,
  consumeBuilderHandoff,
  invalidateSessionBuilderHandoff,
  loadSession,
  recordBuilderResult,
  saveSession,
  validateBuilderResultTransition,
  validateBuilderHandoffPayload,
} from "./trainer-frozen-ia.mjs";

const form = document.querySelector("main.form");
if (!form) throw new Error("FROZEN_IA_FORM_NOT_FOUND");

const locale = () => window.SAKU_GOLDEN_UI?.getLocale?.() === "en-US" ? "en" : "ja";
const state = () => window.__saku_data?.();
const get = (object, path) => path.split(".").reduce((node, key) => node == null ? undefined : node[key], object);
const set = (object, path, value) => {
  const keys = path.split("."); let node = object;
  for (const key of keys.slice(0, -1)) { if (!node[key] || typeof node[key] !== "object") node[key] = {}; node = node[key]; }
  node[keys.at(-1)] = value;
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const ui = (ja, en) => locale() === "en" ? en : ja;
const field = path => FIELD_BY_PATH.get(path);
const label = path => localized(field(path)?.label, locale()) || path;
const formPath = path => FORM_PATH_BY_CANONICAL[path];

const trainerRoute = new URLSearchParams(location.search);
let trainerCandidateReview = null;
let trainerApplyContext = null;
let trainerInternalApply = false;

function readTrainerBuilderContext() {
  try { return JSON.parse(localStorage.getItem(TRAINER_BUILDER_CONTEXT_KEY) || "null"); }
  catch { return null; }
}

function clearTrainerBuilderContext(payload = null) {
  const context = readTrainerBuilderContext();
  if (!context || !payload || (context.session_id === payload.session_id && context.handoff_id === payload.handoff_id)) {
    try { localStorage.removeItem(TRAINER_BUILDER_CONTEXT_KEY); } catch { /* caller remains fail closed */ }
  }
}

function persistTrainerBuilderContext(payload, stateName, result = null, saveAttemptId = null) {
  const context = {
    type: "SAKU_TRAINER_BUILDER_HANDOFF_CONTEXT",
    version: 1,
    session_id: payload.session_id,
    handoff_id: payload.handoff_id,
    payload_content_digest: payload.content_digest,
    source_character: { ...payload.source_character },
    state: stateName,
  };
  if (result?.applied) {
    context.result_character_id = result.character?.identity?.character_id || "";
    context.result_character_revision = String(result.new_revision || "");
    context.result_character_digest = contentDigest(result.character);
  }
  if (saveAttemptId) context.save_attempt_id = saveAttemptId;
  try {
    localStorage.setItem(TRAINER_BUILDER_CONTEXT_KEY, JSON.stringify(context));
    return { ok: true, context };
  } catch (error) {
    return { ok: false, code: "BUILDER_CONTEXT_STORAGE_WRITE_FAILED", error: String(error?.message || error) };
  }
}

function appliedTrainerDraftMatches(character) {
  const prepared = trainerApplyContext?.result?.character;
  return Boolean(prepared && character
    && prepared.identity?.character_id === character.identity?.character_id
    && String(prepared.identity?.character_revision || "") === String(character.identity?.character_revision || "")
    && contentDigest(prepared) === contentDigest(character));
}

function persistedTrainerResultMatches(context, character) {
  return Boolean(context?.result_character_digest && character
    && context.result_character_id === character.identity?.character_id
    && String(context.result_character_revision || "") === String(character.identity?.character_revision || "")
    && context.result_character_digest === contentDigest(character));
}

function invalidateTrainerApplyContext(reason = "BUILDER_WORKING_CHARACTER_REPLACED") {
  if (trainerInternalApply) return true;
  const persisted = readTrainerBuilderContext();
  let payload = trainerApplyContext?.payload || null;
  if (!payload && persisted?.session_id) {
    const loaded = loadSession(localStorage, persisted.session_id);
    payload = loaded.ok ? loaded.session.builder_handoff?.payload || null : null;
  }
  if (!payload && !persisted) return true;
  const invalidated = invalidateSessionBuilderHandoff(localStorage, {
    session_id: payload?.session_id || persisted?.session_id,
  }, reason);
  if (!invalidated.ok) return false;
  // Keep the invalidated context as a tombstone. It blocks the exact revoked
  // Trainer-applied draft after reload without blocking an unrelated Character.
  trainerApplyContext = null;
  window.SAKU_TRAINER_APPLY_CONTEXT = null;
  return true;
}

window.SAKU_INVALIDATE_TRAINER_APPLY_CONTEXT = invalidateTrainerApplyContext;
function trainerSavePreflight(character) {
  const persisted = readTrainerBuilderContext();
  if (persisted?.state === "INVALIDATED") {
    return persistedTrainerResultMatches(persisted, character)
      ? { active: true, ok: false, code: persisted.invalidated_reason || "TRAINER_SESSION_HANDOFF_INVALID" }
      : { active: false, ok: true, code: "NO_MATCHING_TRAINER_APPLY_CONTEXT" };
  }
  if (persisted?.state === "SAVE_IN_PROGRESS" && !persistedTrainerResultMatches(persisted, character)) {
    return { active: false, ok: true, code: "NO_MATCHING_TRAINER_APPLY_CONTEXT" };
  }
  if (!trainerApplyContext?.result?.applied && persisted) {
    const recovered = recoverTrainerCandidateReview(character, persisted);
    if (recovered.status !== "ACCEPTED" || !trainerApplyContext?.result?.applied) {
      return { active: true, ok: false, code: recovered.reason || "TRAINER_APPLY_CONTEXT_BLOCKED" };
    }
  }
  if (!trainerApplyContext?.result?.applied) return { active: false, ok: true, code: "NO_TRAINER_APPLY_CONTEXT" };
  if (trainerApplyContext.save_attempt_id) {
    return { active: true, ok: false, code: "BUILDER_SAVE_RECOVERY_ACTION_REQUIRED" };
  }
  if (!appliedTrainerDraftMatches(character)) {
    return { active: true, ok: false, code: "BUILDER_DRAFT_NO_LONGER_MATCHES_APPLIED_RESULT" };
  }
  let validation;
  try {
    validation = validateBuilderResultTransition(localStorage, trainerApplyContext.payload, {
      ...trainerApplyContext.result,
      character,
      builder_saved: true,
    });
  } catch {
    validation = { ok: false, code: "TRAINER_SESSION_SAVE_PREFLIGHT_FAILED" };
  }
  if (!validation.ok) return { active: true, ok: false, code: validation.code || "TRAINER_SESSION_SAVE_PREFLIGHT_FAILED" };
  return { active: true, ok: true, code: "TRAINER_SESSION_SAVE_PREFLIGHT_PASS" };
}

window.SAKU_TRAINER_SAVE_PREFLIGHT = trainerSavePreflight;
window.SAKU_TRAINER_PREPARED_DRAFT_MATCHES = character => {
  const result = trainerSavePreflight(character);
  return result.active && result.ok;
};

function currentUnifiedCharacter() {
  const current = state();
  const api = window.SAKU_UNIFIED;
  if (!current || !api?.toUnifiedCharacter) return null;
  return api.toUnifiedCharacter(current, current._unified_source || null, { bumpRevision: false });
}

function builderDraftMatchesSource() {
  const current = state();
  const source = current?._unified_source;
  const api = window.SAKU_UNIFIED;
  if (!current || !source || !api?.fromUnifiedCharacter) return false;
  if (contentDigest(currentUnifiedCharacter()) !== contentDigest(source)) return false;
  const expected = api.fromUnifiedCharacter(source);
  return Object.values(FORM_PATH_BY_CANONICAL).every(path => {
    const before = get(expected, path);
    const now = get(current, path);
    if (Array.isArray(before) && before.length) return Array.isArray(now) && now.length > 0;
    if (before !== undefined && before !== null && typeof before !== "object" && String(before).trim()) return String(now ?? "").trim().length > 0;
    return true;
  });
}

function updateTrainerSession(payload, update) {
  if (!payload?.session_id) return false;
  const loaded = loadSession(localStorage, payload.session_id);
  if (!loaded.ok) return false;
  update(loaded.session);
  return saveSession(localStorage, loaded.session, {
    expectedStoredSessionText: loaded.storage_text,
    setCurrent: false,
  }).ok;
}

function recoverTrainerCandidateReview(current, context) {
  if (context?.type !== "SAKU_TRAINER_BUILDER_HANDOFF_CONTEXT" || context.version !== 1
    || !context.session_id || !context.handoff_id || !context.payload_content_digest) {
    clearTrainerBuilderContext();
    return { status: "REJECTED", reason: "BUILDER_HANDOFF_CONTEXT_INVALID" };
  }
  const loaded = loadSession(localStorage, context.session_id);
  if (context.state === "INVALIDATED") {
    return { status: "REJECTED", reason: context.invalidated_reason || "TRAINER_SESSION_HANDOFF_INVALID", preserve_context: true };
  }
  if (context.state === "SAVE_IN_PROGRESS") {
    const payload = loaded.ok ? loaded.session.builder_handoff?.payload || null : null;
    const result = loaded.ok ? loaded.session.builder_result : null;
    const recoveredResult = {
      applied: true,
      code: "RESTORED_INTERRUPTED_BUILDER_SAVE",
      character: current,
      source_revision: result?.source_revision,
      new_revision: result?.new_revision,
      changes: result?.changes || [],
      canonical_persisted: false,
    };
    const inProgress = result?.builder_saved === false
      && loaded.session.builder_handoff?.state === "BUILDER_SAVE_IN_PROGRESS"
      && loaded.session.builder_handoff?.save_attempt_id === context.save_attempt_id;
    const cancelledPendingCleanup = result?.builder_saved === false
      && loaded.session.builder_handoff?.state === "APPLIED_IN_BUILDER_DRAFT"
      && loaded.session.state === "BUILDER_DRAFT_APPLIED";
    const terminalRecorded = result?.builder_saved === true
      && loaded.session.builder_handoff?.state === "SAVED_FROM_BUILDER"
      && loaded.session.state === "TARGETED_RETEST_READY";
    const exactContext = Boolean(payload && result?.applied === true
      && context.save_attempt_id
      && (inProgress || cancelledPendingCleanup || terminalRecorded)
      && persistedTrainerResultMatches(context, current));
    const transition = exactContext
      ? validateBuilderResultTransition(localStorage, payload, {
        ...recoveredResult,
        builder_saved: true,
        save_attempt_id: context.save_attempt_id,
      })
      : { ok: false, code: "BUILDER_SAVE_RECOVERY_BINDING_INVALID" };
    if (!transition.ok) {
      return { status: "REJECTED", reason: transition.code, payload, preserve_context: true };
    }
    trainerApplyContext = {
      payload,
      result: recoveredResult,
      save_attempt_id: context.save_attempt_id,
    };
    window.SAKU_TRAINER_APPLY_CONTEXT = trainerApplyContext;
    return {
      status: "ACCEPTED",
      payload,
      current_character: transition.session.source_character,
      recovered: true,
      save_recovery_required: true,
      recorded_save_transition: terminalRecorded,
      cancel_recovery_required: cancelledPendingCleanup,
    };
  }
  const persistedHandoff = loaded.ok ? loaded.session.builder_handoff : null;
  const payload = persistedHandoff?.payload || null;
  const appliedDraft = context.state === "APPLIED_DRAFT";
  const expectedPersistedState = appliedDraft
    ? "APPLIED_IN_BUILDER_DRAFT"
    : context.state === "RECEIVED" ? "RECEIVED_IN_BUILDER" : null;
  const contextBound = Boolean(payload)
    && Boolean(expectedPersistedState)
    && persistedHandoff?.state === expectedPersistedState
    && persistedHandoff?.handoff_id === context.handoff_id
    && payload.session_id === context.session_id
    && payload.handoff_id === context.handoff_id
    && payload.content_digest === context.payload_content_digest
    && payload.source_character?.character_id === context.source_character?.character_id
    && String(payload.source_character?.character_revision || "") === String(context.source_character?.character_revision || "")
    && payload.source_character?.character_digest === context.source_character?.character_digest;
  if (!contextBound) {
    const invalidated = persistedHandoff?.state === "INVALIDATED_BY_TRAINER_CONTEXT_CHANGE";
    if (!invalidated) clearTrainerBuilderContext();
    return { status: "REJECTED", reason: invalidated ? "TRAINER_SESSION_HANDOFF_INVALID" : "BUILDER_HANDOFF_CONTEXT_BINDING_INVALID", payload, preserve_context: invalidated };
  }
  const expected = {
    character_id: context.source_character.character_id,
    character_revision: context.source_character.character_revision,
    character_digest: context.source_character.character_digest,
    session_id: context.session_id,
    handoff_id: context.handoff_id,
  };
  const verified = validateBuilderHandoffPayload(
    payload,
    appliedDraft ? loaded.session.source_character.snapshot : current,
    expected,
  );
  if (verified.status !== "ACCEPTED") {
    clearTrainerBuilderContext(payload);
    return verified;
  }
  if (appliedDraft) {
    const result = loaded.session.builder_result;
    const exactDraft = result?.applied === true
      && result.builder_saved === false
      && loaded.session.builder_handoff?.state === "APPLIED_IN_BUILDER_DRAFT"
      && result.handoff_id === payload.handoff_id
      && result.result_character_id === current?.identity?.character_id
      && String(result.result_character_revision || "") === String(current?.identity?.character_revision || "")
      && result.result_character_digest === contentDigest(current)
      && context.result_character_id === result.result_character_id
      && String(context.result_character_revision || "") === String(result.result_character_revision || "")
      && context.result_character_digest === result.result_character_digest;
    if (!exactDraft) {
      clearTrainerBuilderContext(payload);
      return { status: "STALE", reason: "APPLIED_BUILDER_DRAFT_BINDING_INVALID", payload };
    }
    trainerApplyContext = {
      payload,
      result: {
        applied: true,
        code: "RESTORED_APPLIED_BUILDER_DRAFT",
        character: current,
        source_revision: result.source_revision,
        new_revision: result.new_revision,
        changes: result.changes,
        canonical_persisted: false,
      },
    };
    window.SAKU_TRAINER_APPLY_CONTEXT = trainerApplyContext;
  } else if (context.state !== "RECEIVED") {
    clearTrainerBuilderContext(payload);
    return { status: "REJECTED", reason: "BUILDER_HANDOFF_CONTEXT_STATE_INVALID", payload };
  }
  return { status: "ACCEPTED", payload, current_character: verified.current_character, recovered: true };
}

function initializeTrainerCandidateReview() {
  const routeRequested = trainerRoute.get("desktop") === "trainer-change-candidates";
  const persistedContext = readTrainerBuilderContext();
  if (!routeRequested && !persistedContext) return;
  const current = currentUnifiedCharacter();
  if (!current) {
    trainerCandidateReview = { status: "REJECTED", reason: "BUILDER_CURRENT_CHARACTER_UNAVAILABLE" };
    return;
  }
  const routeExpected = {
    character_id: trainerRoute.get("character_id") || "",
    character_revision: trainerRoute.get("character_revision") || "",
    character_digest: trainerRoute.get("character_digest") || "",
    session_id: trainerRoute.get("session_id") || "",
    handoff_id: trainerRoute.get("handoff_id") || "",
  };
  const routeComplete = Object.values(routeExpected).every(value => String(value).trim().length > 0);
  if (routeRequested && !routeComplete) {
    trainerCandidateReview = { status: "REJECTED", reason: "HANDOFF_ROUTE_BINDING_INCOMPLETE", preserve_context: true };
    return;
  }
  trainerCandidateReview = routeRequested
    ? consumeBuilderHandoff(localStorage, current, {
      ...routeExpected,
    })
    : { status: "EMPTY" };
  if (trainerCandidateReview.status === "EMPTY" && persistedContext) {
    trainerCandidateReview = routeRequested && !builderRouteMatchesContext(persistedContext, routeExpected)
      ? { status: "REJECTED", reason: "HANDOFF_ROUTE_CONTEXT_MISMATCH", preserve_context: true }
      : recoverTrainerCandidateReview(current, persistedContext);
  }
  const payload = trainerCandidateReview.payload;
  if (trainerCandidateReview.status === "ACCEPTED") {
    if (!trainerApplyContext) {
      const stored = persistTrainerBuilderContext(payload, "RECEIVED");
      if (!stored.ok) {
        updateTrainerSession(payload, session => {
          session.builder_handoff = { ...(session.builder_handoff || {}), state: "BUILDER_CONTEXT_STORAGE_FAILED" };
          session.state = "BUILDER_HANDOFF_BLOCKED";
        });
        trainerCandidateReview = { status: "REJECTED", reason: stored.code, payload };
      }
    }
  } else if (trainerCandidateReview.status === "STALE") {
    updateTrainerSession(payload, session => {
      session.builder_handoff = { ...(session.builder_handoff || {}), state: "STALE_APPLY_BLOCKED" };
      session.revision_conflict = {
        state: "STALE",
        reason: trainerCandidateReview.reason,
        tested: payload?.source_character || null,
        builder_current: trainerCandidateReview.current_character || null,
      };
    });
    clearTrainerBuilderContext(payload);
  } else if (trainerCandidateReview.status === "REJECTED" && !trainerCandidateReview.preserve_context) {
    if (readTrainerBuilderContext()?.state !== "INVALIDATED") clearTrainerBuilderContext(payload);
  }
}

function trainerCandidateDetail(candidate) {
  const value = item => esc(typeof item === "string" ? item : JSON.stringify(item));
  const effect = candidate.EXPECTED_EFFECT?.[locale()] || candidate.EXPECTED_EFFECT?.ja || "UNKNOWN";
  const sideEffect = candidate.SIDE_EFFECT?.[locale()] || candidate.SIDE_EFFECT?.ja || "UNKNOWN";
  return `<article class="trainer-candidate-card" data-candidate-id="${esc(candidate.CANDIDATE_ID)}">
    <h3>${esc(candidate.RELATED_CANONICAL_PATH)}</h3>
    <dl>
      <div><dt>${ui("現在値", "Current value")}</dt><dd>${value(candidate.CURRENT_VALUE)}</dd></div>
      <div><dt>${ui("推奨変更", "Proposed change")}</dt><dd>${value(candidate.PROPOSED_CHANGE)}</dd></div>
      <div><dt>Evidence</dt><dd>${esc(candidate.EVIDENCE_REFERENCE || "NOT_AVAILABLE")}</dd></div>
      <div><dt>${ui("期待効果", "Expected effect")}</dt><dd>${esc(effect)}</dd></div>
      <div><dt>${ui("副作用", "Side effect")}</dt><dd>${esc(sideEffect)}</dd></div>
      <div><dt>Before</dt><dd>${value(candidate.BEFORE)}</dd></div>
      <div><dt>After</dt><dd>${value(candidate.AFTER)}</dd></div>
      <div><dt>Preview</dt><dd><code>${esc(candidate.BUILDER_SINGLE_HOME)}</code><br>${value(candidate.BEFORE)} → ${value(candidate.AFTER)}</dd></div>
    </dl>
  </article>`;
}

function renderTrainerCandidateReview() {
  document.getElementById("trainerCandidateReview")?.remove();
  if (!trainerCandidateReview) return;
  const panel = document.createElement("section");
  panel.id = "trainerCandidateReview";
  panel.className = `trainer-candidate-review ${trainerCandidateReview.status.toLowerCase()}`;
  panel.setAttribute("aria-labelledby", "trainerCandidateReviewTitle");
  panel.innerHTML = `<p class="eyebrow">SAKU TRAINER → BUILDER</p>
    <h2 id="trainerCandidateReviewTitle">${ui("Trainerの変更候補を確認", "Review Trainer change candidates")}</h2>`;

  if (trainerCandidateReview.status !== "ACCEPTED") {
    const stateText = trainerCandidateReview.status === "STALE" ? "STALE / APPLY_BLOCKED" : `REJECTED / ${trainerCandidateReview.reason || "UNKNOWN"}`;
    panel.insertAdjacentHTML("beforeend", `<div class="trainer-candidate-state" role="alert"><strong>${esc(stateText)}</strong><p>${ui("tested revisionとBuilderの現在のCharacterが一致しないか、handoffを検証できません。変更は反映されていません。", "The tested revision does not match Builder's current Character, or the handoff could not be verified. No change was applied.")}</p></div>`);
    form.insertBefore(panel, form.querySelector(".frozen-chapter"));
    return;
  }

  const payload = trainerCandidateReview.payload;
  panel.insertAdjacentHTML("beforeend", `<p>${ui("TrainerではCharacterを変更していません。Evidence・現在値・変更後を確認し、反映する場合だけ下のボタンを押してください。", "Trainer did not change the Character. Review the Evidence, current value, and proposed value; use the button below only if you choose to apply them.")}</p>
    <p class="trainer-candidate-source"><strong>${esc(payload.source_character.character_id)}</strong> · revision ${esc(payload.source_character.character_revision)} · digest ${esc(payload.source_character.character_digest)}</p>
    <div class="trainer-candidate-list">${payload.candidates.map(trainerCandidateDetail).join("")}</div>
    <div class="trainer-candidate-actions"><button type="button" class="btn-sm trainer-candidate-apply">${ui("変更をCharacterへ反映する", "Apply changes to the Character")}</button><p class="trainer-candidate-result" role="status" aria-live="polite"></p></div>`);
  const apply = panel.querySelector(".trainer-candidate-apply");
  const status = panel.querySelector(".trainer-candidate-result");
  const interruptedAttemptId = trainerCandidateReview.save_recovery_required
    ? trainerApplyContext?.save_attempt_id || null
    : null;
  if (trainerApplyContext?.result?.applied) {
    apply.disabled = true;
    status.textContent = interruptedAttemptId
      ? ui("前回の保存は完了状態を確認できません。実際の保存結果を確認し、次の操作を明示してください。", "The previous save has an unknown completion state. Check the actual save result, then choose an explicit recovery action.")
      : ui(`新しいrevision ${trainerApplyContext.result.new_revision} を準備しました。保存はまだ完了していません。`, `Prepared new revision ${trainerApplyContext.result.new_revision}. It has not been saved yet.`);
  }
  apply.addEventListener("click", () => {
    if (!builderDraftMatchesSource()) {
      status.textContent = `STALE / APPLY_BLOCKED — ${ui("Builderの作業ドラフトがtested revisionから変更されています。", "The Builder working draft has changed from the tested revision.")}`;
      apply.disabled = true;
      updateTrainerSession(payload, session => {
        session.revision_conflict = { state: "STALE", reason: "BUILDER_DRAFT_CHANGED_AFTER_TEST", tested: payload.source_character };
      });
      return;
    }
    const current = currentUnifiedCharacter();
    const result = applyBuilderCandidates(current, payload, { humanExplicitApply: true });
    if (!result.applied) {
      status.textContent = `${result.code} — ${ui("変更は反映されていません。", "No change was applied.")}`;
      if (result.code.includes("STALE")) apply.disabled = true;
      updateTrainerSession(payload, session => {
        session.revision_conflict = { state: "STALE", reason: result.code, tested: payload.source_character, builder_current: current?.identity || null };
      });
      return;
    }
    const recorded = recordBuilderResult(localStorage, payload, { ...result, builder_saved: false });
    if (!recorded.ok) {
      status.textContent = `${recorded.code} — ${ui("Trainer Sessionへ変更結果を結び付けられなかったため、反映していません。", "The change was not applied because its result could not be bound to the Trainer Session.")}`;
      return;
    }
    const contextStored = persistTrainerBuilderContext(payload, "APPLIED_DRAFT", result);
    if (!contextStored.ok) {
      invalidateSessionBuilderHandoff(localStorage, { session_id: payload.session_id }, contextStored.code);
      status.textContent = `${contextStored.code} — ${ui("保存前のbindingを保持できないため、変更は作業ドラフトへ反映していません。", "The change was not applied to the working draft because its pre-save binding could not be retained.")}`;
      return;
    }
    trainerInternalApply = true;
    let adopted = false;
    try { adopted = window.adoptWorkingCharacter?.(result.character) === true; }
    finally { trainerInternalApply = false; }
    if (!adopted) {
      invalidateSessionBuilderHandoff(localStorage, { session_id: payload.session_id }, "BUILDER_DRAFT_ADOPTION_FAILED");
      status.textContent = ui("Builderの作業ドラフトを更新できませんでした。", "Builder could not update the working draft.");
      return;
    }
    trainerApplyContext = { payload, result };
    window.SAKU_TRAINER_APPLY_CONTEXT = trainerApplyContext;
    window.SAKU_ACTIVE?.updateDraft(result.character);
    apply.disabled = true;
    status.textContent = ui(`新しいrevision ${result.new_revision} を準備しました。「この内容で保存する」で保存してください。`, `Prepared new revision ${result.new_revision}. Use “Save this Character” to persist it.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  if (interruptedAttemptId) {
    const recovery = document.createElement("div");
    recovery.className = "trainer-save-recovery";
    const confirmSaved = document.createElement("button");
    confirmSaved.type = "button";
    confirmSaved.className = "btn-sm";
    confirmSaved.textContent = ui("保存済みであることを確認してSessionへ記録", "Confirm the file was saved and record it in the Session");
    const retrySave = document.createElement("button");
    retrySave.type = "button";
    retrySave.className = "btn-sm secondary";
    retrySave.textContent = ui("保存されていないとして予約を解除", "Confirm it was not saved and release the reservation");
    confirmSaved.addEventListener("click", () => {
      const resolved = window.SAKU_RECORD_TRAINER_BUILDER_SAVE?.(currentUnifiedCharacter(), interruptedAttemptId)
        || { ok: false, code: "TRAINER_SAVE_FINALIZE_UNAVAILABLE" };
      status.textContent = resolved.ok
        ? ui("保存済みrevisionとしてSessionへ記録しました。", "Recorded the revision as saved in the Session.")
        : `${resolved.code || "TRAINER_SAVE_FINALIZE_FAILED"} — ${ui("保存状態を確定できませんでした。", "The save state could not be finalized.")}`;
      if (resolved.ok) recovery.remove();
    });
    retrySave.addEventListener("click", () => {
      const resolved = window.SAKU_TRAINER_CANCEL_SAVE?.(interruptedAttemptId, "HUMAN_CONFIRMED_NOT_PERSISTED_AFTER_RESTART")
        || { ok: false, code: "TRAINER_SAVE_CANCEL_UNAVAILABLE" };
      status.textContent = resolved.ok
        ? ui("保存予約を解除しました。「この内容で保存する」から再試行できます。", "The save reservation was released. Retry with “Save this Character”.")
        : `${resolved.code || "TRAINER_SAVE_CANCEL_FAILED"} — ${ui("保存予約を解除できませんでした。", "The save reservation could not be released.")}`;
      if (resolved.ok) recovery.remove();
    });
    if (!trainerCandidateReview.cancel_recovery_required) recovery.append(confirmSaved);
    if (!trainerCandidateReview.recorded_save_transition) recovery.append(retrySave);
    panel.querySelector(".trainer-candidate-actions")?.append(recovery);
  }
  form.insertBefore(panel, form.querySelector(".frozen-chapter"));
}

window.SAKU_TRAINER_BEGIN_SAVE = character => {
  const preflight = trainerSavePreflight(character);
  if (!preflight.active || !preflight.ok) return preflight;
  const begun = beginBuilderSave(localStorage, trainerApplyContext.payload, {
    ...trainerApplyContext.result,
    character,
  });
  if (begun.ok) {
    const contextStored = persistTrainerBuilderContext(trainerApplyContext.payload, "SAVE_IN_PROGRESS", trainerApplyContext.result, begun.save_attempt_id);
    if (!contextStored.ok) {
      cancelBuilderSave(localStorage, trainerApplyContext.payload, begun.save_attempt_id, contextStored.code);
      return { active: true, ok: false, code: contextStored.code };
    }
    trainerApplyContext.save_attempt_id = begun.save_attempt_id;
  }
  return { active: true, ...begun };
};

window.SAKU_TRAINER_CANCEL_SAVE = (saveAttemptId, reason) => {
  if (!trainerApplyContext?.result?.applied) return { active: false, ok: true };
  const cancelled = cancelBuilderSave(localStorage, trainerApplyContext.payload, saveAttemptId, reason);
  if (cancelled.ok) {
    delete trainerApplyContext.save_attempt_id;
    const contextStored = persistTrainerBuilderContext(trainerApplyContext.payload, "APPLIED_DRAFT", trainerApplyContext.result);
    if (!contextStored.ok) return { active: true, ok: false, code: contextStored.code, session: cancelled.session };
  }
  return { active: true, ...cancelled };
};

window.SAKU_RECORD_TRAINER_BUILDER_SAVE = (character, saveAttemptId) => {
  if (!trainerApplyContext?.result?.applied) return { active: false, ok: true };
  if (!appliedTrainerDraftMatches(character)) {
    return { active: true, ok: false, code: "BUILDER_SAVED_CHARACTER_DOES_NOT_MATCH_APPLIED_RESULT" };
  }
  const saved = recordBuilderResult(localStorage, trainerApplyContext.payload, {
    ...trainerApplyContext.result,
    character,
    builder_saved: true,
    save_attempt_id: saveAttemptId,
  });
  if (!saved.ok) return { active: true, ...saved };
  const panel = document.getElementById("trainerCandidateReview");
  const status = panel?.querySelector(".trainer-candidate-result");
  if (status) status.textContent = ui(`revision ${character.identity.character_revision} を保存しました。関連項目だけの再test候補をTrainer Sessionへ記録しました。`, `Saved revision ${character.identity.character_revision}. The targeted retest plan is recorded in the Trainer Session.`);
  trainerApplyContext = null;
  window.SAKU_TRAINER_APPLY_CONTEXT = null;
  clearTrainerBuilderContext(saved.session?.builder_handoff?.payload || null);
  return { active: true, ok: true, session: saved.session };
};

function helpMarkup(item) {
  const l = locale();
  const tuning = (item.tuning || []).map(id => TUNING_ITEMS.find(one => one.id === id)).filter(Boolean);
  return `<details class="registry-help"><summary>${ui("この項目のHelp", "Help for this field")}</summary>
    <h4>${ui("人間向け質問", "Human question")}</h4><p>${esc(localized(item.humanQuestion, l))}</p>
    <h4>${ui("この項目について", "About this field")}</h4><p>${esc(localized(item.help.about, l))}</p>
    <h4>${ui("なぜ必要か", "Why it is needed")}</h4><p>${esc(localized(item.help.why, l))}</p>
    <h4>${ui("何を書く項目か", "What to enter")}</h4><p>${esc(localized(item.help.what, l))}</p>
    <h4>${ui("必須性", "Requiredness")}</h4><p>${esc(item.requiredness)}</p>
    <h4>${ui("入力例", "Example")}</h4><p>${esc(localized(item.help.example, l))}</p>
    <h4>${ui("注意点", "Caution")}</h4><p>${esc(localized(item.help.caution, l))}</p>
    <h4>${ui("関連するAIの動き", "Related AI behaviour")}</h4><p>${esc(localized(item.help.relatedAiBehavior, l))}</p>
    ${tuning.length ? `<ul>${tuning.map(one => `<li>${esc(localized(one.symptom, l))}</li>`).join("")}</ul>` : `<p>UNKNOWN</p>`}
    <h4>${ui("関連する項目", "Related fields")}</h4><p>${esc(localized(item.help.relatedItems, l))}</p>
    <h4>${ui("この設定がどこで使われるか", "Where this setting is used")}</h4><p>${esc(localized(item.help.usedAt, l))}</p>
    <h4>${ui("保存・Export時の扱い", "Save and Export handling")}</h4><p>${esc(localized(item.help.persistence, l))}</p>
    <details class="registry-help-expert"><summary>${ui("Expert情報", "Expert information")}</summary>
      <dl><dt>Canonical path</dt><dd>${esc(item.canonicalPath)}</dd><dt>Editability</dt><dd>${esc(item.editability)}</dd>
      <dt>Effect state</dt><dd>${esc(item.effectState)} — ${esc(localized(EFFECT_STATES[item.effectState], l))}</dd>
      <dt>Source</dt><dd>${esc(item.source.repository)} @ ${esc(item.source.revision)}</dd><dt>Evidence</dt><dd>${esc(item.evidence || "UNKNOWN")}</dd></dl>
    </details>
  </details>`;
}

function simpleControl(path) {
  const item = field(path); const fp = formPath(path);
  if (!item || !fp) return "";
  const required = item.required ? '<span class="req">*</span>' : "";
  const current = get(state(), fp);
  let control;
  if (item.kind === "textarea") control = `<textarea data-path="${esc(fp)}" rows="3">${esc(current)}</textarea>`;
  else if (item.kind === "enum") control = `<select data-path="${esc(fp)}"><option value="">${ui("未選択", "Not selected")}</option>${(item.options || []).map(option => `<option value="${esc(option)}"${String(current) === String(option) ? " selected" : ""}>${esc(option)}</option>`).join("")}</select>`;
  else control = `<input type="text" data-path="${esc(fp)}" value="${esc(current)}">`;
  return `<div class="field registry-field" data-canonical-path="${esc(path)}"><label>${esc(label(path))}${required}</label>${control}${helpMarkup(item)}</div>`;
}

function listControl(path, extraClass = "") {
  const item = field(path); const fp = formPath(path);
  return `<div class="field list registry-field ${extraClass}" data-list="${esc(fp)}" data-canonical-path="${esc(path)}"><label>${esc(label(path))}${item?.required ? '<span class="req">*</span>' : ""}</label>${helpMarkup(item)}</div>`;
}

function chapterMarkup(chapter, body) {
  const l = locale();
  return `<section class="chapter frozen-chapter" data-frozen-chapter="${chapter.id}">
    <h2><span class="num">${chapter.numeral}</span>${esc(localized(chapter.title, l))}</h2>
    <p class="chapter-question">${esc(localized(chapter.question, l))}</p>${body}</section>`;
}

function axisControls() {
  return FIELDS.filter(item => item.canonicalPath.startsWith("personality_axes.")).map(item => simpleControl(item.canonicalPath)).join("");
}

function fixedSystemMarkup() {
  const seats = [
    ["1", "Character本人", "The Character"], ["2", "専門家", "Specialist"], ["3", "事実確認", "Fact checking"],
    ["4", "安全確認", "Safety checking"], ["5", "利用者視点", "User viewpoint"], ["6", "反対意見", "Counterpoint"],
    ["7", "人格・ブランド確認", "Persona and brand guard"], ["8", "人間", "Human"],
  ];
  return `<section class="fixed-system-info" aria-labelledby="one-seven-title"><p class="eyebrow">1+7 CHARACTER SYSTEM</p>
    <h2 id="one-seven-title">${ui("考えを支える助手（1+7 Character System）", "Assistants that support thinking (1+7 Character System)")}</h2>
    <p class="fixed-badge">${ui("固定された仕組み", "Fixed system")}</p>
    <ol class="fixed-seat-list">${seats.map(([n, ja, en]) => `<li><strong>${n}</strong> ${ui(ja, en)} <span>${ui("読み取り専用", "Read only")}</span></li>`).join("")}</ol>
    <p>${ui("席1〜7の有効／無効、強さ、担当変更はCharacterごとには編集できません。One Voiceと内部検討も固定された仕組みです。席8の条件は第5章で編集します。", "Seats 1–7 cannot be enabled, disabled, intensified, or reassigned per Character. One Voice and internal deliberation are fixed. Edit Seat 8 conditions in Chapter 5.")}</p>
    <button type="button" class="btn-sm" data-jump-chapter="boundary">${ui("第5章へ移動", "Go to Chapter 5")}</button></section>`;
}

function inspectorMarkup() {
  const source = state()?._unified_source;
  const revision = source?.identity?.character_revision || state()?.meta?.version || "0.1.0-draft";
  return `<details class="definition-inspector"><summary>${ui("定義情報", "Definition information")}</summary>
    <dl><dt>${ui("Schema", "Schema")}</dt><dd>SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE</dd>
      <dt>${ui("Schema version", "Schema version")}</dt><dd>final-delta-recovery-closure-2026-09-04</dd>
      <dt>${ui("Character revision", "Character revision")}</dt><dd>${esc(revision)}</dd>
      <dt>${ui("Canonical source", "Canonical source")}</dt><dd>wi-tcom/-SAKU-1-7-Character-System @ 029655ca703ec7cdb1bb70b43a144531f75a9273</dd></dl>
    <p>${ui("これらはシステム管理情報で、通常の入力項目ではありません。", "These are system-managed values, not ordinary authoring inputs.")}</p></details>`;
}

function tuningMarkup() {
  return `<section class="tuning-entry" aria-labelledby="tuning-title"><h2 id="tuning-title">${ui("AIの動き方を調整", "Adjust AI behaviour")}</h2>
    <p>${ui("気になる症状から、関係するCharacter設定を確認します。Trainerの観察はCanonicalの真実ではなく、推奨は自動適用されません。", "Start with a symptom and inspect related Character settings. Trainer observations are not Canonical truth, and recommendations are never applied automatically.")}</p>
    <div class="tuning-symptom-grid">${TUNING_ITEMS.map(item => `<button type="button" data-tuning-symptom="${item.id}" aria-label="${esc(localized(item.symptom, locale()))}">${esc(localized(item.symptom, locale()))}</button>`).join("")}</div>
    <div id="tuningRegistryDetail" class="tuning-registry-detail" role="status" aria-live="polite">${ui("症状を選択してください。", "Select a symptom.")}</div>
    <p><a href="../index.html?stay=1">${ui("DesktopでCurrent / Expected / Observed / Diff / Recommendationを確認する", "Open Desktop to review Current / Expected / Observed / Diff / Recommendation")}</a></p></section>`;
}

function renderSurface() {
  const top = document.getElementById("authoringTop");
  const preserved = top ? top : null;
  form.replaceChildren();
  if (preserved) form.append(preserved);
  const bodies = {
    identity: `<div class="two">${simpleControl("identity.display_name")}${simpleControl("identity.character_id")}</div>${inspectorMarkup()}`,
    purpose: `${simpleControl("purpose.summary")}<div class="two">${simpleControl("purpose.primary_value")}${simpleControl("character_core.character_role")}</div>${listControl("purpose.non_goals")}`,
    work: `${listControl("purpose.target_users")}${enumListMarkup("purpose.work_modes")}
      <aside class="helper-boundary"><strong>${ui("職能CSVはHelper Contextです", "Occupation CSV is Helper Context")}</strong><p>${ui("直接反映できる既存対応はCharacterの役割だけです。職業から資格・権限・許可・適性を推測しません。Previewと確認を経て明示的に適用します。", "Occupation CSV is helper context. The only existing direct mapping is Character role. It never implies credentials, authority, permission, or proven aptitude, and it requires preview and explicit apply.")}</p></aside>`,
    persona: `${listControl("character_core.values")}<div class="two">${simpleControl("expression_semantics.first_person")}${simpleControl("expression_semantics.address_style")}${simpleControl("expression_semantics.age_expression")}${simpleControl("expression_semantics.voice")}</div>
      ${listControl("expression_semantics.preferred_questions")}${simpleControl("expression_semantics.uncertainty_expression")}${simpleControl("expression_semantics.error_correction_rule")}${simpleControl("expression_semantics.closing_rule")}
      <details class="optional-expression"><summary>${ui("任意の対話・見た目設定", "Optional interaction and appearance settings")}</summary><div class="two">${simpleControl("expression_semantics.interaction_tendencies.encouragement")}${simpleControl("expression_semantics.interaction_tendencies.rapport")}${simpleControl("expression_semantics.interaction_tendencies.metaphor")}${simpleControl("expression_semantics.interaction_tendencies.scaffolding")}</div>${simpleControl("expression_semantics.presentation_intent.appearance")}</details>
      <h3>${ui("十五の人格軸", "Fifteen personality axes")}</h3><div class="two axes-grid">${axisControls()}</div>`,
    boundary: `<div id="invariantsEditor" class="object-editor" data-canonical-path="character_core.hard_invariants"></div>
      ${listControl("character_core.expressive_range.allowed_variation")}${listControl("character_core.expressive_range.prohibited_drift")}
      <div id="handoffEditor" class="object-editor" data-canonical-path="character_core.human_handoff_conditions"></div>
      ${listControl("assistant_composition.seat8.expected_human_contribution")}${listControl("assistant_composition.seat8.handoff_question_requirements")}${listControl("assistant_composition.seat8.handoff_material_requirements")}
      <div id="referenceEditors" class="reference-editors"></div>`,
  };
  for (const chapter of CHAPTERS) form.insertAdjacentHTML("beforeend", chapterMarkup(chapter, bodies[chapter.id]));
  form.insertAdjacentHTML("beforeend", fixedSystemMarkup() + tuningMarkup() + `<details class="advanced-settings"><summary>${ui("詳細設定 — Expert / Advanced", "Expert / Advanced settings")}</summary><p>${ui("現在、通常入力とは別に編集すべきSAKU-owned Expert項目はありません。Runtime、AMU、MACHI、旧Unified V1項目はここへ移していません。", "There are currently no separate SAKU-owned expert fields to edit. Runtime, AMU, MACHI, and legacy Unified V1 controls are not moved here.")}</p></details>`);

  window.bindInputs?.();
  window.renderAllLists?.();
  renderStructuredEditors();
  window.syncDom?.();
  window.buildAccordion?.();
  wireFrozenActions();
  renderTrainerCandidateReview();
  document.documentElement.dataset.frozenIa = "five-chapter-v1";
}

function enumListMarkup(path) {
  const item = field(path); const fp = formPath(path);
  return `<div class="field registry-field enum-list" data-canonical-path="${path}" data-enum-list="${fp}"><label>${esc(label(path))}<span class="req">*</span></label><div class="enum-items"></div><div class="add"><select aria-label="${esc(label(path))}"><option value="">${ui("選択して追加", "Select to add")}</option>${item.options.map(option => `<option value="${option}">${option}</option>`).join("")}</select><button type="button" class="btn-sm">${ui("追加", "Add")}</button></div>${helpMarkup(item)}</div>`;
}

function normalizeList(path) {
  let list = get(state(), path);
  if (!Array.isArray(list)) { list = String(list || "").split(/[\n,、]/).map(value => value.trim()).filter(Boolean); set(state(), path, list); }
  return list;
}

function renderEnumLists() {
  for (const host of document.querySelectorAll("[data-enum-list]")) {
    const path = host.dataset.enumList; const list = normalizeList(path); const items = host.querySelector(".enum-items"); items.replaceChildren();
    for (const [index, value] of list.entries()) { const row = document.createElement("span"); row.className = "enum-chip"; row.textContent = value; const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `${value} ${ui("を削除", "remove")}`); remove.addEventListener("click", () => { list.splice(index, 1); renderEnumLists(); window.render?.(); }); row.append(remove); items.append(row); }
  }
}

function renderStructuredEditors() {
  renderEnumLists();
  renderRequirements();
  renderHandoffs();
  renderReferences();
}

function renderRequirements() {
  const host = document.getElementById("invariantsEditor"); if (!host) return;
  const path = "unified.hard_invariants"; const list = normalizeList(path).map((item, i) => typeof item === "string" ? { id: `INV-${i + 1}`, statement: item } : item); set(state(), path, list);
  host.innerHTML = `<h3>${esc(label("character_core.hard_invariants"))}<span class="req">*</span></h3><p class="fixed-held">INV-INPUT-INTEGRITY — REQUIRED_INPUT != AI_GENERATED_SUBSTITUTE (${ui("固定・編集不可", "fixed, read only")})</p><div class="object-rows"></div><button type="button" class="btn-sm object-add">${ui("約束を追加", "Add commitment")}</button>${helpMarkup(field("character_core.hard_invariants"))}`;
  const rows = host.querySelector(".object-rows");
  list.forEach((item, index) => rows.append(objectRow([["id", ui("ID", "ID")], ["statement", ui("内容", "Statement")]], item, () => { list.splice(index, 1); renderRequirements(); window.render?.(); })));
  host.querySelector(".object-add").addEventListener("click", () => { list.push({ id: `INV-${list.length + 1}`, statement: "" }); renderRequirements(); });
}

function objectRow(fields, item, remove) {
  const row = document.createElement("div"); row.className = "object-row";
  for (const [key, text] of fields) { const wrap = document.createElement("label"); wrap.textContent = text; const input = document.createElement(key.includes("statement") || key.includes("trigger") || key.includes("boundary") ? "textarea" : "input"); input.value = item[key] || ""; input.addEventListener("input", () => { item[key] = input.value; window.render?.(); }); wrap.append(input); row.append(wrap); }
  const del = document.createElement("button"); del.type = "button"; del.className = "btn-sm danger"; del.textContent = ui("削除", "Remove"); del.addEventListener("click", remove); row.append(del); return row;
}

function renderHandoffs() {
  const host = document.getElementById("handoffEditor"); if (!host) return;
  const path = "unified.human_handoff_conditions"; const raw = get(state(), path); const list = Array.isArray(raw) ? raw.map((item, i) => typeof item === "string" ? { id: `HANDOFF-${i + 1}`, reason_class: "OTHER", trigger: item, boundary_statement: item, seat8_required: true } : item) : []; set(state(), path, list);
  host.innerHTML = `<h3>${esc(label("character_core.human_handoff_conditions"))}<span class="req">*</span></h3><div class="object-rows"></div><button type="button" class="btn-sm object-add">${ui("条件を追加", "Add condition")}</button>${helpMarkup(field("character_core.human_handoff_conditions"))}`;
  const rows = host.querySelector(".object-rows");
  list.forEach((item, index) => {
    const row = objectRow([["id", "ID"], ["trigger", ui("きっかけ", "Trigger")], ["boundary_statement", ui("境界", "Boundary")]], item, () => { list.splice(index, 1); renderHandoffs(); window.render?.(); });
    const reason = document.createElement("label"); reason.textContent = ui("理由区分", "Reason class"); const select = document.createElement("select");
    for (const value of HANDOFF_REASON_OPTIONS) { const option = new Option(value, value, false, item.reason_class === value); select.add(option); }
    select.addEventListener("change", () => { item.reason_class = select.value; window.render?.(); }); reason.append(select); row.insertBefore(reason, row.lastElementChild);
    const related = document.createElement("label"); related.className = "checkbox-label"; const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = Boolean(item.seat8_required); checkbox.addEventListener("change", () => { item.seat8_required = checkbox.checked; window.render?.(); }); related.append(checkbox, document.createTextNode(ui("席8へ渡す条件として関連付ける", "Link explicitly as a Seat 8 condition"))); row.insertBefore(related, row.lastElementChild);
    rows.append(row);
  });
  host.querySelector(".object-add").addEventListener("click", () => { list.push({ id: `HANDOFF-${list.length + 1}`, reason_class: "OTHER", trigger: "", boundary_statement: "", seat8_required: true }); renderHandoffs(); });
}

function renderReferences() {
  const host = document.getElementById("referenceEditors"); if (!host) return; host.replaceChildren();
  for (const canonical of ["conformance_expectations.must_preserve_refs", "conformance_expectations.prohibited_drift_refs", "conformance_expectations.continuity_refs"]) {
    const path = formPath(canonical); let list = get(state(), path); if (!Array.isArray(list)) list = []; list = list.map(item => typeof item === "string" ? { requirement_id: item } : item); set(state(), path, list);
    const box = document.createElement("div"); box.className = "object-editor registry-field"; box.dataset.canonicalPath = canonical;
    box.innerHTML = `<h3>${esc(label(canonical))}<span class="req">*</span></h3><div class="object-rows"></div><button type="button" class="btn-sm object-add">${ui("参照を追加", "Add reference")}</button>${helpMarkup(field(canonical))}`;
    const rows = box.querySelector(".object-rows"); list.forEach((item, index) => rows.append(objectRow([["requirement_id", ui("Requirement ID", "Requirement ID")], ["locator", ui("任意locator", "Optional locator")]], item, () => { list.splice(index, 1); renderReferences(); window.render?.(); })));
    box.querySelector(".object-add").addEventListener("click", () => { list.push({ requirement_id: "", locator: "" }); renderReferences(); }); host.append(box);
  }
}

function wireFrozenActions() {
  for (const host of document.querySelectorAll("[data-enum-list]")) { const select = host.querySelector(".add select"); host.querySelector(".add button").addEventListener("click", () => { if (!select.value) return; const list = normalizeList(host.dataset.enumList); if (!list.includes(select.value)) list.push(select.value); select.value = ""; renderEnumLists(); window.render?.(); }); }
  document.querySelector("[data-jump-chapter]")?.addEventListener("click", () => { const target = document.querySelector('[data-frozen-chapter="boundary"]'); const details = target?.closest("details"); if (details) details.open = true; target?.scrollIntoView({ behavior: "smooth" }); target?.querySelector("input,select,textarea,button")?.focus(); });
  document.querySelector(".tuning-symptom-grid")?.addEventListener("click", event => { const button = event.target.closest("[data-tuning-symptom]"); if (!button) return; const item = TUNING_ITEMS.find(one => one.id === button.dataset.tuningSymptom); const related = FIELDS.filter(one => one.tuning.includes(item.id)); const observed = (() => { try { const id = state()?._unified_source?.identity?.character_id || state()?.meta?.slug || ""; return JSON.parse(localStorage.getItem("saku.trainer.observedTuning") || "{}")[id]?.[item.id] || "NOT_ASSESSED"; } catch { return "NOT_ASSESSED"; } })(); document.getElementById("tuningRegistryDetail").innerHTML = `<strong>${esc(localized(item.symptom, locale()))}</strong><p>Current: ${related.map(one => esc(localized(one.label, locale()))).join(" / ") || "UNKNOWN"}</p><p>Observed: ${esc(observed)}</p><p>Diff: ${observed === "NOT_ASSESSED" ? "UNKNOWN" : ui("TrainerのEvidenceを確認してください", "Review Trainer evidence")}</p><p>${ui("Recommendationは自動適用されません。関連項目のHelpを開き、Previewを確認してから明示的に編集してください。", "Recommendations are not applied automatically. Open the related field Help, preview the change, then edit explicitly.")}</p>`; });
  for (const id of ["resetAll", "loadExample"]) document.getElementById(id)?.addEventListener("click", () => setTimeout(renderStructuredEditors, 0));
}

initializeTrainerCandidateReview();
renderSurface();
window.SAKU_FROZEN_IA = Object.freeze({ chapters: CHAPTERS, fields: FIELDS, refresh: renderSurface, renderStructuredEditors });
window.addEventListener("saku-ui-locale-changed", () => renderSurface());
