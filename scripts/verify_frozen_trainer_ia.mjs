import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blankUnifiedCharacter } from "../tools/unified-v1/unified-schema-v1.mjs";
import {
  ASSESSMENT_STATES,
  BUILT_IN_QUESTIONS,
  EXECUTION_MODES,
  LEGACY_SCHEMA_TARGETS,
  QUESTION_LIBRARY_ID,
  SESSION_KEYS,
  TRAINER_BUILDER_CONTEXT_KEY,
  TRAINER_UX_REVISION,
  TEST_SCOPES,
  addEvidence,
  addQuestion,
  addSummary,
  assessmentsForScope,
  applyBuilderCandidates,
  attemptForId,
  beginLinkedRetest,
  beginQuestionAttempt,
  beginBuilderSave,
  builderRouteMatchesContext,
  buildBuilderHandoff,
  buildEvaluationPack,
  buildExecutionPack,
  buildRetestPlan,
  changeScope,
  cancelBuilderSave,
  clearCurrentSession,
  clearResponseDraft,
  contentDigest,
  confirmResponseDraft,
  consumeBuilderHandoff,
  contractProjection,
  createChangeCandidate,
  createGeneratedQuestionCandidate,
  createSession,
  createTrainerResult,
  createUserQuestion,
  deleteSavedSession,
  evidenceForScope,
  eligibleBuilderCandidates,
  finalizePacks,
  listSessions,
  loadSession,
  handoffGuardKeys,
  invalidateSessionBuilderHandoff,
  preflight,
  promoteGeneratedQuestion,
  recordAssessment,
  recordBuilderResult,
  saveSession,
  saveResponseDraft,
  selectCandidate,
  selectQuestionInQueue,
  selectQuestions,
  sourceQuestionResultForAttempt,
  stableStringify,
  storeBuilderHandoff,
  tuningEvidenceState,
  trainerQuestionQueueState,
  nextUnfinishedSelectedQuestion,
  normalizeTrainerUx2Session,
  draftForAttempt,
  resultForAttempt,
  validateFinalizedPacks,
  validateBuilderResultTransition,
  validateSessionSourceBinding,
} from "../tools/v1/trainer-frozen-ia.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let count = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count += 1; };
const ok = (value, message) => { assert.ok(value, message); count += 1; };
const read = relative => readFile(path.join(ROOT, relative), "utf8");

function character() {
  const value = blankUnifiedCharacter();
  value.identity = { character_id: "frozen-trainer-case", display_name: "Frozen Trainer Case", character_revision: "1.0.0" };
  value.purpose = { summary: "Help people make evidence-aware decisions", primary_value: "Evidence first", work_modes: ["ANALYSIS"], target_users: ["Owner"], non_goals: ["Do not approve"] };
  value.character_core.character_role = "Review companion";
  value.character_core.values = ["evidence", "uncertainty"];
  value.character_core.expressive_range = { allowed_variation: ["length"], prohibited_drift: ["Never invent evidence"] };
  value.character_core.hard_invariants = [{ id: "INV-INPUT-INTEGRITY", statement: "REQUIRED_INPUT != AI_GENERATED_SUBSTITUTE" }];
  value.character_core.human_handoff_conditions = [{ id: "HO-1", reason_class: "AUTHORITY_REQUIRED", trigger: "approval required", boundary_statement: "Return to a human", action: "HANDOFF_TO_HUMAN" }];
  value.expression_semantics = {
    first_person: "I", address_style: "calm", age_expression: "neutral", voice: "concise",
    preferred_questions: ["What is confirmed?"], uncertainty_expression: "Separate known from unknown",
    error_correction_rule: "Name and correct errors", closing_rule: "State next step",
    interaction_tendencies: { rapport: "Acknowledge then organize" },
  };
  value.assistant_composition.seat8 = {
    ...value.assistant_composition.seat8,
    expected_human_contribution: ["decision"], handoff_question_requirements: ["Which option?"],
    handoff_material_requirements: ["evidence"], human_required_condition_refs: [{ requirement_id: "HO-1" }],
  };
  for (const key of ["a_motif", "b_companion_domain", "c_intelligence_vector", "d_socratic_angle", "e_vocabulary_tone", "f_acknowledgement", "g_pulse", "h_tactile", "i_thinking_pause_ms", "j_theme_color", "k_whitespace_percent", "l_weathering_presentation", "m_error_narrative", "n_crystallization", "o_closing"]) {
    value.personality_axes[key] = key === "i_thinking_pause_ms" ? 400 : key === "k_whitespace_percent" ? 30 : `test-${key}`;
  }
  return value;
}

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

function stageBuilderHandoff(targetStorage, payload, sessionValue) {
  const sent = cloneCharacter(sessionValue);
  sent.builder_handoff = {
    ...(sent.builder_handoff || {}),
    state: "SENT_TO_BUILDER",
    handoff_id: payload.handoff_id,
    payload: cloneCharacter(payload),
  };
  const saved = saveSession(targetStorage, sent);
  check(saved.ok, true, "REVISION-01 sent Trainer Session persisted before transport");
  check(storeBuilderHandoff(targetStorage, payload).ok, true, "REVISION-01 handoff transport stored");
  return saved.session;
}

function confirmAttemptResponse(sessionValue, questionId, originalResponse, { now, locale = "ja", retestOf = null } = {}) {
  const begun = beginQuestionAttempt(sessionValue, { questionId, now, locale, retestOf });
  assert.equal(begun.ok, true, `begin attempt for ${questionId}`);
  const drafted = saveResponseDraft(begun.session, {
    questionId,
    attemptId: begun.attempt.attempt_id,
    originalResponse,
    now,
  });
  assert.equal(drafted.ok, true, `save response draft for ${questionId}`);
  const confirmed = confirmResponseDraft(drafted.session, {
    questionId,
    attemptId: begun.attempt.attempt_id,
    now,
  });
  assert.equal(confirmed.ok, true, `confirm response draft for ${questionId}`);
  return confirmed;
}

function recordStrictResult(sessionValue, attemptId, { observed, state, diff, notAssessedReason = "", now } = {}) {
  const attempt = attemptForId(sessionValue, attemptId);
  const assessed = recordAssessment(sessionValue, {
    questionId: attempt.question_id,
    evidenceId: attempt.evidence_id,
    attemptId,
    observed,
    state,
    diff,
    notAssessedReason,
    humanReviewed: true,
    strictHumanCheck: true,
  });
  if (!assessed.ok) return { assessed, result: assessed, session: assessed.session };
  const result = createTrainerResult(assessed.session, { attemptId, assessmentId: assessed.assessment.assessment_id, now });
  return { assessed, result, session: result.session };
}

const source = character();
const sourceBefore = stableStringify(source);
let session = createSession(source, { sessionId: "ST-ACCEPTANCE", now: "2026-09-08T00:00:00.000Z", mode: "FRESH_ONE_BY_ONE" });

// PREFLIGHT-01
let missing = createSession({}, { sessionId: "ST-MISSING", now: "2026-09-08T00:00:00.000Z" });
missing = selectQuestions(missing, ["PB-JUDGE"]).session;
check(preflight(missing).ok, false, "PREFLIGHT-01 missing Character definition blocks primary execution");
ok(preflight(missing).checks.some(item => item.id === "CHARACTER_ID" && !item.pass), "PREFLIGHT-01 identifies missing Character ID");
const legacyShaped = character();
legacyShaped.schema = { schema_id: "saku.character", schema_version: ["v", "next-1.0"].join("") };
let legacySession = createSession(legacyShaped, { sessionId: "ST-LEGACY", now: "2026-09-08T00:00:00.000Z" });
legacySession = selectQuestions(legacySession, ["PB-JUDGE"]).session;
ok(preflight(legacySession).checks.some(item => item.id === "UNIFIED_V1_CHARACTER" && !item.pass), "PREFLIGHT-01 legacy Unified V1 Character cannot enter active Trainer execution");

// PACK-01 / PACK-02 / FRESH-01
session = selectQuestions(session, ["PB-UNCERT", "PB-FACT"]).session;
session.current_question_id = "PB-UNCERT";
let final = finalizePacks(session, { locale: "en", questionId: "PB-UNCERT", now: "2026-09-08T00:01:00.000Z" });
check(final.ok, true, "PACK-01 complete execution pack passes preflight");
session = final.session;
check(validateSessionSourceBinding(session).ok, true, "PREFLIGHT-01 source Character binding recomputes exactly");
for (const token of ["SOURCE_CHARACTER_ID = frozen-trainer-case", "SOURCE_CHARACTER_REVISION = 1.0.0", "SOURCE_CHARACTER_DIGEST =", "[PB-UNCERT]"]) {
  ok(session.execution_pack.plain_text.includes(token), `PACK-01 contains ${token}`);
}
check(session.execution_pack.question_ids, ["PB-UNCERT"], "FRESH-01 pack contains one selected question");
check(session.runtime_test_context.conversation_intent, "FRESH_CONVERSATION", "FRESH-01 independent conversation intent retained");
for (const token of ["Rubric:", "t_items", "T09", "A human checks explicit uncertainty"]) {
  ok(!session.execution_pack.plain_text.includes(token), `PACK-02 target excludes ${token}`);
}
ok(buildEvaluationPack(session).questions[0].rubric.en.includes("human"), "PACK-02 rubric retained in Evaluation Pack");
check(session.execution_pack.target_visibility, { expected: false, rubric: false, t_items: false }, "PACK-02 visibility contract");

// SCOPE-01
const beforeScopeIds = session.questions.map(item => item.id);
let scoped = changeScope(session, "BOUNDARY_HANDOFF").session;
const scopedIds = scoped.questions.map(item => item.id);
ok(stableStringify(beforeScopeIds) !== stableStringify(scopedIds), "SCOPE-01 scope changes available questions");
check(scoped.questions.every(item => item.scopes.includes("BOUNDARY_HANDOFF")), true, "SCOPE-01 filtered question library");
scoped = selectQuestions(scoped, ["PB-SAFETY", "PB-HANDOFF"]).session;
scoped.execution_mode = "CATEGORY_BATCH";
scoped.runtime_test_context.conversation_intent = "FRESH_CONVERSATION_PER_CATEGORY_BATCH";
check(addEvidence(scoped, { questionId: "PB-SAFETY", originalResponse: "unbound" }).code, "UX2_CONFIRMED_RESPONSE_DRAFT_REQUIRED", "EVIDENCE-01 UX2 Evidence requires an explicitly confirmed attempt-bound draft");
const scopedFinal = finalizePacks(scoped, { locale: "ja", now: "2026-09-08T00:01:30.000Z" });
check(scopedFinal.ok, true, "SCOPE-01 scoped Execution/Evaluation Packs finalize");
scoped = scopedFinal.session;
const scopedPack = scoped.execution_pack;
check(scopedPack.test_scope, "BOUNDARY_HANDOFF", "SCOPE-01 pack records scope");
check(scopedPack.question_ids, ["PB-SAFETY", "PB-HANDOFF"], "BATCH-01 Q ID association preserved");
check(scoped.categories, ["BOUNDARY"], "SCOPE-01 result/candidate grouping category source");
check(validateFinalizedPacks(scoped, "PB-SAFETY").ok, true, "PACK-01 finalized Pack recomputes with exact Runtime Test Context");
const changedRuntime = cloneCharacter(scoped); changedRuntime.runtime_test_context.platform = "changed-after-run";
check(addEvidence(changedRuntime, { questionId: "PB-SAFETY", originalResponse: "wrong context" }).code, "UX2_CONFIRMED_RESPONSE_DRAFT_REQUIRED", "EVIDENCE-01 direct Evidence insertion cannot bypass the UX2 attempt binding");

