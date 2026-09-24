// Trainer UX Revision 4. This layer extends the UX3 evidence aggregate without
// changing its seven logical responsibilities or the Character Canonical.
import {
  NAMESPACE, CHOICES, CHOICE_VERSION, VALIDATION_RULE_VERSION_R4,
  create as createV3, operate as operateV3, validateGraph as validateV3,
  preparationSession, groupFor, current, digest, newId, legacyReference,
} from './trainer-ux3.mjs';
import { createSession as frozenSession, stableStringify } from './trainer-contract.mjs';
import { TUNING_KNOWLEDGE } from '../lib/tuning-projection.mjs';
import { HANDOFF_FORMAT, PROMPT_CONSTRUCTION, TRAINING_MENU_SEPARATOR, platformLaunchText, trainerHandoffText } from './platform-prompt.mjs';

export { NAMESPACE, CHOICES, CHOICE_VERSION, VALIDATION_RULE_VERSION_R4, current, digest, newId, legacyReference };
export { PROMPT_CONSTRUCTION, TRAINING_MENU_SEPARATOR };

export const UX4_CONTRACT = 'saku.trainer.ux4@1';
export const MENU_POOL_VERSION = 'saku.trainer.menu-pool@1';
export const MENU_METHOD_VERSION = 'saku.trainer.menu-order.sha256@1';
export const SUMMARY_VERSION = 'saku.trainer.summary@1';
export const RECOMMENDATION_RULE_VERSION = 'saku.trainer.recommendation.deterministic-first@1';
export const AI_CANDIDATE_VERSION = 'saku.trainer.ai-proposed-adjustment@1';
const clone = value => structuredClone(value);
const same = (a, b) => stableStringify(a) === stableStringify(b);
const requireThat = (condition, code) => { if (!condition) throw new Error(code); };

function baseR4() {
  return {
    contract: UX4_CONTRACT,
    menu_pool_version: MENU_POOL_VERSION,
    generation_method_version: MENU_METHOD_VERSION,
    generation: null,
    generation_history: {},
    active_training: null,
    added_items: {},
    generated_sources: {},
    optional_drafts: {
      generated: { source_response:'', name:'', question:'', expected:'', review_points:'' },
      manual: { name:'', question:'', expected:'', review_points:'' },
    },
    recommendations: {},
    consultations: {},
    summaries: {},
    summary_head: null,
  };
}

export function normalizeR4(session) {
  const s = clone(session);
  s.r4 = { ...baseR4(), ...(s.r4 || {}) };
  s.r4.optional_drafts = { ...baseR4().optional_drafts, ...(s.r4.optional_drafts || {}) };
  s.preparation.source_kind ||= 'POOL';
  return s;
}

export async function create(character, id = newId('session')) {
  return normalizeR4(await createV3(character, id));
}

function localized(value, locale) {
  return value?.[locale] || value?.ja || value?.en || '';
}

function menuItemSnapshot(question) {
  return {
    ...clone(question),
    name: question.name || { ja: question.id, en: question.id },
  };
}

export function availableMenuPool(session, poolOverride = null) {
  if (poolOverride) return poolOverride.map(menuItemSnapshot);
  const p = session.preparation;
  const base = frozenSession(session.source.snapshot, {
    sessionId: session.session_id, testScope: p.scope, mode: p.mode, platform: p.platform,
  });
  return base.questions.map(menuItemSnapshot);
}

export async function deterministicMenuOrder(pool, {
  seed, menuPoolVersion = MENU_POOL_VERSION, methodVersion = MENU_METHOD_VERSION,
} = {}) {
  requireThat(typeof seed === 'string' && seed.length > 0, 'MENU_SEED_REQUIRED');
  const canonical = pool.map(menuItemSnapshot).sort((a,b)=>a.id.localeCompare(b.id));
  const poolDigest = await digest(canonical);
  const keyed = await Promise.all(canonical.map(async item => ({
    item,
    key: await digest({ menu_pool_version:menuPoolVersion, pool_digest:poolDigest,
      generation_method_version:methodVersion, seed, item_id:item.id }),
  })));
  keyed.sort((a,b)=>a.key.localeCompare(b.key)||a.item.id.localeCompare(b.item.id));
  return { pool_digest:poolDigest, ordered:keyed.map(entry=>entry.item) };
}

