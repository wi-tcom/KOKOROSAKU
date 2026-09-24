// SAKU_UNIFIED_SCHEMA_V1 — the sole active Character schema.
//
// Adopted in the Canonical repository, not decided here:
//
//   repository  wi-tcom/-SAKU-1-7-Character-System
//   main        c442a1a04e876dc7d0a6941b500ce7b1ff94bf0c
//   schema      schema/adopted/unified-v1/saku-unified-character.v1.schema.json
//   sha256      48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817
//   adoption    governance/canonical-adoptions/SAKU_UNIFIED_SCHEMA_V1.json
//               owner_schema_adoption_decision = ADOPT
//               active_schema.role = SOLE_ACTIVE_SAKU_CHARACTER_SCHEMA
//
// D-13 records this exact digest as the sole active schema. The artifact's
// embedded candidate lifecycle labels are historical source metadata and do
// not override the adoption record.
//
// Three field families, from the adopted field-classification-metadata
// (sha256 ae505ad0b6dc70c16ea274a13beb19cc55484d4ba96224c74d6bd7ac9e1378fb):
//
//   CHARACTER_CANONICAL            [SAKU]      the Owner authors it here
//   DEFINITION_TO_RUNTIME_BINDING  [AMU]       SAKU defines it, AMU binds it
//   DEFINITION_TO_RUNTIME_CONTROL  [AMU]       SAKU defines it, AMU runs it
//   RESERVED_RESEARCH_EXTENSION    [RESERVED]  defined, not used
//
// The classification is display and metadata. It is never a value: writing
// "AMU Parameter" or "Reserved" into a Character field is prohibited by the
// metadata itself, and `sentinelViolations` finds any that appear.

export const UNIFIED_SCHEMA_V1 = {
  identity: "SAKU_UNIFIED_SCHEMA_V1",
  // The adopted schema fixes both as consts; they are read from it, not chosen.
  schema_id: "SAKU_UNIFIED_CHARACTER_SCHEMA_FROZEN_CANDIDATE",
  schema_version: "final-delta-recovery-closure-2026-09-04",
  role: "SOLE_ACTIVE_SAKU_CHARACTER_SCHEMA",
  canonical: {
    repository: "wi-tcom/-SAKU-1-7-Character-System",
    revision: "c442a1a04e876dc7d0a6941b500ce7b1ff94bf0c",
    path: "schema/adopted/unified-v1/saku-unified-character.v1.schema.json",
    sha256: "48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817",
    decision_id: "D-13",
    adoption_record_sha256: "15e09ae00dcae3cabf2396465f9fef7b37c09b94ff98cfaac034d28e3363a373",
    field_classification_sha256: "ae505ad0b6dc70c16ea274a13beb19cc55484d4ba96224c74d6bd7ac9e1378fb",
    extension_sha256: "2069021745e9ad98afc84e7dacdb0404c0993f3fcad4147590059764b3170b1b",
  },
  // Required top-level members, from the adopted schema's own `required`.
  required: ["schema", "identity", "purpose", "character_core", "assistant_composition", "personality_axes", "conformance_expectations"],
  optional: ["expression_semantics", "extensions"],
};

// Legacy status, from the adoption record's status_transitions. Neither is an
// authoring target any more, and neither is migrated automatically.
export const LEGACY_STATUS = {
  V1_CHARACTER: "MIGRATION_SOURCE_ONLY",
  LEGACY_SCHEMA_CHARACTER: "NOT_ACTIVE_SCHEMA",
};

export const CLASSIFICATION = {
  CHARACTER_CANONICAL: { badge: "SAKU", editable: true, prompt_effective: true, runtime_enforced: true, label_ja: "Characterとして設定する内容", label_en: "Set on the Character" },
  DEFINITION_TO_RUNTIME_BINDING: { badge: "AMU", editable: false, prompt_effective: false, runtime_enforced: false, label_ja: "AMUで設定する内容", label_en: "Set in AMU" },
  DEFINITION_TO_RUNTIME_CONTROL: { badge: "AMU", editable: false, prompt_effective: false, runtime_enforced: false, label_ja: "AMUで設定する内容", label_en: "Set in AMU" },
  RESERVED_RESEARCH_EXTENSION: { badge: "RESERVED", editable: false, prompt_effective: false, runtime_enforced: false, label_ja: "現在は使用しない", label_en: "Not used at present" },
};

