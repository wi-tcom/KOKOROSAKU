// Deterministic validator for the exact adopted SAKU Unified Character V1
// schema and its character-extension schema (draft 2020-12). SUPPORTED_KEYWORDS
// below is every keyword it evaluates; ANNOTATION_KEYWORDS the ones it reads
// past on purpose. `schema:keywords:verify` walks both schemas and fails on a
// keyword in neither list, so a keyword the schema starts using cannot be
// skipped silently (maxLength and propertyNames were, until 2026-09-23).
// x-wit-* keywords document; the rules they state that can be checked on a
// Character are enforced in validateAdoptedSemanticReferences.

import { conformanceLocatorMismatches } from "./unified-schema.mjs";

export const ADOPTED_SCHEMA = Object.freeze({
  repository: "wi-tcom/-SAKU-1-7-Character-System",
  revision: "c442a1a04e876dc7d0a6941b500ce7b1ff94bf0c",
  path: "schema/adopted/unified-v1/saku-unified-character.v1.schema.json",
  sha256: "48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817",
  decision_id: "D-13",
  extension_path: "schema/adopted/unified-v1/character-extension.v1.schema.json",
  extension_sha256: "2069021745e9ad98afc84e7dacdb0404c0993f3fcad4147590059764b3170b1b",
});

const EXTENSION_SCHEMA_ID = "https://wi-t.com/schemas/saku/character-extension/1.0.0/schema.json";

// Runtime URLs are deliberately relative to this module rather than to the
// document that imports it. The source fallback keeps repository tests usable;
// the generated public artifact always resolves the first, bundled URL.
export const ADOPTION_STATUS = Object.freeze({
  decision_id: ADOPTED_SCHEMA.decision_id,
  active_schema: "SAKU_UNIFIED_SCHEMA_V1",
  schema: Object.freeze({
    bundled_relative_url: "../schemas/saku-unified-character.v1.schema.json",
    source_fallback_relative_url: "../schemas/saku-unified-character.v1.schema.json",
    sha256: ADOPTED_SCHEMA.sha256,
  }),
  resolver_mapping: Object.freeze({
    [EXTENSION_SCHEMA_ID]: Object.freeze({
      bundled_relative_url: "../schemas/character-extension.v1.schema.json",
      source_fallback_relative_url: "../schemas/character-extension.v1.schema.json",
      sha256: ADOPTED_SCHEMA.extension_sha256,
    }),
  }),
});

export const SUPPORTED_KEYWORDS = Object.freeze(["$ref", "type", "const", "enum", "minLength", "maxLength", "pattern", "minItems", "uniqueItems", "items", "contains", "minContains", "maxContains", "minProperties", "required", "properties", "additionalProperties", "propertyNames", "allOf", "if", "then", "else"]);
export const ANNOTATION_KEYWORDS = Object.freeze(["$id", "$schema", "$defs", "$comment", "title", "description", "default", "examples"]);

