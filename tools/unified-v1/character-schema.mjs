// Which Character schema is this, and is it one we support?
//
// Package integrity and schema compatibility are different questions. A package
// can be perfectly formed — manifest present, payload hash exact, archive clean
// — and still carry a Character this application cannot read. Until now the only
// schema check was that `schema_version` was non-empty, which answers neither
// question: a package declaring `schema_version: "anything"` passed.
//
// Two schemas exist and they are not convertible:
//
//   SAKU-CHARACTER   1.0         KOKOROSAKU 1+7 — six AI seats (2-7) plus a
//                                human seat 8; seat7 is PERSONA_GUARD
//   saku.character   legacy 1.0  seven functions (1-7) plus HUMAN seat 8;
//                                seat7 is FORWARD_DRIVER
//
// Seat 7 carries a different role in each. Mapping one onto the other is a
// change of meaning, not a rename, so nothing here converts between them and
// the validators below actively refuse a payload that mixes their vocabularies.
//
// Identification is by DECLARATION only. A Character that does not say which
// schema it is written in is UNKNOWN — never inferred from its shape, never
// defaulted to either family, and never admitted.

import { UNIFIED_SCHEMA_V1, LEGACY_STATUS, validateUnifiedV1 } from "./unified-schema-v1.mjs";

// SAKU_UNIFIED_SCHEMA_V1 is the sole active Character schema, adopted in the
// Canonical repository. The other two remain readable because the adoption did
// not migrate anything — legacy v1 is a migration source and Unified V1 is retained
// for history and provenance — but neither is an authoring target now.
export const ACTIVE_SCHEMA_KIND = "UNIFIED_V1_CHARACTER";
const LEGACY_SCHEMA_VERSION = ["v", "next-1.0"].join("");

export const SCHEMA_REGISTRY = [
  {
    kind: "UNIFIED_V1_CHARACTER",
    schema_id: UNIFIED_SCHEMA_V1.schema_id,
    supported_versions: [UNIFIED_SCHEMA_V1.schema_version],
    label: "SAKU Unified Schema V1",
    active: true,
    requires_tokens: ["PERSONA_BRAND_GUARD_ASSISTANT", "LOGICAL_HUMAN_ASSISTANT"],
    forbids_tokens: [],
  },
  {
    kind: "V1_CHARACTER",
    schema_id: "SAKU-CHARACTER",
    supported_versions: ["1.0"],
    label: "KOKOROSAKU 1+7 (v1)",
    active: false,
    legacy_status: LEGACY_STATUS.V1_CHARACTER,
    // The seat vocabulary that must be present, and the one that must not.
    requires_tokens: ["seat7_persona_guard"],
    forbids_tokens: ["FORWARD_DRIVER", "FRONT_COORDINATOR"],
  },
  {
    kind: "LEGACY_SCHEMA_CHARACTER",
    schema_id: "saku.character",
    supported_versions: [LEGACY_SCHEMA_VERSION],
    label: "saku.character Unified V1",
    active: false,
    legacy_status: LEGACY_STATUS.LEGACY_SCHEMA_CHARACTER,
    requires_tokens: ["FORWARD_DRIVER", "FRONT_COORDINATOR"],
    forbids_tokens: ["seat7_persona_guard"],
  },
];

export const UNKNOWN = "UNKNOWN_CHARACTER";

const entryFor = schemaId => SCHEMA_REGISTRY.find(entry => entry.schema_id === schemaId) || null;

/**
 * What the Character says it is. Returns null when it says nothing.
 *
 * v1 declares a bare string and a sibling version; Unified V1 declares an object.
 * Both are explicit — neither is read from the shape of the rest of the file.
 */
export function declaredSchema(character) {
  if (!character || typeof character !== "object") return null;
  const schema = character.schema;
  if (typeof schema === "string" && schema.trim()) {
    return { schema_id: schema.trim(), schema_version: String(character.version ?? "").trim() };
  }
  if (schema && typeof schema === "object" && typeof schema.schema_id === "string" && schema.schema_id.trim()) {
    return { schema_id: schema.schema_id.trim(), schema_version: String(schema.schema_version ?? "").trim() };
  }
  return null;
}

