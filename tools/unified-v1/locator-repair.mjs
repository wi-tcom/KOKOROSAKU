// Locator repair — the one thing this does is re-point `locator` values by id.
//
// Characters saved by the Builder's edit screen before 2026-09-22 could carry
// conformance_expectations / Seat 8 locators that point at the wrong array
// index (the screen rebuilt hard_invariants with Input Integrity first). Their
// ids are intact, so every locator can be recomputed from `id ===
// requirement_id` without reading, guessing or changing any other field. The
// repair therefore: rewrites locators, bumps the revision (a repaired file is a
// new revision of the same Character), and reports what it did. It never adds
// or removes requirements, never touches statements, seats, axes or names.
import { nextRevision, relocateRequirementRefs } from "../v1/unified-authoring.mjs";
import { conformanceLocatorMismatches, describeLocatorMismatch } from "./unified-schema-v1.mjs";

export const REPAIR_TOOL = "saku.locator-repair@1";
export const REPAIR_RULE = "locator := index of the element whose id equals requirement_id (character_core.hard_invariants, then human_handoff_conditions); no other field changed; revision bumped";

const clone = value => JSON.parse(JSON.stringify(value));

/** sha-256 hex of the canonical (key-sorted, no whitespace) JSON — a stable content identity for the record. */
export async function canonicalDigest(value) {
  const canonical = v => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  const bytes = new TextEncoder().encode(canonical(value));
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** What is wrong, before touching anything. */
export function diagnose(character) {
  const mismatches = conformanceLocatorMismatches(character);
  return { repairable: mismatches.length > 0, mismatches, lines: mismatches.map(item => describeLocatorMismatch(item, "ja")) };
}

/**
 * Repair a copy. Returns { character, rewritten, before, after, from_revision,
 * to_revision, remaining } — `remaining` lists mismatches the id rule could
 * not resolve (a requirement_id that exists in neither array); those are left
 * as they are and the caller must not present the result as repaired.
 */
export async function repairLocators(character, { bumpRevision = true, now = new Date() } = {}) {
  const before = conformanceLocatorMismatches(character);
  const repaired = clone(character);
  const rewritten = relocateRequirementRefs(repaired);
  const after = conformanceLocatorMismatches(repaired);
  const fromRevision = String(character?.identity?.character_revision ?? "");
  if (bumpRevision && after.length === 0 && rewritten > 0) repaired.identity.character_revision = nextRevision(fromRevision);
  const record = {
    tool: REPAIR_TOOL,
    rule: REPAIR_RULE,
    repaired_at: now.toISOString(),
    from_revision: fromRevision,
    to_revision: String(repaired?.identity?.character_revision ?? ""),
    rewritten,
    mismatches_before: before.length,
    mismatches_after: after.length,
    digest_before: await canonicalDigest(character),
    digest_after: await canonicalDigest(repaired),
    changes: before.map(item => ({ group: item.group, index: item.index, requirement_id: item.requirement_id, from: item.locator })),
  };
  for (const change of record.changes) {
    const list = change.group === "seat8" ? repaired.assistant_composition?.seat8?.human_required_condition_refs : repaired.conformance_expectations?.[change.group];
    change.to = Array.isArray(list) && list[change.index] ? list[change.index].locator : null;
  }
  return { character: repaired, rewritten, before, after, remaining: after, from_revision: fromRevision, to_revision: record.to_revision, record };
}