// QUESTION-01
const generated = createGeneratedQuestionCandidate({ text: "Generated question", locale: "en", scope: "BOUNDARY_HANDOFF" });
check(generated.ok, true, "QUESTION-01 generated question candidate created");
check(generated.question.selectable, false, "QUESTION-01 generated question cannot auto-promote");
let withGenerated = addQuestion(scoped, generated.question).session;
check(selectQuestions(withGenerated, [...withGenerated.selected_question_ids, generated.question.id]).ok, false, "QUESTION-01 unreviewed generated question cannot be selected");
check(promoteGeneratedQuestion(generated.question).ok, false, "QUESTION-01 promotion requires Human review");
const promoted = promoteGeneratedQuestion(generated.question, { humanReviewed: true });
check(promoted.ok, false, "QUESTION-01 Human review alone cannot activate an undefined generated question");
check(promoted.code, "HUMAN_DEFINITION_REQUIRED", "QUESTION-01 undefined generated question reports its exact blocker");
check(promoted.question.selectable, false, "QUESTION-01 undefined generated question remains unselectable");
const userQuestion = createUserQuestion({ text: "User-authored question", locale: "en", scope: "BOUNDARY_HANDOFF" });
check(userQuestion.ok && !userQuestion.question.selectable, true, "QUESTION-01 user-created prompt remains unselectable until Expected and rubric are Human-defined");
let undefinedEvaluation = addQuestion(scoped, userQuestion.question).session;
const undefinedSelection = selectQuestions(undefinedEvaluation, [userQuestion.question.id]);
check(undefinedSelection.ok, false, "QUESTION-01 undefined user question cannot enter the executable queue");
check(undefinedSelection.code, "QUESTION_NOT_SELECTABLE", "QUESTION-01 undefined user question fails closed before execution");
const forcedUndefinedSelection = cloneCharacter(undefinedEvaluation);
forcedUndefinedSelection.selected_question_ids = [userQuestion.question.id];
forcedUndefinedSelection.current_question_id = userQuestion.question.id;
const forcedUndefinedPreflight = preflight(forcedUndefinedSelection, { locale: "en", questionId: userQuestion.question.id });
check(forcedUndefinedPreflight.ok, false, "QUESTION-01 preflight rejects a persisted undefined question selection");
check(forcedUndefinedPreflight.checks.find(item => item.id === "QUESTION_EVALUATION_DEFINITIONS")?.pass, false, "QUESTION-01 preflight exposes the missing Human definition check");

let crossCategory = createSession(source, { sessionId: "ST-CATEGORY-BATCH", now: "2026-09-08T00:01:40.000Z", mode: "CATEGORY_BATCH" });
crossCategory = selectQuestions(crossCategory, ["PB-SAFETY", "PB-FACT"]).session;
crossCategory.current_question_id = "PB-SAFETY";
let crossCategoryFinal = finalizePacks(crossCategory, { locale: "en", questionId: "PB-SAFETY", now: "2026-09-08T00:01:41.000Z" });
check(crossCategoryFinal.session.execution_pack.question_ids, ["PB-SAFETY"], "BATCH-01 category batch excludes a selected question from another category");
crossCategory = crossCategoryFinal.session;
crossCategory.current_question_id = "PB-FACT";
crossCategoryFinal = finalizePacks(crossCategory, { locale: "en", questionId: "PB-FACT", now: "2026-09-08T00:01:42.000Z" });
check(crossCategoryFinal.session.execution_pack.question_ids, ["PB-FACT"], "BATCH-01 each category receives its own fresh execution pack");

// EVIDENCE-01 / SUMMARY-01 / OBSERVED-01
const exactEvidence = "Line 1\r\n  <original & exact>\nLine 3  ";
let evidenceResult = confirmAttemptResponse(scoped, "PB-SAFETY", exactEvidence, { now: "2026-09-08T00:02:00.000Z" });
check(evidenceResult.ok, true, "EVIDENCE-01 original response accepted");
scoped = evidenceResult.session;
check(evidenceResult.evidence.original_response, exactEvidence, "EVIDENCE-01 original evidence preserved exactly");
check(evidenceResult.evidence.execution_pack_digest, scoped.execution_pack.digest, "EVIDENCE-01 exact Execution Pack digest bound");
check(evidenceResult.evidence.evaluation_pack_digest, scoped.evaluation_pack.digest, "EVIDENCE-01 exact Evaluation Pack digest bound");
check(evidenceResult.evidence.source_character_digest, scoped.source_character.character_digest, "EVIDENCE-01 source Character digest bound");
check(evidenceResult.evidence.test_scope, "BOUNDARY_HANDOFF", "EVIDENCE-01 Test Scope bound");
check(evidenceResult.evidence.runtime_test_context, scoped.runtime_test_context, "EVIDENCE-01 Runtime Test Context bound");
const originalEvidenceId = evidenceResult.evidence.evidence_id;
const correction = confirmAttemptResponse(scoped, "PB-SAFETY", "Corrected response", { now: "2026-09-08T00:03:00.000Z" });
check(correction.ok, true, "EVIDENCE-01 a second exact attempt preserves a corrected response separately");
scoped = correction.session;
check(scoped.evidence.find(item => item.evidence_id === originalEvidenceId).original_response, exactEvidence, "EVIDENCE-01 correction does not replace original");
check(correction.evidence.attempt_id !== evidenceResult.evidence.attempt_id, true, "EVIDENCE-01 corrected response has a distinct attempt binding");
const summaryResult = addSummary(scoped, { evidenceId: originalEvidenceId, summary: "A short summary" });
scoped = summaryResult.session;
check({ evidence: summaryResult.summary.is_evidence, observed: summaryResult.summary.is_observed, canonical: summaryResult.summary.is_canonical }, { evidence: false, observed: false, canonical: false }, "SUMMARY-01 summary remains separate");
let insufficient = recordAssessment(scoped, { questionId: "PB-SAFETY", evidenceId: originalEvidenceId, attemptId: evidenceResult.attempt.attempt_id, observed: "", state: "MATCH", diff: "", humanReviewed: true, strictHumanCheck: true });
check(insufficient.ok, false, "OBSERVED-01 response alone cannot complete the strict Human check");
check(insufficient.missing_fields, ["observed", "diff"], "OBSERVED-01 missing Human fields remain explicit");

// TUNE-01: one evidence contribution is not a completed T-item measurement.
let assessed = recordAssessment(scoped, { questionId: "PB-SAFETY", evidenceId: originalEvidenceId, attemptId: evidenceResult.attempt.attempt_id, observed: "Boundary was preserved", state: "DIFFERENT", diff: "The handoff material was incomplete", humanReviewed: true, strictHumanCheck: true });
check(assessed.ok, true, "OBSERVED-01 strict Human check records an attempt-bound assessment");
const assessedResult = createTrainerResult(assessed.session, { attemptId: evidenceResult.attempt.attempt_id, assessmentId: assessed.assessment.assessment_id, now: "2026-09-08T00:03:00.500Z" });
check(assessedResult.ok, true, "OBSERVED-01 strict assessment creates an immutable Result");
scoped = assessedResult.session;
const t17 = tuningEvidenceState(scoped).find(item => item.item_id === "T17");
check(t17.contribution_count, 1, "TUNE-01 one response produces one contribution");
check(t17.measurement_complete, false, "TUNE-01 one response is not measurement complete");
check(t17.control_kind, "PROTECTION_STATE_NOT_SLIDER", "TUNE-01 protection item is not a preference slider");
const t19WithoutCatalog = tuningEvidenceState(scoped).find(item => item.item_id === "T19");
check(t19WithoutCatalog.measurement_state, "NOT_ASSESSED", "TUNE-01 T19 requires Catalog evidence");

let catalogSession = createSession(source, { sessionId: "ST-CATALOG-EVIDENCE", now: "2026-09-08T00:03:01.000Z" });
catalogSession = selectQuestions(catalogSession, ["CT-CATALOG-01"]).session;
catalogSession.current_question_id = "CT-CATALOG-01";
catalogSession = finalizePacks(catalogSession, { locale: "en", questionId: "CT-CATALOG-01", now: "2026-09-08T00:03:02.000Z" }).session;
const pastedCatalogAnswer = confirmAttemptResponse(catalogSession, "CT-CATALOG-01", "Name and role repeated by an external LLM", { now: "2026-09-08T00:03:03.000Z", locale: "en" });
check(pastedCatalogAnswer.evidence.evidence_kind, "EXTERNAL_RESPONSE", "TUNE-01 a pasted target response is not promoted to Catalog evidence");
const catalogAssessment = recordAssessment(pastedCatalogAnswer.session, { questionId: "CT-CATALOG-01", evidenceId: pastedCatalogAnswer.evidence.evidence_id, attemptId: pastedCatalogAnswer.attempt.attempt_id, observed: "Identity repeated", state: "MATCH", diff: "No visible difference", humanReviewed: true, strictHumanCheck: true });
catalogSession = createTrainerResult(catalogAssessment.session, { attemptId: pastedCatalogAnswer.attempt.attempt_id, assessmentId: catalogAssessment.assessment.assessment_id, now: "2026-09-08T00:03:03.500Z" }).session;
check(tuningEvidenceState(catalogSession).find(item => item.item_id === "T19").measurement_state, "NOT_ASSESSED", "TUNE-01 T19 stays NOT_ASSESSED without independent Catalog evidence");

const secondEvidence = confirmAttemptResponse(scoped, "PB-HANDOFF", "Second independent contribution", { now: "2026-09-08T00:03:30.000Z" });
check(secondEvidence.ok, true, "TUNE-01 second question Evidence accepted");
const secondAssessment = recordAssessment(secondEvidence.session, { questionId: "PB-HANDOFF", evidenceId: secondEvidence.evidence.evidence_id, attemptId: secondEvidence.attempt.attempt_id, observed: "Handoff material present", state: "MATCH", diff: "No difference", humanReviewed: true, strictHumanCheck: true });
scoped = createTrainerResult(secondAssessment.session, { attemptId: secondEvidence.attempt.attempt_id, assessmentId: secondAssessment.assessment.assessment_id, now: "2026-09-08T00:03:31.000Z" }).session;
const multiT17 = tuningEvidenceState(scoped).find(item => item.item_id === "T17");
check(multiT17.contribution_count, 2, "TUNE-01 two independent question lineages remain two contributions");
check(multiT17.measurement_complete, false, "TUNE-01 two contributions do not invent measurement completion");
check(multiT17.measurement_state, "CONTRIBUTION_ONLY", "TUNE-01 contribution count is not a T-item rubric result");

let expressionScope = changeScope(scoped, "EXPRESSION").session;
check(evidenceForScope(expressionScope).length, 0, "SCOPE-01 prior-scope Evidence is excluded from the current scope view");
check(assessmentsForScope(expressionScope).length, 0, "SCOPE-01 prior-scope assessments are excluded from the current scope view");
check(tuningEvidenceState(expressionScope).every(item => item.contribution_count === 0), true, "SCOPE-01 prior-scope Evidence does not contribute to current-scope T-items");
scoped = changeScope(expressionScope, "BOUNDARY_HANDOFF").session;
scoped = selectQuestions(scoped, ["PB-SAFETY", "PB-HANDOFF"]).session;
scoped.execution_mode = "CATEGORY_BATCH";
scoped.runtime_test_context.conversation_intent = "FRESH_CONVERSATION_PER_CATEGORY_BATCH";
scoped = finalizePacks(scoped, { locale: "ja", now: "2026-09-08T00:03:40.000Z" }).session;
check(evidenceForScope(scoped).length, 3, "SCOPE-01 returning to the scope restores its retained Evidence history");

// LEGACY-01
const legacyQuestion = createUserQuestion({ id: "UQ-LEGACY", text: "Legacy", scope: "BOUNDARY_HANDOFF", related_path: "assistant_composition.seat4.intensity" }).question;
legacyQuestion.expected = { ja: "明示定義", en: "Explicitly defined" };
legacyQuestion.rubric = { ja: "人が明示したRubric", en: "Human-defined rubric" };
legacyQuestion.evaluation_definition_state = "DEFINED";
legacyQuestion.promotion_state = "ACTIVE";
legacyQuestion.selectable = true;
withGenerated = addQuestion(scoped, legacyQuestion).session;
withGenerated = selectQuestions(withGenerated, [...withGenerated.selected_question_ids, legacyQuestion.id]).session;
withGenerated.current_question_id = legacyQuestion.id;
withGenerated = finalizePacks(withGenerated, { locale: "ja", questionId: legacyQuestion.id, now: "2026-09-08T00:03:50.000Z" }).session;
const legacyEvidence = confirmAttemptResponse(withGenerated, legacyQuestion.id, "legacy evidence", { now: "2026-09-08T00:04:00.000Z" });
withGenerated = legacyEvidence.session;
const legacyAssessment = recordAssessment(withGenerated, { questionId: legacyQuestion.id, evidenceId: legacyEvidence.evidence.evidence_id, attemptId: legacyEvidence.attempt.attempt_id, observed: "different", state: "DIFFERENT", diff: "different", humanReviewed: true, strictHumanCheck: true });
const legacyResult = createTrainerResult(legacyAssessment.session, { attemptId: legacyEvidence.attempt.attempt_id, assessmentId: legacyAssessment.assessment.assessment_id, now: "2026-09-08T00:04:01.000Z" });
const legacyCandidate = createChangeCandidate(legacyResult.session, { assessmentId: legacyAssessment.assessment.assessment_id, proposedChange: "HIGH" });
check(legacyCandidate.ok, false, "LEGACY-01 removed Unified V1 target cannot become Candidate");
check(legacyCandidate.code, "LEGACY_SCHEMA_TARGET_PROHIBITED", "LEGACY-01 fail-closed reason");
check(contractProjection().legacy_schema_targets.length, 0, "LEGACY-01 active contract exposes no legacy targets");
check(LEGACY_SCHEMA_TARGETS.join(","), "archetype,intensity,front_control,professional_reasoning", "LEGACY-01 explicit deny-list");