// From the adopted metadata's `assignments`.
export const FIELD_FAMILIES = {
  CHARACTER_CANONICAL: ["schema", "identity", "purpose", "character_core", "expression_semantics", "assistant_composition", "personality_axes", "conformance_expectations"],
  DEFINITION_TO_RUNTIME_BINDING: ["character_core.human_handoff_conditions", "assistant_composition.seat8.logical_human_boundary", "binding_manifest_contract"],
  DEFINITION_TO_RUNTIME_CONTROL: ["internal_consistency_control"],
  RESERVED_RESEARCH_EXTENSION: ["professional_reasoning", "ten_d", "opaque_extension", "legacy_extensionPoints"],
};

// Values that must never be stored in a Character, named by the metadata.
export const PROHIBITED_VALUE_TOKENS = ["AMU Parameter", "Reserved"];

// The fixed 1+7 topology, as consts in the adopted schema. Seat 7 is the persona
// guard and seat 8 is the single logical human; neither is optional and no
// forward-driver seat exists.
export const SEAT_FUNCTIONS = {
  seat1: "FRONT_CHARACTER",
  seat2: "SPECIALIST_ASSISTANT",
  seat3: "FACT_SOURCE_CHECK_ASSISTANT",
  seat4: "SAFETY_RISK_PRIVACY_ASSISTANT",
  seat5: "USER_VIEWPOINT_ASSISTANT",
  seat6: "RED_TEAM_ASSISTANT",
  seat7: "PERSONA_BRAND_GUARD_ASSISTANT",
};
export const SEAT8_FUNCTION = "LOGICAL_HUMAN_ASSISTANT";
export const FRONT_POST_RESOLUTION = "AFTER_CONSTRAINTS_AND_UNRESOLVED_BLOCKERS_ARE_SETTLED_IDENTIFY_BEST_ALLOWED_NEXT_ACTION";
export const ONE_VOICE_CONTRACT = Object.freeze({
  external_speaker: "FRONT_CHARACTER_ONLY",
  internal_assistant_direct_external_speech: "PROHIBITED",
  internal_deliberation_exposure: "PROHIBITED",
  ai_use_and_operator_misrepresentation: "PROHIBITED",
});
export const DELIBERATION_CONTRACT = Object.freeze({
  max_rounds: 3,
  round_sequence: ["INDEPENDENT_ASSISTANT_ANALYSIS", "COMPARE_EVIDENCE_DISAGREEMENT_RISK_ALTERNATIVES", "FINAL_ASSISTANT_STATE"],
  assistant_state_vocabulary: ["SUPPORT", "ACCEPT", "ABSTAIN", "CONCERN", "BLOCK"],
  stop_can_be_raised_independently: true,
  progress_requires_resolution: true,
  unresolved_is_valid_result: true,
  human_required_cannot_be_filled_by_ai: true,
  unresolved_outcome: "UNRESOLVED",
  retained_record_schema_ref: "#/$defs/deliberationFinding",
  full_chain_of_thought_persistence_required: false,
});

// Actual runtime values the Character must never carry, from the metadata's
// `actual_values_excluded_from_character`. A real human belongs in AMU.
export const RUNTIME_VALUE_KEYS = [
  "real_human_identity", "credential", "mandate", "endpoint", "routing",
  "active_assignment", "approval_state", "human_binding_runtime",
];

// Removed by the adoption; not authoring fields and not to be revived.
export const REMOVED_LEGACY_FIELDS = [
  "assistant_composition.seat1-7.archetype",
  "assistant_composition.seat1-7.intensity",
  "assistant_composition.front_control",
  "professional_reasoning",
];

// Internal Consistency: defined by the schema, held at runtime. Displayable,
// never presented as an available runtime feature and never turned on here.
export const INTERNAL_CONSISTENCY = {
  classification: "DEFINITION_TO_RUNTIME_CONTROL",
  badge: "AMU",
  schema_support: "YES",
  runtime_status: "HOLD_NOT_CONFORMING",
  runtime_activation: "PROHIBITED_UNTIL_FUTURE_CONFORMANCE_PASS",
  saku_runtime_value: "NONE",
  recommend_as_available_runtime_feature: false,
};

export function badgeFor(classification) {
  return (CLASSIFICATION[classification] || CLASSIFICATION.RESERVED_RESEARCH_EXTENSION).badge;
}

