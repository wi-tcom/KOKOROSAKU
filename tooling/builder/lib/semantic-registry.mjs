// Shared human-facing semantic source for Builder, Manual and Trainer.
// Canonical ownership remains SAKU Core; this registry describes how the
// Builder presents the exact adopted Unified V1 contract.

export const REGISTRY_ID = "saku.builder.semantic-registry@1";
export const CANONICAL_EVIDENCE = Object.freeze({
  repository: "wi-tcom/-SAKU-1-7-Character-System",
  revision: "c442a1a04e876dc7d0a6941b500ce7b1ff94bf0c",
  path: "schema/adopted/unified-v1/saku-unified-character.v1.schema.json",
  sha256: "48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817",
  decision_id: "D-13",
});
export const EFFECT_STATES = Object.freeze({
  CHARACTER_DEFINED: { ja: "Characterに定義されている", en: "Defined on the Character" },
  PROMPT_INCLUDED: { ja: "Promptに含まれている", en: "Included in the prompt" },
  RUNTIME_CONTROLLED: { ja: "Runtimeで制御されている", en: "Controlled at runtime" },
  UNKNOWN: { ja: "現在、効果経路を確認できない", en: "The effect path is currently unknown" },
});

export const PROMPT_INCLUDED_CAUTION = Object.freeze({
  ja: "Promptに含まれても、ChatGPT、Claude、Geminiなどが定義どおりに動く保証にはなりません。",
  en: "Prompt inclusion does not guarantee that ChatGPT, Claude, Gemini, or another AI platform will behave exactly as defined.",
});

export const CHAPTERS = Object.freeze([
  { id: "identity", numeral: "一", title: { ja: "基本情報", en: "Basic information" }, question: { ja: "このキャラクターは誰ですか？", en: "Who is this Character?" } },
  { id: "purpose", numeral: "二", title: { ja: "目的と役割", en: "Purpose and role" }, question: { ja: "何のために存在し、何をしますか？", en: "Why does this Character exist, and what does it do?" } },
  { id: "work", numeral: "三", title: { ja: "仕事と使いどころ", en: "Work and use contexts" }, question: { ja: "どんな仕事や場面で使いますか？", en: "What work and situations is this Character used for?" } },
  { id: "persona", numeral: "四", title: { ja: "人格・価値観と話し方", en: "Persona, values, and expression" }, question: { ja: "どんな人物で、何を大切にし、どう話しますか？", en: "Who is this Character, what does it value, and how does it speak?" } },
  { id: "boundary", numeral: "五", title: { ja: "守ることと人に任せる条件", en: "Commitments and human handoff" }, question: { ja: "何を必ず守り、どこから人に任せますか？", en: "What must be preserved, and when must a human take over?" } },
]);

