// Rows of unknown origin that a person confirms as their own (SAKU β.13 L11; Owner 結果 383: A, 2 stages, and ロ — the
// repaired files, the Workspace recovery and the hand-off from an older SAKU; not the rows of a pack whose signature failed).
// Design: DESIGN_2026-10-22_SAKU_b13_S7_L11 §4 L11-1〜L11-8, §6.1, §6.2. SAKU only: the frozen kit is not changed — the kit
// reads these rows as UNKNOWN, and an export that passes here hands the kit a copy without provenance (L11-3 (e)).
//
// Every export (and every mark) reads a row in this order (L11-3):
//   (a) a repaired file whose content before the repair is the content of one of the list's pack rows (same ID): that pack's
//       Character, changed (PACK_EDITED, the pack's terms). Compared as canonical JSON with the pack row's Character, which is
//       the Character the pack carried (§6.2: the pack's character_digest is not the repair record's digest_before).
//   (b) a Character ID the SAKU knows as a pack Character (K1: the list's pack rows; K2: the Workspace's imported packs):
//       origin unknown, even when confirmed. (c) K2 cannot be read: unchecked, this time.
//   (d) the content is not the content that was confirmed: not confirmed. (e) otherwise: the person's own.
import { originOf, editedProvenance } from "./character-library.mjs";
import { canonicalJson } from "./canonical-json.mjs";
import { sha256Hex } from "./character-export.mjs";
import { knownPackIds } from "./legacy-origin.mjs";
import { isReadOnly, noteChanged } from "./workspace-state.mjs";

export const DECLARED_KIND = "SELF_MADE_DECLARED";
// The rows the confirmation is offered for, and the basis each record names (§6.1).
export const CONFIRMABLE_SOURCES = Object.freeze({
  FILE_REPAIRED: "PERSON_CONFIRMED_REPAIRED_FILE",
  WORKSPACE_RECOVERY: "PERSON_CONFIRMED_WORKSPACE_RECOVERY",
  HANDOFF: "PERSON_CONFIRMED_HANDOFF",
});
const EDITED_FROM_UNKNOWN = "SAKU_EDITED_FROM_UNKNOWN";
const LIBRARY_KEY = "saku.workspace.library";
const READABLE = new Set(["OK", "NO_WORKSPACE", "NO_HOST"]);
const PACK_COPIED_FIELDS = ["pack_id", "pack_version", "signature_state", "character_digest", "publisher_key_id", "license", "license_md_sha256", "operation_class", "catalog_release_version"];
const rawIdOf = character => (character && character.identity && typeof character.identity.character_id === "string" ? character.identity.character_id : "");
const clone = value => JSON.parse(JSON.stringify(value));

// N-3〜N-5 (ライター&SNS 2026-10-23, FROM_WRITER_2026-10-23_SAKU_S7_L11_texts.md and _consent_license_L11rows.md §3).
// English: 英語翻訳チーム 2026-10-23 (FROM_TRANSLATION_2026-10-23_SAKU13_S7_L11_texts_en.md).
const CONFIRM_REST_EN = "If you made this Character yourself, press “Yes”. After “Yes”, you can export it as your own Character. If it is a pack Character, do not press “Yes”; import the original pack again, then edit that pack's Character again in ②.";
const CONFIRM_REST_JA = "自分で作ったキャラクターなら「はい」を押してください。「はい」の後は、自分で作ったキャラクターとして書き出せます。パックのキャラクターなら、「はい」を押さずに、元のパックを取り込み直してから、②でそのパックのキャラクターを編集し直してください。";
export const CONFIRM_WORDS = Object.freeze({
  action: Object.freeze({ ja: "自分で作ったキャラクターとして確かめる", en: "Confirm as your own Character" }),
  body: Object.freeze({
    FILE_REPAIRED: Object.freeze({ ja: `このキャラクターは、読み込むときに、中の参照（locator）を直して取り込んだものなので、出どころが分かりません。${CONFIRM_REST_JA}`, en: `When this Character was loaded, a reference inside it (locator) was repaired before it was imported, so where it came from is not known. ${CONFIRM_REST_EN}` }),
    WORKSPACE_RECOVERY: Object.freeze({ ja: `このキャラクターは、一覧を作り直したときに、Workspace に保存してあったファイルから戻したものなので、出どころの記録がありません。${CONFIRM_REST_JA}`, en: `This Character was restored from a file saved in the Workspace when the list was rebuilt, so there is no record of where it came from. ${CONFIRM_REST_EN}` }),
    HANDOFF: Object.freeze({ ja: `このキャラクターは、前の版の SAKU から引き継いで、アプリを開いたときに一覧に入れたものなので、出どころの記録がありません。${CONFIRM_REST_JA}`, en: `This Character was carried over from an earlier version of SAKU and added to the list when the app was opened, so there is no record of where it came from. ${CONFIRM_REST_EN}` }),
  }),
});

