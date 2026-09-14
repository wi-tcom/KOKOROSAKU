// Exact, deliberately bounded map from Trainer semantic targets to the
// Owner-facing Builder. Entries come from tooling/builder/index.html; absence from
// this registry means NOT_DETERMINED, never permission to infer a location.

export const BUILDER_FIELD_REGISTRY_VERSION = 'saku.builder-field-registry@1';
export const REGISTRY_BUILDER_REVISION = 'tooling/builder/index.html@sha256:A830933FE8B13B0946D19AE26A83603BC6BAB80B7AFE63E16C7F05892746BF41';

export const BUILDER_FIELD_REGISTRY = Object.freeze([
  Object.freeze({
    builder_revision: REGISTRY_BUILDER_REVISION,
    chapter_number: '三',
    chapter_number_en: '3',
    chapter_label: Object.freeze({ ja:'話法と価値観', en:'Voice and values' }),
    subsection_label: Object.freeze({ ja:'十五の軸', en:'The fifteen axes' }),
    item_label: Object.freeze({ ja:'九　考える間（ミリ秒）', en:'9. Thinking pause (ms)' }),
    canonical_or_builder_data_path: 'unified.axes.i_thinking_pause_ms',
    source_character_path: 'personality_axes.i_thinking_pause_ms',
    control_type: 'select',
    allowed_values: Object.freeze([1500,2000,2500]),
    allowed_value_labels: Object.freeze({
      1500:Object.freeze({ja:'1500ミリ秒（短め）',en:'1500 ms (shorter)'}),
      2000:Object.freeze({ja:'2000ミリ秒（標準）',en:'2000 ms (standard)'}),
      2500:Object.freeze({ja:'2500ミリ秒（長め）',en:'2500 ms (longer)'}),
    }),
    edit_operations_allowed: Object.freeze(['SET_ENUM']),
    owner_domain: 'SAKU',
    active: true,
  }),
  Object.freeze({
    builder_revision: REGISTRY_BUILDER_REVISION,
    chapter_number: '五',
    chapter_number_en: '5',
    chapter_label: Object.freeze({ ja:'人間と引き渡し', en:'Human handoff' }),
    subsection_label: null,
    item_label: Object.freeze({ ja:'人間へ渡す条件', en:'Conditions for handing over to a human' }),
    canonical_or_builder_data_path: 'unified.human_handoff_conditions',
    source_character_path: 'character_core.human_handoff_conditions',
    control_type: 'structured-list',
    allowed_values: null,
    allowed_value_labels: null,
    edit_operations_allowed: Object.freeze(['APPEND_EXACT','REMOVE_EXACT']),
    owner_domain: 'SAKU',
    active: true,
  }),
]);

