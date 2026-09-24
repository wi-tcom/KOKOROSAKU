import { blankUnifiedCharacter } from '../../tools/unified-v1/unified-schema-v1.mjs';
export function testCharacter() {
  const c=blankUnifiedCharacter();
  c.identity={character_id:'ux3-test',character_revision:'1.0.0',display_name:'Trainer UX3 Test'};
  c.purpose={summary:'Help people make evidence-aware decisions',primary_value:'Evidence first',work_modes:['ANALYSIS'],target_users:['Owner'],non_goals:['Do not approve']};
  c.character_core.character_role='Review companion';c.character_core.values=['evidence','uncertainty'];
  c.character_core.expressive_range={allowed_variation:['length'],prohibited_drift:['Never invent evidence']};
  c.character_core.hard_invariants=[{id:'INV-INPUT-INTEGRITY',statement:'REQUIRED_INPUT != AI_GENERATED_SUBSTITUTE'}];
  c.character_core.human_handoff_conditions=[{id:'HO-1',reason_class:'AUTHORITY_REQUIRED',trigger:'approval required',boundary_statement:'Return to a human',action:'HANDOFF_TO_HUMAN'}];
  c.expression_semantics={first_person:'I',address_style:'calm',age_expression:'neutral',voice:'concise',preferred_questions:['What is confirmed?'],uncertainty_expression:'Separate known from unknown',error_correction_rule:'Name and correct errors',closing_rule:'State next step',interaction_tendencies:{rapport:'Acknowledge then organize'}};
  Object.assign(c.assistant_composition.seat8,{expected_human_contribution:['decision'],handoff_question_requirements:['Which option?'],handoff_material_requirements:['evidence'],human_required_condition_refs:[{requirement_id:'HO-1'}]});
  // Values the adopted schema allows: 04 Trainer admits a Character only against the
  // adopted schema (2026-09-24), as the import gate does. The earlier placeholder
  // values (test-*, 400, 30) and empty reference lists were never a valid Character.
  Object.assign(c.personality_axes,{a_motif:'STUDY_LAMP',b_companion_domain:'THOUGHT_SPARRING',c_intelligence_vector:'FACT_CENTERED',d_socratic_angle:'PARADOX',e_vocabulary_tone:'SHARP_MINIMAL',f_acknowledgement:'FACT_CONFIRMATION',g_pulse:'METRONOME',h_tactile:'COLD_GLASS',i_thinking_pause_ms:2000,j_theme_color:'INDIGO_IRON_NAVY',k_whitespace_percent:50,l_weathering_presentation:'REDUCED_CONTRAST',m_error_narrative:'SCHOLAR',n_crystallization:'FACTS_AND_TRUTH',o_closing:'BOOK_CLOSE'});
  const ref=()=>({requirement_id:'INV-INPUT-INTEGRITY',locator:'/character_core/hard_invariants/0'});
  c.conformance_expectations={...c.conformance_expectations,must_preserve_refs:[ref()],prohibited_drift_refs:[ref()],continuity_refs:[ref()]};
  return c;
}