// REVIEW-01 / HOME-01
const candidateResult = createChangeCandidate(scoped, { assessmentId: assessed.assessment.assessment_id, proposedChange: "Stop and return an irreversible decision to a human", whyChange: "Evidence showed incomplete handoff" });
check(candidateResult.ok, true, "REVIEW-01 active Unified V1 Candidate prepared");
scoped = candidateResult.session;
const candidate = candidateResult.candidate;
ok(candidate.BUILDER_SINGLE_HOME.includes(candidate.RELATED_CANONICAL_PATH), "HOME-01 Candidate has one canonical Builder home");
ok(candidate.BUILDER_FORM_PATH, "HOME-01 Candidate has the exact Builder form path");
check(buildBuilderHandoff(scoped, { humanReviewed: true }).ok, false, "REVIEW-01 unselected Candidate is not handed off");
check(selectQuestions(scoped, []).session.change_candidates.length, 0, "REVIEW-01 removing a question invalidates its prepared Candidate");
check(changeScope(scoped, "EXPRESSION").session.change_candidates.length, 0, "SCOPE-01 changing scope invalidates old-scope Candidates");

// Reassessment must invalidate the prior DIFFERENT candidate, including a
// previously selected one.  It must not be possible to revive it at handoff.
let reassessedSession = selectCandidate(scoped, candidate.CANDIDATE_ID, { humanSelected: true }).session;
const reassessmentAttempt = beginLinkedRetest(reassessedSession, { sourceAttemptId: evidenceResult.attempt.attempt_id, now: "2026-09-08T00:04:10.000Z" });
const reassessmentDraft = saveResponseDraft(reassessmentAttempt.session, { questionId: "PB-SAFETY", attemptId: reassessmentAttempt.attempt.attempt_id, originalResponse: "Boundary now matches", now: "2026-09-08T00:04:11.000Z" });
const reassessmentEvidence = confirmResponseDraft(reassessmentDraft.session, { questionId: "PB-SAFETY", attemptId: reassessmentAttempt.attempt.attempt_id, now: "2026-09-08T00:04:12.000Z" });
const reassessed = recordAssessment(reassessmentEvidence.session, {
  questionId: "PB-SAFETY", evidenceId: reassessmentEvidence.evidence.evidence_id, attemptId: reassessmentAttempt.attempt.attempt_id,
  observed: "Boundary now matches", state: "MATCH", diff: "No remaining difference", humanReviewed: true, strictHumanCheck: true,
});
check(reassessed.session.change_candidates.some(item => item.QUESTION_ID === "PB-SAFETY"), false, "REVIEW-01 reassessment invalidates the old DIFFERENT Candidate");
check(buildBuilderHandoff(reassessed.session, { humanReviewed: true }).ok, false, "REVIEW-01 superseded Candidate cannot be handed off later");
scoped = selectCandidate(scoped, candidate.CANDIDATE_ID, { humanSelected: true }).session;
const handoff = buildBuilderHandoff(scoped, { humanReviewed: true, now: "2026-09-08T00:05:00.000Z" });
check(handoff.ok, true, "REVIEW-01 only Human-selected eligible Candidate hands off");
check(handoff.payload.candidates.map(item => item.CANDIDATE_ID), [candidate.CANDIDATE_ID], "REVIEW-01 exact selected Candidate set");
check(stableStringify(source), sourceBefore, "MUTATION-01 Trainer Candidate creation does not mutate Character");

// REVISION-01 and binding falsification.
const staleStorage = storage();
stageBuilderHandoff(staleStorage, handoff.payload, handoff.session);
const changedRevision = cloneCharacter(source); changedRevision.identity.character_revision = "1.1.0";
const stale = consumeBuilderHandoff(staleStorage, changedRevision, { character_id: source.identity.character_id, character_revision: source.identity.character_revision });
check(stale.status, "STALE", "REVISION-01 A/B mismatch blocks Apply");
check(applyBuilderCandidates(changedRevision, handoff.payload, { humanExplicitApply: true }).code, "STALE_APPLY_BLOCKED", "REVISION-01 stale Apply fails closed");
const tamperedStorage = storage();
stageBuilderHandoff(tamperedStorage, handoff.payload, handoff.session);
const tampered = JSON.parse(tamperedStorage.getItem("saku.trainer.pendingChangeCandidates"));
tampered.candidates[0].PROPOSED_CHANGE = "tampered";
tamperedStorage.setItem("saku.trainer.pendingChangeCandidates", JSON.stringify(tampered));
check(consumeBuilderHandoff(tamperedStorage, source).status, "REJECTED", "REVISION-01 envelope content binding rejects tamper");
check(tamperedStorage.getItem("saku.trainer.pendingChangeCandidates"), null, "REVISION-01 rejected payload cannot revive");
check(saveSession(tamperedStorage, handoff.session).ok, false, "REVISION-01 an invalidated handoff cannot be revived from a retained Session clone");
check(storeBuilderHandoff(tamperedStorage, handoff.payload).ok, true, "REVISION-01 rejected handoff bytes can be restaged only as a falsification attempt");
check(consumeBuilderHandoff(tamperedStorage, source).status, "REJECTED", "REVISION-01 the same rejected handoff id remains permanently non-consumable after exact-byte restage");
const malformedPayloadStorage = storage();
stageBuilderHandoff(malformedPayloadStorage, handoff.payload, handoff.session);
malformedPayloadStorage.setItem("saku.trainer.pendingChangeCandidates", "{");
check(consumeBuilderHandoff(malformedPayloadStorage, source).status, "REJECTED", "REVISION-01 malformed payload rejects using its independently readable binding");
check(storeBuilderHandoff(malformedPayloadStorage, handoff.payload).ok, true, "REVISION-01 malformed transport repair cannot erase its prior rejection");
check(consumeBuilderHandoff(malformedPayloadStorage, source).status, "REJECTED", "REVISION-01 malformed transport rejection remains durable for the same handoff id");
const acceptedStorage = storage();
stageBuilderHandoff(acceptedStorage, handoff.payload, handoff.session);
const exactAccepted = consumeBuilderHandoff(acceptedStorage, source, {
  character_id: source.identity.character_id,
  character_revision: source.identity.character_revision,
  character_digest: handoff.payload.source_character.character_digest,
  session_id: handoff.payload.session_id,
  handoff_id: handoff.payload.handoff_id,
});
check(exactAccepted.status, "ACCEPTED", "REVISION-01 exact route identity/revision/digest/session/handoff binding accepted");
const acceptedReceipt = loadSession(acceptedStorage, handoff.session.session_id).session.builder_handoff;
check(acceptedReceipt.state, "RECEIVED_IN_BUILDER", "REVISION-01 consume returns only after the receipt is durable");
ok(Boolean(acceptedReceipt.received_at), "REVISION-01 durable receipt records when Builder consumed the handoff");
check(acceptedReceipt.received_payload_digest, handoff.payload.content_digest, "REVISION-01 durable receipt binds the exact consumed payload");
check(consumeBuilderHandoff(acceptedStorage, source).status, "EMPTY", "REVISION-01 a received handoff cannot be replay-consumed");
const deniedReceiptStorage = storage();
stageBuilderHandoff(deniedReceiptStorage, handoff.payload, handoff.session);
const deniedReceiptAdapter = {
  getItem: deniedReceiptStorage.getItem,
  removeItem: deniedReceiptStorage.removeItem,
  setItem: () => { throw new Error("receipt storage denied"); },
};
const deniedReceipt = consumeBuilderHandoff(deniedReceiptAdapter, source);
check(deniedReceipt.reason, "TRAINER_SESSION_RECEIPT_WRITE_FAILED", "REVISION-01 receipt storage failure never returns an accepted handoff");
check(deniedReceipt.transport_cleared, false, "REVISION-01 transport remains when rejection could not be made durable");
check(deniedReceiptStorage.getItem("saku.trainer.pendingChangeCandidates"), JSON.stringify(handoff.payload), "REVISION-01 complete transport is preserved for a safe retry after a non-durable receipt failure");
check(loadSession(deniedReceiptStorage, handoff.session.session_id).session.builder_handoff.state, "SENT_TO_BUILDER", "REVISION-01 a failed receipt does not claim Builder consumption");
const wrongRouteStorage = storage();
stageBuilderHandoff(wrongRouteStorage, handoff.payload, handoff.session);
check(consumeBuilderHandoff(wrongRouteStorage, source, { session_id: "ST-WRONG" }).reason, "HANDOFF_ROUTE_SESSION_MISMATCH", "REVISION-01 route session mismatch rejected");
const routeConflictStorage = storage();
stageBuilderHandoff(routeConflictStorage, handoff.payload, handoff.session);
let newerRouteSession = createSession(source, { sessionId: "ST-NEWER-TRANSPORT", now: "2026-09-08T00:05:10.000Z" });
newerRouteSession = selectQuestions(newerRouteSession, ["PB-SAFETY"]).session;
const newerRouteEvidence = confirmAttemptResponse(newerRouteSession, "PB-SAFETY", "Newer exact response", { now: "2026-09-08T00:05:11.000Z" });
const newerRouteAssessment = recordStrictResult(newerRouteEvidence.session, newerRouteEvidence.attempt.attempt_id, {
  observed: "A newer difference", state: "DIFFERENT", diff: "Newer exact diff", now: "2026-09-08T00:05:12.000Z",
});
const newerRouteCandidate = createChangeCandidate(newerRouteAssessment.session, {
  assessmentId: newerRouteAssessment.assessed.assessment.assessment_id,
  proposedChange: "Newer exact proposal",
});
newerRouteSession = selectCandidate(newerRouteCandidate.session, newerRouteCandidate.candidate.CANDIDATE_ID, { humanSelected: true }).session;
const newerRouteHandoff = buildBuilderHandoff(newerRouteSession, { humanReviewed: true, now: "2026-09-08T00:05:13.000Z" });
const newerRoutePayload = newerRouteHandoff.payload;
newerRouteSession = newerRouteHandoff.session;
stageBuilderHandoff(routeConflictStorage, newerRoutePayload, newerRouteSession);
const newerTransportText = routeConflictStorage.getItem("saku.trainer.pendingChangeCandidates");
const staleRouteResult = consumeBuilderHandoff(routeConflictStorage, source, {
  session_id: handoff.payload.session_id,
  handoff_id: handoff.payload.handoff_id,
});
check(staleRouteResult.reason, "HANDOFF_ROUTE_SESSION_MISMATCH", "REVISION-01 stale route cannot claim a newer global transport handoff");
check(staleRouteResult.transport_cleared, false, "REVISION-01 stale route preserves the self-consistent newer transport");
check(routeConflictStorage.getItem("saku.trainer.pendingChangeCandidates"), newerTransportText, "REVISION-01 stale route does not clear newer handoff bytes");
check(loadSession(routeConflictStorage, newerRoutePayload.session_id).session.builder_handoff.state, "SENT_TO_BUILDER", "REVISION-01 stale route does not invalidate the newer Session");
check(consumeBuilderHandoff(routeConflictStorage, source, {
  session_id: newerRoutePayload.session_id,
  handoff_id: newerRoutePayload.handoff_id,
}).status, "ACCEPTED", "REVISION-01 the preserved newer transport remains consumable only by its exact route");
const malformedHome = cloneCharacter(handoff.payload);
malformedHome.candidates[0].BUILDER_FORM_PATH = "legacy.path";
delete malformedHome.content_digest;
malformedHome.content_digest = contentDigest(malformedHome);
const malformedHomeStorage = storage();
stageBuilderHandoff(malformedHomeStorage, malformedHome, handoff.session);
check(consumeBuilderHandoff(malformedHomeStorage, source).reason, "HANDOFF_CANDIDATE_HOME_MISMATCH", "HOME-01 redundant Candidate home is verified against the registry");
const withdrawnStorage = storage();
const sentThenDeselected = stageBuilderHandoff(withdrawnStorage, handoff.payload, handoff.session);
const deselectedAfterSend = selectCandidate(sentThenDeselected, candidate.CANDIDATE_ID, { humanSelected: false }).session;
saveSession(withdrawnStorage, deselectedAfterSend);
check(consumeBuilderHandoff(withdrawnStorage, source).reason, "TRAINER_SESSION_HANDOFF_INVALID", "REVIEW-01 a Candidate withdrawn after send cannot be consumed from stale transport");
const switchedStorage = storage();
const sentBeforeSwitch = stageBuilderHandoff(switchedStorage, handoff.payload, handoff.session);
const invalidatedBeforeSwitch = invalidateSessionBuilderHandoff(switchedStorage, sentBeforeSwitch, "TRAINER_CHARACTER_REPLACED", "2026-09-08T00:06:00.000Z");
check(invalidatedBeforeSwitch.ok, true, "REVIEW-01 Character/Session switch durably invalidates the departing handoff");
check(loadSession(switchedStorage, sentBeforeSwitch.session_id).session.builder_handoff.state, "INVALIDATED_BY_TRAINER_CONTEXT_CHANGE", "REVIEW-01 departing saved Session carries an invalidated handoff state");
check(consumeBuilderHandoff(switchedStorage, source).status, "EMPTY", "REVIEW-01 an already-staged transport cannot survive a Trainer Character switch");
const switchedApplied = applyBuilderCandidates(source, handoff.payload, { humanExplicitApply: true });
check(recordBuilderResult(switchedStorage, handoff.payload, { ...switchedApplied, builder_saved: false }).code, "BUILDER_RESULT_STATE_TRANSITION_INVALID", "REVIEW-01 an already-open Builder cannot record a switched-away Session handoff");
const routeContext = {
  type: "SAKU_TRAINER_BUILDER_HANDOFF_CONTEXT", version: 1,
  session_id: handoff.payload.session_id, handoff_id: handoff.payload.handoff_id,
  source_character: handoff.payload.source_character,
};
check(builderRouteMatchesContext(routeContext, { session_id: handoff.payload.session_id, handoff_id: handoff.payload.handoff_id }), true, "REVISION-01 persisted Builder context matches only its exact route");
check(builderRouteMatchesContext(routeContext, { session_id: "ST-OTHER" }), false, "REVISION-01 an empty route cannot substitute an unrelated persisted Builder context");

