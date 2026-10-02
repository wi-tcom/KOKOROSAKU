// canonicalJson on its own, with no imports (2026-10-02). It used to live only in ../v1/external-review-intake.mjs,
// so reading it pulled in the Trainer contract and the tuning modules; AMU vendors platform-prompt.mjs and
// reference-material.mjs byte for byte and needs this one function only (AMU STUDIO(1) 2026-10-02).
// external-review-intake.mjs re-exports it, so its callers are unchanged.
/**
 * RFC 8785-equivalent canonical JSON for the shapes a received packet holds:
 * keys sorted by UTF-16 code units, no whitespace, arrays in order, primitives
 * as JSON.stringify.  A received JSON object never carries `undefined`, so
 * the omission rule is stated for completeness only.
 */
export function canonicalJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