function currentGenerationItems(s) {
  return s.r4.generation?.item_snapshots || [];
}

function menuItem(s, id) {
  return currentGenerationItems(s).find(item=>item.id===id)
    || s.preparation.custom_questions?.find(item=>item.id===id)
    || preparationSession(s).questions.find(item=>item.id===id)
    || null;
}

export function menuCompletion(session, menuId) {
  const s = normalizeR4(session), training = s.r4.active_training;
  const questionId = training?.question_attempt_by_menu?.[menuId];
  const q = questionId && s.questions[questionId];
  if (!q) return { state:'未', code:'NOT_STARTED' };
  const responseDraft = s.drafts.responses[q.execution_id];
  const original = s.originals[s.response_heads[q.execution_id]];
  if (!original) return { state:'未', code:responseDraft ? 'RESPONSE_DRAFT' : 'NO_ORIGINAL' };
  const binding = s.bindings[s.binding_heads[q.id]];
  if (!binding || binding.original_id !== original.id || binding.kind === 'MAPPING_UNRESOLVED') return { state:'途中', code:'EVALUATION_NEEDED' };
  const evaluation = s.evaluations[s.evaluation_heads[binding.id]];
  const result = evaluation && s.results[evaluation.result_id];
  if (!evaluation || !result || result.evaluation_id !== evaluation.id) return { state:'途中', code:'EVALUATION_NEEDED' };
  if (s.drafts.evaluations[binding.id]) return { state:'済', code:'REVIEW_DRAFT', result_id:result.id, evaluation_id:evaluation.id };
  return { state:'済', code:evaluation.choices.conclusion==='NOT_ASSESSED'?'NOT_ASSESSED':'COMPLETE', result_id:result.id, evaluation_id:evaluation.id };
}

/**
 * What the Trainer gives an external AI, and what it keeps for the record.
 *
 * `character` and `both` are composed exactly as 03 composes its paste text
 * (Owner 2026-09-23): the Trainer measures behaviour, so it has to measure the
 * configuration that ships. Until β.4 it handed over `snapshot` — the raw JSON
 * — which carried neither the shared base layer nor the directive blocks, so
 * its records were not evidence about what ships.
 *
 * `snapshot` stays: a record of what was tested is exactly where that JSON
 * belongs. `handoff` is the options the text is composed with; without a base
 * layer that checks out, `character` and `both` come back empty and the screen
 * hands over nothing (fail closed).
 */
export function copyPayloads(session, menuId, locale = 'ja', handoff = {}) {
  const s = normalizeR4(session), training = s.r4.active_training;
  const qid = training?.question_attempt_by_menu?.[menuId];
  const q = qid && s.questions[qid], execution = q && s.executions[q.execution_id];
  requireThat(q && execution, 'MENU_NOT_IN_ACTIVE_TRAINING');
  const ids = execution.preparation.mode === 'FRESH_ONE_BY_ONE' ? [menuId] : [...execution.pack.question_ids];
  const items = ids.map(id=>{
    const item = execution.question_attempt_ids.map(x=>s.questions[x]).find(x=>x.snapshot.id===id)?.snapshot;
    requireThat(item, 'MENU_ITEM_SNAPSHOT_MISSING');
    return { id:item.id, name:localized(item.name,locale)||item.id, question:localized(item.prompt,locale) };
  });
  const snapshot = stableStringify(execution.source.snapshot);
  const menu = items.map((item,index)=>`${index+1}. ${item.name} [${item.id}]\n${item.question}`).join('\n\n');
  const character = platformLaunchText(execution.source.snapshot, HANDOFF_FORMAT, handoff);
  const both = trainerHandoffText(execution.source.snapshot, { ...handoff, menu });
  return { character, menu, both, snapshot, separator:TRAINING_MENU_SEPARATOR, menu_item_ids:ids };
}

/**
 * Mark the executions this operation created with the construction their prompt
 * was composed under (Owner 2026-09-23, decision 3). Nothing already stored is
 * rewritten and nothing is removed: records made before the Trainer changed
 * carry no mark, and `promptConstructionOf` reads them for what they were.
 */