// Explicit apply and RETEST-01.
check(applyBuilderCandidates(source, handoff.payload).code, "HUMAN_EXPLICIT_APPLY_REQUIRED", "MUTATION-01 no implicit Apply path");
const applied = applyBuilderCandidates(source, handoff.payload, { humanExplicitApply: true });
check(applied.applied, true, "MUTATION-01 Human explicit Apply prepares a new revision");
check(applied.source_revision, "1.0.0", "MUTATION-01 source revision retained");
ok(applied.new_revision !== applied.source_revision, "MUTATION-01 new revision created only after explicit Apply");
check(stableStringify(source), sourceBefore, "MUTATION-01 Apply clones rather than mutates source");
const noChangeRetest = buildRetestPlan(scoped, { changes: [] });
check(noChangeRetest.state, "NOT_REQUIRED_NO_SEMANTIC_CHANGE", "RETEST-01 no semantic change means no same-purpose retest");
const retest = buildRetestPlan(scoped, applied);
check(retest.automatic_full_rerun, false, "RETEST-01 no automatic full rerun");
check(retest.automatic_apply_loop, false, "RETEST-01 no automatic retest/apply loop");
ok(retest.question_ids.includes("PB-SAFETY"), "RETEST-01 changed semantic question selected");

// PERSIST-01 / DELETE-01
const sessionStorage = storage();
const persisted = saveSession(sessionStorage, handoff.session);
check(persisted.ok, true, "PERSIST-01 session saved");
check(loadSession(sessionStorage).session.evidence[0].original_response, exactEvidence, "PERSIST-01 exact original Evidence survives restart/load");
check(listSessions(sessionStorage).length, 1, "PERSIST-01 session index persists");
const corruptedStorage = storage();
const corruptedBase = saveSession(corruptedStorage, handoff.session);
const corruptedSession = cloneCharacter(corruptedBase.session);
corruptedSession.source_character.character_digest = "00000000";
corruptedStorage.setItem(`${SESSION_KEYS.prefix}${corruptedSession.session_id}`, JSON.stringify(corruptedSession));
check(loadSession(corruptedStorage, corruptedSession.session_id).code, "SESSION_SOURCE_BINDING_INVALID", "PERSIST-01 corrupted saved source binding fails closed");
const keyMismatchStorage = storage();
saveSession(keyMismatchStorage, handoff.session);
const keyMismatch = cloneCharacter(handoff.session);
keyMismatch.session_id = "ST-STORAGE-KEY-MISMATCH";
keyMismatchStorage.setItem(`${SESSION_KEYS.prefix}${handoff.session.session_id}`, JSON.stringify(keyMismatch));
check(loadSession(keyMismatchStorage, handoff.session.session_id).code, "SESSION_STORAGE_KEY_MISMATCH", "PERSIST-01 storage key cannot load a differently identified Session");

const lifecycleStorage = storage();
stageBuilderHandoff(lifecycleStorage, handoff.payload, handoff.session);
check(consumeBuilderHandoff(lifecycleStorage, source).status, "ACCEPTED", "PERSIST-01 exact handoff receipt is accepted");
check(recordBuilderResult(lifecycleStorage, handoff.payload, { ...applied, builder_saved: true }).code, "BUILDER_RESULT_STATE_TRANSITION_INVALID", "PERSIST-01 save acknowledgement cannot skip the recorded draft-Apply transition");
check(recordBuilderResult(lifecycleStorage, handoff.payload, { ...applied, builder_saved: "false" }).code, "BUILDER_RESULT_STATE_TRANSITION_INVALID", "PERSIST-01 string-like save flags cannot advance Builder state");
let builderRecorded = recordBuilderResult(lifecycleStorage, handoff.payload, { ...applied, builder_saved: false });
check(builderRecorded.session.builder_result.builder_saved, false, "PERSIST-01 draft Apply is recorded without claiming save or Canonical persistence");
check(builderRecorded.session.builder_result.applied, true, "PERSIST-01 exact applied result is recorded");
check(builderRecorded.session.builder_result.result_revision, 1, "PERSIST-01 Builder result contract revision is exact");
check(builderRecorded.session.retest.state, "WAITING_FOR_BUILDER_SAVE", "RETEST-01 retest waits for Builder save acknowledgement");
check(builderRecorded.session.state, "BUILDER_DRAFT_APPLIED", "PERSIST-01 Session state follows the recorded draft-Apply transition");
check(recordBuilderResult(lifecycleStorage, handoff.payload, { ...applied, builder_saved: false }).code, "BUILDER_RESULT_STATE_TRANSITION_INVALID", "PERSIST-01 the draft-Apply transition cannot be replayed");
const unrelatedSaved = cloneCharacter(applied); unrelatedSaved.character.identity.character_id = "unrelated-character";
check(recordBuilderResult(lifecycleStorage, handoff.payload, { ...unrelatedSaved, builder_saved: true }).code, "BUILDER_RESULT_BINDING_INVALID", "REVISION-01 unrelated Builder save cannot attach to the Trainer handoff");
const tamperedSaved = cloneCharacter(applied); tamperedSaved.changes[0].after = "tampered-after-Apply";
check(recordBuilderResult(lifecycleStorage, handoff.payload, { ...tamperedSaved, builder_saved: true }).code, "BUILDER_RESULT_BINDING_INVALID", "REVISION-01 altered Apply result cannot attach to the Trainer handoff");
check(validateBuilderResultTransition(lifecycleStorage, handoff.payload, { ...applied, builder_saved: true }).ok, true, "REVISION-01 exact persisted Session/Apply state passes the read-only pre-save guard");
const currentPointerBeforeBuilder = "ST-INDEPENDENT-CURRENT";
lifecycleStorage.setItem(SESSION_KEYS.current, currentPointerBeforeBuilder);
const reservation = beginBuilderSave(lifecycleStorage, handoff.payload, applied, { saveAttemptId: "BS-EXACT-1", now: "2026-09-08T00:07:00.000Z" });
check(reservation.ok, true, "REVISION-01 exact save reservation is durable before Character persistence");
check(loadSession(lifecycleStorage, handoff.session.session_id).session.builder_handoff.state, "BUILDER_SAVE_IN_PROGRESS", "REVISION-01 Session records the in-progress save token");
check(lifecycleStorage.getItem(SESSION_KEYS.current), currentPointerBeforeBuilder, "PERSIST-01 background Builder reservation does not change the Trainer current Session");
check(invalidateSessionBuilderHandoff(lifecycleStorage, handoff.session, "CONCURRENT_TRAINER_CHANGE").code, "BUILDER_SAVE_IN_PROGRESS", "REVISION-01 Trainer change is blocked during an exact Builder save reservation");
check(cancelBuilderSave(lifecycleStorage, handoff.payload, "BS-WRONG", "WRONG_TOKEN").code, "BUILDER_SAVE_RESERVATION_MISMATCH", "REVISION-01 wrong-token cancellation fails closed");
check(recordBuilderResult(lifecycleStorage, handoff.payload, { ...applied, builder_saved: true, save_attempt_id: "BS-WRONG" }).code, "BUILDER_RESULT_STATE_TRANSITION_INVALID", "REVISION-01 wrong-token finalization fails closed");
check(cancelBuilderSave(lifecycleStorage, handoff.payload, "BS-EXACT-1", "SIMULATED_WORKSPACE_FAILURE").ok, true, "REVISION-01 failed persistence cancels only the exact reservation");
check(loadSession(lifecycleStorage, handoff.session.session_id).session.builder_handoff.state, "APPLIED_IN_BUILDER_DRAFT", "REVISION-01 cancellation returns to the exact applied draft");
const finalReservation = beginBuilderSave(lifecycleStorage, handoff.payload, applied, { saveAttemptId: "BS-EXACT-2", now: "2026-09-08T00:08:00.000Z" });
check(finalReservation.ok, true, "REVISION-01 a cancelled attempt can be retried with a fresh token");
builderRecorded = recordBuilderResult(lifecycleStorage, handoff.payload, { ...applied, builder_saved: true, save_attempt_id: finalReservation.save_attempt_id });
check(builderRecorded.ok, true, "PERSIST-01 exact reserved Builder save acknowledgement persists");
check(builderRecorded.session.builder_result.builder_saved, true, "PERSIST-01 Builder save acknowledgement persists");
check(builderRecorded.session.builder_result.canonical_persisted, false, "MUTATION-01 Builder save is not Canonical Adoption");
check(builderRecorded.session.retest.state, "TARGETED_RETEST_READY", "RETEST-01 targeted retest is linked after Builder save");
check(builderRecorded.session.state, "TARGETED_RETEST_READY", "RETEST-01 Session state follows the saved targeted-retest transition");
check(lifecycleStorage.getItem(SESSION_KEYS.current), currentPointerBeforeBuilder, "PERSIST-01 Builder finalization preserves an independently selected Trainer Session");
check(invalidateSessionBuilderHandoff(lifecycleStorage, handoff.session, "STALE_TRAINER_TAB").terminal, "SAVED_FROM_BUILDER", "REVISION-01 a stale Trainer tab cannot overwrite the saved result");

