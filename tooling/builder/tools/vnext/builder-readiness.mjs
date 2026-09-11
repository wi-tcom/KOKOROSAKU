// SAKU Builder vNext — compatibility/readiness Candidate support.
// Pure deterministic functions shared by browser UI and Node verification.

export const BUILDER_VERSION = "vnext-readiness-candidate-1";

export const VALIDATION_STATUS = Object.freeze({
  INVALID: "INVALID",
  UNKNOWN: "UNKNOWN",
  UNSUPPORTED: "UNSUPPORTED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  EXTERNAL_EVIDENCE_REQUIRED: "EXTERNAL_EVIDENCE_REQUIRED",
});

export const VALIDATION_LAYER = Object.freeze({
  STRUCTURAL: "STRUCTURAL_VALIDATION",
  DETERMINISTIC: "DETERMINISTIC_CONFORMANCE",
  AUTHORING_POLICY: "AUTHORING_POLICY_CONFORMANCE",
});

export const SUPPORTED_CHARACTER = Object.freeze({
  schema_id: "saku.character",
  schema_versions: Object.freeze(["vnext-1.0"]),
});

export const CANDIDATE_FEATURES = Object.freeze({
  operational_integrity: "BLOCKED_BY_CANONICAL",
  opaque_reference_authoring: "FEATURE_GATED_CANDIDATE",
  basic_skill_tendency: "ARCHITECTURE_READY_CANDIDATE",
});

const KNOWN_TOP_LEVEL = new Set([
  "schema", "identity", "purpose", "character_core", "assistant_composition",
  "personality_axes", "professional_reasoning", "conformance", "extensions",
]);

const SECRET_KEY = /^(api[_-]?key|password|secret|secret[_-]?bytes|access[_-]?token|refresh[_-]?token|private[_-]?key|personal[_-]?memory|private[_-]?conversation|conversation[_-]?content|raw[_-]?credential)$/i;

function issue({ code, severity, status, path, reason, semantic_owner, validation_layer,
  expected_behavior, suggested_correction, ai_inference_permitted = false,
  human_decision_required = false }) {
  return { code, severity, status, path, reason, semantic_owner, validation_layer,
    expected_behavior, suggested_correction, ai_inference_permitted,
    human_decision_required };
}

