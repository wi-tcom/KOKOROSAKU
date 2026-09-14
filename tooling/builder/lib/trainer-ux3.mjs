// Trainer UX3: bounded, immutable evidence records. No Character mutation.
// Physical persistence is an IndexedDB transaction over one Session aggregate;
// seven logical record types stay distinct. No runtime/provider identity inferred.
import { createSession as legacySession, finalizePacks, stableStringify, contentDigest } from './trainer-contract.mjs';
import { validateUnifiedV1 } from './unified-authoring.mjs';

export const NAMESPACE = 'saku.trainer.ux3';
export const CHOICE_VERSION = 'saku.trainer.human-choices@1';
export const VALIDATION_RULE_VERSION_R3 = 'saku.trainer.validation-rules@3';
export const VALIDATION_RULE_VERSION_R4 = 'saku.trainer.validation-rules@4';
export const CHOICES = Object.freeze({
  conclusion: {
    MATCH: ['期待どおり', 'As expected'], PARTIAL: ['一部違いがある', 'Some differences'],
    MAJOR: ['大きな違いがある', 'Major differences'], NOT_ASSESSED: ['まだ判断しない', 'Not ready to judge'],
  },
  confirmed: {
    C01: ['質問に沿って答えている', 'Answers the question'],
    C02: ['Characterの役割・方針を保っている', 'Maintains the Character’s role and approach'],
    C03: ['事実と不確かな点を分けている', 'Separates facts from uncertainty'],
    C04: ['必要な内容がそろっている', 'Includes the necessary content'],
    C05: ['長さ・詳しさが適切', 'Uses appropriate length and detail'],
    C06: ['ことばづかい・表現が適切', 'Uses appropriate language and expression'],
    C07: ['できないことや人への引き継ぎが適切', 'Handles limitations and human handoff appropriately'],
    C_NONE: ['この回答から確認できた項目はない', 'None of these items could be confirmed from this response'],
  },
  reasons: {
    R01: ['期待した内容に合っている', 'Matches the expected content'],
    R02: ['必要な内容が足りない', 'Necessary content is missing'],
    R03: ['不要な内容が多い／詳しすぎる', 'Contains unnecessary content or too much detail'],
    R04: ['事実や不確かな点の扱いに問題がある', 'Facts or uncertainty are handled poorly'],
    R05: ['Characterの役割・話し方からずれている', 'Departs from the Character’s role or voice'],
    R06: ['対応範囲や人への引き継ぎが適切でない', 'Scope or human handoff is inappropriate'],
    R07: ['判断に必要な情報・確認がまだそろっていない', 'More information or checking is needed to judge'],
  },
});
const clone = x => structuredClone(x);
const equal = (a, b) => stableStringify(a) === stableStringify(b);
const fail = code => { throw new Error(code); };
const requireThat = (yes, code) => { if (!yes) fail(code); };
export const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
export async function digest(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(typeof value === 'string' ? value : stableStringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function utf8Range(text, start, end) {
  const bytes = new TextEncoder().encode(text);
  requireThat(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= bytes.length, 'PARTIAL_RANGE_OUT_OF_BOUNDS');
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes.slice(0, start)); decoder.decode(bytes.slice(end));
    return decoder.decode(bytes.slice(start, end));
  } catch { fail('PARTIAL_RANGE_UTF8_BOUNDARY'); }
}
export function selectionToUtf8(text, start, end) {
  // UI selection offsets are used once to record a byte range; they are never
  // retained as the authority. A split surrogate fails on round-trip validation.
  const a = new TextEncoder().encode(text.slice(0, start)).length;
  const b = new TextEncoder().encode(text.slice(0, end)).length;
  requireThat(utf8Range(text, a, b) === text.slice(start, end), 'PARTIAL_RANGE_UTF8_BOUNDARY');
  return { start: a, end: b };
}
export function validateChoices(choice, validationRuleVersion = VALIDATION_RULE_VERSION_R3) {
  const errors = [], c = choice?.confirmed || [], r = choice?.reasons || [], conclusion = choice?.conclusion;
  if (!Object.hasOwn(CHOICES.conclusion, conclusion || '')) errors.push('CONCLUSION_REQUIRED');
  if (!c.length || c.some(x => !Object.hasOwn(CHOICES.confirmed, x)) || new Set(c).size !== c.length) errors.push('CONFIRMED_REQUIRED');
  if (c.includes('C_NONE') && c.length > 1) errors.push('C_NONE_EXCLUSIVE');
  if (!r.length || r.some(x => !Object.hasOwn(CHOICES.reasons, x)) || new Set(r).size !== r.length) errors.push('REASON_REQUIRED');
  if (validationRuleVersion !== VALIDATION_RULE_VERSION_R4) {
    if (conclusion === 'MATCH' && (c.includes('C_NONE') || !c.length || !equal(r, ['R01']))) errors.push('MATCH_REQUIRES_CONFIRMED_AND_R01_ONLY');
    if (['PARTIAL', 'MAJOR'].includes(conclusion) && (!r.some(x => /^R0[2-6]$/.test(x)) || r.includes('R01'))) errors.push('DIFFERENCE_REQUIRES_R02_R06');
    if (conclusion === 'NOT_ASSESSED' && (!r.includes('R07') || r.includes('R01'))) errors.push('NOT_ASSESSED_REQUIRES_R07');
  }
  return errors;
}
export function current(s) {
  const execution = s.executions[s.selected.execution];
  const question = s.questions[s.selected.question];
  if (!execution || !question || question.execution_id !== execution.id) return { status: 'PENDING' };
  const original = s.originals[s.response_heads[execution.id]];
  const binding = s.bindings[s.binding_heads[question.id]];
  const base = { execution, question, original };
  if (!original || !binding || binding.original_id !== original.id || binding.question_attempt_id !== question.id) return { ...base, status: 'UNRESOLVED' };
  if (binding.kind === 'MAPPING_UNRESOLVED') return { ...base, binding, status: 'UNRESOLVED' };
  const evaluation = s.evaluations[s.evaluation_heads[binding.id]];
  const result = evaluation && s.results[evaluation.result_id];
  if (!evaluation || !result || result.evaluation_id !== evaluation.id) return { ...base, binding, status: 'PENDING' };
  return { ...base, binding, evaluation, result, status: 'SAVED' };
}
export async function create(character, id = newId('session')) {
  const base = legacySession(character);
  requireThat(base.source_character.structural_validation.ok, 'CHARACTER_INVALID');
  return { schema: NAMESPACE, session_id: id, version: 0, source: clone(base.source_character),
    preparation: { scope: base.test_scope, mode: base.execution_mode, language: 'ja', platform: 'generic', question_ids: [], custom_questions: [] },
    selected: { group: null, execution: null, question: null }, group_heads: {}, response_heads: {}, binding_heads: {}, evaluation_heads: {},
    executions: {}, questions: {}, originals: {}, bindings: {}, evaluations: {}, results: {}, candidates: {}, operations: {},
    drafts: { responses: {}, evaluations: {} }, view: { stage: 1, history_result: null }, created_at: new Date().toISOString(),
    canonical_mutation: false };
}
export function preparationSession(s) {
  const p = s.preparation;
  const base = legacySession(s.source.snapshot, { sessionId: s.session_id, testScope: p.scope, mode: p.mode, platform: p.platform });
  const generated = s.r4?.generation?.item_snapshots || [];
  const replacements = new Set(generated.map(item => item.id));
  if (replacements.size) base.questions = base.questions.filter(item => !replacements.has(item.id));
  base.questions.push(...clone(generated), ...clone((p.custom_questions || []).filter(item => !replacements.has(item.id))));
  base.selected_question_ids = [...p.question_ids];
  return base;
}
export async function groupFor(s, questionId) {
  const base = preparationSession(s);
  requireThat(base.selected_question_ids.includes(questionId), 'QUESTION_NOT_SELECTED');
  const pack = finalizePacks(base, { locale: s.preparation.language, questionId });
  requireThat(pack.ok, 'PREPARATION_INCOMPLETE');
  return { group: await digest({ preparation: s.preparation, question_ids: pack.session.execution_pack.question_ids }), pack: pack.session };
}
function expect(actual, expected) { requireThat(equal(actual ?? null, expected ?? null), 'STALE_EXPECTED_HEAD'); }
function record(table, id, code) { requireThat(Object.hasOwn(table, id || ''), code); return table[id]; }
function context(s, executionId, questionId = null) {
  const e = record(s.executions, executionId, 'EXECUTION_MISSING');
  requireThat(e.session_id === s.session_id, 'CROSS_SESSION');
  const q = questionId ? record(s.questions, questionId, 'QUESTION_ATTEMPT_MISSING') : null;
  if (q) requireThat(q.execution_id === e.id && q.session_id === s.session_id, 'CROSS_LINEAGE');
  return { e, q };
}
function intentKey(intent) { requireThat(typeof intent === 'string' && intent.length > 0 && intent.length < 200, 'INTENT_REQUIRED'); return `intent:${intent}`; }