function stampHandoff(session, existingIds, handoff) {
  if (!handoff || !session?.executions) return session;
  for (const [id, execution] of Object.entries(session.executions)) {
    if (existingIds.has(id) || execution.handoff) continue;
    execution.handoff = clone(handoff);
  }
  return session;
}

/**
 * Which construction an execution was measured under. An unmarked execution is
 * one from before the change, and what it handed over then was the Character
 * snapshot itself — so the digest already in the record is the digest of the
 * text that went to the AI. Nothing is guessed and nothing is rewritten.
 */
export function promptConstructionOf(execution) {
  const stamped = execution?.handoff;
  if (stamped?.construction) return { ...clone(stamped), stamped:true };
  return { construction:PROMPT_CONSTRUCTION.rawSnapshot, prompt_sha256:execution?.character_sha256 || null, base_layer:null, glossary_sha256:null, stamped:false };
}

export function conflictingRecommendations(recommendations = []) {
  const groups = new Map();
  for (const recommendation of recommendations.filter(item=>item?.target&&item?.direction_or_value)) {
    if (!groups.has(recommendation.target)) groups.set(recommendation.target, []);
    groups.get(recommendation.target).push(clone(recommendation));
  }
  return [...groups.entries()].filter(([,items])=>new Set(items.map(item=>stableStringify(item.direction_or_value))).size>1)
    .map(([target,alternatives])=>({target,alternatives,winner:null,state:'UNRESOLVED_CONFLICT'}));
}

async function deterministicRecommendation(s, result) {
  const evaluation = s.evaluations[result.evaluation_id];
  return {
    version: RECOMMENDATION_RULE_VERSION,
    method: 'DETERMINISTIC_FIRST',
    state: 'INSUFFICIENT_BASIS',
    target: null,
    direction_or_value: null,
    reason: 'GENERIC_HUMAN_CHOICES_DO_NOT_ESTABLISH_T01_T20_MEASUREMENTS',
    expected_effect: null,
    side_effects_or_cautions: ['Human review is required; no Character change is applied.'],
    review_state: 'HUMAN_REVIEW_REQUIRED',
    result_id: result.id,
    evaluation_id: evaluation.id,
    character_revision: result.context.character.character_revision,
    character_digest: result.context.character.character_digest,
    knowledge_version: TUNING_KNOWLEDGE.version,
    knowledge_digest: await digest(TUNING_KNOWLEDGE),
    translation_contract: 'tooling/builder/lib/tuning-projection.mjs#translate',
    tuning_measurements: [],
    character_mutation: false,
  };
}

async function createExecution(s, groupInfo, stamp, retestOf = null, handoff = null) {
  const eid = newId('execution'), pack = groupInfo.pack;
  const execution = {
    id:eid, session_id:s.session_id, group:groupInfo.group, preparation:clone(s.preparation), source:clone(s.source),
    character_sha256:await digest(s.source.snapshot), pack:clone(pack.execution_pack), evaluation_pack:clone(pack.evaluation_pack),
    pack_sha256:await digest(pack.execution_pack), status:'PREPARED', provider_identity:'UNKNOWN', run_identity:'UNKNOWN',
    question_attempt_ids:[], retest_of:retestOf, created_at:stamp, ...(handoff ? { handoff:clone(handoff) } : {}),
  };
  for (const menuId of pack.execution_pack.question_ids) {
    const snapshot = pack.questions.find(item=>item.id===menuId);
    requireThat(snapshot, 'MENU_ITEM_SNAPSHOT_MISSING');
    const id = newId('question');
    s.questions[id] = { id, session_id:s.session_id, execution_id:eid, snapshot:clone(snapshot), question_sha256:await digest(snapshot) };
    execution.question_attempt_ids.push(id);
  }
  s.executions[eid]=execution;
  s.group_heads[groupInfo.group]=eid;
  return execution;
}

function operationKey(intent) {
  requireThat(typeof intent==='string' && intent.length>0 && intent.length<200, 'INTENT_REQUIRED');
  return `intent:${intent}`;
}