export function validateBuilderCompatibility(character, options = {}) {
  const issues = [];
  const add = (v) => issues.push(issue(v));
  if (!character || typeof character !== "object" || Array.isArray(character)) {
    add({ code: "STRUCTURE_CHARACTER_OBJECT_REQUIRED", severity: "ERROR", status: VALIDATION_STATUS.INVALID,
      path: "$", reason: "Character input is not an object.", semantic_owner: "SAKU_CANONICAL",
      validation_layer: VALIDATION_LAYER.STRUCTURAL, expected_behavior: "Provide one Character object.",
      suggested_correction: "Import or author a JSON object that represents one Character." });
    return result(issues, null, null);
  }

  const schema = character.schema;
  if (!schema || typeof schema !== "object") {
    add({ code: "SCHEMA_IDENTITY_UNKNOWN", severity: "ERROR", status: VALIDATION_STATUS.UNKNOWN,
      path: "$.schema", reason: "Schema identity and version are absent.", semantic_owner: "SAKU_CANONICAL",
      validation_layer: VALIDATION_LAYER.STRUCTURAL, expected_behavior: "Declare schema_id and schema_version explicitly.",
      suggested_correction: "Resolve the authoritative schema identity; do not infer it from field shape.",
      human_decision_required: true });
  } else {
    if (typeof schema.schema_id !== "string" || !schema.schema_id) {
      add({ code: "SCHEMA_ID_UNKNOWN", severity: "ERROR", status: VALIDATION_STATUS.UNKNOWN,
        path: "$.schema.schema_id", reason: "schema_id is absent or not a string.", semantic_owner: "SAKU_CANONICAL",
        validation_layer: VALIDATION_LAYER.STRUCTURAL, expected_behavior: "Use an explicit schema identifier.",
        suggested_correction: "Obtain schema_id from the Character source or Canonical owner.", human_decision_required: true });
    } else if (schema.schema_id !== SUPPORTED_CHARACTER.schema_id) {
      add({ code: "SCHEMA_ID_UNSUPPORTED", severity: "ERROR", status: VALIDATION_STATUS.UNSUPPORTED,
        path: "$.schema.schema_id", reason: `Builder does not support schema_id ${schema.schema_id}.`, semantic_owner: "SAKU_CANONICAL",
        validation_layer: VALIDATION_LAYER.DETERMINISTIC, expected_behavior: `Use ${SUPPORTED_CHARACTER.schema_id} for this Builder.`,
        suggested_correction: "Use a compatible Builder or an explicitly reviewed migration path." });
    }
    if (typeof schema.schema_version !== "string" || !schema.schema_version) {
      add({ code: "SCHEMA_VERSION_UNKNOWN", severity: "ERROR", status: VALIDATION_STATUS.UNKNOWN,
        path: "$.schema.schema_version", reason: "schema_version is absent or not a string.", semantic_owner: "SAKU_CANONICAL",
        validation_layer: VALIDATION_LAYER.STRUCTURAL, expected_behavior: "Declare the source schema version explicitly.",
        suggested_correction: "Obtain the exact version from the Character source; do not select a likely version.", human_decision_required: true });
    } else if (!SUPPORTED_CHARACTER.schema_versions.includes(schema.schema_version)) {
      add({ code: "SCHEMA_VERSION_UNSUPPORTED", severity: "ERROR", status: VALIDATION_STATUS.UNSUPPORTED,
        path: "$.schema.schema_version", reason: `Builder has no deterministic support contract for ${schema.schema_version}.`, semantic_owner: "SAKU_CANONICAL",
        validation_layer: VALIDATION_LAYER.DETERMINISTIC, expected_behavior: `Supported versions: ${SUPPORTED_CHARACTER.schema_versions.join(", ")}.`,
        suggested_correction: "Use a compatible Builder or wait for an explicit compatibility declaration." });
    }
  }

  if (!("compatibility" in character)) {
    add({ code: "COMPATIBILITY_DECLARATION_NOT_CONFIGURED", severity: "INFO", status: VALIDATION_STATUS.NOT_CONFIGURED,
      path: "$.compatibility", reason: "No Character-level compatibility declaration is configured.", semantic_owner: "SAKU_CANONICAL",
      validation_layer: VALIDATION_LAYER.DETERMINISTIC, expected_behavior: "Absence remains distinct from compatibility approval.",
      suggested_correction: "No automatic correction. Await a Canonical compatibility contract if one is required." });
  } else {
    add({ code: "COMPATIBILITY_DECLARATION_UNSUPPORTED", severity: "WARNING", status: VALIDATION_STATUS.UNSUPPORTED,
      path: "$.compatibility", reason: "A compatibility declaration is present, but no adopted Canonical contract defines it for this Builder.", semantic_owner: "SAKU_CANONICAL",
      validation_layer: VALIDATION_LAYER.DETERMINISTIC, expected_behavior: "Treat the declaration as data, not as proof of compatibility.",
      suggested_correction: "Retain the source unchanged and request Canonical contract review.", human_decision_required: true });
  }

  for (const key of Object.keys(character)) {
    if (KNOWN_TOP_LEVEL.has(key) || key === "compatibility" || key === "provenance") continue;
    const candidate = key === "opaque_extensions" || key === "basic_skill_tendency";
    add({ code: candidate ? "CANONICAL_CANDIDATE_FIELD_UNSUPPORTED" : "UNKNOWN_TOP_LEVEL_FIELD",
      severity: "WARNING", status: VALIDATION_STATUS.UNSUPPORTED, path: `$.${key}`,
      reason: candidate ? `${key} has not been adopted into the Character Canonical contract.` : `Builder has no semantic contract for top-level field ${key}.`,
      semantic_owner: candidate ? "SAKU_CANONICAL" : "UNKNOWN",
      validation_layer: VALIDATION_LAYER.DETERMINISTIC,
      expected_behavior: "Preserve source data without assigning unsupported semantics.",
      suggested_correction: candidate ? "Keep this content in a Candidate overlay until Canonical adoption." : "Ask the field's semantic owner for a compatibility contract.",
      human_decision_required: true });
  }

  if (!("provenance" in character) && !options.provenance) {
    add({ code: "PROVENANCE_NOT_CONFIGURED", severity: "INFO", status: VALIDATION_STATUS.NOT_CONFIGURED,
      path: "$.provenance", reason: "No source provenance was supplied to the Builder session.", semantic_owner: "SOURCE_PROVIDER",
      validation_layer: VALIDATION_LAYER.AUTHORING_POLICY, expected_behavior: "Display provenance when supplied; absence must not be presented as verified origin.",
      suggested_correction: "Attach non-secret source revision/digest evidence when available." });
  }

  const ext = character.opaque_extensions;
  if (Array.isArray(ext) && ext.some((x) => x?.authenticity?.mode === "EXTENSION_ISSUER_SIGNATURE")) {
    add({ code: "EXTENSION_SIGNATURE_EXTERNAL_EVIDENCE_REQUIRED", severity: "WARNING", status: VALIDATION_STATUS.EXTERNAL_EVIDENCE_REQUIRED,
      path: "$.opaque_extensions[*].authenticity", reason: "Signature metadata does not prove cryptographic validity or issuer trust.", semantic_owner: "EXTENSION_SEMANTIC_OWNER",
      validation_layer: VALIDATION_LAYER.AUTHORING_POLICY, expected_behavior: "Keep signature validity and trusted issuer as external verification evidence.",
      suggested_correction: "Supply verifier evidence from the proper extension owner; Builder must not infer it." });
  }

  return result(issues, schema?.schema_id ?? null, schema?.schema_version ?? null);
}