async function appendBinding(s, p, stamp) {
  const { e, q } = context(s, p.execution_id, p.question_attempt_id);
  const original = record(s.originals, p.original_id, 'ORIGINAL_MISSING');
  requireThat(original.execution_id === e.id, 'CROSS_LINEAGE');
  expect(s.response_heads[e.id], p.original_id); expect(s.binding_heads[q.id], p.expected_binding);
  requireThat(['WHOLE', 'PARTIAL', 'MAPPING_UNRESOLVED'].includes(p.kind), 'BINDING_KIND_REQUIRED');
  requireThat(p.human_explicit === true, 'EXPLICIT_MAPPING_REQUIRED');
  const id = newId('binding');
  const range = p.kind === 'PARTIAL' ? { start: p.start, end: p.end } : null;
  const excerpt = range ? utf8Range(original.text, range.start, range.end) : original.text;
  s.bindings[id] = { id, session_id: s.session_id, execution_id: e.id, question_attempt_id: q.id, original_id: original.id,
    original_sha256: original.sha256, kind: p.kind, range, range_sha256: range ? await digest(excerpt) : null,
    human_explicit: true, supersedes_binding_id: p.expected_binding || null, created_at: stamp };
  s.binding_heads[q.id] = id;
  return id;
}

async function appendEvaluation(s, p, stamp) {
  const { e, q } = context(s, p.execution_id, p.question_attempt_id);
  const b = record(s.bindings, p.binding_id, 'BINDING_REQUIRED');
  requireThat(b.question_attempt_id === q.id && b.execution_id === e.id, 'CROSS_LINEAGE');
  expect(s.response_heads[e.id], b.original_id); expect(s.binding_heads[q.id], b.id); expect(s.evaluation_heads[b.id], p.expected_evaluation);
  requireThat(b.kind !== 'MAPPING_UNRESOLVED', 'MAPPING_UNRESOLVED');
  const validationRuleVersion = p.validation_rule_version || VALIDATION_RULE_VERSION_R3;
  requireThat([VALIDATION_RULE_VERSION_R3, VALIDATION_RULE_VERSION_R4].includes(validationRuleVersion), 'VALIDATION_RULE_VERSION_INVALID');
  const errors = validateChoices(p.choices, validationRuleVersion); requireThat(!errors.length, errors.join(','));
  requireThat(['ja', 'en'].includes(p.language), 'UI_LANGUAGE_REQUIRED');
  const id = newId('evaluation'), rid = newId('result'), choice = clone(p.choices), language = p.language;
  const wording = Object.fromEntries(['conclusion', 'confirmed', 'reasons'].map(type => [type,
    Object.fromEntries((type === 'conclusion' ? [choice.conclusion] : choice[type]).map(k => [k, CHOICES[type][k][language === 'en' ? 1 : 0]]))]));
  const ev = { id, result_id: rid, session_id: s.session_id, execution_id: e.id, question_attempt_id: q.id,
    original_id: b.original_id, binding_id: b.id, supersedes_evaluation_id: p.expected_evaluation || null,
    choice_set_version: CHOICE_VERSION, validation_rule_version: validationRuleVersion, choices: choice, displayed_wording: wording, ui_language: language,
    confirmed_note: p.confirmed_note || '', reason_note: p.reason_note || '', created_at: stamp,
    state: ['PARTIAL', 'MAJOR'].includes(choice.conclusion) ? 'DIFFERENT' : choice.conclusion,
    severity: ['PARTIAL', 'MAJOR'].includes(choice.conclusion) ? choice.conclusion : null,
    observation_source: 'HUMAN_SELECTION_NOT_MACHINE_VERIFIED', observed_established: choice.conclusion !== 'NOT_ASSESSED',
    tuning_measurements: [], direct_tuning_targets: [] };
  s.evaluations[id] = ev;
  s.results[rid] = { id: rid, session_id: s.session_id, execution_id: e.id, question_attempt_id: q.id,
    original_id: b.original_id, binding_id: b.id, evaluation_id: id, evaluation_snapshot: clone(ev),
    context: { character: clone(e.source), character_sha256: e.character_sha256, question: clone(q.snapshot), question_sha256: q.question_sha256,
      group: e.group, question_order: [...e.pack.question_ids], preparation: clone(e.preparation), pack_sha256: e.pack_sha256 },
    character_mutation: { state: 'NO_CHANGE_FROM_THIS_VERIFICATION', evidence: 'TRAINER_HAS_NO_CHARACTER_WRITE_OPERATION' }, created_at: stamp };
  s.evaluation_heads[b.id] = id;
  s.view = { stage: p.stay_stage === 2 ? 2 : 3, history_result: null };
  delete s.drafts.evaluations[b.id];
  return { evaluation_id: id, result_id: rid };
}