const help = (jaLabel, enLabel, jaWhat, enWhat, jaExample, enExample, jaCaution, enCaution) => ({
  label: { ja: jaLabel, en: enLabel },
  help: {
    about: { ja: `${jaLabel}をCharacter定義のどこへ記録するかを示します。`, en: `This records ${enLabel.toLowerCase()} in the Character definition.` },
    what: { ja: jaWhat, en: enWhat },
    why: {
      ja: `${jaLabel}を、Characterの意図を人とAIの双方が同じように確認できるようにするためです。`,
      en: `This lets people and AI inspect the Character's intent consistently for ${enLabel.toLowerCase()}.`,
    },
    example: { ja: jaExample, en: enExample },
    caution: { ja: jaCaution, en: enCaution },
    relatedAiBehavior: {
      ja: "関連するAIの動きは期待される傾向です。実際の応答はTrainerのEvidenceで別に確認します。",
      en: "Related AI behavior is an expected tendency. Actual responses are assessed separately with Trainer evidence.",
    },
    relatedItems: {
      ja: "同じ章の項目と、表示された調整症状を一緒に確認します。",
      en: "Review this together with fields in the same chapter and the listed tuning symptoms.",
    },
    usedAt: {
      ja: "Builderの入力・Validation・Previewと、Character JSON/YAMLの生成で使われます。",
      en: "Used by Builder input, validation, preview, and Character JSON/YAML generation.",
    },
    persistence: {
      ja: "Save/Export時は表示されたCanonical pathへ保存され、再読込時も同じpathから復元されます。",
      en: "On Save/Export it is stored at the displayed Canonical path and restored from that path when reopened.",
    },
  },
});
const field = (chapter, canonicalPath, kind, labels, options = {}) => Object.freeze({
  id: canonicalPath.replace(/[^A-Za-z0-9]+/g, "-"), chapter, canonicalPath, kind,
  required: Boolean(options.required),
  requiredness: options.requiredness || (options.required ? "REQUIRED" : "OPTIONAL"),
  editability: "USER_EDITABLE",
  classification: "CANONICAL_CHARACTER_FIELD",
  humanQuestion: CHAPTERS.find(item => item.id === chapter)?.question || { ja: "", en: "" },
  boundary: {
    ja: "Character定義の項目です。Authority・資格・承認・実行許可を作りません。",
    en: "This is Character-definition data. It does not create authority, credentials, approval, or execution permission.",
  },
  relatedSemantics: Object.freeze([...(options.tuning || [])]),
  source: Object.freeze({ registry_id: REGISTRY_ID, ...CANONICAL_EVIDENCE }),
  evidence: "DECLARED_IN_ADOPTED_SCHEMA",
  singleHome: "P08",
  effectState: options.effectState || "CHARACTER_DEFINED",
  tuning: options.tuning || [], options: options.options || null,
  ...labels,
});
const simple = (chapter, path, kind, ja, en, exampleJa, exampleEn, options = {}) => field(chapter, path, kind,
  help(ja, en, options.whatJa || `${ja}を、利用者が読んで判断できる言葉で入力します。`, options.whatEn || `Enter ${en.toLowerCase()} in language a user can understand.`, exampleJa, exampleEn,
    options.cautionJa || "入力はCharacterの定義です。権限・資格・承認・実行許可を意味しません。",
    options.cautionEn || "This is a Character definition; it does not grant authority, credentials, approval, or execution permission."), options);

export const WORK_MODE_OPTIONS = Object.freeze([
  "STRATEGY", "ANALYSIS", "PLANNING", "EXECUTION_SUPPORT", "REVIEW", "FACILITATION", "OPERATIONS",
  "CUSTOMER_INTERACTION", "COACHING", "RESEARCH", "CREATION", "INCIDENT_RESPONSE", "ROUTINE_PROCESSING",
]);
export const HANDOFF_REASON_OPTIONS = Object.freeze([
  "AUTHORITY_REQUIRED", "CREDENTIAL_REQUIRED", "LEGAL_OR_REGULATORY", "SAFETY_CRITICAL",
  "EXTERNAL_IRREVERSIBLE", "MATERIAL_UNCERTAINTY", "CHARACTER_BOUNDARY", "OTHER",
]);

const AXES = [
  ["a_motif", "場のモチーフ", "Motif", ["STUDY_LAMP", "CLOCK_GEARS", "MIDNIGHT_SEA", "QUIET_GARDENER"]],
  ["b_companion_domain", "伴走領域", "Companion domain", ["THOUGHT_SPARRING", "DATA_DECOMPOSITION", "MENTAL_TUNING", "TASK_COMPANION"]],
  ["c_intelligence_vector", "知の向き", "Intelligence vector", ["FACT_CENTERED", "EMOTIONAL_RESOLUTION", "STRUCTURAL_LOGIC", "PHILOSOPHICAL_ABSTRACTION"]],
  ["d_socratic_angle", "問いの角度", "Socratic angle", ["PSYCHOANALYTIC", "FACT_DECONSTRUCTION", "PARADOX", "PERSPECTIVE_SHIFT"]],
  ["e_vocabulary_tone", "語彙のトーン", "Vocabulary tone", ["ACADEMIC_HARD", "WARM_EMBRACING", "SHARP_MINIMAL", "POETIC_METAPHORIC"]],
  ["f_acknowledgement", "受けとめ方", "Acknowledgement", ["SILENT_ACCEPTANCE", "FACT_CONFIRMATION", "CURIOSITY", "MIRRORING"]],
  ["g_pulse", "会話の間合い", "Pulse", ["DEEP_BREATH", "METRONOME", "WAVE", "CAMPFIRE"]],
  ["h_tactile", "言葉の手ざわり", "Tactile expression", ["HOURGLASS_SAND", "WASHI", "COLD_GLASS", "HEAVY_WOOD"]],
  ["i_thinking_pause_ms", "考える間", "Thinking pause", [1500, 2000, 2500]],
  ["j_theme_color", "主調色", "Theme color", ["INDIGO_IRON_NAVY", "AMBER_KAKISHIBU", "EVERGREEN_MIRUCHA", "DULL_SILVER_GRAY"]],
  ["k_whitespace_percent", "余白の好み", "Whitespace preference", [40, 50, 60]],
  ["l_weathering_presentation", "風化の見せ方", "Weathering presentation", ["BLURRED_OUTLINE", "REDUCED_CONTRAST", "FADED_FONT", "INK_BLEED"]],
  ["m_error_narrative", "誤りの語り方", "Error narrative", ["ARTISAN", "SCHOLAR", "PHILOSOPHER"]],
  ["n_crystallization", "結晶のしかた", "Crystallization", ["GROWTH_AND_CONFLICT", "FACTS_AND_TRUTH", "INVARIANT_ESSENCE"]],
  ["o_closing", "結び方", "Closing", ["FADE_OUT", "BOOK_CLOSE", "HOURGLASS", "CANDLE"]],
];

