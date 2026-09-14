// SAKU Builder — Active SAKU session.
//
// The Desktop host previously moved a Character between screens as a one-shot
// handoff: the payload was written, read once, and removed. Every step therefore
// needed the Character to be supplied again, which is why opening Trainer or
// Builder felt like starting over.
//
// This module holds ONE Active SAKU for the workspace and is read without being
// consumed, so Viewer, Trainer and Builder all see the same working subject.
//
// Boundary. This is Builder editing/session state only. It is not AMU memory,
// not runtime activation, and not Canonical Adoption. Nothing here approves,
// signs, or publishes anything.

const ACTIVE_KEY = "saku.workspace.active";
const DRAFT_KEY = "saku.workspace.draft";

// Storage can be unavailable (restricted contexts, private modes). The workflow
// must degrade to a single screen rather than throw.
function readRaw(key) {
  try { return localStorage.getItem(key); } catch (error) { return null; }
}
function writeRaw(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (error) { return false; }
}
function dropRaw(key) {
  try { localStorage.removeItem(key); } catch (error) { /* nothing to drop */ }
}
function parse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { return null; }
}

/** Identity of the Active SAKU, as far as the Builder session is concerned. */
export function identityOf(character) {
  const identity = (character && character.identity) || {};
  const meta = (character && character.meta) || {};
  return {
    character_id: identity.character_id || meta.slug || "",
    display_name: identity.display_name || meta.name || "",
    character_revision: identity.character_revision || meta.version || "",
  };
}

/**
 * Make a Character the Active SAKU. Replaces any previous subject: this product
 * handles one person and one SAKU at a time, deliberately.
 */
export function setActive(character, options = {}) {
  if (!character) return null;
  const record = {
    character,
    identity: identityOf(character),
    source: options.source || "unknown",
    opened_at: new Date().toISOString(),
  };
  if (!writeRaw(ACTIVE_KEY, JSON.stringify(record))) return null;
  // A fresh subject starts clean: the working draft is the Character itself.
  dropRaw(DRAFT_KEY);
  return record;
}

/** Read the Active SAKU. Reading never consumes it. */
export function getActive() {
  return parse(readRaw(ACTIVE_KEY));
}

/**
 * The Character as currently edited. Falls back to the Active SAKU when nothing
 * has been changed yet, so every screen reads the same thing.
 */
export function getWorkingCharacter() {
  const draft = parse(readRaw(DRAFT_KEY));
  if (draft && draft.character) return draft.character;
  const active = getActive();
  return active ? active.character : null;
}

/** Record an edit. The Active SAKU identity is left as it was opened. */
export function updateDraft(character) {
  if (!character) return false;
  const active = getActive();
  if (!active) return false;
  return writeRaw(DRAFT_KEY, JSON.stringify({
    character,
    identity: identityOf(character),
    changed_at: new Date().toISOString(),
  }));
}

/** True when the working draft differs from what was opened. */
export function isDirty() {
  const draft = parse(readRaw(DRAFT_KEY));
  const active = getActive();
  if (!draft || !active) return false;
  return JSON.stringify(draft.character) !== JSON.stringify(active.character);
}

/** After a successful save the working draft becomes the opened state. */
export function markSaved() {
  const draft = parse(readRaw(DRAFT_KEY));
  const active = getActive();
  if (!draft || !active) return false;
  active.character = draft.character;
  active.identity = draft.identity;
  active.saved_at = new Date().toISOString();
  writeRaw(ACTIVE_KEY, JSON.stringify(active));
  dropRaw(DRAFT_KEY);
  return true;
}

/**
 * Leave the workspace. This is 「最初から」, not TOP: returning to the workspace
 * home keeps the Active SAKU, while this removes it.
 */
export function clearActive() {
  dropRaw(ACTIVE_KEY);
  dropRaw(DRAFT_KEY);
}

/** A short description for the workspace home and screen headers. */
export function summary() {
  const active = getActive();
  if (!active) return null;
  const working = getWorkingCharacter();
  return {
    identity: identityOf(working || active.character),
    source: active.source,
    dirty: isDirty(),
  };
}