const at=(value,path)=>path.split('.').reduce((node,key)=>node==null?undefined:node[key],value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=value=>String(value??'').trim();

export function registryEntry(path){return BUILDER_FIELD_REGISTRY.find(item=>item.canonical_or_builder_data_path===path)||null;}

export function assessBuilderEditGuidance(input={}){
  const result=input.result||null,evaluation=input.evaluation||null,rule=input.diagnostic_rule||null,translation=input.translation||null;
  const targets=Array.isArray(translation?.targets)?translation.targets:[];
  const target=targets.length===1?targets[0]:null,path=target?.builder_data_path||target?.field||input.semantic_target||'';
  const field=registryEntry(path),currentRevision=text(input.current_character?.identity?.character_revision),sourceRevision=text(result?.context?.character?.character_revision);
  const currentDigest=text(input.current_character_digest),sourceDigest=text(result?.context?.character?.character_digest);
  const currentValue=field?at(input.current_character,field.source_character_path):undefined;
  const proposed=input.proposed_value,operation=input.edit_operation||'';
  const checks={
    EXACT_RESULT_EVIDENCE:Boolean(result?.id&&evaluation?.id&&result.evaluation_id===evaluation.id&&result.evaluation_snapshot?.id===evaluation.id),
    EXPLICIT_DIAGNOSTIC_RULE:Boolean(rule?.version&&rule?.deterministic===true&&rule?.result_id===result?.id&&rule?.semantic_target===path),
    SAKU_SEMANTIC_TARGET:targets.length===1&&Boolean(path),
    TRANSLATION_CONTRACT:translation?.ok===true&&Boolean(translation?.version)&&targets.length===1&&target?.classification==='SAKU',
    BUILDER_FIELD_REGISTRY_MATCH:Boolean(field&&field.active&&field.owner_domain==='SAKU'&&input.builder_revision===REGISTRY_BUILDER_REVISION),
    BUILDER_LOCATION_EXACT:Boolean(field&&(!input.claimed_chapter_number||input.claimed_chapter_number===field.chapter_number)&&(!input.claimed_item_label||input.claimed_item_label===field.item_label.ja)),
    SOURCE_CHARACTER_REVISION_MATCH:Boolean(currentRevision&&sourceRevision&&currentRevision===sourceRevision),
    SOURCE_CHARACTER_DIGEST_MATCH:Boolean(currentDigest&&sourceDigest&&currentDigest===sourceDigest),
    CURRENT_VALUE_READ:currentValue!==undefined,
    EDIT_OPERATION_ALLOWED:Boolean(field?.edit_operations_allowed.includes(operation)),
    PROPOSED_VALUE_VALID:false,
    ACTION_DETAILS_SUPPORTED:Boolean(text(rule?.reason)&&text(rule?.expected_effect)&&text(rule?.side_effect_or_caution)&&Array.isArray(rule?.evidence_menu_labels)&&rule.evidence_menu_labels.length),
  };
  if(field?.control_type==='select')checks.PROPOSED_VALUE_VALID=field.allowed_values.some(value=>same(value,proposed));
  else if(field&&['text','textarea','structured-list'].includes(field.control_type)){
    checks.PROPOSED_VALUE_VALID=Boolean(
      input.proposal_source==='DETERMINISTIC_EXACT_TEXT'&&rule?.exact_text===true
      ||input.proposal_source==='HUMAN_CONFIRMED_AI_CANDIDATE'&&input.human_confirmed===true
    )&&proposed!==undefined;
  }
  const failed=Object.entries(checks).filter(([,value])=>!value).map(([name])=>name);
  if(!checks.SOURCE_CHARACTER_REVISION_MATCH||!checks.SOURCE_CHARACTER_DIGEST_MATCH)return{actionable:false,code:'STALE_CHARACTER',checks,failed,field:null};
  if(failed.length)return{actionable:false,code:targets.length!==1?'BUILDER_DESTINATION_NOT_DETERMINED':!field?'BUILDER_DESTINATION_NOT_DETERMINED':'RECOMMENDATION_GATE_FAILED',checks,failed,field:null};
  const language=input.language==='en'?'en':'ja';
  return{
    actionable:true,code:'ACTIONABLE_BUILDER_RECOMMENDATION',checks,failed:[],field,
    display:{
      chapter:language==='ja'?`第${field.chapter_number}章「${field.chapter_label.ja}」`:`Chapter ${field.chapter_number_en}: ${field.chapter_label.en}`,
      subsection:field.subsection_label?.[language]||null,item:field.item_label[language],
      current:field.allowed_value_labels?.[currentValue]?.[language]??currentValue,
      proposed:field.allowed_value_labels?.[proposed]?.[language]??proposed,
      operation,
      reason:rule.reason,
      expected_effect:rule.expected_effect,
      side_effect_or_caution:rule.side_effect_or_caution,
      evidence_menu_labels:[...rule.evidence_menu_labels],
      status:language==='ja'?'知識に基づく修正候補・人の確認が必要':'Knowledge-based revision candidate · Human review required',
    },
    evidence:{result_id:result.id,evaluation_id:evaluation.id,diagnostic_rule_version:rule.version,translation_version:translation.version,builder_revision:REGISTRY_BUILDER_REVISION},
  };
}

export function unresolvedBuilderGuidance(reason='BUILDER_DESTINATION_NOT_DETERMINED'){
  return Object.freeze({actionable:false,code:reason,target:null,chapter:null,item:null,proposed:null});
}