export const FIELDS = Object.freeze([
  simple("identity", "identity.display_name", "text", "Character名", "Character name", "例：星野ルカ", "Example: Hoshino Luka", { required: true, tuning: ["T19"] }),
  simple("identity", "identity.character_id", "text", "Character ID", "Character ID", "例：hoshino-luka", "Example: hoshino-luka", { required: true, cautionJa: "英小文字・数字・ハイフンで安定したIDを付けます。表示名とは別です。", cautionEn: "Use a stable lowercase ID made of letters, digits, and hyphens. It is separate from the display name." }),
  simple("purpose", "purpose.summary", "textarea", "このCharacterをつくる目的", "Purpose summary", "例：複雑な選択肢を整理し、次の一歩を言葉にする", "Example: organize complex options and state a next step", { required: true, tuning: ["T01", "T20"] }),
  simple("purpose", "purpose.primary_value", "text", "提供する価値", "Primary value", "例：根拠と不確実性を分けた整理", "Example: separate evidence from uncertainty", { required: true, cautionJa: "第4章の『判断で大切にする価値観』とは別の項目です。", cautionEn: "This is separate from the decision values in Chapter 4." }),
  simple("purpose", "character_core.character_role", "text", "このCharacterが担う役割", "Character role", "例：調査内容の整理担当", "Example: research synthesis guide", { required: true, cautionJa: "職業資格・運用上の担当・権限を表しません。", cautionEn: "This is not a professional credential, operational assignment, or authority." }),
  simple("purpose", "purpose.non_goals", "string-list", "目的に含めないこと", "Non-goals", "例：法的判断を確定する", "Example: make final legal decisions", { required: true, tuning: ["T05", "T17"] }),
  simple("work", "purpose.target_users", "string-list", "主に支える相手", "Target users", "例：初めて企画書を書く担当者", "Example: people writing their first project brief", { tuning: ["T16"] }),
  simple("work", "purpose.work_modes", "enum-list", "扱う仕事の種類", "Work modes", "例：ANALYSIS / REVIEW", "Example: ANALYSIS / REVIEW", { required: true, options: WORK_MODE_OPTIONS, cautionJa: "仕事の種類であり、向いている仕事の証明や実行許可ではありません。", cautionEn: "These are work modes, not proof of aptitude or permission to execute." }),
  simple("persona", "character_core.values", "string-list", "判断で大切にする価値観", "Decision values", "例：根拠を示す／急がせない", "Example: show evidence / do not rush", { required: true, tuning: ["T03", "T18"], cautionJa: "第2章の『提供する価値』と統合・自動変換しません。", cautionEn: "This is not merged with or derived from the Chapter 2 primary value." }),
  simple("persona", "expression_semantics.first_person", "text", "一人称", "First person", "例：私", "Example: I", { tuning: ["T11"] }),
  simple("persona", "expression_semantics.address_style", "text", "相手への呼びかけ方", "Address style", "例：丁寧な敬体で話す", "Example: use calm and polite language", { tuning: ["T02", "T12"] }),
  simple("persona", "expression_semantics.age_expression", "text", "年齢の表現", "Age expression", "例：落ち着いた若手研究者の雰囲気", "Example: the presence of a calm early-career researcher", { tuning: ["T11"] }),
  simple("persona", "expression_semantics.voice", "text", "声・語り口", "Voice", "例：短く穏やかに、間を取る", "Example: brief, calm, and measured", { tuning: ["T02", "T08"] }),
  simple("persona", "expression_semantics.preferred_questions", "string-list", "好む問い方", "Preferred questions", "例：確認できた事実は何ですか？", "Example: What facts have been confirmed?", { tuning: ["T04", "T06"] }),
  simple("persona", "expression_semantics.uncertainty_expression", "text", "不確実性の表し方", "Uncertainty expression", "例：確認済みと未確認を分けます", "Example: I will separate confirmed and unconfirmed points", { tuning: ["T09", "T15"] }),
  simple("persona", "expression_semantics.error_correction_rule", "textarea", "誤りを直すときのルール", "Error-correction rule", "例：誤りを明示し、根拠と訂正内容を示す", "Example: name the error, evidence, and correction", { tuning: ["T13"] }),
  simple("persona", "expression_semantics.closing_rule", "text", "会話の閉じ方", "Closing rule", "例：決まったことと次の一歩を確認して閉じる", "Example: close by confirming decisions and the next step", { tuning: ["T14"] }),
  simple("persona", "expression_semantics.interaction_tendencies.encouragement", "text", "励まし方", "Encouragement", "例：できた部分を具体的に伝える", "Example: name specifically what went well", { tuning: ["T07"] }),
  simple("persona", "expression_semantics.interaction_tendencies.rapport", "text", "関係の築き方", "Rapport", "例：相手の言葉を一度受けとめてから整理する", "Example: acknowledge the person's words before organizing them", { tuning: ["T07"] }),
  simple("persona", "expression_semantics.interaction_tendencies.metaphor", "text", "たとえの使い方", "Metaphor", "例：必要なときだけ短いたとえを使う", "Example: use a short metaphor only when helpful", { tuning: ["T08"] }),
  simple("persona", "expression_semantics.interaction_tendencies.scaffolding", "text", "段階的な支え方", "Scaffolding", "例：一度に一つの問いへ分ける", "Example: split the task into one question at a time", { tuning: ["T06"] }),
  simple("persona", "expression_semantics.presentation_intent.appearance", "text", "見た目の意図", "Appearance intent", "例：静かな書斎を思わせる佇まい", "Example: a presence reminiscent of a quiet study", { cautionJa: "抽象的な描写意図です。画像・CSS・音声などの実体は含みません。", cautionEn: "This is an abstract portrayal intent; it contains no image, CSS, audio, or other asset." }),
  ...AXES.map(([key, ja, en, options]) => simple("persona", `personality_axes.${key}`, "enum", ja, en, `例：${options[0]}`, `Example: ${options[0]}`, { required: true, options, tuning: ["T02", "T08", "T11"] })),
  simple("boundary", "character_core.hard_invariants", "requirement-list", "必ず守ること", "Hard invariants", "例：根拠のない断定をしない", "Example: do not make unsupported claims", { required: true, tuning: ["T10", "T17"] }),
  simple("boundary", "character_core.expressive_range.allowed_variation", "string-list", "変わってよい範囲", "Allowed variation", "例：説明の長さ", "Example: explanation length", { required: true, tuning: ["T03"] }),
  simple("boundary", "character_core.expressive_range.prohibited_drift", "string-list", "変わってはいけない範囲", "Prohibited drift", "例：不確実性を事実として断定しない", "Example: do not state uncertainty as fact", { required: true, tuning: ["T03", "T17"] }),
  simple("boundary", "character_core.human_handoff_conditions", "handoff-list", "人に任せる条件", "Human handoff conditions", "例：法的判断が必要／人が確定する", "Example: legal judgment is required / a human decides", { required: true, tuning: ["T05", "T10"] }),
  simple("boundary", "assistant_composition.seat8.expected_human_contribution", "string-list", "人に期待すること", "Expected human contribution", "例：判断と最終確認", "Example: judgment and final confirmation", { required: true }),
  simple("boundary", "assistant_composition.seat8.handoff_question_requirements", "string-list", "人へ渡す問い", "Handoff questions", "例：どの選択肢を採用しますか？", "Example: Which option should be selected?", { required: true }),
  simple("boundary", "assistant_composition.seat8.handoff_material_requirements", "string-list", "人へ渡す材料", "Handoff materials", "例：根拠・不確実性・選択肢", "Example: evidence, uncertainty, and options", { required: true }),
  simple("boundary", "conformance_expectations.must_preserve_refs", "reference-list", "保持を確認する参照", "Must-preserve references", "例：INV-INPUT-INTEGRITY", "Example: INV-INPUT-INTEGRITY", { required: true }),
  simple("boundary", "conformance_expectations.prohibited_drift_refs", "reference-list", "逸脱を確認する参照", "Prohibited-drift references", "例：INV-BOUNDARY", "Example: INV-BOUNDARY", { required: true }),
  simple("boundary", "conformance_expectations.continuity_refs", "reference-list", "継続性を確認する参照", "Continuity references", "例：INV-VOICE", "Example: INV-VOICE", { required: true }),
]);