async function customOperation(input, op) {
  const s=normalizeR4(input), key=operationKey(op.intent), fingerprint=await digest({type:op.type,payload:op.payload});
  const prior=s.operations[key];
  if(prior){requireThat(prior.fingerprint===fingerprint,'INTENT_PAYLOAD_MISMATCH');return{session:s,result:clone(prior.result),replay:true};}
  const p=op.payload||{}, ids={}, stamp=new Date().toISOString();
  if(op.type==='menu-generate'){
    requireThat((s.r4.generation?.generation_id||null)===(p.expected_generation||null),'STALE_EXPECTED_HEAD');
    const pool=availableMenuPool(s,p.pool_override||null);
    const order=await deterministicMenuOrder(pool,{seed:p.seed});
    const selected=order.ordered.slice(0,30), displayed=selected.length<30?selected:selected.slice(0,10);
    const generationId=newId('generation');
    if(s.r4.generation)s.r4.generation_history[s.r4.generation.generation_id]=clone(s.r4.generation);
    s.r4.generation={generation_id:generationId,menu_pool_version:MENU_POOL_VERSION,pool_digest:order.pool_digest,
      generation_method_version:MENU_METHOD_VERSION,seed:p.seed,source_kind:'POOL',source_training:null,
      selected_item_ids:selected.map(x=>x.id),displayed_item_ids:displayed.map(x=>x.id),current_selected_item_ids:selected.map(x=>x.id),item_snapshots:clone(selected),created_at:stamp};
    s.preparation.question_ids=[...s.r4.generation.current_selected_item_ids];s.preparation.source_kind='POOL';s.view={stage:1,history_result:null};
    s.selected={group:null,execution:null,question:null};ids.generation_id=generationId;
  }else if(op.type==='menu-more'){
    const g=s.r4.generation;requireThat(g&&g.generation_id===p.expected_generation,'STALE_EXPECTED_HEAD');
    const count=Math.min(g.selected_item_ids.length,g.displayed_item_ids.length+10);
    g.displayed_item_ids=g.selected_item_ids.slice(0,count);
  }else if(op.type==='menu-selection'){
    const g=s.r4.generation;requireThat(g&&g.generation_id===p.expected_generation,'STALE_EXPECTED_HEAD');
    requireThat(Array.isArray(p.item_ids)&&new Set(p.item_ids).size===p.item_ids.length&&p.item_ids.every(id=>g.selected_item_ids.includes(id)),'MENU_SELECTION_INVALID');
    g.current_selected_item_ids=[...g.selected_item_ids.filter(id=>p.item_ids.includes(id))];
    s.preparation.question_ids=[...g.current_selected_item_ids];s.selected={group:null,execution:null,question:null};
  }else if(op.type==='menu-clear'){
    const g=s.r4.generation;requireThat((g?.generation_id||null)===(p.expected_generation||null),'STALE_EXPECTED_HEAD');
    if(g)s.r4.generation_history[g.generation_id]=clone(g);
    s.r4.generation=null;s.preparation.question_ids=[];s.selected={group:null,execution:null,question:null};s.view={stage:1,history_result:null};
  }else if(op.type==='reuse-menu'){
    requireThat(p.source_session_id&&p.source_generation_id&&Array.isArray(p.item_snapshots)&&p.item_snapshots.length,'SAVED_TRAINING_SOURCE_INVALID');
    requireThat(await digest(p.item_snapshots)===p.item_snapshot_digest,'SAVED_TRAINING_SOURCE_DIGEST_MISMATCH');
    const generationId=newId('generation');
    if(s.r4.generation)s.r4.generation_history[s.r4.generation.generation_id]=clone(s.r4.generation);
    s.r4.generation={generation_id:generationId,menu_pool_version:p.menu_pool_version||'LEGACY_UNRECORDED',pool_digest:p.pool_digest||p.item_snapshot_digest,
      generation_method_version:'SAVED_TRAINING_REUSE',seed:null,source_kind:'SAVED_TRAINING',source_training:{session_id:p.source_session_id,generation_id:p.source_generation_id,
        character_id:p.source_character_id,character_revision:p.source_character_revision,item_snapshot_digest:p.item_snapshot_digest},
      selected_item_ids:p.item_snapshots.map(x=>x.id),displayed_item_ids:p.item_snapshots.length<30?p.item_snapshots.map(x=>x.id):p.item_snapshots.slice(0,10).map(x=>x.id),
      current_selected_item_ids:p.item_snapshots.map(x=>x.id),item_snapshots:clone(p.item_snapshots),created_at:stamp};
    s.preparation.question_ids=[...s.r4.generation.current_selected_item_ids];s.preparation.scope=p.actual_scope;s.preparation.source_kind='SAVED_TRAINING';
    s.selected={group:null,execution:null,question:null};s.view={stage:1,history_result:null};ids.generation_id=generationId;
  }else if(op.type==='optional-drafts'){
    requireThat(['generated','manual'].includes(p.kind),'OPTIONAL_DRAFT_KIND_INVALID');
    s.r4.optional_drafts[p.kind]={...s.r4.optional_drafts[p.kind],...clone(p.draft)};
  }else if(op.type==='add-menu-item'){
    requireThat(['GENERATED_HUMAN_CONFIRMED','MANUAL_HUMAN_AUTHORED'].includes(p.provenance),'MENU_PROVENANCE_INVALID');
    for(const field of ['name','question','expected','review_points'])requireThat(typeof p[field]==='string'&&p[field].trim(),'MENU_ITEM_INCOMPLETE');
    if(p.provenance==='GENERATED_HUMAN_CONFIRMED')requireThat(typeof p.source_response==='string'&&p.source_response.trim(),'GENERATED_SOURCE_REQUIRED');
    const id=newId(p.provenance.startsWith('GENERATED')?'GENERATED':'MANUAL'), locale=p.language;
    const item={id,name:{[locale]:p.name},prompt:{[locale]:p.question},expected:{[locale]:p.expected},rubric:{[locale]:p.review_points},
      category:s.preparation.scope,evaluation_definition_state:'DEFINED',provenance:{kind:p.provenance,human_confirmed:true,created_at:stamp}};
    s.preparation.custom_questions.push(clone(item));s.r4.added_items[id]=clone(item);
    if(p.provenance==='GENERATED_HUMAN_CONFIRMED'){
      const sourceId=newId('generated-source');s.r4.generated_sources[sourceId]={id:sourceId,response:p.source_response,sha256:await digest(p.source_response),created_at:stamp};
      item.provenance.source_id=sourceId;s.r4.added_items[id]=clone(item);s.preparation.custom_questions[s.preparation.custom_questions.length-1]=clone(item);
    }
    if(!s.r4.generation){s.r4.generation={generation_id:newId('generation'),menu_pool_version:MENU_POOL_VERSION,pool_digest:await digest([]),generation_method_version:'OPTIONAL_ITEM_ONLY',seed:null,source_kind:'OPTIONAL',source_training:null,selected_item_ids:[],displayed_item_ids:[],current_selected_item_ids:[],item_snapshots:[],created_at:stamp};}
    const g=s.r4.generation;g.selected_item_ids.push(id);g.displayed_item_ids.push(id);g.current_selected_item_ids.push(id);g.item_snapshots.push(clone(item));s.preparation.question_ids.push(id);
    s.r4.optional_drafts[p.provenance.startsWith('GENERATED')?'generated':'manual']={...baseR4().optional_drafts[p.provenance.startsWith('GENERATED')?'generated':'manual']};ids.menu_item_id=id;
  }else if(op.type==='start-training'){
    const idsInOrder=s.r4.generation?.current_selected_item_ids||[];requireThat(idsInOrder.length,'MENU_REQUIRED');
    requireThat(s.source?.character_id&&s.preparation.platform&&s.preparation.language&&s.preparation.mode&&s.preparation.scope,'PREPARATION_INCOMPLETE');
    const preparationSha=await digest({preparation:s.preparation,generation_id:s.r4.generation.generation_id,item_ids:idsInOrder});
    if(s.r4.active_training?.preparation_sha256===preparationSha){
      const first=s.r4.active_training.question_attempt_by_menu[idsInOrder[0]],q=s.questions[first],e=s.executions[q.execution_id];
      s.selected={group:e.group,execution:e.id,question:q.id};ids.training_id=s.r4.active_training.training_id;
    }else{
      const byGroup=new Map(), questionByMenu={}, executionIds=[];
      for(const menuId of idsInOrder){const info=await groupFor(s,menuId);if(!byGroup.has(info.group)){const execution=await createExecution(s,info,stamp,null,p.handoff||null);byGroup.set(info.group,execution);executionIds.push(execution.id);}const e=byGroup.get(info.group);questionByMenu[menuId]=e.question_attempt_ids.find(id=>s.questions[id].snapshot.id===menuId);}
      const trainingId=newId('training');s.r4.active_training={training_id:trainingId,generation_id:s.r4.generation.generation_id,preparation_sha256:preparationSha,
        menu_item_ids:[...idsInOrder],question_attempt_by_menu:questionByMenu,execution_ids:executionIds,created_at:stamp};
      const q=s.questions[questionByMenu[idsInOrder[0]]],e=s.executions[q.execution_id];s.selected={group:e.group,execution:e.id,question:q.id};ids.training_id=trainingId;
    }
    s.view={stage:2,history_result:null};
  }else if(op.type==='select-menu'){
    const qid=s.r4.active_training?.question_attempt_by_menu?.[p.menu_item_id],q=qid&&s.questions[qid],e=q&&s.executions[q.execution_id];
    requireThat(q&&e,'MENU_NOT_IN_ACTIVE_TRAINING');s.selected={group:e.group,execution:e.id,question:q.id};s.view={stage:2,history_result:null};
  }else if(op.type==='finish-training'){
    const training=s.r4.active_training;requireThat(training,'TRAINING_NOT_STARTED');
    const rows=training.menu_item_ids.map(menuId=>{const state=menuCompletion(s,menuId);return{menu_id:menuId,status:state.state,status_code:state.code,result_id:state.result_id||null,evaluation_id:state.evaluation_id||null};});
    const summaryId=newId('summary'), resultIds=rows.map(x=>x.result_id).filter(Boolean), evaluationIds=rows.map(x=>x.evaluation_id).filter(Boolean);
    const supportingRecommendations=resultIds.map(id=>s.r4.recommendations[id]).filter(Boolean);
    const candidateRecords=Object.values(s.r4.consultations).filter(x=>resultIds.includes(x.result_id));
    const candidateRefs=candidateRecords.map(x=>x.id);
    const conflicts=conflictingRecommendations([...supportingRecommendations,...candidateRecords.map(item=>({target:item.proposal.target,direction_or_value:item.proposal.direction_or_value,result_id:item.result_id,evaluation_id:item.evaluation_id,candidate_id:item.id}))]);
    const summary={id:summaryId,version:SUMMARY_VERSION,session_id:s.session_id,training_id:training.training_id,generation_id:training.generation_id,
      menu_item_ids:[...training.menu_item_ids],rows,result_ids:resultIds,evaluation_ids:evaluationIds,recommendation_rule_version:RECOMMENDATION_RULE_VERSION,
      knowledge_version:TUNING_KNOWLEDGE.version,recommendation_result_refs:supportingRecommendations.map(item=>item.result_id),ai_candidate_refs:candidateRefs,limited_scope:true,conflicts,created_at:stamp};
    summary.sha256=await digest(summary);s.r4.summaries[summaryId]=summary;s.r4.summary_head=summaryId;s.view={stage:3,history_result:null,summary_id:summaryId};ids.summary_id=summaryId;
  }else if(op.type==='view-summary-menu'){
    const summary=s.r4.summaries[p.summary_id];requireThat(summary&&summary.menu_item_ids.includes(p.menu_item_id),'SUMMARY_MENU_REFERENCE_INVALID');
    const qid=s.r4.active_training?.question_attempt_by_menu?.[p.menu_item_id],q=qid&&s.questions[qid],e=q&&s.executions[q.execution_id];requireThat(q&&e,'MENU_NOT_IN_ACTIVE_TRAINING');
    s.selected={group:e.group,execution:e.id,question:q.id};s.view={stage:2,history_result:null,from_summary:p.summary_id};
  }else if(op.type==='ai-candidate'){
    const result=s.results[p.result_id],evaluation=s.evaluations[p.evaluation_id];requireThat(result&&evaluation&&result.evaluation_id===evaluation.id,'CANDIDATE_EVALUATION_MISMATCH');
    requireThat(typeof p.source_response==='string'&&p.source_response.trim(),'AI_CONSULTATION_RESPONSE_REQUIRED');
    const id=newId('ai-candidate'),sourceId=newId('consultation-response'),item=s.questions[result.question_attempt_id].snapshot;
    const source={id:sourceId,text:p.source_response,sha256:await digest(p.source_response),created_at:stamp};
    const candidate={id,version:AI_CANDIDATE_VERSION,source_response_id:sourceId,result_id:result.id,evaluation_id:evaluation.id,question_attempt_id:result.question_attempt_id,
      menu_snapshot:clone(item),character_revision:result.context.character.character_revision,character_digest:result.context.character.character_digest,
      translation_rule_version:'tooling/builder/lib/tuning-projection.mjs#translate',knowledge_version:TUNING_KNOWLEDGE.version,knowledge_digest:await digest(TUNING_KNOWLEDGE),
      proposal:clone(p.proposal||{}),review_state:'HUMAN_REVIEW_REQUIRED',canonical_mutation:false,created_at:stamp};
    s.r4.consultations[id]={...candidate,source_response:source};ids.candidate_id=id;
  }else throw new Error('UNKNOWN_OPERATION');
  const result={status:'SUCCESS',...ids,new_heads:{selected:clone(s.selected),generation:s.r4.generation?.generation_id||null,summary:s.r4.summary_head}};
  s.operations[key]={namespace:NAMESPACE,session_id:s.session_id,intent:op.intent,type:op.type,fingerprint,result:clone(result)};
  s.version++;await validateGraph(s);return{session:s,result,replay:false};
}

