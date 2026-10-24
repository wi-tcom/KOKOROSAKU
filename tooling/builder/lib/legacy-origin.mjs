// Rows saved before β.13 with no record of where they came from (SAKU β.13 L10; Owner 結果 281 問い 6, design v4 §8.2;
// 00A ANSWER_2026-10-22_L10_known_pack_ids C06-1〜6; 統括 2026-10-22: K1＋K2, the record kept outside provenance so that
// the frozen kit — character-library.mjs and character-export.mjs — stays as it is).
//
// A row with no provenance whose source is one of the self-made sources is read as self-made by the kit (kindOf, the
// rule at character-library.mjs:183). A β.11 row that edited a pack Character looks the same, so before every export:
//   - a row the app recorded as self-made (entry.origin_record, written from β.13 on) is self-made;
//   - an unrecorded row whose Character ID is a known pack Character ID stops: origin unknown (ORIGIN_UNKNOWN, C06-3);
//   - when the imported packs cannot be read, an unrecorded row stops this time: unchecked (ORIGIN_UNCHECKED, C06-6).
// Known pack Character IDs (C06-1): (a) the list's PACK and PACK_EDITED rows, deleted ones too; (b) the slugs of the
// packs this Workspace imported, from the host (list_imported_pack_ids; .pending is not read). Compared exactly.
// Nothing here guesses a pack, a license or a signature state from an ID (design v4 §8.2).
import { originOf } from "./character-library.mjs";
import { isReadOnly, noteChanged } from "./workspace-state.mjs";

export const SELF_MADE_RECORD = Object.freeze({ kind: "SELF_MADE", since: "0.1.0-beta.13" });
const LIBRARY_KEY = "saku.workspace.library";
const PACK_KINDS = new Set(["PACK", "PACK_EDITED"]);
// What the host's read means for an unrecorded row: readable (the slugs are complete) or not.
const READABLE = new Set(["OK", "NO_WORKSPACE", "NO_HOST"]);
// C06-1: compared exactly — the ID as written, not the kit's trimmed reading.
const rawIdOf = character => (character && character.identity && typeof character.identity.character_id === "string" ? character.identity.character_id : "");

export const hasSelfMadeRecord = entry => Boolean(entry && entry.origin_record && entry.origin_record.kind === "SELF_MADE");

/** The kit reads it as self-made only by the rule of character-library.mjs:183 (no provenance, a self-made source), and the app has not recorded it. */
export function isUnrecordedRow(entry) {
  return Boolean(entry) && !entry.provenance && originOf(entry).kind === "SELF_MADE" && !hasSelfMadeRecord(entry);
}

/** C06-1: the known pack Character IDs, exactly as written. `imported` is the host's answer ({ status, ids }). */
export function knownPackIds(entries, imported) {
  const ids = new Set();
  for (const entry of entries || []) if (PACK_KINDS.has(originOf(entry).kind)) { const id = rawIdOf(entry.character); if (id) ids.add(id); }
  for (const id of (imported && Array.isArray(imported.ids) ? imported.ids : [])) if (typeof id === "string" && id) ids.add(id);
  return ids;
}

/**
 * The refusal for one row before an export, or null: { code: "ORIGIN_UNKNOWN" } when an unrecorded row carries a known
 * pack Character ID, { code: "ORIGIN_UNCHECKED" } when the imported packs could not be read (this time only; the row's
 * mark is not changed). `entries` is the whole list (deleted rows too); `imported` is the host's fresh answer.
 * A hit on the list's pack rows (K1) is ORIGIN_UNKNOWN even when the host cannot be read, as its mark says (統括
 * 2026-10-22 N3-1); ORIGIN_UNCHECKED is only for a row K1 does not hit while K2 cannot be read. Both stop the export.
 */
export function legacyExportRefusal(entry, entries, imported) {
  if (!isUnrecordedRow(entry)) return null;
  if (knownPackIds(entries, null).has(rawIdOf(entry.character))) return { code: "ORIGIN_UNKNOWN" };
  if (!imported || !READABLE.has(imported.status) || !Array.isArray(imported.ids)) return { code: "ORIGIN_UNCHECKED" };
  return knownPackIds(entries, imported).has(rawIdOf(entry.character)) ? { code: "ORIGIN_UNKNOWN" } : null;
}

const UNKNOWN_BADGE = Object.freeze({ id: null, class: "UNKNOWN", pack_id: "" });
/**
 * The mark of a row (統括 照らし NG-4, 00A C06-3): an unrecorded row whose Character ID is a known pack Character ID is
 * shown 出どころ不明 (the badge with no id, origin-badges.mjs UNKNOWN_LABEL), not 自作. The list's pack rows (K1) count
 * always; the imported packs (K2) count when the host's answer is readable. An unreadable answer leaves the mark as it
 * is (C06-6: only the export stops, this time). Every other row keeps its badge: `badgeFor` is the caller's
 * (origin-badges.mjs, which the public web tool does not carry, so it is not imported here).
 */
export function originBadge(entry, entries, imported, badgeFor) {
  if (!entry) return { ...UNKNOWN_BADGE };
  if (isUnrecordedRow(entry) && knownPackIds(entries, imported && READABLE.has(imported.status) ? imported : null).has(rawIdOf(entry.character))) return { ...UNKNOWN_BADGE };
  return badgeFor(entry);
}

/**
 * C06-4: the record a saved row gets from the row it was saved from — only a new Character (② 新規作成's draft) or a row
 * already recorded as self-made. An unrecorded row, a pack row or nothing known gives none.
 */
export function recordForSave(sourceEntry) {
  if (sourceEntry && (sourceEntry.draft === true || hasSelfMadeRecord(sourceEntry))) return SELF_MADE_RECORD;
  return null;
}

/** Write the record on the saved rows (beside provenance, never inside it). Read-only windows write nothing. */
export function markSelfMade(entryIds, record = SELF_MADE_RECORD) {
  if (!record || !Array.isArray(entryIds) || entryIds.length === 0) return { ok: true, marked: 0 };
  if (isReadOnly()) return { ok: false, reason: "WORKSPACE_READ_ONLY", marked: 0 };
  try {
    const state = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "null");
    if (!state || !Array.isArray(state.entries)) return { ok: false, reason: "LIBRARY_MISSING", marked: 0 };
    let marked = 0;
    for (const entry of state.entries) if (entry && entryIds.includes(entry.entry_id) && !entry.provenance) { entry.origin_record = { ...record }; marked += 1; }
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(state));
    noteChanged(LIBRARY_KEY);
    return { ok: true, marked };
  } catch (error) {
    return { ok: false, reason: String(error && error.message || error), marked: 0 };
  }
}
