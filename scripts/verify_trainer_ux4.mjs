import assert from 'node:assert/strict';
import {
  UX4_CONTRACT, MENU_POOL_VERSION, MENU_METHOD_VERSION, SUMMARY_VERSION,
  VALIDATION_RULE_VERSION_R4, create, operate, validateGraph, availableMenuPool,
  deterministicMenuOrder, menuCompletion, copyPayloads, savedMenuSource, digest,
  conflictingRecommendations,
} from '../tools/v1/trainer-ux4.mjs';
import { operate as operateV3 } from '../tools/v1/trainer-ux3.mjs';
import { PROMPT_CONSTRUCTION, promptConstructionOf } from '../tools/v1/trainer-ux4.mjs';
import * as P from '../tools/unified-v1/platform-prompt.mjs';
import { testCharacter } from './fixtures/trainer-ux3-character.mjs';

let passed=0,intent=0;
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);passed++;};
const ok=(value,label)=>{assert.ok(value,label);passed++;};
const run=async(session,type,payload={})=>(await operate(session,{intent:`r4-${++intent}`,type,payload})).session;
const rejects=async(fn,code,label)=>{await assert.rejects(fn,error=>String(error.message).includes(code),label);passed++;};

const character=testCharacter();
let session=await create(character,'r4-primary');
check(session.r4.contract,UX4_CONTRACT,'R4 contract is explicit');
check(session.canonical_mutation,false,'R4 cannot mutate Character');
check(Object.keys(character).includes('menu_generation_seed'),false,'no new Character Canonical field');

const expectedCounts={FULL_CHARACTER:9,IDENTITY_PURPOSE:3,EXPRESSION:3,BOUNDARY_HANDOFF:3,CONTINUITY:5};
for(const [scope,count] of Object.entries(expectedCounts)){const candidate=await create(character,`pool-${scope}`);candidate.preparation.scope=scope;check(availableMenuPool(candidate).length,count,`current pool count ${scope}`);}
check(availableMenuPool(session).every(item=>item.name&&item.prompt&&item.expected&&item.rubric),true,'every built-in menu item has four display parts');

const synthetic=Array.from({length:35},(_,index)=>({id:`SYN-${String(index+1).padStart(2,'0')}`,name:{ja:`項目${index+1}`,en:`Item ${index+1}`},prompt:{ja:`質問${index+1}`,en:`Question ${index+1}`},expected:{ja:'期待',en:'Expected'},rubric:{ja:'見る',en:'Review'},category:'FULL_CHARACTER',evaluation_definition_state:'DEFINED'}));
const orderedA=await deterministicMenuOrder(synthetic,{seed:'fixed-seed'}),orderedB=await deterministicMenuOrder([...synthetic].reverse(),{seed:'fixed-seed'});
check(orderedA.pool_digest,orderedB.pool_digest,'pool digest is input-order independent');
check(orderedA.ordered.map(x=>x.id),orderedB.ordered.map(x=>x.id),'same version/digest/seed/method reproduces order');
check(new Set(orderedA.ordered.map(x=>x.id)).size,35,'deterministic order contains no duplicate');
session=await run(session,'menu-generate',{expected_generation:null,seed:'fixed-seed',pool_override:synthetic});
check(session.r4.generation.menu_pool_version,MENU_POOL_VERSION,'menu pool version persisted');
check(session.r4.generation.generation_method_version,MENU_METHOD_VERSION,'generation method version persisted');
check(session.r4.generation.selected_item_ids.length,30,'>=30 selects exactly 30');
check(session.r4.generation.displayed_item_ids.length,10,'first menu page is 10');
session=await run(session,'menu-more',{expected_generation:session.r4.generation.generation_id});
check(session.r4.generation.displayed_item_ids.length,20,'first Show more exposes next unseen 10');
session=await run(session,'menu-more',{expected_generation:session.r4.generation.generation_id});
check(session.r4.generation.displayed_item_ids.length,30,'second Show more exposes remaining 10');
check(new Set(session.r4.generation.displayed_item_ids).size,30,'10+10+10 remains unique');
const firstGeneration=session.r4.generation.generation_id,firstOrder=[...session.r4.generation.selected_item_ids];
session=await run(session,'menu-generate',{expected_generation:firstGeneration,seed:'fixed-seed',pool_override:synthetic});
ok(session.r4.generation.generation_id!==firstGeneration,'explicit regenerate creates a new generation identity');
check(session.r4.generation.selected_item_ids,firstOrder,'explicit regenerate with same inputs reproduces order');
check(session.r4.generation_history[firstGeneration].selected_item_ids,firstOrder,'old generated snapshot remains immutable history');