export const EDITABLE_DENOMINATOR = FIELDS.length;
export const FIELD_BY_PATH = new Map(FIELDS.map(item => [item.canonicalPath, item]));
export const CHAPTER_BY_ID = new Map(CHAPTERS.map(item => [item.id, item]));

// A semantic may be summarized elsewhere, but its complete explanation has one
// authoritative Manual home.  This is shared navigation metadata, not a second
// Manual-only field taxonomy.
export const MANUAL_HOME_BY_SEMANTIC = Object.freeze({
  saku_boundary: "P01",
  character_selection: "P02",
  five_chapter_authoring: "P03",
  human_handoff: "P03#chapter-boundary",
  one_plus_seven: "P04",
  ai_platform_effect_path: "P05",
  trainer_handoff: "P06",
  expected_observed_diff_recommendation: "P07",
  field_help: "P08",
  save_import_export: "P09",
  state_definitions: "P10",
  troubleshooting: "P11",
  glossary: "P12",
  source_version_evidence: "P13",
});

export const READ_ONLY_SEMANTICS = Object.freeze([
  Object.freeze({
    id: "system-schema-identity", label: { ja: "Schema identity", en: "Schema identity" },
    requiredness: "REQUIRED", editability: "READ_ONLY", classification: "SYSTEM_MANAGED",
    reason: { ja: "採択済みSchemaとの対応を検証するシステム管理値のため編集できません。", en: "Read only because the system uses it to validate the adopted Schema binding." },
    singleHome: "P13", effectState: "CHARACTER_DEFINED",
  }),
  Object.freeze({
    id: "system-character-revision", label: { ja: "Character revision", en: "Character revision" },
    requiredness: "REQUIRED", editability: "AUTO_GENERATED", classification: "SYSTEM_MANAGED",
    reason: { ja: "保存時に現在のCharacterから生成される識別値のため直接編集しません。", en: "Not directly edited because it is generated from the current Character when saved." },
    singleHome: "P13", effectState: "CHARACTER_DEFINED",
  }),
  Object.freeze({
    id: "fixed-one-plus-seven", label: { ja: "1+7の固定構造", en: "Fixed 1+7 structure" },
    requiredness: "REQUIRED", editability: "FIXED", classification: "SYSTEM_FIXED",
    reason: { ja: "Unified V1の固定構造であり、CharacterごとのSeat設定ではないため編集できません。", en: "Not editable because Unified V1 fixes the structure; it is not per-Character Seat configuration." },
    singleHome: "P04", effectState: "CHARACTER_DEFINED",
  }),
]);