// JSON equality does not depend on the order an object's keys were written in.
// JSON.stringify does, so two equal references written in different key orders
// passed uniqueItems (2026-09-23 overall check). Keys are sorted at every level.
const canonical = value => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const deepEqual = (a, b) => canonical(a) === canonical(b);
const pointerTokens = pointer => pointer.replace(/^#\/?/, "").split("/").filter(Boolean)
  .map(token => token.replace(/~1/g, "/").replace(/~0/g, "~"));

function resolveRef(root, ref) {
  const reference = String(ref);
  const hashAt = reference.indexOf("#");
  const documentId = hashAt < 0 ? reference : reference.slice(0, hashAt);
  const pointer = hashAt < 0 ? "#" : reference.slice(hashAt);
  const targetRoot = documentId
    ? root?.__externalSchemas?.[documentId]
    : root;
  if (!targetRoot) return null;
  return {
    schema: pointerTokens(pointer).reduce((node, key) => node?.[key], targetRoot),
    root: targetRoot,
  };
}

function typeMatches(value, expected) {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

const joinPath = (path, key) => `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;
const issue = (errors, path, keyword, message, expected, actual) => errors.push({
  path: path || "/", keyword, message, expected, actual,
});

function evaluate(value, schema, root, path, errors) {
  if (schema === true || schema == null) return true;
  if (schema === false) { issue(errors, path, "falseSchema", "value is prohibited"); return false; }
  const before = errors.length;
  if (schema.$ref) {
    const resolved = resolveRef(root, schema.$ref);
    if (!resolved?.schema) issue(errors, path, "$ref", `unresolved schema reference ${schema.$ref}`);
    else evaluate(value, resolved.schema, resolved.root, path, errors);
    return errors.length === before;
  }
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some(type => typeMatches(value, type))) {
      issue(errors, path, "type", `expected ${allowed.join(" or ")}`, allowed, Array.isArray(value) ? "array" : value === null ? "null" : typeof value);
      return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const") && !deepEqual(value, schema.const))
    issue(errors, path, "const", "must equal the fixed schema value", schema.const, value);
  if (schema.enum && !schema.enum.some(candidate => deepEqual(value, candidate)))
    issue(errors, path, "enum", "must be one of the allowed values", schema.enum, value);
  if (typeof value === "string") {
    if (schema.minLength != null && [...value].length < schema.minLength)
      issue(errors, path, "minLength", `must contain at least ${schema.minLength} character(s)`, schema.minLength, [...value].length);
    // Characters (code points), as minLength counts them — not UTF-16 units.
    if (schema.maxLength != null && [...value].length > schema.maxLength)
      issue(errors, path, "maxLength", `must contain at most ${schema.maxLength} character(s)`, schema.maxLength, [...value].length);
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value))
      issue(errors, path, "pattern", `must match ${schema.pattern}`, schema.pattern, value);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems)
      issue(errors, path, "minItems", `must contain at least ${schema.minItems} item(s)`, schema.minItems, value.length);
    if (schema.uniqueItems) {
      const seen = new Set();
      value.forEach((item, index) => {
        const key = canonical(item);
        if (seen.has(key)) issue(errors, joinPath(path, index), "uniqueItems", "duplicate item is not allowed");
        seen.add(key);
      });
    }
    if (schema.items) value.forEach((item, index) => evaluate(item, schema.items, root, joinPath(path, index), errors));
    if (schema.contains) {
      let count = 0;
      value.forEach((item, index) => {
        const nested = [];
        evaluate(item, schema.contains, root, joinPath(path, index), nested);
        if (!nested.length) count += 1;
      });
      const minimum = schema.minContains == null ? 1 : schema.minContains;
      if (count < minimum) issue(errors, path, "minContains", `must contain at least ${minimum} matching item(s)`, minimum, count);
      if (schema.maxContains != null && count > schema.maxContains)
        issue(errors, path, "maxContains", `must contain at most ${schema.maxContains} matching item(s)`, schema.maxContains, count);
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties != null && keys.length < schema.minProperties)
      issue(errors, path, "minProperties", `must contain at least ${schema.minProperties} property/properties`, schema.minProperties, keys.length);
    for (const key of schema.required || []) if (!Object.prototype.hasOwnProperty.call(value, key))
      issue(errors, joinPath(path, key), "required", "required value is missing", true, false);
    // Every key of the object is itself validated as a string (the extension
    // map's keys must be namespaced ids).
    if (schema.propertyNames !== undefined)
      for (const key of keys) evaluate(key, schema.propertyNames, root, joinPath(path, key), errors);
    for (const [key, child] of Object.entries(schema.properties || {}))
      if (Object.prototype.hasOwnProperty.call(value, key)) evaluate(value[key], child, root, joinPath(path, key), errors);
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of keys) if (!allowed.has(key)) issue(errors, joinPath(path, key), "additionalProperties", "unknown property is not allowed");
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      const known = new Set(Object.keys(schema.properties || {}));
      for (const key of keys) if (!known.has(key)) evaluate(value[key], schema.additionalProperties, root, joinPath(path, key), errors);
    }
  }
  for (const child of schema.allOf || []) evaluate(value, child, root, path, errors);
  if (schema.if) {
    const conditional = [];
    evaluate(value, schema.if, root, path, conditional);
    if (!conditional.length && schema.then) evaluate(value, schema.then, root, path, errors);
    if (conditional.length && schema.else) evaluate(value, schema.else, root, path, errors);
  }
  return errors.length === before;
}

export function validateAgainstAdoptedSchema(character, schema) {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    issue(errors, "/", "schema", "the pinned adopted schema is unavailable");
    return { ok: false, errors, schema: ADOPTED_SCHEMA };
  }
  evaluate(character, schema, schema, "", errors);
  return { ok: errors.length === 0, errors, schema: ADOPTED_SCHEMA };
}

// JSON Schema intentionally cannot assert that stable references resolve to
// requirement identifiers elsewhere in the same Character. These checks are
// deterministic cross-field conformance rules from the adopted contract.
/** Extensions this implementation understands. None yet: a CRITICAL extension is refused. */
export const KNOWN_EXTENSIONS = Object.freeze(new Set());

export function validateAdoptedSemanticReferences(character) {
  const errors = [];
  const invariants = character?.character_core?.hard_invariants || [];
  const handoffs = character?.character_core?.human_handoff_conditions || [];
  const ids = new Map();
  const add = (item, path) => {
    const id = String(item?.id || "").trim();
    if (!id) return;
    if (ids.has(id)) issue(errors, path, "uniqueRequirementId", `requirement id ${id} is duplicated`, "globally unique", id);
    else ids.set(id, path);
  };
  invariants.forEach((item, index) => add(item, `/character_core/hard_invariants/${index}/id`));
  handoffs.forEach((item, index) => add(item, `/character_core/human_handoff_conditions/${index}/id`));

  const refs = [
    [character?.assistant_composition?.seat8?.human_required_condition_refs || [], "/assistant_composition/seat8/human_required_condition_refs", new Set(handoffs.map(item => item?.id))],
    [character?.conformance_expectations?.must_preserve_refs || [], "/conformance_expectations/must_preserve_refs", new Set(ids.keys())],
    [character?.conformance_expectations?.prohibited_drift_refs || [], "/conformance_expectations/prohibited_drift_refs", new Set(ids.keys())],
    [character?.conformance_expectations?.continuity_refs || [], "/conformance_expectations/continuity_refs", new Set(ids.keys())],
  ];
  for (const [list, path, targets] of refs) list.forEach((ref, index) => {
    const id = String(ref?.requirement_id || "").trim();
    if (id && !targets.has(id)) issue(errors, `${path}/${index}/requirement_id`, "unresolvedRequirementRef", `reference ${id} does not resolve in this Character`, "existing requirement id", id);
  });
  // x-wit-semantic-validation.duplicate_reference_requirement_id_rejected: one
  // requirement_id per reference list. uniqueItems only refuses identical
  // objects; the same id with another locator (or none) is the same reference.
  for (const [list, path] of refs) {
    const seen = new Map();
    list.forEach((ref, index) => {
      const id = String(ref?.requirement_id || "").trim();
      if (!id) return;
      if (seen.has(id)) issue(errors, `${path}/${index}/requirement_id`, "duplicateReferenceRequirementId", `reference ${id} is already listed at index ${seen.get(id)}`, "one reference per requirement id", id);
      else seen.set(id, index);
    });
  }
  // The extension schema's x-wit-semantic-validation: a map key is the entry's
  // own extension_id, and a CRITICAL extension this implementation does not
  // know fails closed. It knows none, so every CRITICAL extension is refused;
  // a NONCRITICAL one is kept, read-only, with no runtime effect.
  const extensions = character?.extensions;
  if (extensions && typeof extensions === "object" && !Array.isArray(extensions)) {
    for (const [key, entry] of Object.entries(extensions)) {
      const at = `/extensions/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (entry?.extension_id !== key) issue(errors, `${at}/extension_id`, "extensionKeyMismatch", `the map key ${key} is not the entry's extension_id`, key, entry?.extension_id);
      if (entry?.criticality === "CRITICAL" && !KNOWN_EXTENSIONS.has(key)) issue(errors, `${at}/criticality`, "unknownCriticalExtension", `CRITICAL extension ${key} is not known to this implementation (fails closed)`, "a known extension", key);
    }
  }
  // The locator beside a requirement_id is a JSON Pointer into this Character.
  // The schema: "Resolution or locator mismatch fails closed." A locator that
  // lands on another requirement, or nowhere, is refused here so the Builder
  // never saves or exports one (2026-09-21, after four hand-generated
  // Characters shipped with swapped hard_invariants locators).
  for (const item of conformanceLocatorMismatches(character)) {
    const message = item.resolvable
      ? `locator ${JSON.stringify(item.locator)} resolves to ${item.resolved_id === null ? "an element without id" : `id ${item.resolved_id}`}, not ${item.requirement_id === null ? "(requirement_id missing)" : item.requirement_id}`
      : `locator ${JSON.stringify(item.locator)} does not resolve (${item.reason})`;
    issue(errors, `/conformance_expectations/${item.group}/${item.index}/locator`, "locatorMismatch", message, item.requirement_id, item.resolved_id);
  }
  return { ok: errors.length === 0, errors, schema: ADOPTED_SCHEMA };
}