export async function operate(input, op) {
  await validateGraph(input);
  const s = clone(input), key = intentKey(op.intent), fingerprint = await digest({ type: op.type, payload: op.payload });
  const prior = s.operations[key];
  if (prior) { requireThat(prior.fingerprint === fingerprint, 'INTENT_PAYLOAD_MISMATCH'); return { session: s, result: clone(prior.result), replay: true }; }
  const p = op.payload || {}, ids = {}, stamp = new Date().toISOString();
  if (op.type === 'prepare') {
    expect(s.preparation, p.expected);
    requireThat(['FULL_CHARACTER', 'IDENTITY_PURPOSE', 'EXPRESSION', 'BOUNDARY_HANDOFF', 'CONTINUITY'].includes(p.preparation.scope), 'INVALID_SCOPE');
    requireThat(['FRESH_ONE_BY_ONE', 'CATEGORY_BATCH'].includes(p.preparation.mode), 'INVALID_MODE');
    requireThat(['ja', 'en'].includes(p.preparation.language) && ['generic', 'chatgpt', 'claude', 'gemini', 'local'].includes(p.preparation.platform), 'INVALID_PREPARATION');
    s.preparation = clone(p.preparation); s.view.stage = 1;
    // An old result cannot remain current under different preparation.
    if (!equal(p.expected, p.preparation)) s.selected = { group: null, execution: null, question: null };
  } else if (op.type === 'start' || op.type === 'retest') {
    const { group, pack } = await groupFor(s, p.question_id);
    expect(s.group_heads[group], p.expected_execution);
    if (op.type === 'start' && s.group_heads[group]) {
      const e = s.executions[s.group_heads[group]];
      s.selected = { group, execution: e.id, question: e.question_attempt_ids.find(id => s.questions[id].snapshot.id === p.question_id) };
      ids.execution_id = e.id;
    } else {
      if (op.type === 'retest') {
        const old = record(s.executions, p.retest_of, 'RETEST_SOURCE_MISSING');
        requireThat(old.group === group, 'RETEST_CONDITIONS_CHANGED');
      }
      const eid = newId('execution');
      const execution = { id: eid, session_id: s.session_id, group, preparation: clone(s.preparation), source: clone(s.source),
        character_sha256: await digest(s.source.snapshot), pack: clone(pack.execution_pack), evaluation_pack: clone(pack.evaluation_pack),
        pack_sha256: await digest(pack.execution_pack), status: 'PREPARED', provider_identity: 'UNKNOWN', run_identity: 'UNKNOWN',
        question_attempt_ids: [], retest_of: p.retest_of || null, created_at: stamp };
      for (const qid of pack.execution_pack.question_ids) {
        const q = pack.questions.find(x => x.id === qid), id = newId('question');
        s.questions[id] = { id, session_id: s.session_id, execution_id: eid, snapshot: clone(q), question_sha256: await digest(q) };
        execution.question_attempt_ids.push(id);
      }
      s.executions[eid] = execution; s.group_heads[group] = eid;
      s.selected = { group, execution: eid, question: execution.question_attempt_ids.find(id => s.questions[id].snapshot.id === p.question_id) };
      ids.execution_id = eid;
    }
    s.view = { stage: 2, history_result: null };
  } else if (op.type === 'response' || op.type === 'response-whole-r4') {
    const { e } = context(s, p.execution_id);
    expect(s.response_heads[e.id], p.expected_original);
    requireThat(typeof p.text === 'string' && p.text.trim().length, 'RESPONSE_REQUIRED');
    // UTF-8 must reproduce precisely the submitted JS string (reject lone surrogates).
    requireThat(new TextDecoder().decode(new TextEncoder().encode(p.text)) === p.text, 'RESPONSE_INVALID_UNICODE');
    const id = newId('original');
    s.originals[id] = { id, session_id: s.session_id, execution_id: e.id, text: p.text, sha256: await digest(p.text),
      correction_of: p.expected_original || null, source: 'EXACT_USER_SUBMITTED_RESPONSE', created_at: stamp };
    s.response_heads[e.id] = id;
    for (const q of e.question_attempt_ids) delete s.binding_heads[q];
    delete s.drafts.responses[e.id]; ids.original_id = id;
    if (op.type === 'response-whole-r4') {
      const q = record(s.questions, p.question_attempt_id, 'QUESTION_ATTEMPT_MISSING');
      requireThat(q.execution_id === e.id, 'CROSS_LINEAGE');
      ids.binding_id = await appendBinding(s, { execution_id:e.id, question_attempt_id:q.id, original_id:id,
        expected_binding:null, kind:'WHOLE', human_explicit:true }, stamp);
    }
  } else if (op.type === 'binding') {
    ids.binding_id = await appendBinding(s, p, stamp);
  } else if (op.type === 'evaluate' || op.type === 'evaluate-whole-r4') {
    if (op.type === 'evaluate-whole-r4' && !p.binding_id) {
      const originalId = s.response_heads[p.execution_id];
      ids.binding_id = await appendBinding(s, { execution_id:p.execution_id, question_attempt_id:p.question_attempt_id,
        original_id:originalId, expected_binding:p.expected_binding || null, kind:'WHOLE', human_explicit:true }, stamp);
      p.binding_id = ids.binding_id; p.expected_evaluation = null;
    }
    Object.assign(ids, await appendEvaluation(s, p, stamp));
  } else if (op.type === 'draft') {
    const { e, q } = context(s, p.execution_id, p.question_attempt_id);
    if (p.response !== undefined) { expect(s.response_heads[e.id], p.expected_original); s.drafts.responses[e.id] = p.response; }
    if (p.evaluation !== undefined) {
      const b = record(s.bindings, p.binding_id, 'BINDING_REQUIRED');
      requireThat(q && b.question_attempt_id === q.id, 'CROSS_LINEAGE'); expect(s.binding_heads[q.id], b.id);
      s.drafts.evaluations[b.id] = clone(p.evaluation);
    }
  } else if (op.type === 'view') {
    requireThat([1, 2, 3].includes(p.stage), 'INVALID_STAGE');
    s.view = { stage: p.stage, history_result: p.history_result || null };
    if (p.question_attempt_id) {
      const q = record(s.questions, p.question_attempt_id, 'QUESTION_ATTEMPT_MISSING');
      const e = s.executions[q.execution_id];
      requireThat(e.group === (await groupFor(s, q.snapshot.id)).group, 'PREPARATION_LINEAGE_MISMATCH');
      s.selected = { group: e.group, execution: e.id, question: q.id };
    }
  } else fail('UNKNOWN_OPERATION');
  const result = { status: 'SUCCESS', ...ids, new_heads: clone({ selected: s.selected, response: s.response_heads, binding: s.binding_heads, evaluation: s.evaluation_heads }) };
  s.operations[key] = { namespace: NAMESPACE, session_id: s.session_id, intent: op.intent, type: op.type, fingerprint,
    expected_head: clone(p.expected_original ?? p.expected_binding ?? p.expected_evaluation ?? p.expected_execution ?? null), result };
  s.version++; await validateGraph(s);
  return { session: s, result, replay: false };
}

