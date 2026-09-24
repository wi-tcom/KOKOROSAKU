// Unified V1 authoring for the V1-baseline Builder.
//
// The Builder's screen model and the adopted Character model are different
// shapes. This module is the only place where they meet, and it is a declared
// contract rather than a scattering of assignments: every entry names the
// Builder field, the Canonical field, and why that pairing is legitimate.
//
// Two rules govern what may appear here.
//
//  1. A pairing is allowed only when the Canonical schema itself already names
//     the concept — `expression_semantics.first_person` for the Builder's
//     一人称, `identity.display_name` for キャラクター名. Nothing is paired to
//     preserve an old field for its own sake.
//  2. Everything else the Builder collects is listed in NON_CANONICAL_FORM_PATHS
//     and never reaches the Character. AMU runtime configuration, MACHI
//     assignment and occupation source data are authoring aids on this screen,
//     not Character content.
//
// Editing merges onto the Character that was handed in, so Canonical content
// this screen does not author — seat responsibilities, deliberation contract,
// anything a future revision adds — survives an import → edit → export round
// trip instead of being silently dropped.

import {
  UNIFIED_SCHEMA_V1,
  SEAT_FUNCTIONS,
  SEAT8_FUNCTION,
  FRONT_POST_RESOLUTION,
  INPUT_INTEGRITY_STATEMENT,
  SEAT_RESPONSIBILITIES,
  blankUnifiedCharacter,
  validateUnifiedV1,
  isUnifiedV1,
} from "../unified-v1/unified-schema-v1.mjs";

export { UNIFIED_SCHEMA_V1, validateUnifiedV1, isUnifiedV1 };

// ── the declared contract ────────────────────────────────────────────────────
// `form` is the Builder's own path, `canonical` the Unified V1 path, `basis`
// the reason the pairing is permitted. `kind` is "text" or "list".

export const AUTHORITATIVE_FIELD_MAP = Object.freeze([
  { form: "meta.name", canonical: "identity.display_name", kind: "text", basis: "Canonical names this field display_name; the Builder calls it キャラクター名." },
  { form: "meta.slug", canonical: "identity.character_id", kind: "text", basis: "Canonical character_id; the Builder's slug is the same identifier." },
  { form: "meta.version", canonical: "identity.character_revision", kind: "text", basis: "Canonical character_revision." },
  { form: "meta.field", canonical: "character_core.character_role", kind: "text", basis: "Canonical character_role; the Builder's 主な活動分野 is the role this Character holds." },
  { form: "identity.value", canonical: "purpose.primary_value", kind: "text", basis: "Canonical primary_value; the Builder's 提供価値." },
  { form: "persona_rationale.core_thesis", canonical: "purpose.summary", kind: "text", basis: "Canonical purpose.summary; the Builder's 設計の芯 is the statement of what this Character is for." },
  { form: "identity.target_users", canonical: "purpose.target_users", kind: "list", basis: "Canonical target_users, same name." },
  { form: "identity.out_of_scope", canonical: "purpose.non_goals", kind: "list", basis: "Canonical non_goals; the Builder's 対応しない領域 is the same exclusion list." },
  { form: "persona_rules.values", canonical: "character_core.values", kind: "list", basis: "Canonical character_core.values, same name." },
  { form: "identity.first_person", canonical: "expression_semantics.first_person", kind: "text", basis: "Canonical expression_semantics.first_person, same name." },
  { form: "identity.address_style", canonical: "expression_semantics.address_style", kind: "text", basis: "Canonical address_style, same name." },
  { form: "identity.age_expression", canonical: "expression_semantics.age_expression", kind: "text", basis: "Canonical age_expression, same name." },
  { form: "identity.voice", canonical: "expression_semantics.voice", kind: "text", basis: "Canonical voice, same name." },
  { form: "persona_rules.preferred_questions", canonical: "expression_semantics.preferred_questions", kind: "list", basis: "Canonical preferred_questions, same name." },
  { form: "persona_rules.uncertainty_expression", canonical: "expression_semantics.uncertainty_expression", kind: "text", basis: "Canonical uncertainty_expression, same name." },
  { form: "persona_rules.error_apology", canonical: "expression_semantics.error_correction_rule", kind: "text", basis: "Canonical error_correction_rule; the Builder's エラー時の謝罪 is that rule." },
  { form: "persona_rules.close_style", canonical: "expression_semantics.closing_rule", kind: "text", basis: "Canonical closing_rule; the Builder's 会話の閉じ方." },
  { form: "unified.interaction_tendencies.encouragement", canonical: "expression_semantics.interaction_tendencies.encouragement", kind: "text", basis: "The adopted Schema defines this optional interaction tendency." },
  { form: "unified.interaction_tendencies.rapport", canonical: "expression_semantics.interaction_tendencies.rapport", kind: "text", basis: "The adopted Schema defines this optional interaction tendency." },
  { form: "unified.interaction_tendencies.metaphor", canonical: "expression_semantics.interaction_tendencies.metaphor", kind: "text", basis: "The adopted Schema defines this optional interaction tendency." },
  { form: "unified.interaction_tendencies.scaffolding", canonical: "expression_semantics.interaction_tendencies.scaffolding", kind: "text", basis: "The adopted Schema defines this optional interaction tendency." },
  { form: "unified.appearance", canonical: "expression_semantics.presentation_intent.appearance", kind: "text", basis: "The adopted Schema defines appearance as optional presentation intent." },
]);