/**
 * The kind of a row the confirmation is about, or null.
 *   { kind, derived: false }  a row of one of the three sources, as it came in (FILE_REPAIRED with its repair record only;
 *                             a row with a pack_id — a pack whose signature failed — is never one, ロ)
 *   { kind, derived: true }   a row ② saved from one (§3 O-2: SAKU_EDITED_FROM_UNKNOWN, from_source one of the three)
 */
export function rowKind(entry) {
  if (!entry || originOf(entry).kind !== "UNKNOWN") return null;
  const provenance = entry.provenance || null;
  if (provenance && provenance.source === EDITED_FROM_UNKNOWN) return CONFIRMABLE_SOURCES[provenance.from_source] ? { kind: provenance.from_source, derived: true } : null;
  if (!CONFIRMABLE_SOURCES[entry.source]) return null;
  if (entry.source === "FILE_REPAIRED") {
    const only = provenance && provenance.source === "FILE_REPAIRED" && provenance.locator_repair && !provenance.pack_id && !provenance.kind;
    return only ? { kind: "FILE_REPAIRED", derived: false } : null;
  }
  return provenance ? null : { kind: entry.source, derived: false };
}

/** The person's record on this row, when it names this row's kind (P-L11-2: a replaced row keeps an old record). */
export function declaredRecordOf(entry) {
  const kind = rowKind(entry);
  const record = entry && entry.origin_record;
  if (!kind || !record || record.kind !== DECLARED_KIND || record.basis !== CONFIRMABLE_SOURCES[kind.kind]) return null;
  return typeof record.character_digest === "string" && /^[0-9a-f]{64}$/.test(record.character_digest) ? record : null;
}

/** L11-1 (§6.2): the Character before its locators were repaired — each change's `from` back in its place, the revision back. */
export function beforeRepair(entry) {
  const repair = entry && entry.provenance && entry.provenance.locator_repair;
  if (!repair || !Array.isArray(repair.changes) || !entry.character) return null;
  const character = clone(entry.character);
  for (const change of repair.changes) {
    const list = change.group === "seat8" ? character.assistant_composition?.seat8?.human_required_condition_refs : character.conformance_expectations?.[change.group];
    if (!Array.isArray(list) || !list[change.index] || typeof list[change.index] !== "object") return null;
    list[change.index].locator = change.from;
  }
  if (!character.identity || typeof repair.from_revision !== "string") return null;
  character.identity.character_revision = repair.from_revision;
  return character;
}

/** L11-1: { status: "MATCH", packRow } | { status: "AMBIGUOUS" } | { status: "NONE" } — never the newest of several. */
export function repairedPackRow(entry, entries) {
  const kind = rowKind(entry);
  if (!kind || kind.derived || kind.kind !== "FILE_REPAIRED") return { status: "NONE" };
  const before = beforeRepair(entry);
  if (!before) return { status: "NONE" };
  const text = canonicalJson(before);
  const id = rawIdOf(before);
  const rows = (entries || []).filter(row => row && !row.deleted && originOf(row).kind === "PACK" && rawIdOf(row.character) === id && canonicalJson(row.character) === text);
  if (!rows.length) return { status: "NONE" };
  const copied = row => JSON.stringify(PACK_COPIED_FIELDS.map(field => row.provenance[field] ?? null));
  if (new Set(rows.map(copied)).size !== 1) return { status: "AMBIGUOUS" };
  return { status: "MATCH", packRow: rows[0] };
}

/** The digest the record keeps and (d) compares: SHA-256 of the Character's canonical JSON. */
export const contentDigest = character => sha256Hex(canonicalJson(character));