/** Does this Character declare the adopted schema? Declaration only, never shape. */
export function isUnifiedV1(character) {
  const schema = character && character.schema;
  if (!schema || typeof schema !== "object") return false;
  return String(schema.schema_id || "").trim() === UNIFIED_SCHEMA_V1.schema_id
    && String(schema.schema_version || "").trim() === UNIFIED_SCHEMA_V1.schema_version;
}

/**
 * Structural validation against the adopted schema's required members.
 *
 * This is not a JSON Schema engine: it checks the contract the Builder must not
 * break — required members present, the fixed 1+7 topology with seat8 human,
 * fifteen axes, and none of the removed legacy tuning fields revived.
 */
export function validateUnifiedV1(character) {
  const errors = [];
  if (!isUnifiedV1(character)) errors.push(`schema must declare ${UNIFIED_SCHEMA_V1.schema_id} ${UNIFIED_SCHEMA_V1.schema_version}`);
  for (const key of UNIFIED_SCHEMA_V1.required) {
    if (key === "schema") continue;
    if (!character || character[key] === undefined || character[key] === null) errors.push(`${key} is missing`);
  }
  const identity = (character && character.identity) || {};
  for (const key of ["character_id", "character_revision", "display_name"]) {
    if (!String(identity[key] || "").trim()) errors.push(`identity.${key} is empty`);
  }
  const composition = (character && character.assistant_composition) || {};
  for (let seat = 1; seat <= 8; seat += 1) {
    if (!composition[`seat${seat}`]) errors.push(`assistant_composition.seat${seat} is missing`);
  }
  for (const [seat, fn] of Object.entries(SEAT_FUNCTIONS)) {
    const body = composition[seat];
    if (body && String(body.function || "") !== fn) errors.push(`${seat} must be ${fn}, found ${body.function}`);
  }
  const seat8 = composition.seat8 || {};
  if (composition.seat8) {
    if (String(seat8.function || "") !== SEAT8_FUNCTION) errors.push(`seat8 must be ${SEAT8_FUNCTION}, found ${seat8.function}`);
    if (!String(seat8.expected_human_contribution || "").trim()) errors.push("seat8 must state the expected human contribution");
  }
  const axes = (character && character.personality_axes) || {};
  const axisKeys = ["a_motif", "b_companion_domain", "c_intelligence_vector", "d_socratic_angle", "e_vocabulary_tone", "f_acknowledgement", "g_pulse", "h_tactile", "i_thinking_pause_ms", "j_theme_color", "k_whitespace_percent", "l_weathering_presentation", "m_error_narrative", "n_crystallization", "o_closing"];
  const missingAxes = axisKeys.filter(key => axes[key] === undefined || axes[key] === null || axes[key] === "");
  if (missingAxes.length) errors.push(`personality_axes missing: ${missingAxes.join(", ")}`);
  // Input Integrity must be present as a Character-level hard invariant.
  if (!hasInputIntegrityInvariant(character)) errors.push("character_core.hard_invariants must carry the Input Integrity invariant (REQUIRED_INPUT != AI_GENERATED_SUBSTITUTE)");
  errors.push(...revivedLegacyFields(character));
  errors.push(...sentinelViolations(character).map(item => `prohibited value "${item.token}" at ${item.path}`));
  return { ok: errors.length === 0, errors };
}

export const INPUT_INTEGRITY_STATEMENT = "REQUIRED_INPUT != AI_GENERATED_SUBSTITUTE";

export function hasInputIntegrityInvariant(character) {
  const list = ((character && character.character_core) || {}).hard_invariants || [];
  return list.some(item => String((item && item.statement) || item || "").includes(INPUT_INTEGRITY_STATEMENT));
}

/** Removed legacy tuning fields must not reappear as authoring fields. */
export function revivedLegacyFields(character) {
  const found = [];
  const composition = (character && character.assistant_composition) || {};
  for (let seat = 1; seat <= 7; seat += 1) {
    const body = composition[`seat${seat}`] || {};
    if ("archetype" in body) found.push(`assistant_composition.seat${seat}.archetype is a removed field`);
    if ("intensity" in body) found.push(`assistant_composition.seat${seat}.intensity is a removed field`);
  }
  if ("front_control" in composition) found.push("assistant_composition.front_control is a removed field");
  if (character && "professional_reasoning" in character) found.push("professional_reasoning is not an active schema field");
  return found;
}

