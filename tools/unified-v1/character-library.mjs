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
// The list belongs to the open workspace: every write is reported so it is
// written through, and a window that does not hold the workspace writes nothing.
import { isReadOnly, noteChanged } from "./workspace-state.mjs";

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
  if (isReadOnly()) return { ok: false, reason: "WORKSPACE_READ_ONLY" };
  try { localStorage.setItem(KEY, JSON.stringify(state)); noteChanged(KEY); return { ok: true }; }
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
 * The rows an import would really replace (2026-10-14 keying 3-21): the same character_id, and an origin that
 * replaceDecision lets replace. The question 「置き換える／両方残す」 is asked only for these; a row with the same name
 * but another origin or another id is never replaced, so asking about it offered a choice that did nothing.
 */
export function replaceableConflicts(characters, source = "IMPORT", entryMeta = null) {
  const live = list();
  const conflicts = [];
  for (const character of characters) {
    const id = characterIdOf(character);
    const provenance = typeof entryMeta === "function" ? (entryMeta(character) || null) : null;
    const target = replaceTarget(live, { character, provenance, source });
    if (target && target.decision.replaceable) conflicts.push({ name: displayNameOf(character) || id, entry_id: target.entry.entry_id, reason: target.decision.reason });
  }
  return conflicts;
}

/**
 * The row an incoming Character would replace, among every live row with its character_id (2026-10-15 keying round 2):
 * the pack row and the row edited from it share the id, so the first row with the id was the pack row, and a self-made
 * ZIP of the edited one was refused against it and never asked about. The first row whose origin allows the
 * replacement is the target; with none, the first row with the id and its refusal. null: no row has the id.
 */
function replaceTarget(entries, incoming) {
  const id = characterIdOf(incoming && incoming.character);
  if (!id) return null;
  let refused = null;
  for (const entry of entries) {
    if (!entry || entry.deleted || characterIdOf(entry.character) !== id) continue;
    const decision = replaceDecision(entry, incoming);
    if (decision.replaceable) return { entry, decision };
    if (!refused) refused = { entry, decision };
  }
  return refused;
}

// ── Origin and lineage (2026-10-14 signature/display fixes G2, G3, G5) ─────────────
//
// Where a row came from is kept beside the Character, never in it (the adopted
// schema has no origin field and gets none). The kinds:
//   PACK                  a WI-T.COM pack entry whose signatures passed or could not be checked (DIGEST_ONLY)
//   PACK_EDITED           a pack entry changed in SAKU; the pack's state is history in `edited_from`
//   SELF_MADE_ZIP_EDITED  a self-made ZIP whose unsigned manifest names a pack (self-reported)
//   SELF_MADE             everything the Owner made or brought without a pack signature
//   AMU_RETURN            an edit request returned from AMU Studio (a candidate)
//   UNKNOWN               a pack state this list does not trust (FAIL, missing): never treated as a pack
// CONTRACT KOKORO Common Authorization v0.1 §SAKU / §SAKU Builder (TV-B-06, TV-B-09, TV-V-11).
const TRUSTED_PACK_STATES = new Set(["PASS", "DIGEST_ONLY"]);
// A row rebuilt from the workspace files or adopted from a pre-list handoff carries no provenance: its origin is
// unknown (G5), never assumed self-made.
const SELF_MADE_SOURCES = new Set(["FILE", "FILE_REPAIRED", "NEW", "BUILDER", "SELF_MADE_ZIP", "IMPORT"]);
// What is written to the workspace's characters/ folder: only the Owner's own rows. A pack lives in imports/ (G1)
// and a return from AMU Studio is a candidate that is not saved (G7, TV-B-09).
const WORKSPACE_MIRROR_SOURCES = new Set(["BUILDER", "NEW", "FILE", "FILE_REPAIRED", "SELF_MADE_ZIP"]);

export function mirrorsToWorkspace(source) {
  return WORKSPACE_MIRROR_SOURCES.has(source);
}

/**
 * The line of revisions a row belongs to, for the 「最新 revision」 mark (G5): one character_id within one origin —
 * a pack's versions, the edits of one pack's Character, or the Owner's own rows. null: a row in no line (unknown
 * origin, or a return from AMU Studio).
 */