let small=await create(character,'r4-small');
small=await run(small,'menu-generate',{expected_generation:null,seed:'small'});
check(small.r4.generation.selected_item_ids.length,9,'<30 shows every authored item without fabrication');
check(small.r4.generation.displayed_item_ids.length,9,'<30 displays all immediately');
check(small.r4.generation.item_snapshots.every(item=>!item.id.startsWith('SYN-')),true,'missing items are not manufactured');
let empty=await create(character,'r4-empty');
empty=await run(empty,'menu-generate',{expected_generation:null,seed:'empty',pool_override:[]});
check(empty.r4.generation.selected_item_ids.length,0,'zero pool is represented exactly');

small=await run(small,'optional-drafts',{kind:'generated',draft:{source_response:'unfinished candidate'}});
const historyBefore=Object.keys(small.executions).length;
const smallGeneration=small.r4.generation.generation_id;
small=await run(small,'menu-clear',{expected_generation:smallGeneration});
check(small.r4.generation,null,'menu clear detaches working generation');
check(small.r4.optional_drafts.generated.source_response,'unfinished candidate','menu clear preserves optional draft');
check(Object.keys(small.executions).length,historyBefore,'menu clear does not delete execution history');
ok(small.r4.generation_history[smallGeneration],'menu clear preserves generation history');

await rejects(()=>run(empty,'add-menu-item',{language:'ja',provenance:'MANUAL_HUMAN_AUTHORED',name:'未完成',question:'',expected:'期待',review_points:'見る'}),'MENU_ITEM_INCOMPLETE','incomplete manual item is not selectable');
empty=await run(empty,'optional-drafts',{kind:'generated',draft:{source_response:'unfinished'}});
empty=await run(empty,'add-menu-item',{language:'ja',provenance:'MANUAL_HUMAN_AUTHORED',name:'手動項目',question:'質問',expected:'期待',review_points:'見る'});
check(empty.r4.generation.current_selected_item_ids.length,1,'valid manual item can satisfy menu requirement');
check(empty.r4.optional_drafts.generated.source_response,'unfinished','incomplete generated draft does not block valid manual item');
empty=await run(empty,'add-menu-item',{language:'ja',provenance:'GENERATED_HUMAN_CONFIRMED',source_response:'AI candidate source',name:'生成項目',question:'生成質問',expected:'生成期待',review_points:'生成見る'});
check(empty.r4.generation.current_selected_item_ids.length,2,'Human-confirmed generated item becomes selectable');
const generatedId=empty.r4.generation.current_selected_item_ids[1];
check(empty.r4.added_items[generatedId].provenance.kind,'GENERATED_HUMAN_CONFIRMED','generated provenance stays distinct');
ok(Object.values(empty.r4.generated_sources).some(source=>source.response==='AI candidate source'),'generated source answer is preserved');

const sourcePayload=await savedMenuSource(empty);
let reused=await create(character,'r4-reused');
reused=await run(reused,'reuse-menu',sourcePayload);
check(reused.r4.generation.current_selected_item_ids,empty.r4.generation.current_selected_item_ids,'saved menu exact order is reused');
check(Object.keys(reused.originals).length,0,'saved response is not reused');
check(Object.keys(reused.evaluations).length,0,'saved evaluation is not reused');
check(Object.keys(reused.results).length,0,'saved result/completion is not reused');
check(reused.r4.generation.source_training.session_id,empty.session_id,'saved source exact Session is pinned');
check(reused.source.character_id,character.identity.character_id,'saved-menu reuse does not auto-switch Character');