/**
 * Any classification token stored as a value. `[SAKU]` / `[AMU]` / `[RESERVED]`
 * are display labels; a Character that carries one as data has confused the two.
 */
export function sentinelViolations(character) {
  const found = [];
  const walk = (node, path) => {
    if (typeof node === "string") {
      for (const token of PROHIBITED_VALUE_TOKENS) if (node.trim() === token) found.push({ path, token });
      return;
    }
    if (Array.isArray(node)) { node.forEach((item, index) => walk(item, `${path}[${index}]`)); return; }
    if (node && typeof node === "object") { for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key); }
  };
  walk(character, "");
  return found;
}

// ── conformance_expectations locator resolution ─────────────────────────────
//
// Every `*_refs[]` entry names a requirement by `requirement_id` and may carry a
// `locator`, a JSON Pointer (RFC 6901) into the same Character. The schema says
// what the locator is for: "requirement_id is normative identity; locator is
// optional convenience only. Resolution or locator mismatch fails closed."
// Until 2026-09-21 nothing here resolved it — a locator pointing at the wrong
// invariant passed as long as it was a well-formed string, and four individually
// generated Characters shipped with their hard_invariants locators swapped.
// The check below resolves each locator and refuses the Character unless the
// object it lands on carries `id === requirement_id`. An unresolvable locator
// is a mismatch too, never a pass.

export const LOCATOR_MISMATCH_CODE = "CONFORMANCE_LOCATOR_MISMATCH";

/**
 * Resolve an RFC 6901 JSON Pointer against a document.
 * Returns { ok: true, value } or { ok: false, reason }. "" is the whole document.
 */
export function resolveJsonPointer(document, pointer) {
  if (typeof pointer !== "string") return { ok: false, reason: "locator is not a string" };
  if (pointer === "") return { ok: true, value: document };
  if (!pointer.startsWith("/")) return { ok: false, reason: "locator does not start with /" };
  let current = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return { ok: false, reason: `"${token}" is not an array index` };
      const index = Number(token);
      if (index >= current.length) return { ok: false, reason: `index ${index} is out of range (length ${current.length})` };
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return { ok: false, reason: `key "${token}" does not exist` };
      current = current[token];
    } else {
      return { ok: false, reason: `cannot descend into a ${current === null ? "null" : typeof current} at "${token}"` };
    }
  }
  return { ok: true, value: current };
}

/**
 * Every locator under conformance_expectations, resolved. Returns one record
 * per mismatch: { group, index, requirement_id, locator, resolved_id, resolvable, reason }.
 * A Character without conformance_expectations, or whose refs carry no locator,
 * yields []. Nothing is inferred from the shape: a ref with a locator is checked,
 * a ref without one is left to the requirement_id alone, exactly as the schema says.
 */
export function conformanceLocatorMismatches(character) {
  const found = [];
  const expectations = character && typeof character === "object" ? character.conformance_expectations : null;
  if (!expectations || typeof expectations !== "object" || Array.isArray(expectations)) return found;
  for (const [group, refs] of Object.entries(expectations)) {
    if (!Array.isArray(refs)) continue;
    refs.forEach((ref, index) => {
      if (!ref || typeof ref !== "object" || Array.isArray(ref) || !("locator" in ref)) return;
      const requirementId = typeof ref.requirement_id === "string" ? ref.requirement_id : null;
      const resolved = resolveJsonPointer(character, ref.locator);
      const target = resolved.ok ? resolved.value : undefined;
      const resolvedId = target && typeof target === "object" && !Array.isArray(target) && typeof target.id === "string" ? target.id : null;
      if (!resolved.ok) {
        found.push({ group, index, requirement_id: requirementId, locator: ref.locator, resolved_id: null, resolvable: false, reason: resolved.reason });
      } else if (requirementId === null || resolvedId === null || resolvedId !== requirementId) {
        found.push({ group, index, requirement_id: requirementId, locator: ref.locator, resolved_id: resolvedId, resolvable: true, reason: resolvedId === null ? "target carries no id" : "id differs" });
      }
    });
  }
  return found;
}

