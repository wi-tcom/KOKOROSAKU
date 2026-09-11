import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILDER_VERSION, VALIDATION_STATUS, VALIDATION_LAYER, SUPPORTED_CHARACTER,
  validateBuilderCompatibility, createOpaqueReferenceCandidate,
  createBasicSkillTendencyCandidate, buildSupportBundle, preserveUnsupportedFields,
} from "../tools/vnext/builder-readiness.mjs";

let passed = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}`);
}

const character = {
  schema: { schema_id: "saku.character", schema_version: "vnext-1.0" },
  identity: { character_id: "fx-readiness", character_revision: "1.0.0", display_name: "Readiness Fixture", catalog: {} },
  purpose: { summary: "fixture", primary_value: "fixture", work_modes: [], non_goals: [] },
  character_core: { character_role: "fixture", values: [], hard_invariants: [], human_handoff_conditions: [] },
  assistant_composition: {}, personality_axes: {}, conformance: {},
};

const baseJSON = JSON.stringify(character);
const base = validateBuilderCompatibility(character);
ok(base.schema_id === SUPPORTED_CHARACTER.schema_id && base.schema_version === "vnext-1.0", "schema identity/version are displayed exactly");
ok(base.overall === VALIDATION_STATUS.NOT_CONFIGURED, "absence of optional compatibility/provenance is NOT_CONFIGURED");
ok(base.counts.INVALID === 0 && base.counts.UNKNOWN === 0 && base.counts.UNSUPPORTED === 0, "supported Canonical is not collapsed into an error");
ok(base.issues.every((i) => ["code","severity","status","path","reason","semantic_owner","validation_layer","expected_behavior","suggested_correction","ai_inference_permitted","human_decision_required"].every((k) => Object.hasOwn(i, k))), "every issue has the human+AI explanation contract");
ok(base.issues.every((i) => i.ai_inference_permitted === false), "deterministic validity never permits AI inference");
ok(JSON.stringify(character) === baseJSON, "compatibility validation does not mutate Character input");

const missingSchema = validateBuilderCompatibility({ identity: {} });
ok(missingSchema.overall === VALIDATION_STATUS.UNKNOWN, "missing schema identity remains UNKNOWN");
ok(missingSchema.issues.some((i) => i.code === "SCHEMA_IDENTITY_UNKNOWN" && i.human_decision_required), "unknown schema requires resolution, not inference");

const unsupportedVersion = validateBuilderCompatibility({ ...character, schema: { schema_id: "saku.character", schema_version: "vnext-2.0" } });
ok(unsupportedVersion.overall === VALIDATION_STATUS.UNSUPPORTED, "unknown future schema version is UNSUPPORTED");
ok(unsupportedVersion.issues.some((i) => i.code === "SCHEMA_VERSION_UNSUPPORTED"), "unsupported version has a stable code");

const invalid = validateBuilderCompatibility("not-an-object");
ok(invalid.overall === VALIDATION_STATUS.INVALID, "non-object Character is INVALID");

const unknownField = validateBuilderCompatibility({ ...character, future_field: { value: 1 } }, { provenance: { source: "fixture" } });
ok(unknownField.overall === VALIDATION_STATUS.UNSUPPORTED, "unknown field is UNSUPPORTED, not INVALID");
ok(unknownField.issues.some((i) => i.code === "UNKNOWN_TOP_LEVEL_FIELD" && i.semantic_owner === "UNKNOWN"), "unknown field preserves unknown semantic owner");

const compatClaim = validateBuilderCompatibility({ ...character, compatibility: { supported: true } }, { provenance: { source: "fixture" } });
ok(compatClaim.issues.some((i) => i.code === "COMPATIBILITY_DECLARATION_UNSUPPORTED"), "unadopted compatibility declaration cannot self-authorize support");

const externalSignature = validateBuilderCompatibility({ ...character, opaque_extensions: [{ authenticity: { mode: "EXTENSION_ISSUER_SIGNATURE" } }] }, { provenance: { source: "fixture" } });
ok(externalSignature.issues.some((i) => i.status === VALIDATION_STATUS.EXTERNAL_EVIDENCE_REQUIRED), "signature claims require external verification evidence");
ok(externalSignature.issues.some((i) => i.code === "CANONICAL_CANDIDATE_FIELD_UNSUPPORTED"), "unadopted opaque_extensions field remains UNSUPPORTED");

const opaque = createOpaqueReferenceCandidate({
  extension_id: "amu.example", semantic_owner: "AMU", reference: "urn:amu:opaque:example",
  declared_capabilities: "context_support\ncase_assistance", may_enable: "guided_session",
  configuration_required: true, owner_private_hint: "opaque-selector-value",
});
ok(opaque.status === "CANDIDATE" && opaque.canonical === "NO", "opaque authoring output is explicitly non-Canonical Candidate");
ok(opaque.feature_gate === "OPAQUE_REFERENCE_ONLY" && opaque.declaration.authenticity.mode === "NONE", "only OPAQUE_REFERENCE_ONLY is authored");
ok(opaque.canonical_export_included === false, "opaque Candidate is excluded from Character Canonical export");
ok(opaque.declaration.core_behavior_without_extension.mode === "CORE_VALID_EXTENSION_UNAVAILABLE", "Core remains valid without extension");
ok(opaque.interpretation_rules.owner_private_hint === "DO_NOT_INTERPRET", "owner_private_hint is not interpreted");
ok(!JSON.stringify(opaque).match(/signature_valid|trusted_issuer|entitlement|approval/i), "opaque authoring makes no signature/trust/entitlement/Approval claim");
let opaqueRejected = false;
try { createOpaqueReferenceCandidate({ extension_id: "x" }); } catch (error) { opaqueRejected = /Missing required/.test(error.message); }
ok(opaqueRejected, "required opaque fields fail closed");

const skill = createBasicSkillTendencyCandidate({ skill_id: "summarization", label: "Summarization", tendency: "FREQUENT" });
ok(skill.claim_scope === "DESIGN_TENDENCY_ONLY" && skill.verified_competence === "NOT_CLAIMED", "Basic Skill is design tendency, not verified competence");
ok(skill.trainer_observation.status === "NOT_TESTED" && skill.trainer_observation.stored_separately, "Trainer observation remains separate");
ok(skill.canonical_export_included === false && skill.canonical === "NO", "Basic Skill Candidate is excluded from Canonical export");

const supportInput = { ...character, api_key: "must-not-leak" };
const supportValidation = validateBuilderCompatibility(supportInput, { provenance: { source: "fixture" } });
const bundle = buildSupportBundle({
  character: supportInput, validation: supportValidation, platform: "test-platform",
  provenance: { source: "fixture", source_revision: "abc", password: "must-not-leak" },
  error_context: { note: "safe", private_conversation: "must-not-leak", nested: { access_token: "must-not-leak" } },
});
const bundleText = JSON.stringify(bundle);
ok(bundle.builder_version === BUILDER_VERSION && bundle.platform === "test-platform", "support bundle identifies Builder and platform");
ok(bundle.character_schema_id === "saku.character" && bundle.character_schema_version === "vnext-1.0", "support bundle exposes schema identity/version");
ok(bundle.validation_summary.layers.includes(VALIDATION_LAYER.STRUCTURAL) && bundle.validation_codes.length > 0, "support bundle exposes layers and stable codes");
ok(Array.isArray(bundle.unsupported_features) && bundle.unsupported_features.some((f) => f.path === "$.api_key"), "unsupported fields are explained without generic ERROR");
ok(!bundleText.includes("must-not-leak") && bundleText.includes("[EXCLUDED_BY_DEFAULT]"), "secret/private values are excluded by default");
ok(!Object.hasOwn(bundle, "character"), "support bundle excludes full Character and personal memory by design");

const declaredCharacter = { ...character, opaque_extensions: [{
  extension_id: "amu.example", semantic_owner: "AMU", declared_capabilities: ["context_support"], may_enable: ["guided_session"],
  integration_mode: "OPAQUE_REFERENCE_ONLY", opaque_reference: { reference: "urn:amu:opaque:example", payload_digest: "abc" },
  owner_private_hint: "do-not-export-this-value",
}] };
const extBundle = buildSupportBundle({ character: declaredCharacter, provenance: { source: "fixture" } });
ok(extBundle.extension_declarations[0].owner_private_hint_present === true, "support bundle reports opaque hint presence only");
ok(!JSON.stringify(extBundle).includes("do-not-export-this-value"), "support bundle never exports owner_private_hint value");
ok(extBundle.extension_declarations[0].opaque_reference_present === true, "support bundle reports extension reference presence without payload semantics");

const repeat = buildSupportBundle({ character, platform: "test-platform", provenance: { source: "fixture" } });
ok(JSON.stringify(repeat) === JSON.stringify(buildSupportBundle({ character, platform: "test-platform", provenance: { source: "fixture" } })), "deterministic inputs produce deterministic support bundle");
ok(new Set(Object.values(VALIDATION_STATUS)).size === 5, "INVALID/UNKNOWN/UNSUPPORTED/NOT_CONFIGURED/EXTERNAL_EVIDENCE_REQUIRED remain distinct");

const futureSource = { ...character,
  schema: { schema_id: "saku.character", schema_version: "vnext-2.0" },
  identity: { ...character.identity, character_revision: "9.4.1", catalog: { catalog_version: "vnext-2.0", future_catalog_value: true } },
  future_field: { opaque: "preserve-exactly" }, extensions: { ten_d: { value_state: "EXPLICIT" }, future_extension: { value: 2 } },
  professional_reasoning: { status: "REASONING_PROFILE_ONLY" },
};
const editedKnown = { ...character, identity: { ...character.identity, display_name: "Edited", catalog: { role_label: "Edited role" } } };
const preserved = preserveUnsupportedFields(futureSource, editedKnown, { remove_professional_reasoning: true, remove_ten_d: true });
ok(preserved.future_field.opaque === "preserve-exactly" && preserved.identity.catalog.future_catalog_value === true, "unsupported top-level and nested fields round-trip without interpretation");
ok(preserved.schema.schema_version === "vnext-2.0" && preserved.identity.character_revision === "9.4.1" && preserved.identity.catalog.catalog_version === "vnext-2.0", "source schema/revision identity is never silently rewritten");
ok(preserved.identity.display_name === "Edited" && preserved.identity.catalog.role_label === "Edited role", "supported edits overlay preserved source data");
ok(!Object.hasOwn(preserved, "professional_reasoning") && !Object.hasOwn(preserved.extensions, "ten_d") && preserved.extensions.future_extension.value === 2, "explicit optional-field removal does not remove unrelated unsupported extensions");
ok(JSON.stringify(futureSource).includes("preserve-exactly"), "round-trip preservation does not mutate source input");

const here = path.dirname(fileURLToPath(import.meta.url));
const builderHTML = fs.readFileSync(path.join(here, "../tools/saku-builder-vnext.html"), "utf8");
const supportSchema = JSON.parse(fs.readFileSync(path.join(here, "../schemas/support-bundle.candidate.schema.json"), "utf8"));
const supportExample = JSON.parse(fs.readFileSync(path.join(here, "../examples/support_bundle.json"), "utf8"));
ok(/builder-readiness\.mjs/.test(builderHTML), "Builder UI imports the shared deterministic readiness module");
ok(/id="compatibility"/.test(builderHTML) && /EXTERNAL_EVIDENCE_REQUIRED/.test(builderHTML), "Builder UI displays compatibility states and validation layers");
ok(/id="ex_support_bundle"/.test(builderHTML), "Builder UI exposes support_bundle.json output");
ok(/id="feature_opaque"/.test(builderHTML) && /OPAQUE_REFERENCE_ONLY authoring/.test(builderHTML), "Opaque Reference authoring is visibly feature-gated");
ok(/id="feature_basic_skill"/.test(builderHTML) && /verified competence/.test(builderHTML), "Basic Skill readiness remains separate from competence claims");
ok(!/c\.opaque_extensions\s*=|c\.basic_skill_tendency\s*=/.test(builderHTML), "Candidate workbench never inserts Candidate fields into Canonical collect()");
ok(/BUILDER_DISPLAY_DIGEST/.test(builderHTML) && !/canonical_character_digest/.test(builderHTML), "non-cryptographic UI digest is labeled as display binding, not Canonical integrity evidence");
ok(supportSchema.$id === "urn:saku:builder:support-bundle:candidate:1" && /not a Character Canonical schema/i.test(supportSchema.description), "support bundle schema is explicitly non-Canonical");
ok(supportSchema.required.every((key) => Object.hasOwn(supportExample, key)), "support_bundle.json example contains every required field");
ok(Object.keys(bundle).sort().join("|") === supportSchema.required.slice().sort().join("|"), "generated support bundle matches the Candidate top-level contract");
ok(!/api[_-]?key|password|secret bytes|personal memory|private conversation/i.test(JSON.stringify(supportExample)), "support bundle example contains no excluded private/secret material");

console.log(`\nBuilder readiness verify OK (${passed}/${passed} checks passed)`);