let flow=await create(character,'r4-flow');
flow.preparation.mode='CATEGORY_BATCH';
flow=await run(flow,'menu-generate',{expected_generation:null,seed:'flow'});
const wanted=flow.r4.generation.selected_item_ids.filter(id=>['PB-SAFETY','PB-HANDOFF'].includes(id));
flow=await run(flow,'menu-selection',{expected_generation:flow.r4.generation.generation_id,item_ids:wanted});
flow=await run(flow,'start-training',{});
check(flow.r4.active_training.menu_item_ids,wanted,'Stage 02 keeps all selected menu items/order');
const qa=flow.questions[flow.r4.active_training.question_attempt_by_menu['PB-SAFETY']],qb=flow.questions[flow.r4.active_training.question_attempt_by_menu['PB-HANDOFF']];
check(qa.execution_id,qb.execution_id,'same category batch shares one execution');
check(menuCompletion(flow,'PB-SAFETY').state,'未','no saved Original means 未');
const selectedBefore=Object.keys(flow.bindings).length;
flow=await run(flow,'select-menu',{menu_item_id:'PB-HANDOFF'});
check(Object.keys(flow.bindings).length,selectedBefore,'radio selection alone creates no Binding/evidence');
flow=await run(flow,'select-menu',{menu_item_id:'PB-SAFETY'});
const payloads=copyPayloads(flow,'PB-SAFETY','ja');
check(payloads.menu_item_ids,wanted,'BATCH copy uses exact ordered execution group only');
ok(payloads.character.includes('ux3-test'),'Character-only copy uses execution-fixed Character');
ok(payloads.menu.includes('PB-SAFETY')&&payloads.menu.includes('PB-HANDOFF'),'menu copy includes exact batch items');
ok(!payloads.menu.includes('期待')&&!payloads.menu.includes('見るポイント'),'normal test menu payload does not leak expected/review target');
check(payloads.both,`${payloads.character}${payloads.separator}${payloads.menu}`,'both copy is exact components plus stable separator');

// What goes to the external AI is the composed text, not the record (Owner 2026-09-23).
ok(payloads.character.startsWith('以下はあなたが演じるキャラクターの定義です。'),'HANDOFF the Trainer hands over the composed text, the same one 03 composes');
ok(payloads.snapshot.startsWith('{')&&payloads.snapshot.includes('"identity"'),'HANDOFF the JSON snapshot is still produced — for the record of what was tested');
ok(!payloads.character.includes(payloads.snapshot),'HANDOFF the snapshot is not inside the text handed over');
{
  const BASE=['B0:','  ALWAYS name Seat 8 as a human role','','PRECEDENCE','  Hard invariants win.',''].join(String.fromCharCode(10));
  const sha=await P.sha256Of(BASE);
  const good={text:BASE,version:'t',sha256:sha,expectedSha256:sha};
  const withBase=copyPayloads(flow,'PB-SAFETY','ja',{baseLayer:good});
  ok(withBase.character.includes('## Base')&&withBase.character.indexOf('## Base')<withBase.character.indexOf('## Character'),'HANDOFF with a base layer the Trainer carries it, above the persona');
  // falsification (Owner 2026-09-23): a base layer that is not the shipped one
  // stops the Trainer handing anything over — a run measured on a different text
  // is not evidence about what ships.
  const broken=copyPayloads(flow,'PB-SAFETY','ja',{baseLayer:{...good,sha256:'0'.repeat(64)}});
  check(broken.character,'','HANDOFF falsification: a base layer that does not check out leaves nothing to hand over');
  check(broken.both,'','HANDOFF falsification: and nothing to hand over with the menu either');
  ok(broken.snapshot.length>0,'HANDOFF the record is unaffected — nothing is deleted when a hand-off is refused');
}
// The construction mark: a run from before the change is read for what it was.
{
  const execution=flow.executions[qa.execution_id];
  const unmarked=promptConstructionOf(execution);
  check(unmarked.construction,PROMPT_CONSTRUCTION.rawSnapshot,'MARK an execution with no mark is read as the raw-snapshot construction');
  check(unmarked.prompt_sha256,execution.character_sha256,'MARK its digest is the one already in the record — that is what went to the AI then');
  check(unmarked.stamped,false,'MARK and it says plainly that it carries no mark');
  const marked=promptConstructionOf({...execution,handoff:{construction:PROMPT_CONSTRUCTION.composed,prompt_sha256:'a'.repeat(64)}});
  check(marked.construction,PROMPT_CONSTRUCTION.composed,'MARK a marked execution names the composed construction');
  check(marked.prompt_sha256,'a'.repeat(64),'MARK and carries the digest of the text it handed over');
  ok(unmarked.prompt_sha256!==marked.prompt_sha256,'MARK the two constructions are told apart by their digests');
}
// A training started with a mark records it on the executions it creates.
{
  const stamp={construction:PROMPT_CONSTRUCTION.composed,prompt_sha256:'b'.repeat(64),base_layer:{version:'1.0',sha256:'c'.repeat(64)},glossary_sha256:null};
  let marked=await create(character,'r4-mark');
  marked.preparation.mode='CATEGORY_BATCH';
  marked=await run(marked,'menu-generate',{expected_generation:null,seed:'mark-seed'});
  const ids=marked.r4.generation.selected_item_ids.slice(0,2);
  marked=await run(marked,'menu-selection',{expected_generation:marked.r4.generation.generation_id,item_ids:ids});
  marked=await run(marked,'start-training',{handoff:stamp});
  const created=Object.values(marked.executions);
  ok(created.length>0&&created.every(execution=>promptConstructionOf(execution).construction===PROMPT_CONSTRUCTION.composed),'MARK every execution a marked training creates carries the mark');
  ok(created.every(execution=>promptConstructionOf(execution).prompt_sha256==='b'.repeat(64)),'MARK and the digest of the text that training hands over');
}

