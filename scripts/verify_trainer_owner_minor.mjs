import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  BUILDER_FIELD_REGISTRY, BUILDER_FIELD_REGISTRY_VERSION, REGISTRY_BUILDER_REVISION,
  assessBuilderEditGuidance, registryEntry,
} from '../tools/v1/builder-field-registry.mjs';

let passed=0;
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);passed++;};
const ok=(value,label)=>{assert.ok(value,label);passed++;};

const builder=await readFile(new URL('../tools/saku-builder.html',import.meta.url),'utf8');
const builderSha=createHash('sha256').update(builder).digest('hex').toUpperCase();
check(REGISTRY_BUILDER_REVISION,`tools/saku-builder.html@sha256:${builderSha}`,'registry pins the exact current Builder source');
check(BUILDER_FIELD_REGISTRY_VERSION,'saku.builder-field-registry@1','registry version is explicit');
check(BUILDER_FIELD_REGISTRY.length,2,'registry is deliberately bounded to two exact Owner-confirmed Builder fields');
for(const entry of BUILDER_FIELD_REGISTRY){for(const key of ['builder_revision','chapter_number','chapter_label','item_label','canonical_or_builder_data_path','control_type','edit_operations_allowed'])ok(Object.hasOwn(entry,key),`registry entry carries ${key}`);}
ok(/<span class="num">三<\/span>話法と価値観/.test(builder),'thinking-pause chapter is read from the Builder UI authority');
ok(/<h3 class="sub">十五の軸<\/h3>/.test(builder),'thinking-pause subsection is exact');
ok(/<label>九　考える間（ミリ秒）<\/label>\s*<select data-path="unified\.axes\.i_thinking_pause_ms">/.test(builder),'thinking-pause item and path are exact');
for(const value of [1500,2000,2500])ok(builder.includes(`<option value="${value}">${value}ミリ秒`),`Builder enum contains ${value}`);
ok(/<span class="num">五<\/span>人間と引き渡し/.test(builder),'handoff chapter is exact');
ok(/data-list="unified\.human_handoff_conditions">\s*<label>人間へ渡す条件<\/label>/.test(builder),'handoff item and path are exact');

const character={identity:{character_revision:'1.2.3'},personality_axes:{i_thinking_pause_ms:2500},character_core:{human_handoff_conditions:[]}};
const evaluation={id:'evaluation-exact'};
const result={id:'result-exact',evaluation_id:evaluation.id,evaluation_snapshot:{id:evaluation.id},context:{character:{character_revision:'1.2.3',character_digest:'digest-exact'}}};
const translation={ok:true,version:'translation@exact',targets:[{builder_data_path:'unified.axes.i_thinking_pause_ms',classification:'SAKU'}]};
const diagnostic_rule={version:'diagnostic.thinking-pause@1',deterministic:true,result_id:result.id,semantic_target:'unified.axes.i_thinking_pause_ms',exact_text:false,reason:'回答前の間が現在の目的には長すぎるという明示的な診断',expected_effect:'待ち時間を標準範囲へ戻す',side_effect_or_caution:'短くしすぎると熟考が必要な場面で急いで見える',evidence_menu_labels:['判断を急がないか']};
const base={result,evaluation,diagnostic_rule,translation,current_character:character,current_character_digest:'digest-exact',proposed_value:2000,edit_operation:'SET_ENUM',builder_revision:REGISTRY_BUILDER_REVISION,claimed_chapter_number:'三',claimed_item_label:'九　考える間（ミリ秒）',language:'ja'};
const positive=assessBuilderEditGuidance(base);
check(positive.actionable,true,'exact thinking-pause mapping passes every eligibility gate');
check(positive.display.chapter,'第三章「話法と価値観」','positive mapping shows the exact Builder chapter');
check(positive.display.subsection,'十五の軸','positive mapping shows the exact subsection');
check(positive.display.item,'九　考える間（ミリ秒）','positive mapping shows the exact item');
check(positive.display.current,'2500ミリ秒（長め）','positive mapping reads the exact current enum value');
check(positive.display.proposed,'2000ミリ秒（標準）','positive mapping accepts an exact allowed enum value');
check(positive.display.expected_effect,'待ち時間を標準範囲へ戻す','positive mapping preserves the versioned expected effect');
check(positive.display.side_effect_or_caution,'短くしすぎると熟考が必要な場面で急いで見える','positive mapping preserves side effects and cautions');
check(positive.display.evidence_menu_labels,['判断を急がないか'],'positive mapping preserves the exact evidence menu label');
check(Object.values(positive.checks).every(Boolean),true,'all eligibility checks pass only for the exact positive fixture');

const fail=(changes,label)=>{const value=assessBuilderEditGuidance({...base,...changes});check(value.actionable,false,label);check(value.field,null,`${label} exposes no guessed field`);return value;};
fail({claimed_chapter_number:'九十九'},'nonexistent Builder chapter fails closed');
fail({claimed_item_label:'存在しない項目'},'nonexistent Builder item fails closed');
fail({builder_revision:'tools/saku-builder.html@stale'},'stale Builder registry fails closed');
fail({current_character:{...character,identity:{character_revision:'1.2.4'}}},'stale Character revision fails closed');
fail({current_character_digest:'digest-changed'},'stale Character digest fails closed');
fail({translation:{ok:true,version:'translation@exact',targets:[{builder_data_path:'semantic.with.no.ui',classification:'SAKU'}]},diagnostic_rule:{...diagnostic_rule,semantic_target:'semantic.with.no.ui'}},'semantic field with no UI mapping fails closed');
fail({proposed_value:1800},'enum value outside Builder allowed values fails closed');
const handoffTranslation={ok:true,version:'translation@exact',targets:[{builder_data_path:'unified.human_handoff_conditions',classification:'SAKU'}]};
const handoffRule={...diagnostic_rule,semantic_target:'unified.human_handoff_conditions'};
fail({translation:handoffTranslation,diagnostic_rule:handoffRule,proposed_value:'AI wrote this',edit_operation:'APPEND_EXACT',proposal_source:'AI_PROPOSED_ADJUSTMENT_CANDIDATE',claimed_chapter_number:'五',claimed_item_label:'人間へ渡す条件'},'unreviewed AI free-text edit fails closed');
fail({translation:{ok:true,version:'translation@exact',targets:[...translation.targets,{builder_data_path:'unified.human_handoff_conditions',classification:'SAKU'}]}},'multiple possible Builder fields fail closed');
fail({translation:{ok:true,version:'translation@exact',targets:[{builder_data_path:'assistant_composition.front_control',classification:'SAKU'}]},diagnostic_rule:{...diagnostic_rule,semantic_target:'assistant_composition.front_control'}},'removed or inactive Schema field fails closed');
fail({translation:{ok:true,version:'translation@exact',targets:[{builder_data_path:'amu.runtime.policy',classification:'AMU'}]},diagnostic_rule:{...diagnostic_rule,semantic_target:'amu.runtime.policy'}},'AMU-owned field cannot be presented as a SAKU edit');
check(registryEntry('does.not.exist'),null,'unmapped lookup returns exact null rather than an inferred substitute');

console.log(`TRAINER_OWNER_MINOR PASS (${passed}/${passed})`);
console.log(`BUILDER_FIELD_REGISTRY ${BUILDER_FIELD_REGISTRY.length} entries ${REGISTRY_BUILDER_REVISION}`);
console.log('LLM_LOCATION_INFERENCE 0');
console.log('LLM_UNREVIEWED_EDIT_INSTRUCTION 0');
console.log('AMU_AS_SAKU_EDIT 0');