/** One Japanese line per mismatch: which group[index] pointed where, and what it found there. */
export function describeLocatorMismatch(item, locale = "ja") {
  const where = `conformance_expectations.${item.group}[${item.index}]`;
  const rid = item.requirement_id === null ? "(requirement_id なし)" : item.requirement_id;
  if (locale === "en") {
    if (!item.resolvable) return `${where}: requirement_id ${rid} — locator ${JSON.stringify(item.locator)} does not resolve (${item.reason})`;
    return `${where}: requirement_id ${rid} — locator ${JSON.stringify(item.locator)} points at ${item.resolved_id === null ? "an object without id" : `id ${item.resolved_id}`}`;
  }
  if (!item.resolvable) return `${where}: requirement_id ${rid} の locator ${JSON.stringify(item.locator)} は解決できません（${item.reason}）`;
  return `${where}: requirement_id ${rid} の locator ${JSON.stringify(item.locator)} は ${item.resolved_id === null ? "id を持たない要素" : `id ${item.resolved_id}`} を指しています`;
}

/** Runtime values that belong to AMU and must not sit in a Character. */
export function runtimeValueViolations(character) {
  const found = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) { node.forEach((item, index) => walk(item, `${path}[${index}]`)); return; }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (RUNTIME_VALUE_KEYS.includes(key)) found.push({ path: path ? `${path}.${key}` : key, key });
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(character, "");
  return found;
}

/** A blank Unified V1 Character: the fixed topology, nothing invented. */
// Fixed by the Canonical schema: only seats 1 and 7 carry responsibilities, and
// their contents are consts. No other seat may carry the property at all.
export const SEAT_RESPONSIBILITIES = Object.freeze({
  seat1: Object.freeze(["QUESTION_FRAMING", "ASSISTANT_ORCHESTRATION", "FINDING_SYNTHESIS", "FINAL_EXPLANATION", "EXTERNAL_RESPONSE"]),
  seat7: Object.freeze(["PERSONA_CONSISTENCY", "VOICE_CONSISTENCY", "VALUE_CONSISTENCY", "ROLE_SCOPE_CONSISTENCY", "PROHIBITED_DRIFT", "QUALIFICATION_AUTHORITY_MISREPRESENTATION_DETECTION", "UNAUTHORIZED_PERSONA_CHANGE_DETECTION"]),
});

export function blankUnifiedCharacter() {
  const seatFunctions = SEAT_FUNCTIONS;
  const composition = { profile_version: "v1" };
  // Each seat body is closed (additionalProperties: false). Seats 2-6 carry the
  // function alone; seats 1 and 7 carry their fixed responsibility lists. Adding
  // an empty responsibilities array to every seat made the Character invalid
  // against the Canonical schema while still passing the local checks.
  for (const [seat, fn] of Object.entries(seatFunctions)) {
    composition[seat] = SEAT_RESPONSIBILITIES[seat]
      ? { function: fn, responsibilities: [...SEAT_RESPONSIBILITIES[seat]] }
      : { function: fn };
  }
  composition.seat8 = {
    function: SEAT8_FUNCTION,
    expected_human_contribution: "",
    human_required_condition_refs: [],
    handoff_question_requirements: [],
    handoff_material_requirements: [],
  };
  composition.front_post_resolution = FRONT_POST_RESOLUTION;
  composition.one_voice = JSON.parse(JSON.stringify(ONE_VOICE_CONTRACT));
  composition.deliberation = JSON.parse(JSON.stringify(DELIBERATION_CONTRACT));
  return {
    schema: { schema_id: UNIFIED_SCHEMA_V1.schema_id, schema_version: UNIFIED_SCHEMA_V1.schema_version },
    identity: { character_id: "", character_revision: "0.1.0-draft", display_name: "" },
    purpose: { summary: "", primary_value: "", work_modes: [], non_goals: [] },
    character_core: {
      role_kind: "CHARACTER_ROLE",
      character_role: "",
      values: [],
      // Input Integrity is required at Character level, so a blank Character
      // starts with it rather than acquiring it later by accident.
      hard_invariants: [{ id: "INV-INPUT-INTEGRITY", statement: INPUT_INTEGRITY_STATEMENT }],
      expressive_range: { allowed_variation: [], prohibited_drift: [] },
      human_handoff_conditions: [],
    },
    assistant_composition: composition,
    personality_axes: {},
    conformance_expectations: { must_preserve_refs: [], prohibited_drift_refs: [], continuity_refs: [] },
  };
}
