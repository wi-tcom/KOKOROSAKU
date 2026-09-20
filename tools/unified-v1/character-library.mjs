// The Character list the Owner builds up in a Workspace.
//
// Import used to be a one-shot handoff: the last package replaced whatever was
// on screen, so importing a second one lost the first. The selection screen is
// meant to accumulate — import a package, import a single file, create one, come
// back tomorrow and they are all still there — so the list has to be state, not
// the residue of the most recent import.
//
// Deletion is a flag, never a wipe. A Character the Owner removes from the list
// can still be shown with a filter, because "I deleted the wrong one" must not
// mean "it is gone". Only 「一覧をクリア」 removes rows, and only after the
// Owner confirms it.
//
// Boundary: this is Builder workspace state. It is not AMU memory, not runtime
// activation, and not Canonical Adoption. Nothing here promotes a Character to
// anything.

import { blankUnifiedCharacter } from "./unified-schema-v1.mjs";

const KEY = "saku.workspace.library";
const VERSION = 1;

// Every storage touch is wrapped: a private window, a cleared profile or a
// quota error must degrade to an empty list, never throw into the UI.
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: VERSION, entries: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return { version: VERSION, entries: [] };
    return { version: VERSION, entries: parsed.entries.filter(entry => entry && entry.character) };
  } catch { return { version: VERSION, entries: [] }; }
}

function write(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return { ok: true }; }
  catch (error) { return { ok: false, reason: String(error && error.message || error) }; }
}