function result(issues, schema_id, schema_version) {
  const counts = Object.fromEntries(Object.values(VALIDATION_STATUS).map((s) => [s, issues.filter((i) => i.status === s).length]));
  const overall = counts.INVALID ? VALIDATION_STATUS.INVALID
    : counts.UNKNOWN ? VALIDATION_STATUS.UNKNOWN
      : counts.UNSUPPORTED ? VALIDATION_STATUS.UNSUPPORTED
        : counts.EXTERNAL_EVIDENCE_REQUIRED ? VALIDATION_STATUS.EXTERNAL_EVIDENCE_REQUIRED
          : counts.NOT_CONFIGURED ? VALIDATION_STATUS.NOT_CONFIGURED : "SUPPORTED";
  return { overall, schema_id, schema_version, validation_layers: Object.values(VALIDATION_LAYER), counts, issues };
}

export function createOpaqueReferenceCandidate(input = {}) {
  const required = ["extension_id", "semantic_owner", "reference"];
  const missing = required.filter((k) => typeof input[k] !== "string" || !input[k].trim());
  if (missing.length) throw new Error(`Missing required opaque reference fields: ${missing.join(", ")}`);
  return {
    kind: "SAKU_OPAQUE_EXTENSION_AUTHORING_CANDIDATE", status: "CANDIDATE", canonical: "NO",
    feature_gate: "OPAQUE_REFERENCE_ONLY", canonical_export_included: false,
    declaration: {
      extension_id: input.extension_id.trim(), semantic_owner: input.semantic_owner.trim(),
      declared_capabilities: lines(input.declared_capabilities), may_enable: lines(input.may_enable),
      integration_mode: "OPAQUE_REFERENCE_ONLY",
      configuration_location: "EXTERNAL_EXTENSION_CONFIGURATION",
      configuration_required: Boolean(input.configuration_required),
      core_behavior_without_extension: { mode: "CORE_VALID_EXTENSION_UNAVAILABLE", description: String(input.core_behavior_description || "").trim() || undefined },
      opaque_reference: { reference: input.reference.trim(), ...(input.payload_digest ? { payload_digest: String(input.payload_digest).trim() } : {}) },
      ...(input.owner_private_hint ? { owner_private_hint: String(input.owner_private_hint) } : {}),
      authenticity: { mode: "NONE" },
    },
    interpretation_rules: { owner_private_hint: "DO_NOT_INTERPRET", runtime_availability: "NOT_CLAIMED", execution_authorization: "NOT_CLAIMED" },
  };
}