const CUSTOM_OPERATIONS=new Set(['menu-generate','menu-more','menu-selection','menu-clear','reuse-menu','optional-drafts','add-menu-item','start-training','select-menu','finish-training','view-summary-menu','ai-candidate']);

export async function operate(input, op) {
  const s=normalizeR4(input);
  // Executions the operation is about to create are the ones that get the mark;
  // everything already in the session keeps whatever it has (or has none).
  const existingIds=new Set(Object.keys(s.executions||{}));
  if(CUSTOM_OPERATIONS.has(op.type)){const outcome=await customOperation(s,op);stampHandoff(outcome.session,existingIds,op.payload?.handoff);return outcome;}
  const payload=clone(op.payload||{});
  if(op.type==='evaluate'||op.type==='evaluate-whole-r4'){
    payload.validation_rule_version=VALIDATION_RULE_VERSION_R4;payload.stay_stage=2;
  }
  const outcome=await operateV3(s,{...op,payload});
  const next=normalizeR4(outcome.session);
  if((op.type==='evaluate'||op.type==='evaluate-whole-r4')&&!outcome.replay){
    const result=next.results[outcome.result.result_id];next.r4.recommendations[result.id]=await deterministicRecommendation(next,result);next.view={stage:2,history_result:null};
  }
  if(op.type==='retest'&&!outcome.replay&&next.r4.active_training){
    const e=next.executions[outcome.result.execution_id];next.r4.active_training.execution_ids=[...next.r4.active_training.execution_ids.filter(id=>next.executions[id]?.group!==e.group),e.id];
    for(const qid of e.question_attempt_ids)next.r4.active_training.question_attempt_by_menu[next.questions[qid].snapshot.id]=qid;
  }
  stampHandoff(next,existingIds,op.payload?.handoff);
  await validateGraph(next);return{...outcome,session:next};
}