// Collected by the Builder, never written into the Character. AMU runtime
// configuration, MACHI assignment, occupation source data and authoring aids.
export const NON_CANONICAL_FORM_PATHS = Object.freeze([
  "meta.operation_class", "meta.operator_company", "meta.responsible_human",
  "identity.appearance",
  "persona_rules.forbidden_words", "persona_rules.memory_policy",
  "layer0", "role_source", "mission", "activity", "charback",
  "organization_participation", "saku", "_test",
]);

export const AXIS_KEYS = Object.freeze([
  "a_motif", "b_companion_domain", "c_intelligence_vector", "d_socratic_angle",
  "e_vocabulary_tone", "f_acknowledgement", "g_pulse", "h_tactile",
  "i_thinking_pause_ms", "j_theme_color", "k_whitespace_percent",
  "l_weathering_presentation", "m_error_narrative", "n_crystallization", "o_closing",
]);

// Areas the Builder screen authors directly in Canonical shape, because the V1
// form had no equivalent to translate from.
export function blankUnifiedExtras() {
  return {
    work_modes: [],
    interaction_tendencies: { encouragement: "", rapport: "", metaphor: "", scaffolding: "" },
    appearance: "",
    allowed_variation: [],
    prohibited_drift: [],
    hard_invariants: [],
    human_handoff_conditions: [],
    axes: Object.fromEntries(AXIS_KEYS.map(key => [key, ""])),
    seat8_expected_human_contribution: [],
    seat8_handoff_question_requirements: [],
    seat8_handoff_material_requirements: [],
    must_preserve_refs: [],
    prohibited_drift_refs: [],
    continuity_refs: [],
  };
}

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function getPath(source, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), source);
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let node = target;
  for (const key of parts.slice(0, -1)) {
    if (node[key] == null || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

const asList = value => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  const text = String(value == null ? "" : value).trim();
  if (!text) return [];
  return text.split(/[\n,、]/).map(item => item.trim()).filter(Boolean);
};

// A revision the Owner can tell apart from the one they opened. Editing never
// writes over the source Character; it produces the next revision of it.
export function nextRevision(current) {
  const text = String(current || "").trim();
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(text);
  if (!match) return text ? `${text}+1` : "0.1.0-draft";
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}

/**
 * Assemble the Unified V1 Character.
 *
 * `base` is the Character this edit started from, so Canonical content the
 * Builder does not author is carried through rather than lost. For a new
 * Character it is the blank Unified V1 skeleton.
 */
export function toUnifiedCharacter(form, base = null, options = {}) {
  const character = base && isUnifiedV1(base) ? clone(base) : blankUnifiedCharacter();
  character.schema = { schema_id: UNIFIED_SCHEMA_V1.schema_id, schema_version: UNIFIED_SCHEMA_V1.schema_version };

  for (const entry of AUTHORITATIVE_FIELD_MAP) {
    const raw = getPath(form, entry.form);
    if (entry.kind === "list") {
      const list = asList(raw);
      // An empty optional list is left as the base had it rather than being
      // written as an empty array the schema would reject.
      if (list.length) setPath(character, entry.canonical, list);
      else if (getPath(character, entry.canonical) === undefined) { /* leave unset */ }
      else if (Array.isArray(getPath(character, entry.canonical)) && !base) setPath(character, entry.canonical, []);
      continue;
    }
    const text = String(raw == null ? "" : raw).trim();
    if (text) setPath(character, entry.canonical, text);
  }

  const extras = (form && form.unified) || {};
  const core = character.character_core;
  core.role_kind = "CHARACTER_ROLE";

  const workModes = asList(extras.work_modes);
  if (workModes.length) character.purpose.work_modes = workModes;

  const allowed = asList(extras.allowed_variation);
  const prohibited = asList(extras.prohibited_drift);
  core.expressive_range = {
    allowed_variation: allowed.length ? allowed : (core.expressive_range?.allowed_variation || []),
    prohibited_drift: prohibited.length ? prohibited : (core.expressive_range?.prohibited_drift || []),
  };

  // Input Integrity is a Character-level invariant, not a preference. It is
  // always present and is never sourced from the form.
  //
  // Order matters: conformance_expectations and Seat 8 reference these rows by
  // index (`/character_core/hard_invariants/N`). Until 2026-09-22 this list was
  // rebuilt with Input Integrity first, which silently moved every other row
  // and left the locators pointing at the wrong invariant; the locator check
  // (PR #30) then refused an unchanged save. The base order is now kept: rows
  // the author edited are updated in place, rows the base had stay where they
  // were, new rows go to the end, and Input Integrity is inserted first only
  // for a Character that never had it.
  const authored = (Array.isArray(extras.hard_invariants) ? extras.hard_invariants : [])
    .map(item => (typeof item === "string"
      ? { id: `INV-${item.slice(0, 24).replace(/[^A-Za-z0-9._:-]/g, "-") || "AUTHORED"}`, statement: item }
      : { id: String(item?.id || "INV-AUTHORED"), statement: String(item?.statement || "") }))
    .filter(item => item.statement.trim());
  const authoredById = new Map(authored.map(item => [item.id, item]));
  const invariants = [];
  for (const item of base ? (base.character_core?.hard_invariants || []) : []) {
    if (item.id === "INV-INPUT-INTEGRITY") invariants.push({ id: "INV-INPUT-INTEGRITY", statement: INPUT_INTEGRITY_STATEMENT });
    else if (authoredById.has(item.id)) { invariants.push(authoredById.get(item.id)); authoredById.delete(item.id); }
    else invariants.push({ id: item.id, statement: item.statement });
  }
  if (!invariants.some(item => item.id === "INV-INPUT-INTEGRITY")) invariants.unshift({ id: "INV-INPUT-INTEGRITY", statement: INPUT_INTEGRITY_STATEMENT });
  for (const item of authored) if (authoredById.has(item.id)) { invariants.push(item); authoredById.delete(item.id); }
  core.hard_invariants = invariants;

  const handoffSource = Array.isArray(extras.human_handoff_conditions) ? extras.human_handoff_conditions : [];
  const explicitHandoffIds = new Set(handoffSource.filter(item => item && typeof item === "object" && item.seat8_required)
    .map((item, index) => String(item.id || `HANDOFF-${index + 1}`)));
  const handoff = handoffSource
    .map((item, index) => (typeof item === "string"
      ? { id: `HANDOFF-${index + 1}`, reason_class: "JUDGMENT_REQUIRED", trigger: item, boundary_statement: item, action: "HANDOFF_TO_HUMAN" }
      : {
          id: String(item?.id || `HANDOFF-${index + 1}`),
          reason_class: String(item?.reason_class || "JUDGMENT_REQUIRED"),
          trigger: String(item?.trigger || ""),
          boundary_statement: String(item?.boundary_statement || item?.trigger || ""),
          action: "HANDOFF_TO_HUMAN",
        }))
    .filter(item => item.trigger.trim());
  if (handoff.length) core.human_handoff_conditions = handoff;

  const composition = character.assistant_composition;
  composition.profile_version = composition.profile_version || "v1";
  composition.front_post_resolution = FRONT_POST_RESOLUTION;
  for (const [seat, fn] of Object.entries(SEAT_FUNCTIONS)) {
    // Closed seat bodies: seats 2-6 take the function alone, seats 1 and 7 take
    // their fixed responsibility lists. Anything else is not a valid Character.
    const body = { ...(composition[seat] || {}), function: fn };
    if (SEAT_RESPONSIBILITIES[seat]) body.responsibilities = [...SEAT_RESPONSIBILITIES[seat]];
    else delete body.responsibilities;
    composition[seat] = body;
  }
  const seat8 = { ...(composition.seat8 || {}), function: SEAT8_FUNCTION };
  const contribution = asList(extras.seat8_expected_human_contribution);
  if (contribution.length) seat8.expected_human_contribution = contribution;
  else if (!seat8.expected_human_contribution) seat8.expected_human_contribution = [];
  const questions = asList(extras.seat8_handoff_question_requirements);
  if (questions.length) seat8.handoff_question_requirements = questions;
  else if (!seat8.handoff_question_requirements) seat8.handoff_question_requirements = [];
  const materials = asList(extras.seat8_handoff_material_requirements);
  if (materials.length) seat8.handoff_material_requirements = materials;
  else if (!seat8.handoff_material_requirements) seat8.handoff_material_requirements = [];
  // A Seat 8 reference is created only when the author explicitly marks that
  // handoff row as related.  It is never inferred from similar prose. A
  // reference the base already carried keeps its locator (recomputed below).
  const baseSeat8Refs = base?.assistant_composition?.seat8?.human_required_condition_refs || [];
  seat8.human_required_condition_refs = [...explicitHandoffIds].map(requirement_id => {
    const previous = baseSeat8Refs.find(ref => ref && ref.requirement_id === requirement_id);
    return previous && typeof previous === "object" && "locator" in previous ? { requirement_id, locator: previous.locator } : { requirement_id };
  });
  composition.seat8 = seat8;

  const axes = { ...(character.personality_axes || {}) };
  for (const key of AXIS_KEYS) {
    const value = extras.axes ? extras.axes[key] : undefined;
    if (value === undefined || value === null || String(value).trim() === "") continue;
    axes[key] = (key === "i_thinking_pause_ms" || key === "k_whitespace_percent") ? Number(value) : String(value);
  }
  character.personality_axes = axes;

  const conformance = character.conformance_expectations || {};
  for (const [key, source] of [["must_preserve_refs", extras.must_preserve_refs], ["prohibited_drift_refs", extras.prohibited_drift_refs], ["continuity_refs", extras.continuity_refs]]) {
    // A ref the base already carried is kept exactly as it was (with or
    // without a locator) so an unchanged save stays byte-identical. A ref the
    // author added on this screen (U3: by ticking a row) has no locator yet and
    // is marked for generation below — nobody types a locator.
    const baseRefs = Array.isArray(base?.conformance_expectations?.[key]) ? base.conformance_expectations[key] : [];
    const list = (Array.isArray(source) ? source : asList(source)).map(item => {
      if (item && typeof item === "object") return { requirement_id: String(item.requirement_id || "").trim(), ...(String(item.locator || "").trim() ? { locator: String(item.locator).trim() } : {}) };
      return { requirement_id: String(item || "").trim() };
    }).filter(item => item.requirement_id).map(item => {
      if ("locator" in item) return item;
      const previous = baseRefs.find(ref => ref && ref.requirement_id === item.requirement_id);
      if (previous) return "locator" in previous ? { requirement_id: item.requirement_id, locator: previous.locator } : item;
      return { requirement_id: item.requirement_id, locator: LOCATOR_PENDING };
    });
    if (list.length) conformance[key] = list;
    else if (!Array.isArray(conformance[key])) conformance[key] = [];
  }
  character.conformance_expectations = conformance;

  // Locators are index-based and the arrays above may have moved: every ref
  // that carries a locator is re-pointed by id (ids are stable), so the saved
  // Character satisfies "locator resolves to requirement_id" by construction.
  // New refs (LOCATOR_PENDING) receive their locator here; one whose id is on
  // no row is left without a locator and the validator says so.
  relocateRequirementRefs(character);
  for (const list of Object.values(character.conformance_expectations)) for (const ref of Array.isArray(list) ? list : []) if (ref && ref.locator === LOCATOR_PENDING) delete ref.locator;

  if (options.bumpRevision) {
    character.identity.character_revision = nextRevision(base?.identity?.character_revision || character.identity.character_revision);
  }
  return character;
}

/**
 * Re-point every `{ requirement_id, locator }` under conformance_expectations
 * and Seat 8 at the array element that carries that id (hard_invariants, then
 * human_handoff_conditions). Refs without a locator are left alone; refs whose
 * id is not found keep their locator (a pending "" marker is removed by the
 * caller). Returns the number of locators rewritten.
 */
/** Marker for a reference added on the edit screen whose locator is generated at save. */
export const LOCATOR_PENDING = "";

export function relocateRequirementRefs(character) {
  const core = character?.character_core || {};
  const indexOf = (list, id) => (Array.isArray(list) ? list.findIndex(item => item && item.id === id) : -1);
  let rewritten = 0;
  const relocate = refs => {
    if (!Array.isArray(refs)) return;
    for (const ref of refs) {
      if (!ref || typeof ref !== "object" || !("locator" in ref)) continue;
      let locator = null;
      const invariant = indexOf(core.hard_invariants, ref.requirement_id);
      if (invariant >= 0) locator = `/character_core/hard_invariants/${invariant}`;
      else { const handoff = indexOf(core.human_handoff_conditions, ref.requirement_id); if (handoff >= 0) locator = `/character_core/human_handoff_conditions/${handoff}`; }
      if (locator !== null && ref.locator !== locator) { ref.locator = locator; rewritten += 1; }
    }
  };
  for (const list of Object.values(character?.conformance_expectations || {})) relocate(list);
  relocate(character?.assistant_composition?.seat8?.human_required_condition_refs);
  return rewritten;
}

/**
 * The reverse direction: fill the Builder's fields from a Unified V1 Character.
 * Editing an existing Character must show that Character, not an empty form.
 */
export function fromUnifiedCharacter(character) {
  const form = {};
  for (const entry of AUTHORITATIVE_FIELD_MAP) {
    const value = getPath(character, entry.canonical);
    if (value === undefined || value === null) continue;
    setPath(form, entry.form, entry.kind === "list" ? (Array.isArray(value) ? value.slice() : asList(value)) : String(value));
  }
  const core = character?.character_core || {};
  const composition = character?.assistant_composition || {};
  const seat8 = composition.seat8 || {};
  const conformance = character?.conformance_expectations || {};
  form.unified = {
    work_modes: (character?.purpose?.work_modes || []).slice(),
    allowed_variation: (core.expressive_range?.allowed_variation || []).slice(),
    prohibited_drift: (core.expressive_range?.prohibited_drift || []).slice(),
    // The Input Integrity invariant is shown as held, not as an editable row.
    hard_invariants: (core.hard_invariants || []).filter(item => item.id !== "INV-INPUT-INTEGRITY").map(item => ({ id: item.id, statement: item.statement })),
    human_handoff_conditions: (core.human_handoff_conditions || []).map(item => ({ id: item.id, reason_class: item.reason_class, trigger: item.trigger, boundary_statement: item.boundary_statement, seat8_required: (seat8.human_required_condition_refs || []).some(ref => ref.requirement_id === item.id) })),
    axes: Object.fromEntries(AXIS_KEYS.map(key => [key, character?.personality_axes?.[key] ?? ""])),
    seat8_expected_human_contribution: asList(seat8.expected_human_contribution),
    seat8_handoff_question_requirements: asList(seat8.handoff_question_requirements),
    seat8_handoff_material_requirements: asList(seat8.handoff_material_requirements),
    must_preserve_refs: clone(conformance.must_preserve_refs || []),
    prohibited_drift_refs: clone(conformance.prohibited_drift_refs || []),
    continuity_refs: clone(conformance.continuity_refs || []),
  };
  return form;
}

/** The generic prompt, derived from the Character rather than from the screen. */
export function unifiedPrompt(character) {
  const identity = character?.identity || {};
  const purpose = character?.purpose || {};
  const core = character?.character_core || {};
  const expression = character?.expression_semantics || {};
  const axes = character?.personality_axes || {};
  const seat8 = character?.assistant_composition?.seat8 || {};
  const lines = [];
  const push = (label, value) => { if (value !== undefined && value !== null && String(value).trim()) lines.push(`${label}: ${value}`); };
  const pushList = (label, list) => { if (Array.isArray(list) && list.length) lines.push(`${label}: ${list.join(" / ")}`); };

  lines.push("# SAKU Character");
  push("name", identity.display_name);
  push("id", identity.character_id);
  push("revision", identity.character_revision);
  lines.push("");
  lines.push("## purpose");
  push("summary", purpose.summary);
  push("primary value", purpose.primary_value);
  pushList("work modes", purpose.work_modes);
  pushList("target users", purpose.target_users);
  pushList("non-goals", purpose.non_goals);
  lines.push("");
  lines.push("## core");
  push("role", core.character_role);
  pushList("values", core.values);
  for (const invariant of core.hard_invariants || []) lines.push(`hard invariant (${invariant.id}): ${invariant.statement}`);
  pushList("allowed variation", core.expressive_range?.allowed_variation);
  pushList("prohibited drift", core.expressive_range?.prohibited_drift);
  lines.push("");
  lines.push("## expression");
  for (const [key, label] of [["first_person", "first person"], ["address_style", "address style"], ["age_expression", "age expression"], ["voice", "voice"], ["uncertainty_expression", "uncertainty"], ["error_correction_rule", "error correction"], ["closing_rule", "closing"]]) {
    push(label, expression[key]);
  }
  pushList("preferred questions", expression.preferred_questions);
  lines.push("");
  lines.push("## human handoff");
  lines.push("Seat 8 is a human. An assistant seat never fills it.");
  pushList("expected human contribution", seat8.expected_human_contribution);
  for (const condition of core.human_handoff_conditions || []) lines.push(`handoff (${condition.id}): ${condition.trigger} -> ${condition.boundary_statement}`);
  lines.push("");
  lines.push("## personality axes");
  for (const key of AXIS_KEYS) push(key, axes[key]);
  lines.push("");
  lines.push("## boundaries");
  lines.push("This prompt is authoring output. It is not Canonical, not an Authority, and not an approval.");
  return lines.join("\n");
}