/** The current digests of the rows that carry a record, for (d): Map(entry_id → digest). Read before an export or a mark. */
export async function currentDigests(entries) {
  const digests = new Map();
  for (const entry of entries || []) if (declaredRecordOf(entry)) {
    try { digests.set(entry.entry_id, await contentDigest(entry.character)); } catch { /* no SHA-256 here: left out, (d) stops */ }
  }
  return digests;
}

/**
 * How one row is read (L11-3, L11-4, L11-6). `imported` is the host's fresh answer for K2; `digests` from currentDigests.
 *   { state: "NOT_APPLICABLE" }                    not one of these rows
 *   { state: "PACK", entry }                       (a): the copy to read, as that pack's Character changed
 *   { state: "SELF_MADE", entry }                  (e): the copy to read, without provenance
 *   { state: "HOLD", code, offer }                 stopped; `offer`: the confirmation may be offered (L11-4)
 */
export function declaredOrigin(entry, entries, { imported = null, digests = null } = {}) {
  const kind = rowKind(entry);
  if (!kind) return { state: "NOT_APPLICABLE" };
  const repaired = repairedPackRow(entry, entries);
  if (repaired.status === "MATCH") return { state: "PACK", entry: { ...entry, provenance: editedProvenance(repaired.packRow, entries) } };
  if (repaired.status === "AMBIGUOUS") return { state: "HOLD", code: "ORIGIN_UNKNOWN", offer: false };
  const id = rawIdOf(entry.character);
  if (knownPackIds(entries, null).has(id)) return { state: "HOLD", code: "ORIGIN_UNKNOWN", offer: false };
  if (!imported || !READABLE.has(imported.status) || !Array.isArray(imported.ids)) return { state: "HOLD", code: "ORIGIN_UNCHECKED", offer: false };
  if (knownPackIds(entries, imported).has(id)) return { state: "HOLD", code: "ORIGIN_UNKNOWN", offer: false };
  const record = declaredRecordOf(entry);
  // L11-D: a row ② saved from one that was not confirmed stays of unknown origin; the confirmation is for the row as it came in.
  if (!record) return kind.derived ? { state: "HOLD", code: "ORIGIN_UNKNOWN", offer: false } : { state: "HOLD", code: "ORIGIN_NOT_CONFIRMED", offer: true };
  const now = digests && typeof digests.get === "function" ? digests.get(entry.entry_id) : undefined;
  if (!now) return { state: "HOLD", code: "ORIGIN_UNCHECKED", offer: false };
  if (now !== record.character_digest) return kind.derived ? { state: "HOLD", code: "ORIGIN_UNKNOWN", offer: false } : { state: "HOLD", code: "ORIGIN_NOT_CONFIRMED", offer: true };
  return { state: "SELF_MADE", entry: { ...entry, source: "FILE", provenance: null } };
}

/** The record the confirmation writes (L11-2): beside provenance, never inside it. */
export async function confirmationRecord(entry) {
  const kind = rowKind(entry);
  if (!kind || kind.derived) return null;
  return { kind: DECLARED_KIND, basis: CONFIRMABLE_SOURCES[kind.kind], since: "0.1.0-beta.13", character_digest: await contentDigest(entry.character), confirmed_at: new Date().toISOString() };
}

/** Write a record on one row of the list (the confirmation, or L11-5's carried record on a row ② saved). */
export function writeRecord(entryId, record) {
  if (!record) return { ok: false, reason: "NO_RECORD" };
  if (isReadOnly()) return { ok: false, reason: "WORKSPACE_READ_ONLY" };
  try {
    const state = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "null");
    if (!state || !Array.isArray(state.entries)) return { ok: false, reason: "LIBRARY_MISSING" };
    const entry = state.entries.find(item => item && item.entry_id === entryId);
    if (!entry) return { ok: false, reason: "ENTRY_NOT_FOUND" };
    entry.origin_record = { ...record };
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(state));
    noteChanged(LIBRARY_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error && error.message || error) };
  }
}

/** L11-5: the record a row ② saved from a confirmed row carries — the same basis, the new content's digest. */
export async function carriedRecord(sourceEntry, entries, context, character) {
  if (declaredOrigin(sourceEntry, entries, context).state !== "SELF_MADE") return null;
  const record = declaredRecordOf(sourceEntry);
  return { ...record, character_digest: await contentDigest(character), carried_from: String(sourceEntry.entry_id || ""), confirmed_at: record.confirmed_at || "" };
}