// The Builder keeps an internal form state so that existing persistence and
// handoff code can remain stable.  This is the single declared bridge from the
// human-facing registry to that state; it is not a second semantic taxonomy.
export const FORM_PATH_BY_CANONICAL = Object.freeze({
  "identity.display_name": "meta.name",
  "identity.character_id": "meta.slug",
  "purpose.summary": "persona_rationale.core_thesis",
  "purpose.primary_value": "identity.value",
  "character_core.character_role": "meta.field",
  "purpose.non_goals": "identity.out_of_scope",
  "purpose.target_users": "identity.target_users",
  "purpose.work_modes": "unified.work_modes",
  "character_core.values": "persona_rules.values",
  "expression_semantics.first_person": "identity.first_person",
  "expression_semantics.address_style": "identity.address_style",
  "expression_semantics.age_expression": "identity.age_expression",
  "expression_semantics.voice": "identity.voice",
  "expression_semantics.preferred_questions": "persona_rules.preferred_questions",
  "expression_semantics.uncertainty_expression": "persona_rules.uncertainty_expression",
  "expression_semantics.error_correction_rule": "persona_rules.error_apology",
  "expression_semantics.closing_rule": "persona_rules.close_style",
  "expression_semantics.interaction_tendencies.encouragement": "unified.interaction_tendencies.encouragement",
  "expression_semantics.interaction_tendencies.rapport": "unified.interaction_tendencies.rapport",
  "expression_semantics.interaction_tendencies.metaphor": "unified.interaction_tendencies.metaphor",
  "expression_semantics.interaction_tendencies.scaffolding": "unified.interaction_tendencies.scaffolding",
  "expression_semantics.presentation_intent.appearance": "unified.appearance",
  "character_core.hard_invariants": "unified.hard_invariants",
  "character_core.expressive_range.allowed_variation": "unified.allowed_variation",
  "character_core.expressive_range.prohibited_drift": "unified.prohibited_drift",
  "character_core.human_handoff_conditions": "unified.human_handoff_conditions",
  "assistant_composition.seat8.expected_human_contribution": "unified.seat8_expected_human_contribution",
  "assistant_composition.seat8.handoff_question_requirements": "unified.seat8_handoff_question_requirements",
  "assistant_composition.seat8.handoff_material_requirements": "unified.seat8_handoff_material_requirements",
  "conformance_expectations.must_preserve_refs": "unified.must_preserve_refs",
  "conformance_expectations.prohibited_drift_refs": "unified.prohibited_drift_refs",
  "conformance_expectations.continuity_refs": "unified.continuity_refs",
  ...Object.fromEntries(AXES.map(([key]) => [`personality_axes.${key}`, `unified.axes.${key}`])),
});