const reservationFenceStorage = storage();
stageBuilderHandoff(reservationFenceStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(reservationFenceStorage, source);
recordBuilderResult(reservationFenceStorage, handoff.payload, { ...applied, builder_saved: false });
const beforeReservationClone = loadSession(reservationFenceStorage, handoff.session.session_id).session;
const fencedReservation = beginBuilderSave(reservationFenceStorage, handoff.payload, applied, { saveAttemptId: "BS-FENCE-1", now: "2026-09-08T00:08:10.000Z" });
check(fencedReservation.ok, true, "PERSIST-01 reservation-fence fixture begins an exact Builder save");
const forgedSameRevision = cloneCharacter(beforeReservationClone);
forgedSameRevision.storage_revision = loadSession(reservationFenceStorage, handoff.session.session_id).session.storage_revision;
check(saveSession(reservationFenceStorage, forgedSameRevision).code, "BUILDER_SAVE_IN_PROGRESS", "PERSIST-01 reservation fences an ordinary same-revision stale Session writer");
check(loadSession(reservationFenceStorage, handoff.session.session_id).session.builder_handoff.state, "BUILDER_SAVE_IN_PROGRESS", "PERSIST-01 fenced stale writer cannot replace the save reservation state");
check(cancelBuilderSave(reservationFenceStorage, handoff.payload, "BS-FENCE-1", "TEST_CLEANUP").ok, true, "PERSIST-01 exact reservation remains cancellable after a fenced stale write");

const nestedFenceStorage = storage();
stageBuilderHandoff(nestedFenceStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(nestedFenceStorage, source);
recordBuilderResult(nestedFenceStorage, handoff.payload, { ...applied, builder_saved: false });
const interleavedStale = loadSession(nestedFenceStorage, handoff.session.session_id).session;
interleavedStale.state = "STALE_TRAINER_EDIT";
let nestedReservation = null;
let nestedTriggered = false;
const nestedFenceAdapter = {
  get length() { return nestedFenceStorage.length; },
  key: nestedFenceStorage.key,
  getItem: nestedFenceStorage.getItem,
  removeItem: nestedFenceStorage.removeItem,
  setItem: (key, value) => {
    nestedFenceStorage.setItem(key, value);
    if (!nestedTriggered && key === SESSION_KEYS.index) {
      nestedTriggered = true;
      nestedReservation = beginBuilderSave(nestedFenceStorage, handoff.payload, applied, { saveAttemptId: "BS-NESTED-1", now: "2026-09-08T00:08:20.000Z" });
    }
  },
};
const nestedStaleSave = saveSession(nestedFenceAdapter, interleavedStale, { setCurrent: false });
check(nestedReservation.ok, true, "PERSIST-01 nested interleave establishes the Builder reservation before the stale writer commits");
ok(nestedStaleSave.code.startsWith("SESSION_STORAGE_CONFLICT"), "PERSIST-01 interleaved stale writer detects loss of its exact Session snapshot");
check(loadSession(nestedFenceStorage, handoff.session.session_id).session.builder_handoff.state, "BUILDER_SAVE_IN_PROGRESS", "PERSIST-01 interleaved stale writer preserves the authoritative Builder reservation");
check(cancelBuilderSave(nestedFenceStorage, handoff.payload, "BS-NESTED-1", "TEST_CLEANUP").ok, true, "PERSIST-01 nested reservation remains recoverable");

const markerFailureStorage = storage();
stageBuilderHandoff(markerFailureStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(markerFailureStorage, source);
recordBuilderResult(markerFailureStorage, handoff.payload, { ...applied, builder_saved: false });
const markerFailureReservation = beginBuilderSave(markerFailureStorage, handoff.payload, applied, { saveAttemptId: "BS-MARKER-FAIL", now: "2026-09-08T00:08:30.000Z" });
const markerFailureGuards = handoffGuardKeys(handoff.payload.handoff_id);
const markerFailureAdapter = {
  get length() { return markerFailureStorage.length; },
  key: markerFailureStorage.key,
  getItem: markerFailureStorage.getItem,
  removeItem: markerFailureStorage.removeItem,
  setItem: (key, value) => {
    if (key === markerFailureGuards.saved) throw new Error("simulated completion-marker failure");
    markerFailureStorage.setItem(key, value);
  },
};
const markerFailure = recordBuilderResult(markerFailureAdapter, handoff.payload, { ...applied, builder_saved: true, save_attempt_id: markerFailureReservation.save_attempt_id });
check(markerFailure.code, "BUILDER_SAVE_COMPLETION_WRITE_FAILED", "PERSIST-01 completion-marker failure is surfaced after the exact terminal Session is retained");
check(loadSession(markerFailureStorage, handoff.session.session_id).session.state, "TARGETED_RETEST_READY", "PERSIST-01 terminal Session survives completion-marker failure");
const markerRecovered = recordBuilderResult(markerFailureStorage, handoff.payload, { ...applied, builder_saved: true, save_attempt_id: markerFailureReservation.save_attempt_id });
check(markerRecovered.ok && markerRecovered.reconciled, true, "PERSIST-01 exact retry reconciles a terminal Session after completion-marker failure");
check(markerFailureStorage.getItem(markerFailureGuards.reservation), null, "PERSIST-01 reconciliation removes only the exact completed reservation");

const cleanupFailureStorage = storage();
stageBuilderHandoff(cleanupFailureStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(cleanupFailureStorage, source);
recordBuilderResult(cleanupFailureStorage, handoff.payload, { ...applied, builder_saved: false });
const cleanupFailureReservation = beginBuilderSave(cleanupFailureStorage, handoff.payload, applied, { saveAttemptId: "BS-CLEANUP-FAIL", now: "2026-09-08T00:08:40.000Z" });
const cleanupFailureGuards = handoffGuardKeys(handoff.payload.handoff_id);
const cleanupFailureAdapter = {
  get length() { return cleanupFailureStorage.length; },
  key: cleanupFailureStorage.key,
  getItem: cleanupFailureStorage.getItem,
  setItem: cleanupFailureStorage.setItem,
  removeItem: key => {
    if (key === cleanupFailureGuards.reservation) throw new Error("simulated reservation cleanup failure");
    cleanupFailureStorage.removeItem(key);
  },
};
const cleanupFailure = recordBuilderResult(cleanupFailureAdapter, handoff.payload, { ...applied, builder_saved: true, save_attempt_id: cleanupFailureReservation.save_attempt_id });
check(cleanupFailure.code, "HANDOFF_GUARD_REMOVE_FAILED", "PERSIST-01 reservation cleanup failure is surfaced without losing the terminal Session or completion marker");
const cleanupRecovered = recordBuilderResult(cleanupFailureStorage, handoff.payload, { ...applied, builder_saved: true, save_attempt_id: cleanupFailureReservation.save_attempt_id });
check(cleanupRecovered.ok && cleanupRecovered.reconciled, true, "PERSIST-01 exact retry completes reservation cleanup after a prior removal failure");

const cancelCleanupStorage = storage();
stageBuilderHandoff(cancelCleanupStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(cancelCleanupStorage, source);
recordBuilderResult(cancelCleanupStorage, handoff.payload, { ...applied, builder_saved: false });
const cancelCleanupReservation = beginBuilderSave(cancelCleanupStorage, handoff.payload, applied, { saveAttemptId: "BS-CANCEL-CLEANUP", now: "2026-09-08T00:08:45.000Z" });
const cancelCleanupGuards = handoffGuardKeys(handoff.payload.handoff_id);
const cancelCleanupAdapter = {
  get length() { return cancelCleanupStorage.length; },
  key: cancelCleanupStorage.key,
  getItem: cancelCleanupStorage.getItem,
  setItem: cancelCleanupStorage.setItem,
  removeItem: key => {
    if (key === cancelCleanupGuards.reservation) throw new Error("simulated cancel cleanup failure");
    cancelCleanupStorage.removeItem(key);
  },
};
const cancelCleanupFailure = cancelBuilderSave(cancelCleanupAdapter, handoff.payload, cancelCleanupReservation.save_attempt_id, "SIMULATED_PERSISTENCE_FAILURE");
check(cancelCleanupFailure.code, "HANDOFF_GUARD_REMOVE_FAILED", "PERSIST-01 cancel cleanup failure is surfaced after returning the Session to its exact applied draft");
check(loadSession(cancelCleanupStorage, handoff.session.session_id).session.builder_handoff.state, "APPLIED_IN_BUILDER_DRAFT", "PERSIST-01 failed cancel cleanup does not falsely retain an in-progress Session state");
const cancelCleanupRecovered = cancelBuilderSave(cancelCleanupStorage, handoff.payload, cancelCleanupReservation.save_attempt_id, "SIMULATED_PERSISTENCE_FAILURE");
check(cancelCleanupRecovered.ok && cancelCleanupRecovered.reconciled, true, "PERSIST-01 exact retry removes a stranded cancellation reservation idempotently");

const indexRecoveryStorage = storage();
const indexedA = saveSession(indexRecoveryStorage, createSession(source, { sessionId: "ST-INDEX-A", now: "2026-09-08T00:08:50.000Z" }));
const indexedB = saveSession(indexRecoveryStorage, createSession(source, { sessionId: "ST-INDEX-B", now: "2026-09-08T00:08:51.000Z" }));
check(indexedA.ok && indexedB.ok, true, "PERSIST-01 independent Session items persist before index-loss simulation");
indexRecoveryStorage.setItem(SESSION_KEYS.index, JSON.stringify([{ session_id: "ST-INDEX-A", character_id: "frozen-trainer-case", revision: "1.0.0", scope: "FULL_CHARACTER", updated_at: indexedA.session.updated_at }]));
check(listSessions(indexRecoveryStorage).map(item => item.session_id).sort(), ["ST-INDEX-A", "ST-INDEX-B"], "PERSIST-01 authoritative Session-item scan recovers an entry lost from the shared index");

const revokedStorage = storage();
stageBuilderHandoff(revokedStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(revokedStorage, source);
const revokedDraft = recordBuilderResult(revokedStorage, handoff.payload, { ...applied, builder_saved: false });
check(revokedDraft.ok, true, "REVISION-01 revocation fixture records the exact applied draft");
const staleCaller = cloneCharacter(handoff.session);
staleCaller.builder_handoff = { state: "NOT_SENT", handoff_id: null };
const invalidated = invalidateSessionBuilderHandoff(revokedStorage, staleCaller, "TRAINER_SCOPE_CHANGED", "2026-09-08T00:09:00.000Z");
check(invalidated.ok, true, "REVISION-01 invalidation reloads the authoritative Session rather than trusting a stale caller clone");
check(loadSession(revokedStorage, handoff.session.session_id).session.builder_handoff.state, "INVALIDATED_BY_TRAINER_CONTEXT_CHANGE", "REVISION-01 invalidation remains durable across reload");
check(validateBuilderResultTransition(revokedStorage, handoff.payload, { ...applied, builder_saved: true }).ok, false, "REVISION-01 revoked applied draft stays blocked on every save attempt");
check(saveSession(revokedStorage, revokedDraft.session).ok, false, "REVISION-01 a retained applied-draft clone cannot revive an invalidated handoff");
const invalidatedLoaded = loadSession(revokedStorage, handoff.session.session_id);
const clearedInvalidatedHandoff = selectQuestions(invalidatedLoaded.session, []).session;
check(saveSession(revokedStorage, clearedInvalidatedHandoff, { expectedStoredSessionText: invalidatedLoaded.storage_text }).ok, true, "REVISION-01 a current invalidated handoff may be explicitly cleared without reviving it");

const priorTamperStorage = storage();
stageBuilderHandoff(priorTamperStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(priorTamperStorage, source);
recordBuilderResult(priorTamperStorage, handoff.payload, { ...applied, builder_saved: false });
const priorKey = `${SESSION_KEYS.prefix}${handoff.session.session_id}`;
const priorTampered = JSON.parse(priorTamperStorage.getItem(priorKey));
priorTampered.builder_result.result_revision = 2;
priorTamperStorage.setItem(priorKey, JSON.stringify(priorTampered));
check(validateBuilderResultTransition(priorTamperStorage, handoff.payload, { ...applied, builder_saved: true }).code, "BUILDER_RESULT_STATE_TRANSITION_INVALID", "REVISION-01 stored prior result must match every exact result field");

const freshAfterRejected = buildBuilderHandoff(loadSession(tamperedStorage, handoff.session.session_id).session, { humanReviewed: true, now: "2026-09-08T00:10:00.000Z" });
check(freshAfterRejected.ok, true, "REVISION-01 Human review may prepare a fresh handoff after an old rejection");
stageBuilderHandoff(tamperedStorage, freshAfterRejected.payload, freshAfterRejected.session);
check(consumeBuilderHandoff(tamperedStorage, source).status, "ACCEPTED", "REVISION-01 only the fresh handoff id is accepted after an old rejection");

const throwingStorage = {
  getItem: () => null,
  setItem: () => { throw new Error("quota denied"); },
  removeItem: () => {},
};
check(saveSession(throwingStorage, handoff.session).code, "SESSION_STORAGE_WRITE_FAILED", "PERSIST-01 storage write failure is returned instead of escaping the UI flow");
check(storeBuilderHandoff(throwingStorage, handoff.payload).code, "BUILDER_HANDOFF_STORAGE_WRITE_FAILED", "PERSIST-01 handoff transport write failure is returned instead of claiming a send");

const casStorage = storage();
const casBase = saveSession(casStorage, handoff.session);
const staleCasSession = cloneCharacter(casBase.session);
const newerCasSession = cloneCharacter(casBase.session); newerCasSession.state = "NEWER_AUTHORITATIVE_STATE";
const newerCasSave = saveSession(casStorage, newerCasSession);
const newerCasRaw = casStorage.getItem(`${SESSION_KEYS.prefix}${handoff.session.session_id}`);
check(saveSession(casStorage, staleCasSession).code, "SESSION_STORAGE_CONFLICT", "PERSIST-01 storage revision rejects a stale ordinary writer");
check(casStorage.getItem(`${SESSION_KEYS.prefix}${handoff.session.session_id}`), newerCasRaw, "PERSIST-01 stale CAS does not overwrite the newer authoritative Session");

for (const malformedIndex of ["{}", "[null]", "{not-json"]) {
  const malformedIndexStorage = storage();
  malformedIndexStorage.setItem(SESSION_KEYS.index, malformedIndex);
  const before = JSON.stringify([...malformedIndexStorage.values.entries()].sort());
  check(saveSession(malformedIndexStorage, handoff.session).code, "SESSION_INDEX_INVALID", "PERSIST-01 malformed/non-array/null index fails before writes");
  check(JSON.stringify([...malformedIndexStorage.values.entries()].sort()), before, "PERSIST-01 invalid index produces zero storage mutation");
}

const atomicStorage = storage();
const atomicBase = saveSession(atomicStorage, handoff.session);
const atomicNext = cloneCharacter(atomicBase.session); atomicNext.state = "ATOMIC_NEXT";
const atomicBefore = JSON.stringify([...atomicStorage.values.entries()].sort());
let atomicWrites = 0;
const writeThenThrowStorage = {
  getItem: atomicStorage.getItem,
  removeItem: atomicStorage.removeItem,
  setItem: (key, value) => {
    atomicStorage.setItem(key, value);
    atomicWrites += 1;
    if (atomicWrites === 2) throw new Error("simulated pointer write failure after mutation");
  },
};
check(saveSession(writeThenThrowStorage, atomicNext).code, "SESSION_STORAGE_WRITE_FAILED", "PERSIST-01 partial multi-key save reports a storage failure");
check(JSON.stringify([...atomicStorage.values.entries()].sort()), atomicBefore, "PERSIST-01 rollback restores only this operation's exact after-images");

const interleavedStorage = storage();
const interleavedBase = saveSession(interleavedStorage, handoff.session);
const interleavedNext = cloneCharacter(interleavedBase.session); interleavedNext.state = "INTERLEAVED_NEXT";
let interleavedWrites = 0;
const interleavedAdapter = {
  getItem: interleavedStorage.getItem,
  removeItem: interleavedStorage.removeItem,
  setItem: (key, value) => {
    interleavedStorage.setItem(key, value);
    interleavedWrites += 1;
    if (interleavedWrites === 1) {
      interleavedStorage.values.set(key, "INTERLEAVED_NEWER_INDEX");
      throw new Error("simulated interleaved writer");
    }
  },
};
ok(saveSession(interleavedAdapter, interleavedNext).code.endsWith("ROLLBACK_INCOMPLETE"), "PERSIST-01 rollback reports lost ownership instead of overwriting an interleaved writer");
check(interleavedStorage.getItem(SESSION_KEYS.index), "INTERLEAVED_NEWER_INDEX", "PERSIST-01 rollback preserves an interleaved newer value");

const deleteStorage = storage();
stageBuilderHandoff(deleteStorage, handoff.payload, handoff.session);
consumeBuilderHandoff(deleteStorage, source);
deleteStorage.setItem("saku.workspace.active", "CHARACTER_MUST_SURVIVE");
deleteStorage.setItem("saku.amu.memory", "AMU_MEMORY_MUST_SURVIVE");
deleteStorage.setItem(TRAINER_BUILDER_CONTEXT_KEY, JSON.stringify({ type: "SAKU_TRAINER_BUILDER_HANDOFF_CONTEXT", version: 1, session_id: handoff.session.session_id, handoff_id: handoff.payload.handoff_id }));
const cleared = clearCurrentSession(deleteStorage);
check(cleared.deleted_saved_session, false, "DELETE-01 clear current does not delete saved session");
check(JSON.parse(deleteStorage.getItem(TRAINER_BUILDER_CONTEXT_KEY)).state, "INVALIDATED", "DELETE-01 clear current retains a durable invalidated Builder context tombstone");
check(loadSession(deleteStorage, handoff.session.session_id).ok, true, "DELETE-01 saved session remains after clear current");
const deleted = deleteSavedSession(deleteStorage, handoff.session.session_id);
check(deleted.ok, true, "DELETE-01 target saved session deleted deliberately");
check(deleteStorage.getItem("saku.workspace.active"), "CHARACTER_MUST_SURVIVE", "DELETE-01 Character state not deleted");
check(deleteStorage.getItem("saku.amu.memory"), "AMU_MEMORY_MUST_SURVIVE", "DELETE-01 AMU Memory not deleted");
check([...deleteStorage.values.keys()].some(key => key.startsWith(SESSION_KEYS.prefix)), false, "DELETE-01 only target Trainer session removed");

// UX Revision 2: persisted attempts, draft/Evidence separation, immutable
// result history, exact navigation, linked retest, and legacy preservation.
const uxQuestionA = BUILT_IN_QUESTIONS[0].id;
const uxQuestionB = BUILT_IN_QUESTIONS[1].id;
let ux2 = createSession(source, { sessionId: "ST-UX2", now: "2026-09-08T01:00:00.000Z", mode: "FRESH_ONE_BY_ONE" });
check(ux2.trainer_ux_revision, TRAINER_UX_REVISION, "UX2-01 new Session carries the explicit UX revision");
check(normalizeTrainerUx2Session(ux2).read_only, false, "UX2-01 current Session is writable without a migration guess");
ux2 = selectQuestions(ux2, [uxQuestionA, uxQuestionB]).session;

const begunA = beginQuestionAttempt(ux2, { questionId: uxQuestionA, locale: "en", now: "2026-09-08T01:00:01.000Z" });
check(begunA.ok, true, "UX2-02 a selected question starts one persisted attempt");
ok(begunA.attempt.question_snapshot_digest && begunA.attempt.execution_pack_snapshot && begunA.attempt.evaluation_pack_snapshot, "UX2-02 attempt freezes exact question and pack snapshots");
check(attemptForId(begunA.session, begunA.attempt.attempt_id).rendered_prompt, begunA.attempt.rendered_prompt, "UX2-02 attempt lookup returns the exact rendered source question");
const tamperedAttemptPack = cloneCharacter(begunA.session);
tamperedAttemptPack.attempts[0].execution_pack_snapshot.plain_text += "\nTAMPERED";
check(saveSession(storage(), tamperedAttemptPack).code, "ATTEMPT_BINDING_INVALID", "UX2-02 a modified Pack snapshot cannot retain its old digest and persist");
const tamperedAttemptPackFields = cloneCharacter(begunA.session);
tamperedAttemptPackFields.attempts[0].execution_pack_snapshot.question_ids.push(uxQuestionB);
check(saveSession(storage(), tamperedAttemptPackFields).code, "ATTEMPT_BINDING_INVALID", "UX2-02 duplicated Execution Pack fields cannot drift from the digest-bound context binding");
check(addEvidence(begunA.session, { questionId: uxQuestionA, originalResponse: "bypass" }).code, "UX2_CONFIRMED_RESPONSE_DRAFT_REQUIRED", "UX2-02 direct Evidence insertion cannot bypass draft confirmation");
check(recordAssessment(begunA.session, { questionId: uxQuestionA, state: "DIFFERENT", observed: "bypass", diff: "bypass", humanReviewed: true }).code, "UX2_STRICT_ATTEMPT_HUMAN_CHECK_REQUIRED", "UX2-02 unbound non-strict assessment cannot bypass the UX2 flow");

const initialDraftA = saveResponseDraft(begunA.session, {
  questionId: uxQuestionA,
  attemptId: begunA.attempt.attempt_id,
  originalResponse: "Exact original response A",
  now: "2026-09-08T01:00:02.000Z",
});
check(initialDraftA.ok, true, "UX2-03 response draft persists before confirmation");
check(initialDraftA.session.evidence.length, 0, "UX2-03 a saved response draft is not Evidence");
check(draftForAttempt(initialDraftA.session, begunA.attempt.attempt_id).is_evidence, false, "UX2-03 draft explicitly declares non-Evidence status");
check(saveResponseDraft(initialDraftA.session, { questionId: uxQuestionB, attemptId: begunA.attempt.attempt_id, originalResponse: "wrong" }).code, "DRAFT_QUESTION_BINDING_MISMATCH", "UX2-03 draft cannot cross a question binding");
const wrongClearA = clearResponseDraft(initialDraftA.session, { questionId: uxQuestionB, attemptId: begunA.attempt.attempt_id, now: "2026-09-08T01:00:02.100Z" });
check(wrongClearA.code, "DRAFT_QUESTION_BINDING_MISMATCH", "UX2-03 draft clear refuses a mismatched question binding");
check(draftForAttempt(wrongClearA.session, begunA.attempt.attempt_id).original_response, "Exact original response A", "UX2-03 rejected clear preserves the exact draft");
const clearedA = clearResponseDraft(initialDraftA.session, { questionId: uxQuestionA, attemptId: begunA.attempt.attempt_id, now: "2026-09-08T01:00:02.200Z" });
check(clearedA.code, "RESPONSE_DRAFT_CLEARED", "UX2-03 clear removes only the non-Evidence response draft");
check([draftForAttempt(clearedA.session, begunA.attempt.attempt_id), clearedA.attempt.state, clearedA.session.state], [null, "AWAITING_RESPONSE", "TEST_ATTEMPT_IN_PROGRESS"], "UX2-03 clear restores the attempt and Session response-waiting states");
const clearedAgainA = clearResponseDraft(clearedA.session, { questionId: uxQuestionA, attemptId: begunA.attempt.attempt_id, now: "2026-09-08T01:00:02.300Z" });
check(clearedAgainA.code, "RESPONSE_DRAFT_ALREADY_CLEAR", "UX2-03 repeated clear is idempotent");
const draftA = saveResponseDraft(clearedAgainA.session, {
  questionId: uxQuestionA,
  attemptId: begunA.attempt.attempt_id,
  originalResponse: "Exact original response A",
  now: "2026-09-08T01:00:02.400Z",
});

const confirmedA = confirmResponseDraft(draftA.session, { questionId: uxQuestionA, attemptId: begunA.attempt.attempt_id, now: "2026-09-08T01:00:03.000Z" });
check(confirmedA.ok, true, "UX2-04 Human confirmation creates original Evidence");
check(confirmedA.evidence.original_response, "Exact original response A", "UX2-04 Evidence preserves exact response bytes");
check(confirmedA.evidence.question_snapshot_digest, begunA.attempt.question_snapshot_digest, "UX2-04 Evidence binds the exact source-question snapshot");
check(confirmedA.session.assessments.length, 0, "UX2-04 Evidence confirmation does not auto-assess");
const tamperedConfirmedDraft = cloneCharacter(confirmedA.session);
tamperedConfirmedDraft.attempts[0].response_draft.source_character_digest = "tampered-draft-source";
check(saveSession(storage(), tamperedConfirmedDraft).code, "RESPONSE_DRAFT_BINDING_INVALID", "UX2-04 confirmed draft metadata remains bound to the exact attempt");
const tamperedEvidenceKind = resignEvidence(confirmedA.session, item => { item.evidence_kind = "CATALOG"; });
check(saveSession(storage(), tamperedEvidenceKind).code, "EVIDENCE_ATTEMPT_BINDING_INVALID", "UX2-04 a pasted response cannot be relabelled as Catalog Evidence even with a recomputed self-digest");
const reconfirmedA = confirmResponseDraft(confirmedA.session, { questionId: uxQuestionA, attemptId: begunA.attempt.attempt_id, now: "2026-09-08T01:00:04.000Z" });
check(reconfirmedA.code, "ORIGINAL_EVIDENCE_ALREADY_CONFIRMED", "UX2-04 confirm is idempotent");
check(reconfirmedA.session.evidence.length, 1, "UX2-04 idempotent confirm never duplicates immutable Evidence");
const clearConfirmedA = clearResponseDraft(confirmedA.session, { questionId: uxQuestionA, attemptId: begunA.attempt.attempt_id });
check(clearConfirmedA.code, "CONFIRMED_DRAFT_IMMUTABLE", "UX2-04 clear refuses a draft confirmed as Evidence");
check(clearConfirmedA.session.evidence[0].original_response, "Exact original response A", "UX2-04 refused clear preserves immutable Evidence");

const incompleteCheck = recordAssessment(confirmedA.session, {
  questionId: uxQuestionA,
  evidenceId: confirmedA.evidence.evidence_id,
  attemptId: begunA.attempt.attempt_id,
  state: "DIFFERENT",
  observed: "Observed response differs",
  diff: "",
  humanReviewed: true,
  strictHumanCheck: true,
});
check(incompleteCheck.code, "HUMAN_CHECK_REQUIRED_FIELDS_MISSING", "UX2-05 strict Human check never silently downgrades an incomplete decision");
check(incompleteCheck.missing_fields, ["diff"], "UX2-05 strict Human check returns actionable missing fields");
check(incompleteCheck.session.assessments.length, 0, "UX2-05 rejected Human check produces no assessment");

const assessedA = recordAssessment(confirmedA.session, {
  questionId: uxQuestionA,
  evidenceId: confirmedA.evidence.evidence_id,
  attemptId: begunA.attempt.attempt_id,
  state: "DIFFERENT",
  observed: "Observed response differs",
  diff: "Expected boundary was absent",
  humanReviewed: true,
  strictHumanCheck: true,
});
check(assessedA.ok, true, "UX2-05 complete strict Human check is recorded");
const resultA = createTrainerResult(assessedA.session, { attemptId: begunA.attempt.attempt_id, assessmentId: assessedA.assessment.assessment_id, now: "2026-09-08T01:00:05.000Z" });
check(resultA.ok, true, "UX2-06 assessment becomes an immutable append-only Trainer result");
check([resultA.result.test_scope, resultA.result.execution_mode], [resultA.attempt.test_scope, resultA.attempt.execution_mode], "UX2-06 result preserves exact attempt scope and execution mode bindings");
check(resultA.result.canonical_mutation, false, "UX2-06 recording a result never mutates Canonical Character data");
check(resultForAttempt(resultA.session, begunA.attempt.attempt_id).state, "DIFFERENT", "UX2-06 result lookup resolves the exact attempt");
check(createTrainerResult(resultA.session, { attemptId: begunA.attempt.attempt_id, assessmentId: assessedA.assessment.assessment_id }).code, "TRAINER_RESULT_ALREADY_RECORDED", "UX2-06 result creation is idempotent");
check(clearResponseDraft(resultA.session, { questionId: uxQuestionA, attemptId: begunA.attempt.attempt_id }).code, "CONFIRMED_DRAFT_IMMUTABLE", "UX2-06 clear refuses a completed result attempt");
const sourceView = sourceQuestionResultForAttempt(resultA.session, begunA.attempt.attempt_id);
check(sourceView.original_evidence.original_response, "Exact original response A", "UX2-07 result navigation returns the exact original Evidence");
check(sourceView.question_snapshot.id, uxQuestionA, "UX2-07 result navigation returns the exact source question");

const queueAfterA = trainerQuestionQueueState(resultA.session);
check([queueAfterA.completed_question_count, queueAfterA.selected_question_count], [1, 2], "UX2-08 progress denominator counts selected questions only");
check(nextUnfinishedSelectedQuestion(resultA.session).question.id, uxQuestionB, "UX2-08 next navigation skips completed questions");
let queueInChangedScope = changeScope(resultA.session, "IDENTITY_PURPOSE").session;
queueInChangedScope = selectQuestions(queueInChangedScope, [uxQuestionA]).session;
check(trainerQuestionQueueState(queueInChangedScope).completed_question_count, 0, "UX2-08 completion from another scope never completes the current-scope queue");
check(trainerQuestionQueueState(queueInChangedScope).entries[0].attempt_id, null, "UX2-08 current-scope progress does not open an old-scope attempt");

const candidateA = createChangeCandidate(resultA.session, { assessmentId: assessedA.assessment.assessment_id, proposedChange: "Evidence-bound value" });
check(candidateA.ok, true, "UX2-09 a DIFFERENT immutable result may prepare a Builder candidate");
ok(candidateA.candidate.CANDIDATE_CONTENT_DIGEST && candidateA.candidate.RESULT_CONTENT_DIGEST && candidateA.candidate.QUESTION_SNAPSHOT_DIGEST, "UX2-09 Candidate binds its immutable Result and question snapshot");
const tamperedAssessment = cloneCharacter(resultA.session);
tamperedAssessment.assessments.find(item => item.assessment_id === assessedA.assessment.assessment_id).observed = "Tampered after Result";
check(createChangeCandidate(tamperedAssessment, { assessmentId: assessedA.assessment.assessment_id, proposedChange: "bypass" }).code, "RESULT_ASSESSMENT_BINDING_INVALID", "UX2-09 Candidate derivation rejects a mutable assessment that differs from the immutable Result");
check(saveSession(storage(), tamperedAssessment).code, "RESULT_ASSESSMENT_BINDING_INVALID", "UX2-09 persistence rejects an assessment that differs from its immutable Result snapshot");
const injectedUnbound = cloneCharacter(resultA.session);
injectedUnbound.assessments.push({ ...cloneCharacter(assessedA.assessment), assessment_id: "AS-UNBOUND", attempt_id: null });
check(createChangeCandidate(injectedUnbound, { assessmentId: "AS-UNBOUND", proposedChange: "bypass" }).code, "TRAINER_RESULT_REQUIRED", "UX2-09 an unbound assessment cannot prepare a Builder candidate");
check(eligibleBuilderCandidates(candidateA.session).length, 1, "UX2-09 eligibility helper exposes only exactly bound candidates");
check(eligibleBuilderCandidates(candidateA.session, { selectedOnly: true }).length, 0, "UX2-09 unselected candidate is not send-eligible");
const candidateSourceTamper = resignCandidate(candidateA.session, item => { item.SOURCE_CHARACTER_ID = "other-character"; });
check(eligibleBuilderCandidates(candidateSourceTamper).length, 0, "UX2-09 recomputing a Candidate digest cannot bypass source-Character binding");
const candidatePathTamper = resignCandidate(candidateA.session, item => { item.RELATED_CANONICAL_PATH = "purpose.summary"; });
check(eligibleBuilderCandidates(candidatePathTamper).length, 0, "UX2-09 recomputing a Candidate digest cannot redirect its immutable Result to another field");
const candidateResultTamper = resignCandidate(candidateA.session, item => { item.RESULT_CONTENT_DIGEST = "00000000"; });
check(eligibleBuilderCandidates(candidateResultTamper).length, 0, "UX2-09 recomputing a Candidate digest cannot substitute another Result binding");
const candidateProposalTamper = cloneCharacter(candidateA.session);
candidateProposalTamper.change_candidates[0].PROPOSED_CHANGE = "tampered without binding";
check(eligibleBuilderCandidates(candidateProposalTamper).length, 0, "UX2-09 changing proposed content invalidates the Candidate content binding");
const selectedA = selectCandidate(candidateA.session, candidateA.candidate.CANDIDATE_ID, { humanSelected: true });
check(eligibleBuilderCandidates(selectedA.session, { selectedOnly: true }).length, 1, "UX2-09 Human-selected exact result becomes send-eligible");
const uxCandidateHandoff = buildBuilderHandoff(selectedA.session, { humanReviewed: true, now: "2026-09-08T01:00:05.500Z" });
const applyTamper = cloneCharacter(uxCandidateHandoff.payload);
applyTamper.candidates[0].PROPOSED_CHANGE = "tampered before direct Apply";
delete applyTamper.content_digest;
applyTamper.content_digest = contentDigest(applyTamper);
check(applyBuilderCandidates(source, applyTamper, { humanExplicitApply: true }).code, "CANDIDATE_CONTENT_BINDING_INVALID", "UX2-09 direct Builder Apply rejects Candidate content changed after preparation");
const uxCandidateStorage = storage();
const persistedCandidate = saveSession(uxCandidateStorage, candidateA.session);
check(persistedCandidate.ok, true, "UX2-09 an exactly bound unselected Candidate persists");
const persistedSelection = selectCandidate(persistedCandidate.session, candidateA.candidate.CANDIDATE_ID, { humanSelected: true });
check(saveSession(uxCandidateStorage, persistedSelection.session).ok, true, "UX2-09 Human selection is the only permitted mutable Candidate field");
const persistedCandidateTamper = resignCandidate(persistedSelection.session, item => { item.PROPOSED_CHANGE = "changed after persistence"; item.AFTER = "changed after persistence"; });
check(saveSession(uxCandidateStorage, persistedCandidateTamper).code, "IMMUTABLE_CANDIDATE_CONTENT_MUTATION", "UX2-09 persisted Candidate content remains immutable even with a recomputed self-digest");

const begunB = beginQuestionAttempt(selectedA.session, { questionId: uxQuestionB, now: "2026-09-08T01:00:06.000Z" });
const draftB = saveResponseDraft(begunB.session, { questionId: uxQuestionB, attemptId: begunB.attempt.attempt_id, originalResponse: "Exact original response B", now: "2026-09-08T01:00:07.000Z" });
const confirmedB = confirmResponseDraft(draftB.session, { questionId: uxQuestionB, attemptId: begunB.attempt.attempt_id, now: "2026-09-08T01:00:08.000Z" });
const missingNotAssessedReason = recordAssessment(confirmedB.session, {
  questionId: uxQuestionB, evidenceId: confirmedB.evidence.evidence_id, attemptId: begunB.attempt.attempt_id,
  state: "NOT_ASSESSED", humanReviewed: true, strictHumanCheck: true,
});
check(missingNotAssessedReason.missing_fields, ["not_assessed_reason"], "UX2-10 explicit NOT_ASSESSED requires a Human reason");
const assessedB = recordAssessment(confirmedB.session, {
  questionId: uxQuestionB, evidenceId: confirmedB.evidence.evidence_id, attemptId: begunB.attempt.attempt_id,
  state: "NOT_ASSESSED", notAssessedReason: "Required external observation is unavailable", humanReviewed: true, strictHumanCheck: true,
});
check(assessedB.assessment.not_assessed_reason, "Required external observation is unavailable", "UX2-10 explainable NOT_ASSESSED preserves its reason");
const resultB = createTrainerResult(assessedB.session, { attemptId: begunB.attempt.attempt_id, assessmentId: assessedB.assessment.assessment_id, now: "2026-09-08T01:00:09.000Z" });
check(resultB.ok, true, "UX2-10 explainable NOT_ASSESSED is a valid immutable result");

const retestA = beginLinkedRetest(resultB.session, { sourceAttemptId: begunA.attempt.attempt_id, now: "2026-09-08T01:00:10.000Z" });
check(retestA.ok, true, "UX2-11 a retest starts only from a completed source attempt");
check(retestA.attempt.retest_of_attempt_id, begunA.attempt.attempt_id, "UX2-11 retest records direct lineage");
check(retestA.session.evidence.length, 2, "UX2-11 linked retest preserves all prior Evidence");
check(retestA.session.result_history.length, 2, "UX2-11 linked retest preserves all prior results");

let orderedQueue = createSession(source, { sessionId: "ST-UX2-ORDER", now: "2026-09-08T01:01:00.000Z" });
orderedQueue = selectQuestionInQueue(orderedQueue, { questionId: uxQuestionB, selected: true }).session;
orderedQueue = selectQuestionInQueue(orderedQueue, { questionId: uxQuestionA, selected: true }).session;
check(orderedQueue.selected_question_ids, [uxQuestionB, uxQuestionA], "UX2-12 queue preserves explicit Human selection order");

const uxStorage = storage();
const persistedUx2 = saveSession(uxStorage, resultB.session);
check(persistedUx2.ok, true, "UX2-13 exact attempt/Evidence/result history persists");
const reorderedResults = cloneCharacter(persistedUx2.session);
reorderedResults.result_history.reverse();
check(saveSession(uxStorage, reorderedResults).code, "RESULT_ORDINAL_BINDING_INVALID", "UX2-13 immutable Result chronology cannot be reordered");
const changedEvidence = cloneCharacter(persistedUx2.session);
changedEvidence.evidence[0].source = "TAMPERED_AFTER_PERSISTENCE";
check(saveSession(uxStorage, changedEvidence).code, "EVIDENCE_CONTENT_DIGEST_INVALID", "UX2-13 persisted Evidence rejects changed provenance before it can replace the immutable record");
const changedResult = cloneCharacter(persistedUx2.session);
changedResult.result_history[0].state = "MATCH";
delete changedResult.result_history[0].result_content_digest;
changedResult.result_history[0].result_content_digest = contentDigest(changedResult.result_history[0]);
check(saveSession(uxStorage, changedResult).code, "RESULT_ATTEMPT_BINDING_INVALID", "UX2-13 persisted result history is rejected before a changed state can contradict its immutable attempt");
const corruptedLoadStorage = storage();
const loadBaseline = saveSession(corruptedLoadStorage, resultB.session);
const corruptedLoad = JSON.parse(corruptedLoadStorage.getItem(`${SESSION_KEYS.prefix}${loadBaseline.session.session_id}`));
corruptedLoad.evidence[0].evidence_kind = "CATALOG";
resignEvidenceRecord(corruptedLoad.evidence[0]);
corruptedLoadStorage.setItem(`${SESSION_KEYS.prefix}${loadBaseline.session.session_id}`, JSON.stringify(corruptedLoad));
check(loadSession(corruptedLoadStorage, loadBaseline.session.session_id).code, "EVIDENCE_ATTEMPT_BINDING_INVALID", "UX2-13 load rejects a recomputed but semantically altered Evidence record before UI adoption");

const legacyUx = cloneCharacter(createSession(source, { sessionId: "ST-LEGACY-UX", now: "2026-09-08T01:02:00.000Z" }));
delete legacyUx.trainer_ux_revision;
delete legacyUx.attempts;
delete legacyUx.active_attempt_id;
delete legacyUx.result_history;
legacyUx.assessments.push({ assessment_id: "AS-LEGACY", question_id: uxQuestionA, state: "NOT_ASSESSED" });
const legacyView = normalizeTrainerUx2Session(legacyUx);
check(legacyView.code, "LEGACY_SESSION_READ_ONLY", "UX2-14 historical Session is marked read-only without migration");
check(legacyView.legacy_record_markers[0].marker, "LEGACY_AMBIGUOUS_NOT_ASSESSED", "UX2-14 ambiguous historical result is visibly marked and never reinterpreted");
check(saveSession(storage(), legacyUx).code, "LEGACY_SESSION_READ_ONLY", "UX2-14 historical Session cannot be silently rewritten");
const legacyStorage = storage();
legacyStorage.setItem(SESSION_KEYS.current, legacyUx.session_id);
legacyStorage.setItem(`${SESSION_KEYS.prefix}${legacyUx.session_id}`, JSON.stringify(legacyUx));
const loadedLegacy = loadSession(legacyStorage, legacyUx.session_id);
check(loadedLegacy.ok && loadedLegacy.read_only, true, "UX2-14 historical Session remains loadable as read-only evidence");
check(loadedLegacy.session.assessments[0].state, "NOT_ASSESSED", "UX2-14 historical record bytes remain unchanged on load");

// LANG-01 and contract identity.
for (const questionValue of BUILT_IN_QUESTIONS) {
  ok(questionValue.prompt.ja && questionValue.prompt.en, `LANG-01 ${questionValue.id} question JA/EN`);
  ok(questionValue.expected.ja && questionValue.expected.en, `LANG-01 ${questionValue.id} Expected JA/EN`);
  ok(questionValue.rubric.ja && questionValue.rubric.en, `LANG-01 ${questionValue.id} rubric JA/EN`);
}
check(TEST_SCOPES.every(item => item.ja && item.en), true, "LANG-01 Test Scope JA/EN parity");
check(EXECUTION_MODES.every(item => item.ja && item.en), true, "LANG-01 execution mode JA/EN parity");
check(QUESTION_LIBRARY_ID, "saku.trainer.built-in-questions@1", "QUESTION-01 versioned built-in library");
check(ASSESSMENT_STATES.includes("NOT_ASSESSED"), true, "OBSERVED-01 NOT_ASSESSED is a first-class state");
check(contractProjection().trainer_direct_canonical_mutation_paths, 0, "MUTATION-01 Trainer direct Canonical mutation paths");

// Legacy and UX3 contract tests above remain compatibility evidence. Production UX4 wiring:
const trainerUi = await read("tools/unified-v1/trainer-ux4-ui.mjs");
const trainerHtml = await read("tools/saku-trainer.html");
const ux3Contract = await read("tools/v1/trainer-ux3.mjs");
const ux4Contract = await read("tools/v1/trainer-ux4.mjs");
ok(trainerHtml.includes('trainer-ux4-ui.mjs'), "UX4 entry is the shipped controller");
ok(!trainerUi.includes("suggestAdjustments") && !trainerUi.includes("buildCandidate("), "No legacy tuning inference from generic choices");
ok(trainerUi.includes('validateUnifiedV1') && trainerUi.includes('consumeHandoff'), "Character validation and bound intake retained");
ok(ux3Contract.includes('finalizePacks') && ux3Contract.includes('pack_sha256'), "Execution and evaluation packs retain separate immutable context");
ok(trainerUi.includes('EXECUTION_MODES.map'), "Both frozen execution modes available in normal setup");
ok(ux3Contract.includes('candidateTrace') && ux3Contract.includes('CANDIDATE_EVALUATION_MISMATCH'), "Future Candidate trace binds exact Result/Evaluation");
ok(ux4Contract.includes('GENERIC_HUMAN_CHOICES_DO_NOT_ESTABLISH_T01_T20_MEASUREMENTS') && ux4Contract.includes("character_mutation: false"), "UX4 recommendation remains non-inferred and non-mutating");
const builderFrozenUi = await read("tools/v1/frozen-ia-ui.mjs");
const builderHtml = await read("tools/saku-builder.html");
  ok(builderFrozenUi.includes("trainerSavePreflight") && builderFrozenUi.includes("validateBuilderResultTransition") && builderFrozenUi.includes("BUILDER_SAVED_CHARACTER_DOES_NOT_MATCH_APPLIED_RESULT"), "REVISION-01 Builder save revalidates the exact post-Apply Character and persisted Session binding");
  ok(builderFrozenUi.includes("persistTrainerBuilderContext") && builderFrozenUi.includes("recoverTrainerCandidateReview") && builderFrozenUi.includes("APPLIED_DRAFT"), "PERSIST-01 exact Builder Apply context survives reload and remains bound to the Trainer Session");
  ok(builderFrozenUi.includes("BUILDER_SAVE_RECOVERY_ACTION_REQUIRED") && builderFrozenUi.includes("recorded_save_transition") && builderFrozenUi.includes("cancel_recovery_required"), "PERSIST-01 interrupted saves and incomplete cancel cleanup require an explicit bound recovery action and never start a second save");
  ok(builderFrozenUi.includes("HANDOFF_ROUTE_BINDING_INCOMPLETE") && builderFrozenUi.includes("builderRouteMatchesContext"), "REVISION-01 Builder recovery cannot substitute an unrelated or incomplete route context");
  ok(builderHtml.includes("SAKU_INVALIDATE_TRAINER_APPLY_CONTEXT") && builderHtml.includes("SAKU_TRAINER_SAVE_PREFLIGHT"), "REVISION-01 Character replacement or revoked Trainer Session blocks before Save");
  const preflightOrder = builderHtml.indexOf("SAKU_TRAINER_SAVE_PREFLIGHT");
  const schemaOrder = builderHtml.indexOf("await window.SAKU_ADOPTED_VALIDATE", preflightOrder);
  const reservationOrder = builderHtml.indexOf("SAKU_TRAINER_BEGIN_SAVE", schemaOrder);
  const workspaceOrder = builderHtml.indexOf('invoke("save_workspace_character"', reservationOrder);
  const libraryOrder = builderHtml.indexOf("CharacterLibrary.importCharacters", reservationOrder);
  const finalizeOrder = builderHtml.indexOf("SAKU_RECORD_TRAINER_BUILDER_SAVE", reservationOrder);
  ok(preflightOrder >= 0 && preflightOrder < schemaOrder && schemaOrder < reservationOrder && reservationOrder < workspaceOrder && reservationOrder < libraryOrder && workspaceOrder < finalizeOrder && libraryOrder < finalizeOrder, "REVISION-01 Builder orders preflight, schema validation, exact reservation, persistence, then finalization");
  ok(builderHtml.includes("trainerAwareSaveInProgress") && builderHtml.includes("if (trainerAwareSaveInProgress) return"), "PERSIST-01 duplicate Builder Save activation is suppressed while one exact attempt is active");
ok(trainerUi.includes("failedOperation") && ux3Contract.includes("SESSION_STORAGE_CONFLICT") && ux4Contract.includes("SESSION_STORAGE_CONFLICT"), "PERSIST-01 production Trainer retains failed operation and rejects storage conflicts");
  ok(builderFrozenUi.includes('"RECEIVED_IN_BUILDER"') && builderFrozenUi.includes("persistedHandoff?.handoff_id === context.handoff_id"), "PERSIST-01 RECEIVED context recovery requires the exact durable Session state and outer handoff ID");
  ok(builderHtml.includes("Trainer Sessionとの関連付けと対象再test計画を記録できませんでした"), "PERSIST-01 Builder surfaces Trainer linkage failure after Character save");
  ok(/try \{ trainerLinkRecorded = window\.SAKU_RECORD_TRAINER_BUILDER_SAVE/.test(builderHtml), "PERSIST-01 a save-link exception cannot suppress the partial-success warning");

console.log(`FROZEN_TRAINER_IA_VERIFY PASS ${count}/${count}`);
for (const id of ["PREFLIGHT-01", "PACK-01", "PACK-02", "SCOPE-01", "BATCH-01", "FRESH-01", "QUESTION-01", "EVIDENCE-01", "SUMMARY-01", "OBSERVED-01", "TUNE-01", "LEGACY-01", "REVIEW-01", "HOME-01", "REVISION-01", "RETEST-01", "PERSIST-01", "DELETE-01", "LANG-01", "MUTATION-01"]) console.log(`${id} PASS`);

function cloneCharacter(value) { return JSON.parse(JSON.stringify(value)); }

function resignCandidate(sessionValue, mutate) {
  const session = cloneCharacter(sessionValue);
  const candidate = session.change_candidates[0];
  mutate(candidate);
  const projection = cloneCharacter(candidate);
  delete projection.CANDIDATE_CONTENT_DIGEST;
  delete projection.HUMAN_REVIEW_STATE;
  candidate.CANDIDATE_CONTENT_DIGEST = contentDigest(projection);
  return session;
}

function resignEvidence(sessionValue, mutate) {
  const session = cloneCharacter(sessionValue);
  mutate(session.evidence[0]);
  resignEvidenceRecord(session.evidence[0]);
  return session;
}

function resignEvidenceRecord(evidence) {
  const projection = cloneCharacter(evidence);
  delete projection.evidence_content_digest;
  evidence.evidence_content_digest = contentDigest(projection);
}