export async function validateGraph(input) {
  const s=normalizeR4(input);await validateV3(s);requireThat(s.r4.contract===UX4_CONTRACT,'UX4_CONTRACT_INVALID');
  const g=s.r4.generation;
  if(g){requireThat(new Set(g.selected_item_ids).size===g.selected_item_ids.length,'MENU_DUPLICATE');requireThat(g.displayed_item_ids.every(id=>g.selected_item_ids.includes(id)),'MENU_DISPLAY_INVALID');
    requireThat(g.current_selected_item_ids.every(id=>g.selected_item_ids.includes(id)),'MENU_CURRENT_SELECTION_INVALID');requireThat(g.item_snapshots.map(x=>x.id).every(id=>g.selected_item_ids.includes(id)),'MENU_SNAPSHOT_INVALID');}
  for(const [resultId,recommendation] of Object.entries(s.r4.recommendations)){requireThat(s.results[resultId]&&recommendation.result_id===resultId&&recommendation.evaluation_id===s.results[resultId].evaluation_id,'RECOMMENDATION_TRACE_INVALID');requireThat(recommendation.character_mutation===false&&same(recommendation.tuning_measurements,[]),'FAKE_TUNING_MEASUREMENT');}
  for(const candidate of Object.values(s.r4.consultations)){requireThat(s.results[candidate.result_id]?.evaluation_id===candidate.evaluation_id&&candidate.canonical_mutation===false,'AI_CANDIDATE_TRACE_INVALID');requireThat(await digest(candidate.source_response.text)===candidate.source_response.sha256,'AI_SOURCE_DIGEST_INVALID');}
  for(const summary of Object.values(s.r4.summaries)){requireThat(summary.session_id===s.session_id&&summary.result_ids.every(id=>s.results[id])&&summary.evaluation_ids.every(id=>s.evaluations[id]),'SUMMARY_TRACE_INVALID');const value=clone(summary);delete value.sha256;requireThat(await digest(value)===summary.sha256,'SUMMARY_DIGEST_INVALID');}
  return true;
}