let originalSave=await operate(flow,{intent:`r4-${++intent}`,type:'response-whole-r4',payload:{execution_id:qa.execution_id,question_attempt_id:qa.id,expected_original:null,text:'同じbatch回答'}});flow=originalSave.session;
const originalId=originalSave.result.original_id,bindingA=originalSave.result.binding_id;
check(menuCompletion(flow,'PB-SAFETY').state,'途中','saved response without evaluation means 途中');
check(Object.keys(flow.originals).length,1,'batch Original is stored once');
check(flow.binding_heads[qb.id],undefined,'other batch item receives no automatic Binding');
flow=await run(flow,'select-menu',{menu_item_id:'PB-HANDOFF'});
check(Object.keys(flow.bindings).length,1,'selecting other batch item still creates no Binding');
const relaxed={conclusion:'MATCH',confirmed:['C01'],reasons:['R03']};
let evaluated=await operate(flow,{intent:`r4-${++intent}`,type:'evaluate-whole-r4',payload:{execution_id:qb.execution_id,question_attempt_id:qb.id,binding_id:null,expected_binding:null,expected_evaluation:null,language:'ja',choices:relaxed,confirmed_note:'',reason_note:'',validation_rule_version:VALIDATION_RULE_VERSION_R4,stay_stage:2}});flow=evaluated.session;
check(flow.view.stage,2,'per-menu result remains on Stage 02');
check(Object.keys(flow.originals).length,1,'second batch evaluation reuses exact Original');
check(flow.bindings[evaluated.result.binding_id].original_id,originalId,'other batch WHOLE binding points to same Original');
check(flow.evaluations[evaluated.result.evaluation_id].validation_rule_version,VALIDATION_RULE_VERSION_R4,'R4 validation rule version is persisted');
check(flow.evaluations[evaluated.result.evaluation_id].choices,relaxed,'MATCH + R03 saves without Human judgement rewrite');
check(menuCompletion(flow,'PB-HANDOFF').state,'済','exact current Result means 済');
check(flow.r4.recommendations[evaluated.result.result_id].state,'INSUFFICIENT_BASIS','deterministic recommendation fails closed when mapping is insufficient');
check(flow.r4.recommendations[evaluated.result.result_id].tuning_measurements,[],'generic choices do not become T01-T20 measurements');
check(flow.r4.recommendations[evaluated.result.result_id].direction_or_value,null,'no direction is invented');
const conflict=conflictingRecommendations([{target:'expression_semantics.voice',direction_or_value:'UP',result_id:'r1'},{target:'expression_semantics.voice',direction_or_value:'DOWN',result_id:'r2'}]);
check(conflict[0].state,'UNRESOLVED_CONFLICT','opposite recommendations remain an unresolved conflict');
check(conflict[0].alternatives.map(item=>item.direction_or_value),['UP','DOWN'],'conflict preserves both recommendations without averaging');
check(conflict[0].winner,null,'conflict handler does not silently choose a winner');