export async function validateGraph(s) {
  requireThat(s?.schema === NAMESPACE && s.session_id && Number.isInteger(s.version), 'SESSION_INVALID');
  requireThat(s.canonical_mutation === false, 'CHARACTER_MUTATION_PROHIBITED');
  requireThat(validateUnifiedV1(s.source?.snapshot).ok && contentDigest(s.source.snapshot) === s.source.character_digest
    && s.source.snapshot.identity.character_id === s.source.character_id
    && String(s.source.snapshot.identity.character_revision) === s.source.character_revision, 'SESSION_SOURCE_INVALID');
  const tables = ['executions', 'questions', 'originals', 'bindings', 'evaluations', 'results'];
  const allIds = new Set();
  for (const name of tables) for (const [id, item] of Object.entries(s[name])) {
    requireThat(item.id === id && item.session_id === s.session_id && !allIds.has(id), 'RECORD_ID_OR_SESSION_INVALID'); allIds.add(id);
  }
  for (const e of Object.values(s.executions)) {
    requireThat(await digest(e.source.snapshot) === e.character_sha256 && await digest(e.pack) === e.pack_sha256, 'EXECUTION_DIGEST_MISMATCH');
    requireThat(e.source.character_id === s.source.character_id && e.source.character_revision === s.source.character_revision && e.source.character_digest === s.source.character_digest, 'CHARACTER_LINEAGE_MISMATCH');
    requireThat(contentDigest(e.source.snapshot) === e.source.character_digest, 'CHARACTER_DIGEST_MISMATCH');
    requireThat(e.pack.session_id === s.session_id && e.pack.source_character_id === e.source.character_id
      && e.pack.source_character_revision === e.source.character_revision && e.pack.source_character_digest === e.source.character_digest
      && e.pack.test_scope === e.preparation.scope && e.pack.execution_mode === e.preparation.mode
      && e.pack.locale === e.preparation.language && e.pack.runtime_test_context.platform === e.preparation.platform, 'PACK_CONTEXT_MISMATCH');
    requireThat(await digest({ preparation:e.preparation, question_ids:e.pack.question_ids }) === e.group, 'GROUP_DIGEST_MISMATCH');
    requireThat(equal(e.pack.question_ids, e.question_attempt_ids.map(id => record(s.questions, id, 'QUESTION_MISSING').snapshot.id)), 'QUESTION_ORDER_MISMATCH');
    for (const id of e.question_attempt_ids) requireThat(s.questions[id].execution_id === e.id, 'CROSS_LINEAGE');
    if (e.retest_of) requireThat(s.executions[e.retest_of]?.group === e.group, 'RETEST_LINEAGE_INVALID');
  }
  for (const q of Object.values(s.questions)) {
    requireThat(s.executions[q.execution_id]?.question_attempt_ids.includes(q.id), 'QUESTION_LINEAGE_INVALID');
    requireThat(await digest(q.snapshot) === q.question_sha256, 'QUESTION_DIGEST_MISMATCH');
  }
  for (const r of Object.values(s.originals)) {
    context(s, r.execution_id); requireThat(await digest(r.text) === r.sha256, 'ORIGINAL_DIGEST_MISMATCH');
    if (r.correction_of) requireThat(s.originals[r.correction_of]?.execution_id === r.execution_id, 'CORRECTION_LINEAGE_INVALID');
  }
  for (const b of Object.values(s.bindings)) {
    context(s, b.execution_id, b.question_attempt_id);
    const r = record(s.originals, b.original_id, 'ORIGINAL_MISSING');
    requireThat(r.execution_id === b.execution_id && r.sha256 === b.original_sha256 && b.human_explicit === true, 'BINDING_LINEAGE_INVALID');
    requireThat(['WHOLE', 'PARTIAL', 'MAPPING_UNRESOLVED'].includes(b.kind), 'BINDING_KIND_REQUIRED');
    if (b.kind === 'PARTIAL') requireThat(await digest(utf8Range(r.text, b.range?.start, b.range?.end)) === b.range_sha256, 'RANGE_DIGEST_MISMATCH');
    else requireThat(b.range === null && b.range_sha256 === null, 'UNEXPECTED_RANGE');
    if (b.supersedes_binding_id) requireThat(s.bindings[b.supersedes_binding_id]?.question_attempt_id === b.question_attempt_id, 'BINDING_SUPERSESSION_INVALID');
  }
  for (const ev of Object.values(s.evaluations)) {
    const b = record(s.bindings, ev.binding_id, 'BINDING_MISSING');
    requireThat(b.kind !== 'MAPPING_UNRESOLVED' && b.original_id === ev.original_id && b.execution_id === ev.execution_id && b.question_attempt_id === ev.question_attempt_id, 'EVALUATION_LINEAGE_INVALID');
    const validationRuleVersion = ev.validation_rule_version || VALIDATION_RULE_VERSION_R3;
    requireThat(!validateChoices(ev.choices, validationRuleVersion).length && ev.choice_set_version === CHOICE_VERSION
      && [VALIDATION_RULE_VERSION_R3, VALIDATION_RULE_VERSION_R4].includes(validationRuleVersion), 'EVALUATION_CHOICES_INVALID');
    requireThat(['ja','en'].includes(ev.ui_language) && ev.observation_source === 'HUMAN_SELECTION_NOT_MACHINE_VERIFIED'
      && equal(ev.tuning_measurements, []) && equal(ev.direct_tuning_targets, []), 'EVALUATION_PROVENANCE_INVALID');
    requireThat(ev.state === (['PARTIAL','MAJOR'].includes(ev.choices.conclusion) ? 'DIFFERENT' : ev.choices.conclusion)
      && ev.severity === (['PARTIAL','MAJOR'].includes(ev.choices.conclusion) ? ev.choices.conclusion : null), 'EVALUATION_CONCLUSION_MISMATCH');
    requireThat(ev.observed_established === (ev.choices.conclusion !== 'NOT_ASSESSED'), 'OBSERVED_STATE_INVALID');
    requireThat(s.results[ev.result_id]?.evaluation_id === ev.id, 'RESULT_MISSING');
    if (ev.supersedes_evaluation_id) requireThat(s.evaluations[ev.supersedes_evaluation_id]?.binding_id === ev.binding_id, 'EVALUATION_SUPERSESSION_INVALID');
  }
  for (const r of Object.values(s.results)) {
    const ev = record(s.evaluations, r.evaluation_id, 'EVALUATION_MISSING'), e = s.executions[ev.execution_id], q = s.questions[ev.question_attempt_id];
    for (const k of ['session_id', 'execution_id', 'question_attempt_id', 'original_id', 'binding_id']) requireThat(r[k] === ev[k], 'RESULT_CROSS_LINEAGE');
    requireThat(ev.result_id === r.id && equal(r.evaluation_snapshot, ev), 'RESULT_EVALUATION_MISMATCH');
    requireThat(equal(r.context, { character: e.source, character_sha256: e.character_sha256, question: q.snapshot, question_sha256: q.question_sha256,
      group: e.group, question_order: e.pack.question_ids, preparation: e.preparation, pack_sha256: e.pack_sha256 }), 'RESULT_CONTEXT_MISMATCH');
  }
  for (const [table, field] of [['executions', 'retest_of'], ['originals', 'correction_of'], ['bindings', 'supersedes_binding_id'], ['evaluations', 'supersedes_evaluation_id']]) {
    for (const item of Object.values(s[table])) {
      const visited = new Set(); let pointer = item;
      while (pointer) { requireThat(!visited.has(pointer.id), 'CYCLIC_LINEAGE'); visited.add(pointer.id); pointer = pointer[field] ? record(s[table], pointer[field], 'LINEAGE_MISSING') : null; }
    }
  }
  for (const [group, eid] of Object.entries(s.group_heads)) requireThat(s.executions[eid]?.group === group, 'GROUP_HEAD_INVALID');
  for (const [eid, rid] of Object.entries(s.response_heads)) requireThat(s.originals[rid]?.execution_id === eid, 'RESPONSE_HEAD_INVALID');
  for (const [qid, bid] of Object.entries(s.binding_heads)) requireThat(s.bindings[bid]?.question_attempt_id === qid && s.response_heads[s.bindings[bid].execution_id] === s.bindings[bid].original_id, 'BINDING_HEAD_INVALID');
  for (const [bid, eid] of Object.entries(s.evaluation_heads)) requireThat(s.evaluations[eid]?.binding_id === bid, 'EVALUATION_HEAD_INVALID');
  if (s.selected.execution) requireThat(s.executions[s.selected.execution]?.group === s.selected.group && s.questions[s.selected.question]?.execution_id === s.selected.execution, 'SELECTED_LINEAGE_INVALID');
  if (s.view.history_result) record(s.results, s.view.history_result, 'HISTORY_RESULT_MISSING');
  return true;
}

