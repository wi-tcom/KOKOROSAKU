// The adopted Unified V1 schema for Node (gates and CLIs).
//
// The browser reads the schema with `loadAdoptedSchema()`, which fetches it and
// checks its sha256. Node has no fetch for file URLs, so gates used to parse the
// file themselves — each in its own way, some without the extension schema the
// root `$ref`s. This reads the same two files the browser falls back to, checks
// the same two digests, and wires the extension schema the same way, so a gate
// validates with exactly what the application validates with.
//
// Node only (node:fs). Not shipped to the desktop or the public tooling.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ADOPTED_SCHEMA, ADOPTION_STATUS } from "./adopted-schema-validator.mjs";

function readExact(relativeUrl, expectedSha256, label) {
  const text = readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  if (digest !== expectedSha256) throw new Error(`${label}_UNAVAILABLE: SHA256 mismatch: ${digest}`);
  return JSON.parse(text);
}

let cached = null;

/** Same result as `loadAdoptedSchema()` in the browser, read synchronously from the repository. */
export function loadAdoptedSchemaFromRepository() {
  if (cached) return cached;
  const schema = readExact(ADOPTION_STATUS.schema.source_fallback_relative_url, ADOPTED_SCHEMA.sha256, "ADOPTED_SCHEMA");
  const extensionId = String(schema?.properties?.extensions?.$ref || "").split("#")[0];
  const resolver = ADOPTION_STATUS.resolver_mapping[extensionId];
  if (!extensionId || !resolver) throw new Error(`CHARACTER_EXTENSION_SCHEMA_UNAVAILABLE: no resolver mapping for ${extensionId || "missing absolute $ref"}`);
  const extension = readExact(resolver.source_fallback_relative_url, resolver.sha256, "CHARACTER_EXTENSION_SCHEMA");
  if (extension?.$id !== extensionId) throw new Error("CHARACTER_EXTENSION_SCHEMA_UNAVAILABLE: identity marker missing");
  const externalSchemas = Object.freeze({ [extensionId]: extension });
  Object.defineProperty(schema, "__externalSchemas", { value: externalSchemas, enumerable: false });
  Object.defineProperty(extension, "__externalSchemas", { value: externalSchemas, enumerable: false });
  cached = schema;
  return schema;
}