export function revisionGroupKey(entry) {
  const id = characterIdOf(entry && entry.character);
  if (!id) return null;
  const origin = originOf(entry);
  if (origin.kind === "PACK") return `${id}|PACK|${origin.pack_id}`;
  if (origin.kind === "PACK_EDITED" || origin.kind === "SELF_MADE_ZIP_EDITED") return `${id}|EDITED|${origin.pack_id}`;
  if (origin.kind === "SELF_MADE") return `${id}|SELF`;
  return null;
}

// 00A QA10 (2026-10-14): an edited_from that does not name its pack completely is not 「WI-T.COM署名無効・改変あり」; the row's
// origin is unknown. A changed pack row's history needs pack_id, pack_version and license (the pack's id as the pack stated it,
// which may be the stale id that the export maps from LICENSE.md); a self-made ZIP's edited_from needs them too, with a pack
// license id, as checkSelfMadeEntries refuses otherwise.
const EDITED_FROM_REQUIRED = ["pack_id", "pack_version", "license"];
const PACK_LICENSE_ID = /^LicenseRef-WIT-(?:Commercial|Subscriber|Sample)-[0-9]+\.[0-9]+$/;
const namesPack = editedFrom => Boolean(editedFrom) && typeof editedFrom === "object"
  && EDITED_FROM_REQUIRED.every(key => typeof editedFrom[key] === "string" && editedFrom[key].length > 0);

function kindOf(provenance, source) {
  if (provenance && provenance.source === "AMU_STUDIO_RETURN") return "AMU_RETURN";
  if (provenance && provenance.kind === "PACK_EDITED") return namesPack(provenance.edited_from) ? "PACK_EDITED" : "UNKNOWN";
  if (provenance && provenance.kind === "SELF_MADE_ZIP") {
    if (!provenance.edited_from) return "SELF_MADE";
    return namesPack(provenance.edited_from) && PACK_LICENSE_ID.test(provenance.edited_from.license) ? "SELF_MADE_ZIP_EDITED" : "UNKNOWN";
  }
  if (provenance && typeof provenance.pack_id === "string" && provenance.pack_id) {
    return TRUSTED_PACK_STATES.has(provenance.signature_state) ? "PACK" : "UNKNOWN";
  }
  // Owner 結果 178 ①: what cannot be classified stays unknown; a row with no provenance and no source is not made self-made.
  if (!provenance && SELF_MADE_SOURCES.has(source)) return "SELF_MADE";
  return "UNKNOWN";
}

/** Where a list row came from: { kind, pack_id?, pack_version?, signature_state? }. */
export function originOf(entry) {
  const provenance = entry && entry.provenance || null;
  const kind = kindOf(provenance, entry && entry.source);
  if (kind === "PACK") return { kind, pack_id: provenance.pack_id, pack_version: provenance.pack_version || "", signature_state: provenance.signature_state };
  if (kind === "PACK_EDITED" || kind === "SELF_MADE_ZIP_EDITED") return { kind, pack_id: provenance.edited_from.pack_id || "", pack_version: provenance.edited_from.pack_version || "" };
  return { kind };
}

/** -1, 0 or 1 by dotted numeric parts ("1.10.0" > "1.9.0"); a non-numeric part compares as text. */
export function compareVersions(a, b) {
  const left = String(a || "").split(/[.+-]/), right = String(b || "").split(/[.+-]/);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const x = left[index] ?? "0", y = right[index] ?? "0";
    const nx = /^\d+$/.test(x) ? Number(x) : NaN, ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) { if (nx !== ny) return nx < ny ? -1 : 1; continue; }
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const EDITED_KINDS = new Set(["PACK_EDITED", "SELF_MADE_ZIP_EDITED"]);

/**
 * May `incoming` ({ character, provenance, source }) replace the row `existing`?
 * Only within one origin: a pack continues only itself and only forwards; the Owner's
 * own rows replace each other; a return from AMU replaces nothing.
 */