export function createBasicSkillTendencyCandidate(input = {}) {
  if (!input.skill_id || !input.label) throw new Error("skill_id and label are required");
  return { kind: "SAKU_BASIC_SKILL_TENDENCY_CANDIDATE", status: "CANDIDATE", canonical: "NO",
    feature_gate: "BASIC_SKILL_FUTURE_CANDIDATE", canonical_export_included: false,
    skill_id: String(input.skill_id).trim(), label: String(input.label).trim(), tendency: String(input.tendency || "NOT_CONFIGURED"),
    claim_scope: "DESIGN_TENDENCY_ONLY", verified_competence: "NOT_CLAIMED",
    trainer_observation: { status: "NOT_TESTED", stored_separately: true } };
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function overlay(source, edited) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return clone(edited);
  if (!edited || typeof edited !== "object" || Array.isArray(edited)) return clone(edited);
  const out = clone(source);
  for (const [key, value] of Object.entries(edited)) out[key] = overlay(source[key], value);
  return out;
}

export function preserveUnsupportedFields(source, edited, options = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return clone(edited);
  const out = overlay(source, edited);
  if (source.schema) out.schema = clone(source.schema);
  if (source.identity?.character_revision != null) out.identity.character_revision = source.identity.character_revision;
  if (source.identity?.catalog?.catalog_version != null) out.identity.catalog.catalog_version = source.identity.catalog.catalog_version;
  if (options.remove_professional_reasoning) delete out.professional_reasoning;
  if (options.remove_ten_d && out.extensions) {
    delete out.extensions.ten_d;
    if (!Object.keys(out.extensions).length) delete out.extensions;
  }
  return out;
}

function lines(value) {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function sanitized(value, key = "") {
  if (SECRET_KEY.test(key)) return "[EXCLUDED_BY_DEFAULT]";
  if (Array.isArray(value)) return value.map((v) => sanitized(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitized(v, k)]));
  return value;
}

function summarizeExtensions(character) {
  const ext = Array.isArray(character?.opaque_extensions) ? character.opaque_extensions : [];
  return ext.map((d) => ({
    extension_id: d?.extension_id ?? null, semantic_owner: d?.semantic_owner ?? null,
    declared_capabilities: Array.isArray(d?.declared_capabilities) ? d.declared_capabilities : [],
    may_enable: Array.isArray(d?.may_enable) ? d.may_enable : [],
    integration_mode: d?.integration_mode ?? null,
    opaque_reference_present: Boolean(d?.opaque_reference?.reference),
    payload_digest_present: Boolean(d?.opaque_reference?.payload_digest),
    owner_private_hint_present: Object.prototype.hasOwnProperty.call(d || {}, "owner_private_hint"),
  }));
}

export function buildSupportBundle({ character, validation, platform = "UNKNOWN", provenance = null, error_context = null, builder_version = BUILDER_VERSION } = {}) {
  const checked = validation || validateBuilderCompatibility(character, { provenance });
  return sanitized({
    builder_version, character_schema_id: checked.schema_id, character_schema_version: checked.schema_version,
    platform, validation_summary: { overall: checked.overall, counts: checked.counts, layers: checked.validation_layers },
    validation_codes: checked.issues.map((i) => i.code),
    compatibility: { supported_schema_id: SUPPORTED_CHARACTER.schema_id, supported_schema_versions: [...SUPPORTED_CHARACTER.schema_versions], result: checked.overall },
    extension_declarations: summarizeExtensions(character),
    unsupported_features: checked.issues.filter((i) => i.status === VALIDATION_STATUS.UNSUPPORTED).map((i) => ({ code: i.code, path: i.path, reason: i.reason })),
    error_context: error_context || [], provenance: provenance || { status: "NOT_CONFIGURED" },
  });
}