export const TUNING_ITEMS = Object.freeze([
  ["T01", "同じ検討を何度も繰り返す", "Repeatedly revisits the same consideration"],
  ["T02", "話し方が場面に合わない", "Uses a speaking style that does not fit the situation"],
  ["T03", "判断の軸が途中で揺れる", "Lets decision values drift during a task"],
  ["T04", "確認の問いが多すぎる", "Asks too many confirmation questions"],
  ["T05", "人へ任せるべき場面で進める", "Continues when a human should take over"],
  ["T06", "説明の段階が飛ぶ", "Skips needed explanation steps"],
  ["T07", "励ましや共感が過剰になる", "Overuses encouragement or rapport"],
  ["T08", "たとえや表現が強すぎる", "Uses overly strong metaphors or expression"],
  ["T09", "反対意見を止められない", "Cannot stop exploring counterarguments"],
  ["T10", "守るべき境界を越える", "Crosses a required boundary"],
  ["T11", "人格や語り口が安定しない", "Does not maintain a stable persona or voice"],
  ["T12", "相手への呼びかけ方が不適切", "Uses an unsuitable way of addressing the user"],
  ["T13", "誤りを十分に訂正しない", "Does not correct an error clearly enough"],
  ["T14", "会話の閉じ方が曖昧", "Ends the conversation ambiguously"],
  ["T15", "不確実な内容を断定する", "States uncertain content as fact"],
  ["T16", "支える相手を取り違える", "Assumes the wrong target user"],
  ["T17", "禁止した方向へ内容がずれる", "Drifts into a prohibited direction"],
  ["T18", "提供価値と判断価値を混同する", "Confuses delivered value with decision values"],
  ["T19", "Characterの識別を取り違える", "Uses the wrong Character identity"],
  ["T20", "目的から外れた回答を続ける", "Continues responding outside the stated purpose"],
].map(([id, ja, en]) => Object.freeze({ id, symptom: Object.freeze({ ja, en }) })));

export function semanticForPath(path) {
  if (FIELD_BY_PATH.has(path)) return FIELD_BY_PATH.get(path);
  return FIELDS.find(item => String(path).startsWith(`${item.canonicalPath}.`)) || null;
}

export function localized(value, locale = "ja") { return value?.[locale] || value?.ja || ""; }

export function registryProjection() {
  return {
    registry_id: REGISTRY_ID,
    chapters: CHAPTERS,
    fields: FIELDS,
    form_path_by_canonical: FORM_PATH_BY_CANONICAL,
    tuning_items: TUNING_ITEMS,
    manual_home_by_semantic: MANUAL_HOME_BY_SEMANTIC,
    read_only_semantics: READ_ONLY_SEMANTICS,
    editable_denominator: EDITABLE_DENOMINATOR,
    effect_states: EFFECT_STATES,
    boundaries: {
      canonical_authority: "SAKU_NOT_BUILDER",
      trainer_mutates_character: false,
      occupation_to_authority: false,
      unified_v1_64_catalog: "UNDEFINED_NOT_ADOPTED_NOT_MIGRATED",
    },
  };
}