export function replaceDecision(existing, incoming) {
  const before = originOf(existing);
  const after = originOf({ provenance: incoming && incoming.provenance || null, source: incoming && incoming.source });
  if (after.kind === "AMU_RETURN") return { replaceable: false, reason: "CA.MEMORY.CANONICAL_BACKFLOW" };
  if (characterIdOf(existing && existing.character) !== characterIdOf(incoming && incoming.character)) return { replaceable: false, reason: "CA.IDENTITY.CHARACTER_MISMATCH" };
  if (before.kind === "SELF_MADE" && after.kind === "SELF_MADE") return { replaceable: true, reason: "SAME_ORIGIN_SELF_MADE" };
  if (EDITED_KINDS.has(before.kind) && EDITED_KINDS.has(after.kind)) {
    return before.pack_id && before.pack_id === after.pack_id
      ? { replaceable: true, reason: "SAME_ORIGIN_EDITED" }
      : { replaceable: false, reason: "CA.PACKAGE.LINEAGE_UNVERIFIED" };
  }
  if (before.kind === "PACK" && after.kind === "PACK") {
    if (before.pack_id !== after.pack_id) return { replaceable: false, reason: "CA.PACKAGE.LINEAGE_UNVERIFIED" };
    const order = compareVersions(after.pack_version, before.pack_version);
    if (order > 0) return { replaceable: true, reason: "SAME_LINEAGE_NEWER" };
    if (order === 0) return { replaceable: true, reason: "SAME_LINEAGE_SAME" };
    return { replaceable: false, reason: "CA.PACKAGE.LINEAGE_UNVERIFIED" };
  }
  return { replaceable: false, reason: "CA.PACKAGE.ORIGIN_UNVERIFIED" };
}

const EDITED_FROM_FIELDS = ["pack_id", "pack_version", "signature_state", "character_digest", "publisher_key_id", "license", "license_md_sha256", "operation_class", "catalog_release_version"];

/**
 * The pack a return from AMU Studio was made from (00A 2026-10-14). A return carries no pack id or license — AMU's
 * 「SAKU へ戻す」 is offered for pack Characters only — so it is traced to the list: the newest version of the only
 * WI-T.COM pack whose row has the same character_id. No such row, or rows of two packs: null (never guessed).
 */
export function packRowForReturn(entry, entries) {
  if (kindOf(entry && entry.provenance || null, entry && entry.source) !== "AMU_RETURN") return null;
  const id = characterIdOf(entry.character);
  const rows = (entries || []).filter(row => row && !row.deleted && characterIdOf(row.character) === id && kindOf(row.provenance || null, row.source) === "PACK");
  if (new Set(rows.map(row => row.provenance.pack_id)).size !== 1) return null;
  return [...rows].sort((a, b) => compareVersions(b.provenance.pack_version, a.provenance.pack_version))[0];
}

function editedFromPack(provenance) {
  const editedFrom = {};
  for (const field of EDITED_FROM_FIELDS) if (provenance[field] !== undefined && provenance[field] !== null && provenance[field] !== "") editedFrom[field] = provenance[field];
  return editedFrom;
}

/**
 * The provenance a changed copy of this row carries: a pack row's state moves into
 * `edited_from` as history, and the copy claims no signature of its own. An edited
 * row passes its first origin on. A return from AMU Studio, traced to its pack in
 * `entries`, is a change of that pack's Character too. A self-made or failed row, or
 * an untraced return, hands nothing on.
 */
export function editedProvenance(entry, entries = null) {
  const provenance = entry && entry.provenance || null;
  const kind = kindOf(provenance, entry && entry.source);
  if (kind === "PACK") return { kind: "PACK_EDITED", edited_from: editedFromPack(provenance) };
  if (kind === "AMU_RETURN") {
    const pack = packRowForReturn(entry, entries || []);
    return pack ? { kind: "PACK_EDITED", edited_from: editedFromPack(pack.provenance), via: "AMU_STUDIO_RETURN" } : null;
  }
  if (kind === "PACK_EDITED") return { kind: "PACK_EDITED", edited_from: { ...provenance.edited_from } };
  return null;
}

/**
 * Add Characters to the list.
 *
 * Every entry carries the schema it was admitted as. There is no default: a
 * caller that does not say which schema a Character is written in is refused,
 * because the alternative is a row nothing downstream knows how to render.
 *
 * onConflict:
 *   "KEEP_BOTH" — the incoming Character is added alongside any existing one
 *   "REPLACE"   — an existing row with the same character_id is overwritten
 *                 (keeping its id) only when replaceDecision allows it; otherwise
 *                 the incoming one is added as its own row and the refusal is
 *                 reported in `refused_replace`. A display name never decides it.
 */