/**
 * Classify without guessing.
 *
 * kind is one of the registry kinds, or UNKNOWN_CHARACTER. An identified family
 * carrying a version we do not support is reported as such — supported is false,
 * and the family is named so the refusal can say what it saw — but it is still
 * not admitted.
 */
export function classify(character) {
  const declared = declaredSchema(character);
  if (!declared) {
    return { kind: UNKNOWN, supported: false, schema_id: "", schema_version: "", code: "SCHEMA_NOT_DECLARED", reason: "Character does not declare a schema." };
  }
  const entry = entryFor(declared.schema_id);
  if (!entry) {
    return { kind: UNKNOWN, supported: false, ...declared, code: "SCHEMA_ID_UNKNOWN", reason: `Unknown Character schema: ${declared.schema_id}` };
  }
  if (!entry.supported_versions.includes(declared.schema_version)) {
    return {
      kind: UNKNOWN, supported: false, ...declared, family: entry.kind,
      code: "SCHEMA_VERSION_UNSUPPORTED",
      reason: `${entry.schema_id} ${declared.schema_version || "(version absent)"} is not supported. Supported: ${entry.supported_versions.join(", ")}`,
    };
  }
  return { kind: entry.kind, supported: true, ...declared, code: "SCHEMA_RECOGNISED", reason: entry.label };
}

// Vocabulary check: a payload that declares one schema while carrying the other
// schema's seat names has been converted or mislabelled, and must not be trusted
// on the strength of its declaration alone.
function vocabularyErrors(character, entry) {
  const text = JSON.stringify(character);
  const errors = [];
  for (const token of entry.forbids_tokens) {
    if (text.includes(token)) errors.push(`carries ${token}, which belongs to the other schema`);
  }
  return errors;
}