await rejects(()=>operate(flow,{intent:`r4-${++intent}`,type:'evaluate',payload:{execution_id:qb.execution_id,question_attempt_id:qb.id,binding_id:evaluated.result.binding_id,expected_evaluation:evaluated.result.evaluation_id,language:'ja',choices:{conclusion:'MATCH',confirmed:['C01','C_NONE'],reasons:['R03']},validation_rule_version:VALIDATION_RULE_VERSION_R4,stay_stage:2}}),'C_NONE_EXCLUSIVE','C_NONE remains mutually exclusive');
const resultCount=Object.keys(flow.results).length;
flow=await run(flow,'select-menu',{menu_item_id:'PB-HANDOFF'});
check(Object.keys(flow.results).length,resultCount,'opening/switching to result creates no new Evidence');

const firstEvaluation=evaluated.result.evaluation_id,firstResult=evaluated.result.result_id;
evaluated=await operate(flow,{intent:`r4-${++intent}`,type:'evaluate',payload:{execution_id:qb.execution_id,question_attempt_id:qb.id,binding_id:evaluated.result.binding_id,expected_evaluation:firstEvaluation,language:'ja',choices:{conclusion:'NOT_ASSESSED',confirmed:['C01'],reasons:['R02']},validation_rule_version:VALIDATION_RULE_VERSION_R4,stay_stage:2}});flow=evaluated.session;
ok(flow.evaluations[firstEvaluation]&&flow.results[firstResult],'reevaluation preserves old Evaluation/Result');
check(flow.evaluations[evaluated.result.evaluation_id].supersedes_evaluation_id,firstEvaluation,'reevaluation appends with exact supersession');
check(menuCompletion(flow,'PB-HANDOFF').code,'NOT_ASSESSED','R4 permits judgement deferred without forcing R07');

const consultationResult=evaluated.result.result_id,consultationEvaluation=evaluated.result.evaluation_id;
flow=await run(flow,'ai-candidate',{result_id:consultationResult,evaluation_id:consultationEvaluation,source_response:'AI source answer',proposal:{target:'expression_semantics.voice',direction_or_value:'review',reason:'candidate only',expected_effect:'unknown',side_effect_or_caution:'Human review',unresolved_points:'value'}});
const candidate=Object.values(flow.r4.consultations)[0];
check(candidate.result_id,consultationResult,'AI proposed candidate pins exact Result');
check(candidate.evaluation_id,consultationEvaluation,'AI proposed candidate pins exact Evaluation');
check(candidate.source_response.text,'AI source answer','AI consultation source response is immutable evidence distinct from proposal');
check(candidate.canonical_mutation,false,'AI proposed candidate cannot mutate Character');

flow=await run(flow,'finish-training',{});
const summary=flow.r4.summaries[flow.r4.summary_head],summaryBefore=structuredClone(summary);
check(flow.view.stage,3,'training end moves to all-menu Stage 03');
check(summary.version,SUMMARY_VERSION,'summary generation version is pinned');
check(summary.menu_item_ids,wanted,'summary includes all selected menu statuses');
ok(summary.rows.some(row=>row.status!=='済'),'training can end with unresolved items');
ok(summary.result_ids.includes(consultationResult)&&summary.evaluation_ids.includes(consultationEvaluation),'summary pins exact Result/Evaluation set');
ok(summary.ai_candidate_refs.includes(candidate.id),'summary pins AI consultation candidate reference');
check(summary.limited_scope,true,'summary does not claim Character-wide performance');