let counter = 0;
function newId() {
  counter += 1;
  return `entry-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function displayNameOf(character) {
  const identity = (character && character.identity) || {};
  return String(identity.display_name || character?.display_name || identity.character_id || character?.character_id || "").trim();
}

export function characterIdOf(character) {
  const identity = (character && character.identity) || {};
  return String(identity.character_id || character?.character_id || "").trim();
}

export function list({ includeDeleted = false, onlyDeleted = false } = {}) {
  const entries = read().entries;
  if (onlyDeleted) return entries.filter(entry => entry.deleted);
  if (includeDeleted) return entries;
  return entries.filter(entry => !entry.deleted);
}

export function count(options) { return list(options).length; }

export function get(entryId) {
  return read().entries.find(entry => entry.entry_id === entryId) || null;
}

// Which of these Characters already have a name in the list. The caller asks
// before importing so it can put the choice to the Owner instead of deciding.
export function nameConflicts(characters, { includeDeleted = false } = {}) {
  const existing = new Map();
  for (const entry of list({ includeDeleted })) {
    const name = displayNameOf(entry.character);
    if (name) existing.set(name, entry);
  }
  const conflicts = [];
  for (const character of characters) {
    const name = displayNameOf(character);
    if (name && existing.has(name)) conflicts.push({ name, entry_id: existing.get(name).entry_id });
  }
  return conflicts;
}

/**
 * Add Characters to the list.
 *
 * onConflict:
 *   "KEEP_BOTH" — the incoming Character is added alongside the existing one
 *   "REPLACE"   — the existing entry's content is overwritten, keeping its id
 *                 so anything pointing at it still resolves
 */
/**
 * Add Characters to the list.
 *
 * Every entry carries the schema it was admitted as. There is no default: a
 * caller that does not say which schema a Character is written in is refused,
 * because the alternative is a row nothing downstream knows how to render.
 */
export function importCharacters(characters, source = "IMPORT", { onConflict = "KEEP_BOTH", verification = null, schema = null, entryMeta = null } = {}) {
  if (!schema || !schema.kind || schema.kind === "UNKNOWN_CHARACTER") {
    return { added: 0, replaced: 0, saved: false, reason: "SCHEMA_KIND_REQUIRED", rejected: characters.length };
  }
  const state = read();
  const byName = new Map();
  for (const entry of state.entries) {
    if (entry.deleted) continue;
    const name = displayNameOf(entry.character);
    if (name && !byName.has(name)) byName.set(name, entry);
  }
  let added = 0, replaced = 0;
  const at = new Date().toISOString();
  for (const character of characters) {
    if (!character || typeof character !== "object") continue;
    const name = displayNameOf(character);
    const existing = name ? byName.get(name) : null;
    // Provenance the intake established for this one Character (a pack entry's
    // operation class, digests, signature state).  Stored beside the Character,
    // never written into it.
    const provenance = typeof entryMeta === "function" ? (entryMeta(character) || null) : null;
    if (existing && onConflict === "REPLACE") {
      existing.character = character;
      existing.source = source;
      existing.verification = verification;
      existing.provenance = provenance;
      existing.schema = schema;
      existing.updated_at = at;
      existing.batch = at;
      existing.deleted = false;
      replaced += 1;
      continue;
    }
    const entry = { entry_id: newId(), character, source, verification, provenance, schema, added_at: at, batch: at, deleted: false };
    state.entries.push(entry);
    if (name && !byName.has(name)) byName.set(name, entry);
    added += 1;
  }
  const saved = write(state);
  return { added, replaced, saved: saved.ok, reason: saved.reason || "" };
}

export function update(entryId, character) {
  const state = read();
  const entry = state.entries.find(item => item.entry_id === entryId);
  if (!entry) return { updated: false, saved: false, reason: "ENTRY_NOT_FOUND" };
  entry.character = character;
  entry.updated_at = new Date().toISOString();
  const saved = write(state);
  return { updated: true, saved: saved.ok, reason: saved.reason || "" };
}

export function setDeleted(entryIds, deleted = true) {
  const ids = new Set(entryIds);
  const state = read();
  let changed = 0;
  for (const entry of state.entries) {
    if (!ids.has(entry.entry_id) || entry.deleted === deleted) continue;
    entry.deleted = deleted;
    entry.deleted_at = deleted ? new Date().toISOString() : "";
    changed += 1;
  }
  const saved = write(state);
  return { changed, saved: saved.ok, reason: saved.reason || "" };
}

// The only operation that removes rows. The caller must have confirmed first.
export function clear() {
  const removed = read().entries.length;
  const saved = write({ version: VERSION, entries: [] });
  return { removed, saved: saved.ok, reason: saved.reason || "" };
}

// A blank Character with the shape the Builder and the Catalog both expect, so
// a newly created entry appears in the list immediately instead of after a save.
export function blankCharacter() {
  const legacySchemaVersion = ["v", "next-1.0"].join("");
  const seatFunctions = ["FRONT_COORDINATOR", "SPECIALIST", "FACT_CHECKER", "SAFETY_BOUNDARY", "USER_ADVOCATE", "RED_TEAM", "FORWARD_DRIVER"];
  const composition = { profile_version: legacySchemaVersion };
  seatFunctions.forEach((fn, index) => { composition[`seat${index + 1}`] = { function: fn, archetype: "", intensity: "MEDIUM" }; });
  composition.seat8 = { function: "HUMAN", archetype: "HUMAN" };
  return {
    schema: { schema_id: "saku.character", schema_version: legacySchemaVersion },
    identity: { character_id: "", character_revision: "0.1.0-draft", display_name: "", catalog: { catalog_version: legacySchemaVersion, catalog_code: "", catalog_group: "", role_label: "" } },
    purpose: { summary: "", primary_value: "", work_modes: [], non_goals: [] },
    character_core: { role_kind: "CHARACTER_ROLE", character_role: "", values: [], hard_invariants: [], expressive_range: { allowed_variation: [], prohibited_drift: [] }, human_handoff_conditions: [] },
    assistant_composition: composition,
    personality_axes: {},
    conformance: { expected_strengths: [], expected_failure_tendencies: [], must_preserve: [], prohibited_drift: [] },
  };
}

export function createDraft(source = "NEW") {
  const state = read();
  const at = new Date().toISOString();
  // A new Character starts in the active contract. Starting it in a legacy
  // schema would mean "create from scratch" produced something the Builder had
  // to convert, and the Owner would be told the Builder received a legacy
  // Character on a screen they opened to make a new one.
  const character = blankUnifiedCharacter();
  const entry = { entry_id: newId(), character, source, schema: { kind: "UNIFIED_V1_CHARACTER", schema_id: character.schema.schema_id, schema_version: character.schema.schema_version }, added_at: at, batch: at, deleted: false, draft: true };
  state.entries.push(entry);
  const saved = write(state);
  return { entry, saved: saved.ok, reason: saved.reason || "" };
}

// Which rows arrived most recently. The Owner imports 64 at once and needs to
// see what just landed, not hunt for it among what was already there.
export function latestBatch() {
  const batches = read().entries.map(entry => entry.batch).filter(Boolean).sort();
  return batches.length ? batches[batches.length - 1] : "";
}

export function summary() {
  const entries = read().entries;
  return { total: entries.length, active: entries.filter(entry => !entry.deleted).length, deleted: entries.filter(entry => entry.deleted).length };
}