export async function savedMenuSource(session) {
  const s=normalizeR4(session),g=s.r4.generation;
  requireThat(g&&g.current_selected_item_ids.length,'SAVED_TRAINING_MENU_MISSING');
  const snapshots=g.current_selected_item_ids.map(id=>menuItem(s,id));requireThat(snapshots.every(Boolean),'SAVED_TRAINING_ITEM_MISSING');
  return {source_session_id:s.session_id,source_generation_id:g.generation_id,source_character_id:s.source.character_id,source_character_revision:s.source.character_revision,
    actual_scope:s.preparation.scope,menu_pool_version:g.menu_pool_version,pool_digest:g.pool_digest,item_snapshots:clone(snapshots),item_snapshot_digest:await digest(snapshots)};
}

export async function openStore(indexedDB=globalThis.indexedDB){
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(NAMESPACE,1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const read=key=>new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),req=tx.objectStore('records').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const write=(id,expectedVersion,value,active=undefined,remove=false)=>new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let reason;const request=store.get(`session:${id}`);request.onsuccess=()=>{if((request.result?.version??null)!==expectedVersion){reason=new Error('SESSION_STORAGE_CONFLICT');tx.abort();return;}if(remove)store.delete(`session:${id}`);else if(value)store.put(value,`session:${id}`);if(active!==undefined)store.put(active,'active');if(remove){const a=store.get('active');a.onsuccess=()=>{if(a.result===id)store.put(null,'active');};}};tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(reason||tx.error||new Error('SESSION_WRITE_FAILED'));});
  return {
    async load(id){const raw=await read(`session:${id}`);if(!raw)return raw;const s=normalizeR4(raw);await validateGraph(s);return s;},
    active:()=>read('active'),
    async list(){return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),r=tx.objectStore('records').getAll();r.onsuccess=async()=>{try{const out=[];for(const raw of r.result.filter(x=>x?.schema===NAMESPACE)){const s=normalizeR4(raw);await validateGraph(s);out.push(s);}resolve(out);}catch(e){reject(e);}};r.onerror=()=>reject(r.error);});},
    async create(character){const s=await create(character);await write(s.session_id,null,s,s.session_id);return s;},
    async run(id,op){const raw=await read(`session:${id}`);requireThat(raw,'SESSION_MISSING');const previous=normalizeR4(raw),next=await operate(previous,op);if(!next.replay)await write(id,raw.version,next.session);return next;},
    async activate(id){const raw=await read(`session:${id}`);requireThat(raw,'SESSION_MISSING');const s=normalizeR4(raw);await validateGraph(s);await write(id,raw.version,null,id);return s;},
    async detach(id){const raw=await read(`session:${id}`);requireThat(raw,'SESSION_MISSING');await write(id,raw.version,null,null);},
    async delete(id,expectedVersion,confirmed){requireThat(confirmed===true,'DELETE_CONFIRMATION_REQUIRED');await write(id,expectedVersion,null,undefined,true);},
    close(){db.close();},
  };
}