flow=await run(flow,'view-summary-menu',{summary_id:summary.id,menu_item_id:'PB-HANDOFF'});
check(flow.view.stage,2,'summary returns to exact Stage 02 menu');
check(flow.selected.question,qb.id,'summary return selects exact QuestionAttempt');
const summaryAfter=flow.r4.summaries[summary.id];
check(summaryAfter,summaryBefore,'returning from summary does not rewrite snapshot');

const oldOriginalCount=Object.keys(flow.originals).length,oldBindingCount=Object.keys(flow.bindings).length;
const correction=await operate(flow,{intent:`r4-${++intent}`,type:'response-whole-r4',payload:{execution_id:qb.execution_id,question_attempt_id:qb.id,expected_original:originalId,text:'訂正した新回答'}});flow=correction.session;
check(Object.keys(flow.originals).length,oldOriginalCount+1,'Original correction appends new immutable Original');
ok(Object.keys(flow.bindings).length===oldBindingCount+1&&flow.bindings[bindingA],'Original correction does not overwrite legacy bindings');
check(flow.binding_heads[qa.id],undefined,'correction does not copy prior other-menu Binding');
check(flow.r4.summaries[summary.id],summaryBefore,'later correction does not rewrite old summary');

const partialSessionBase=await create(character,'r4-partial');
let partial=await run(partialSessionBase,'menu-generate',{expected_generation:null,seed:'partial'});
partial=await run(partial,'menu-selection',{expected_generation:partial.r4.generation.generation_id,item_ids:['PB-SAFETY']});partial=await run(partial,'start-training',{});
const pq=partial.questions[partial.r4.active_training.question_attempt_by_menu['PB-SAFETY']];
let raw=await operateV3(partial,{intent:'legacy-response',type:'response',payload:{execution_id:pq.execution_id,expected_original:null,text:'日本語🌸exact'}});partial=raw.session;
raw=await operateV3(partial,{intent:'legacy-partial',type:'binding',payload:{execution_id:pq.execution_id,question_attempt_id:pq.id,original_id:raw.result.original_id,expected_binding:null,kind:'PARTIAL',human_explicit:true,start:0,end:9}});partial=raw.session;
await validateGraph(partial);check(partial.bindings[raw.result.binding_id].kind,'PARTIAL','legacy PARTIAL remains exact and valid');
check(partial.bindings[raw.result.binding_id].range,{start:0,end:9},'legacy PARTIAL byte range is not converted to WHOLE');

const retestSource=flow.selected.execution;
const retest=await operate(flow,{intent:`r4-${++intent}`,type:'retest',payload:{question_id:'PB-HANDOFF',expected_execution:flow.group_heads[flow.selected.group],retest_of:retestSource}});flow=retest.session;
ok(retest.result.execution_id!==retestSource,'retest creates a new ExecutionAttempt');
check(Object.keys(flow.originals).length,oldOriginalCount+1,'retest does not overwrite old responses');
check(menuCompletion(flow,'PB-HANDOFF').state,'未','new retest starts independently');

const retryOp={intent:'lost-response-r4',type:'finish-training',payload:{}};
const once=await operate(flow,retryOp),twice=await operate(once.session,retryOp);
check(twice.replay,true,'retry returns prior successful operation');
check(twice.result.summary_id,once.result.summary_id,'retry does not duplicate summary/evidence');
await rejects(()=>operate(once.session,{...retryOp,payload:{different:true}}),'INTENT_PAYLOAD_MISMATCH','same intent with changed payload fails closed');

const staleBase=await create(character,'r4-stale');
let stale=await run(staleBase,'menu-generate',{expected_generation:null,seed:'stale'});const staleGeneration=stale.r4.generation.generation_id;
stale=await run(stale,'menu-generate',{expected_generation:staleGeneration,seed:'new'});
await rejects(()=>run(stale,'menu-more',{expected_generation:staleGeneration}),'STALE_EXPECTED_HEAD','cross-menu stale generation save fails closed');
await validateGraph(flow);check(flow.canonical_mutation,false,'full R4 graph preserves Character mutation = 0');

console.log(`TRAINER_UX4_CONTRACT PASS (${passed}/${passed})`);
console.log(`MENU_POOL_CURRENT_COUNTS ${JSON.stringify(expectedCounts)}`);