export function legacyReference(session) {
  // Preserve old free text and relation references verbatim. Lack of a recorded
  // response scope never establishes WHOLE or new Human choice vocabulary.
  return { role: 'LEGACY_SOURCE_REFERENCE', scope: 'SCOPE_UNRECORDED', read_only: true,
    source_session_id: session.session_id, snapshot: clone(session) };
}
export async function candidateTrace(s, resultId, evaluationId) {
  await validateGraph(s);
  const r = record(s.results, resultId, 'RESULT_MISSING');
  requireThat(r.evaluation_id === evaluationId, 'CANDIDATE_EVALUATION_MISMATCH');
  return { session_id: s.session_id, result_id: r.id, evaluation_id: evaluationId, execution_id: r.execution_id,
    question_attempt_id: r.question_attempt_id, original_id: r.original_id, binding_id: r.binding_id,
    result_sha256: await digest(r), evaluation_sha256: await digest(s.evaluations[evaluationId]), canonical_mutation: false };
}

export async function openStore(indexedDB = globalThis.indexedDB) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(NAMESPACE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const read = key => new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly'), req = tx.objectStore('records').get(key);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  const write = (id, expectedVersion, value, active = undefined, remove = false) => new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records'); let reason;
    const request = store.get(`session:${id}`);
    request.onsuccess = () => {
      if ((request.result?.version ?? null) !== expectedVersion) { reason = new Error('SESSION_STORAGE_CONFLICT'); tx.abort(); return; }
      if (remove) store.delete(`session:${id}`); else if (value) store.put(value, `session:${id}`);
      if (active !== undefined) store.put(active, 'active');
      if (remove) { const a = store.get('active'); a.onsuccess = () => { if (a.result === id) store.put(null, 'active'); }; }
    };
    tx.oncomplete = () => resolve(value); tx.onabort = tx.onerror = () => reject(reason || tx.error || new Error('SESSION_WRITE_FAILED'));
  });
  return {
    async load(id) { const s = await read(`session:${id}`); if (s) await validateGraph(s); return s; },
    active: () => read('active'),
    async list() {
      return new Promise((resolve, reject) => { const tx = db.transaction('records', 'readonly'), r = tx.objectStore('records').getAll();
        r.onsuccess = () => resolve(r.result.filter(x => x?.schema === NAMESPACE)); r.onerror = () => reject(r.error); });
    },
    async create(character) { const s = await create(character); await write(s.session_id, null, s, s.session_id); return s; },
    async run(id, op) {
      // Read successful intent before evaluating expected heads. A lost response
      // therefore returns the exact IDs on retry, even after later operations.
      const previous = await this.load(id); requireThat(previous, 'SESSION_MISSING');
      const next = await operate(previous, op);
      if (!next.replay) await write(id, previous.version, next.session);
      return next;
    },
    async activate(id) { const s = await this.load(id); requireThat(s, 'SESSION_MISSING'); await write(id, s.version, null, id); return s; },
    async detach(id) { const s = await this.load(id); requireThat(s, 'SESSION_MISSING'); await write(id, s.version, null, null); },
    async delete(id, expectedVersion, confirmed) { requireThat(confirmed === true, 'DELETE_CONFIRMATION_REQUIRED'); await write(id, expectedVersion, null, undefined, true); },
    close() { db.close(); },
  };
}