export function validateCompleteAdoptedCharacter(character, schema) {
  const structural = validateAgainstAdoptedSchema(character, schema);
  const semantic = validateAdoptedSemanticReferences(character);
  return { ok: structural.ok && semantic.ok, errors: [...structural.errors, ...semantic.errors], schema: ADOPTED_SCHEMA };
}

let cachedSchema = null;
const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
async function fetchExactJson(candidates, expectedSha256, label) {
  const failures = [];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) { failures.push(`${url}: HTTP ${response.status}`); continue; }
      const source = await response.text();
      const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)));
      if (digest !== expectedSha256) throw new Error(`SHA256 mismatch: ${digest}`);
      return JSON.parse(source);
    } catch (error) { failures.push(`${url}: ${error.message}`); }
  }
  throw new Error(`${label}_UNAVAILABLE: ${failures.join(" | ")}`);
}

export async function loadAdoptedSchema() {
  if (cachedSchema) return cachedSchema;
  const schema = await fetchExactJson([
    new URL(ADOPTION_STATUS.schema.bundled_relative_url, import.meta.url),
    new URL(ADOPTION_STATUS.schema.source_fallback_relative_url, import.meta.url),
  ], ADOPTED_SCHEMA.sha256, "ADOPTED_SCHEMA");
  if (schema?.properties?.schema?.$ref !== "#/$defs/schemaIdentity") throw new Error("ADOPTED_SCHEMA_UNAVAILABLE: identity marker missing");

  const extensionReference = String(schema?.properties?.extensions?.$ref || "");
  const extensionDocumentId = extensionReference.split("#")[0];
  const extensionResolver = ADOPTION_STATUS.resolver_mapping[extensionDocumentId];
  if (!extensionDocumentId || !extensionResolver)
    throw new Error(`CHARACTER_EXTENSION_SCHEMA_UNAVAILABLE: no resolver mapping for ${extensionDocumentId || "missing absolute $ref"}`);
  const extension = await fetchExactJson([
    new URL(extensionResolver.bundled_relative_url, import.meta.url),
    new URL(extensionResolver.source_fallback_relative_url, import.meta.url),
  ], extensionResolver.sha256, "CHARACTER_EXTENSION_SCHEMA");
  if (extension?.$id !== extensionDocumentId)
    throw new Error("CHARACTER_EXTENSION_SCHEMA_UNAVAILABLE: identity marker missing");
  const externalSchemas = Object.freeze({ [extensionDocumentId]: extension });
  Object.defineProperty(schema, "__externalSchemas", { value: externalSchemas, enumerable: false });
  Object.defineProperty(extension, "__externalSchemas", { value: externalSchemas, enumerable: false });
  cachedSchema = schema;
  return schema;
}

export function formatValidationIssue(entry, registry = null, locale = "ja") {
  const canonicalPath = entry.path.replace(/^\//, "").replace(/\//g, ".").replace(/~1/g, "/").replace(/~0/g, "~");
  const field = registry?.find?.(item => item.canonicalPath === canonicalPath || canonicalPath.startsWith(`${item.canonicalPath}.`));
  const label = field?.label?.[locale] || canonicalPath || "Character";
  return locale === "en"
    ? `${label}: ${entry.message} (${entry.keyword})`
    : `${label}：${entry.message}（${entry.keyword}）`;
}