export function validateV1(character) {
  const entry = entryFor("SAKU-CHARACTER");
  const errors = vocabularyErrors(character, entry);
  const front = character.front_character || {};
  if (!String(front.name || "").trim()) errors.push("front_character.name is empty");
  const assistants = Array.isArray(character.assistants) ? character.assistants : null;
  if (!assistants) errors.push("assistants is missing");
  else {
    const keys = assistants.map(item => String(item && item.key || ""));
    // Seat 7 is the persona guard in this schema. If it is absent the file is
    // either incomplete or has been converted, and either way it is not v1.
    if (!keys.includes("seat7_persona_guard")) errors.push("assistants does not carry seat7_persona_guard");
    if (!keys.includes("seat8_human")) errors.push("assistants does not carry seat8_human");
    const aiSeats = assistants.filter(item => item && item.kind === "ai").length;
    if (aiSeats !== 6) errors.push(`v1 defines six AI seats; found ${aiSeats}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateLegacySchema(character) {
  const entry = entryFor("saku.character");
  const errors = vocabularyErrors(character, entry);
  const identity = character.identity || {};
  if (!String(identity.character_id || "").trim()) errors.push("identity.character_id is empty");
  if (!String(identity.display_name || "").trim()) errors.push("identity.display_name is empty");
  const composition = character.assistant_composition;
  if (!composition || typeof composition !== "object") errors.push("assistant_composition is missing");
  else {
    for (const seat of ["seat1", "seat2", "seat3", "seat4", "seat5", "seat6", "seat7", "seat8"]) {
      if (!composition[seat]) errors.push(`assistant_composition.${seat} is missing`);
    }
    const fn = seat => String((composition[seat] || {}).function || "");
    if (composition.seat1 && fn("seat1") !== "FRONT_COORDINATOR") errors.push(`seat1 must be FRONT_COORDINATOR, found ${fn("seat1")}`);
    if (composition.seat7 && fn("seat7") !== "FORWARD_DRIVER") errors.push(`seat7 must be FORWARD_DRIVER, found ${fn("seat7")}`);
    if (composition.seat8 && fn("seat8") !== "HUMAN") errors.push(`seat8 must be HUMAN, found ${fn("seat8")}`);
  }
  return { ok: errors.length === 0, errors };
}

const VALIDATORS = { UNIFIED_V1_CHARACTER: character => validateUnifiedV1(character), V1_CHARACTER: validateV1, LEGACY_SCHEMA_CHARACTER: validateLegacySchema };

/**
 * Classify, then run the matching validator. Nothing else may reach the library.
 *
 * There is deliberately no fallback branch: an unclassified Character has no
 * validator, so it cannot be admitted by omission.
 */
export function admit(character) {
  const verdict = classify(character);
  if (!verdict.supported) return { accepted: false, kind: UNKNOWN, ...verdict, errors: [verdict.reason] };
  const validator = VALIDATORS[verdict.kind];
  if (!validator) return { accepted: false, kind: UNKNOWN, ...verdict, code: "NO_VALIDATOR_FOR_SCHEMA", errors: [`No validator registered for ${verdict.kind}`] };
  const result = validator(character);
  if (!result.ok) {
    return { accepted: false, kind: UNKNOWN, ...verdict, code: "SCHEMA_VALIDATION_FAILED", reason: result.errors.join("; "), errors: result.errors };
  }
  return { accepted: true, ...verdict, errors: [] };
}

/**
 * The package manifest and the payload must name the same schema, exactly.
 *
 * A manifest that names no schema identity cannot be bound to anything, so it is
 * refused rather than resolved from the payload — resolving it there would make
 * the manifest's claim unfalsifiable, which is the whole point of the binding.
 */
export function checkManifestBinding(manifest, characters) {
  const manifestId = String((manifest && manifest.schema_id) || "").trim();
  const manifestVersion = String((manifest && manifest.schema_version) || "").trim();
  if (!manifestId) return { ok: false, code: "MANIFEST_SCHEMA_ID_MISSING", reason: "Package manifest does not name a Character schema identity." };
  if (!manifestVersion) return { ok: false, code: "MANIFEST_SCHEMA_VERSION_MISSING", reason: "Package manifest does not name a Character schema version." };
  const entry = entryFor(manifestId);
  if (!entry) return { ok: false, code: "MANIFEST_SCHEMA_ID_UNKNOWN", reason: `Package manifest names an unknown schema: ${manifestId}` };
  if (!entry.supported_versions.includes(manifestVersion)) {
    return { ok: false, code: "MANIFEST_SCHEMA_VERSION_UNSUPPORTED", reason: `${manifestId} ${manifestVersion} is not supported.` };
  }
  if (!Array.isArray(characters) || !characters.length) {
    return { ok: false, code: "PAYLOAD_HAS_NO_CHARACTER", reason: "Package payload carries no Character." };
  }
  for (const [index, character] of characters.entries()) {
    const declared = declaredSchema(character);
    if (!declared) {
      return { ok: false, code: "PAYLOAD_SCHEMA_NOT_DECLARED", reason: `Payload Character ${index + 1} declares no schema.` };
    }
    if (declared.schema_id !== manifestId || declared.schema_version !== manifestVersion) {
      return {
        ok: false, code: "MANIFEST_PAYLOAD_SCHEMA_MISMATCH",
        reason: `Manifest says ${manifestId} ${manifestVersion}; payload Character ${index + 1} says ${declared.schema_id} ${declared.schema_version || "(version absent)"}.`,
      };
    }
  }
  return { ok: true, code: "MANIFEST_PAYLOAD_SCHEMA_BOUND", schema_id: manifestId, schema_version: manifestVersion, kind: entry.kind, reason: entry.label };
}

export function labelFor(kind) {
  const entry = SCHEMA_REGISTRY.find(item => item.kind === kind);
  return entry ? entry.label : "Unsupported Character Schema";
}