export function importCharacters(characters, source = "IMPORT", { onConflict = "KEEP_BOTH", verification = null, schema = null, entryMeta = null } = {}) {
  if (!schema || !schema.kind || schema.kind === "UNKNOWN_CHARACTER") {
    return { added: 0, replaced: 0, saved: false, reason: "SCHEMA_KIND_REQUIRED", rejected: characters.length, refused_replace: [] };
  }
  const state = read();
  let added = 0, replaced = 0;
  const refusedReplace = [];
  const entryIds = [];
  const at = new Date().toISOString();
  for (const character of characters) {
    if (!character || typeof character !== "object") continue;
    const id = characterIdOf(character);
    // Provenance the intake established for this one Character (a pack entry's
    // operation class, digests, signature state).  Stored beside the Character,
    // never written into it.
    const provenance = typeof entryMeta === "function" ? (entryMeta(character) || null) : null;
    if (onConflict === "REPLACE" && id) {
      const target = replaceTarget(state.entries, { character, provenance, source });
      if (target) {
        const { entry: existing, decision } = target;
        if (decision.replaceable) {
          existing.character = character;
          existing.source = source;
          existing.verification = verification;
          existing.provenance = provenance;
          existing.schema = schema;
          existing.updated_at = at;
          existing.batch = at;
          existing.deleted = false;
          replaced += 1;
          entryIds.push(existing.entry_id);
          continue;
        }
        refusedReplace.push({ character_id: id, entry_id: existing.entry_id, reason: decision.reason });
      }
    }
    const entryId = newId();
    state.entries.push({ entry_id: entryId, character, source, verification, provenance, schema, added_at: at, batch: at, deleted: false });
    entryIds.push(entryId);
    added += 1;
  }
  const saved = write(state);
  return { added, replaced, saved: saved.ok, reason: saved.reason || "", refused_replace: refusedReplace, entry_ids: entryIds };
}

/**
 * The list row the Active SAKU was chosen from (G4, 2026-10-14). The row id the selection carries
 * decides; without one (an older session), the only row with the character_id, or among several the
 * one with the identical Character. Anything else is not guessed: null.
 */
export function entryForActive(entries, active) {
  const character = active && active.character;
  const id = characterIdOf(character);
  // A new Character from ① has no id yet: its row is found by the row id alone, and only while that row is still the
  // unsaved draft with no id (2026-10-15 keying round 2 N1: the line read 「出どころ不明」 for it).
  if (!id) {
    const row = active && active.entry_id ? (entries || []).find(entry => entry && !entry.deleted && entry.entry_id === active.entry_id) : null;
    return row && row.draft && !characterIdOf(row.character) ? row : null;
  }
  const live = (entries || []).filter(entry => entry && !entry.deleted && characterIdOf(entry.character) === id);
  if (active.entry_id) return live.find(entry => entry.entry_id === active.entry_id) || null;
  if (live.length === 1) return live[0];
  const text = JSON.stringify(character);
  const same = live.filter(entry => JSON.stringify(entry.character) === text);
  return same.length === 1 ? same[0] : null;
}

/** Change a row's Character. A pack row stops claiming its signature: the state becomes history (editedProvenance). */
export function update(entryId, character) {
  const state = read();
  const entry = state.entries.find(item => item.entry_id === entryId);
  if (!entry) return { updated: false, saved: false, reason: "ENTRY_NOT_FOUND" };
  if (JSON.stringify(entry.character) !== JSON.stringify(character)) {
    const edited = editedProvenance(entry);
    if (edited) entry.provenance = edited;
  }
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

/**
 * Remove the row 新規作成 put in the list, when it is left without being saved (2026-10-15 keying round 2 N3: a
 * 「Unnamed Character」 row stayed, and the count went up by one). Only a draft row is removed — one this list made
 * blank and nothing has been saved into; any other row is left as it is.
 */
export function discardDraft(entryId) {
  const state = read();
  const index = state.entries.findIndex(entry => entry.entry_id === entryId && entry.draft === true);
  if (index < 0) return { removed: 0, saved: true, reason: "" };
  state.entries.splice(index, 1);
  const saved = write(state);
  return { removed: saved.ok ? 1 : 0, saved: saved.ok, reason: saved.reason || "" };
}

// The only operation that removes rows the Owner keeps. The caller must have confirmed first.
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
