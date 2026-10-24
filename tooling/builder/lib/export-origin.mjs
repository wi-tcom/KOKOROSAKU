// Where a row came from, at the two places SAKU writes a Character out of a row: ②'s save, and the exports (④ and ②'s
// 「ダウンロード」「コピー」). SAKU β.13 S-7 (設計 v4 §8.3; Owner 結果 281 問い 8, 381; 統括 2026-10-22 NG-1・NG-4・NG-10・NG-11).
// SAKU only: the frozen kit (character-library.mjs, character-export.mjs) is not changed; its rules are used as they are.
//
//   resolveReturnPack  a return from AMU Studio is traced to its pack by the digest it carries — the one pack row (not
//                      deleted, kit kind PACK, same character_id) whose provenance.character_digest is the return's. One
//                      (pack_id, pack_version) whose copied fields agree: RESOLVED. None: UNRESOLVED. More: AMBIGUOUS.
//                      Never the newest version. The digest is what the return names itself; resolving it can only add
//                      a pack's terms, never make it self-made (fail-closed).
//   saveOrigin         the origin ②'s save gives the new row: it keeps the origin of the row it was opened from, and a
//                      row whose origin is not known never becomes self-made by being saved (NG-1). An unresolved return
//                      or a row ① opened that cannot be found again is not saved at all.
//   exportEntryFor     the row an export reads: a return resolved as above (never the newest version).
//   EXPORT_REFUSAL_WORDS  the refusal of every export, Japanese and English, at ④ and ② alike (ライター&SNS; the English
//                      is the translation team's, the same as desktop/i18n.mjs).
import { originOf, editedProvenance } from "./character-library.mjs";
import { exportPermission } from "./character-export.mjs";
import { legacyExportRefusal, SELF_MADE_RECORD } from "./legacy-origin.mjs";
import { declaredOrigin, rowKind } from "./declared-origin.mjs";

export const EXPORT_REFUSAL_WORDS = Object.freeze({
  ENTRY_NOT_RESOLVED: Object.freeze({ ja: "一覧の行が分からないため、書き出しません。①キャラクター選択で選び直してください。", en: "Not exported because the row in the list cannot be identified. Choose the Character again in ① Choose a Character." }),
  ORIGIN_UNKNOWN: Object.freeze({ ja: "このキャラクターは出どころが分からないため、書き出しません。取り込み直してください。", en: "Not exported because where this Character came from is not known. Import it again." }),
  ORIGIN_UNCHECKED: Object.freeze({ ja: "取り込んだパックの記録を読めなかったため、このキャラクターの出どころを確かめられませんでした。キャラクターに問題があるという意味ではありません。今回は書き出しません。もう一度試してください。", en: "The record of the imported pack could not be read, so where this Character came from could not be checked. This does not mean that there is a problem with the Character. It is not exported this time. Try again." }),
  SAMPLE_NOT_EXPORTABLE: Object.freeze({ ja: "見本（サンプル）のキャラクターは読むだけです。どの形でも書き出せません（見本の使用条件）。", en: "Sample Characters are for reading only. They cannot be exported in any form (the samples' terms of use)." }),
  PACK_LICENSE_UNKNOWN: Object.freeze({ ja: "パックの使用条件が分からないため、書き出しません。パックを取り込み直してください。", en: "Not exported because the pack's terms of use are not known. Import the pack again." }),
  PACK_TEXT_NOT_EXPORTABLE: Object.freeze({ ja: "パックのキャラクターは .json／.yaml では書き出せません。書き出せるのは自作のキャラクターだけです。", en: "A pack Character cannot be exported as .json / .yaml. Only self-made Characters can be exported this way." }),
  PACK_ZIP_NOT_SELF_MADE: Object.freeze({ ja: "編集していないパックのキャラクターは、自作の ZIP にはできません。②で編集して保存したものは書き出せます。", en: "A pack Character that has not been edited cannot be made into a self-made ZIP. A pack Character edited and saved in ② can be exported." }),
  RETURN_ZIP_LATER: Object.freeze({ ja: "AMU Studio から戻ってきたキャラクターは、いまは .zip にしません（AMU Studio へ戻すファイルは β.5 の後に作ります）。", en: "A Character returned from AMU Studio is not exported as a .zip for now (the file that goes back to AMU Studio will come after β.5)." }),
  // L11 N-5 (ライター&SNS 2026-10-23): a row the person may confirm as their own, before they do. English: 英語翻訳チーム 2026-10-23.
  ORIGIN_NOT_CONFIRMED: Object.freeze({ ja: "出どころの記録が無いキャラクターは、出どころを確かめるまで書き出せません。自分で作ったものなら、「自分で作ったキャラクターとして確かめる」を押してください。", en: "A Character with no record of where it came from cannot be exported until where it came from is confirmed. If you made it yourself, press “Confirm as your own Character”." }),
  // N-2 (ライター&SNS 2026-10-23): the words of S-7, which decides a return by its digest, not by "the pack is not in the list".
  // English: 英語翻訳チーム 2026-10-23 (FROM_TRANSLATION_2026-10-23_SAKU13_S7_L11_texts_en.md).
  RETURN_PACK_UNKNOWN: Object.freeze({ ja: "AMU Studio から戻ってきたこのキャラクターは、元のパックを一覧の中で 1 つに決められないため、書き出しません。元のパック（同じ版）を取り込んでから、書き出してください。", en: "This Character came back from AMU Studio, and its original pack cannot be narrowed down to one in the list, so it is not exported. Import the original pack (the same version), then export it." }),
});

// ②'s save, download and copy refused (N-1・N-6, ライター&SNS 2026-10-23 08:16; English: 英語翻訳チーム 2026-10-23).
// N-6 names what was pressed: {operation} is one of SAVE_OPERATION_WORDS.
export const SAVE_REFUSAL_WORDS = Object.freeze({
  RETURN_PACK_UNRESOLVED: Object.freeze({ ja: "AMU Studio から戻ってきたこのキャラクターは、元のパックを一覧の中で 1 つに決められないため、保存しませんでした。入力はそのまま残っています。元のパック（同じ版）を取り込んでから、もう一度保存してください。", en: "This Character came back from AMU Studio, and its original pack cannot be narrowed down to one in the list, so it was not saved. Your input is still there. Import the original pack (the same version), then save again." }),
  RETURN_PACK_AMBIGUOUS: Object.freeze({ ja: "AMU Studio から戻ってきたこのキャラクターは、元のパックを一覧の中で 1 つに決められないため、保存しませんでした。入力はそのまま残っています。元のパック（同じ版）を取り込んでから、もう一度保存してください。", en: "This Character came back from AMU Studio, and its original pack cannot be narrowed down to one in the list, so it was not saved. Your input is still there. Import the original pack (the same version), then save again." }),
  ORIGIN_ROW_UNRESOLVED: Object.freeze({ ja: "このキャラクターを、一覧のどのキャラクターから開いたのかを 1 つに決められないため、{operation}しませんでした。①でキャラクターを選び直してから、もう一度開いてください。", en: "Which Character in the list this one was opened from cannot be narrowed down to one, so it was not {operation}. Choose the Character again in ①, then open it again." }),
});
export const SAVE_OPERATION_WORDS = Object.freeze({
  save: Object.freeze({ ja: "保存", en: "saved" }),
  download: Object.freeze({ ja: "ダウンロード", en: "downloaded" }),
  copy: Object.freeze({ ja: "コピー", en: "copied" }),
});
/** The words of one refusal of ②, in `lang` ("ja" or "en"), with what was pressed filled in. */
export function saveRefusalText(code, operation, lang) {
  const words = SAVE_REFUSAL_WORDS[code] || EXPORT_REFUSAL_WORDS[code];
  if (!words || !words[lang]) return code;
  const op = SAVE_OPERATION_WORDS[operation]?.[lang] || "";
  return words[lang].replace("{operation}", op);
}

const PACK_COPIED_FIELDS = ["pack_id", "pack_version", "signature_state", "character_digest", "publisher_key_id", "license", "license_md_sha256", "operation_class", "catalog_release_version"];
const HEX64 = /^[0-9a-f]{64}$/;
const idOf = character => (character && character.identity && typeof character.identity.character_id === "string" ? character.identity.character_id : "");
const clone = value => JSON.parse(JSON.stringify(value));

/** S7-1〜S7-3. `entries` is the list (deleted rows are not candidates). */
export function resolveReturnPack(entry, entries) {
  if (!entry || originOf(entry).kind !== "AMU_RETURN") return { status: "NOT_A_RETURN" };
  const digest = entry.provenance && entry.provenance.character_digest;
  if (typeof digest !== "string" || !HEX64.test(digest)) return { status: "UNRESOLVED" };
  const id = idOf(entry.character);
  const rows = (entries || []).filter(row => row && !row.deleted && idOf(row.character) === id && originOf(row).kind === "PACK" && row.provenance.character_digest === digest);
  if (!rows.length) return { status: "UNRESOLVED" };
  const copied = row => JSON.stringify(PACK_COPIED_FIELDS.map(field => row.provenance[field] ?? null));
  if (new Set(rows.map(copied)).size !== 1) return { status: "AMBIGUOUS", candidates: rows.map(row => row.entry_id) };
  return { status: "RESOLVED", packRow: rows[0] };
}

/** The provenance a changed copy of a resolved return carries: that pack row's, through the kit, with where it came from. */
const returnProvenance = (packRow, entries) => ({ ...editedProvenance(packRow, entries), via: "AMU_STUDIO_RETURN" });

// A Character loaded into ② from a file, the example or a template (beginWorkingCharacter: import, example, template, and
// its default builder) is read as a file import (NG-11). Any other Active that names a Character came from a row: chosen
// in ①, or handed on by ② or the Trainer (builder-platform, builder-train, builder-save, trainer-handoff and the like) —
// so a row that cannot be found again stops, whether or not the hand-off kept its id (design S7-9; 統括 照らし #124 NG-1).
const FILE_SOURCES = new Set(["import", "example", "template", "builder"]);
const FROM_LIST_SOURCES = new Set(["library-view", "library-edit", "tuning-apply"]);
export const openedFromList = active => Boolean(active && (active.entry_id || FROM_LIST_SOURCES.has(active.source)
  || (!FILE_SOURCES.has(String(active.source || "")) && idOf(active.character))));

/**
 * S7-4〜S7-9 and §3 O-2: what ②'s save gives the new row, before anything is written.
 *   { ok: true, meta }         meta is the provenance (null: no provenance — a new Character, a file loaded into ②, or a
 *                              row the kit reads as self-made with no provenance; L10 decides those at export)
 *   { ok: false, code }        RETURN_PACK_UNRESOLVED, RETURN_PACK_AMBIGUOUS, ORIGIN_ROW_UNRESOLVED: nothing is saved
 */
export function saveOrigin(sourceEntry, entries, active, context = {}) {
  if (!sourceEntry) return openedFromList(active) ? { ok: false, code: "ORIGIN_ROW_UNRESOLVED" } : { ok: true, meta: null };
  const provenance = sourceEntry.provenance || null;
  const kind = originOf(sourceEntry).kind;
  if (kind === "PACK" || kind === "PACK_EDITED") return { ok: true, meta: editedProvenance(sourceEntry, entries) };
  if (kind === "AMU_RETURN") {
    const traced = resolveReturnPack(sourceEntry, entries);
    if (traced.status === "RESOLVED") return { ok: true, meta: returnProvenance(traced.packRow, entries) };
    return { ok: false, code: traced.status === "AMBIGUOUS" ? "RETURN_PACK_AMBIGUOUS" : "RETURN_PACK_UNRESOLVED" };
  }
  // A self-made ZIP (with or without a pack named in it) keeps its own record (NG-10).
  if ((kind === "SELF_MADE_ZIP_EDITED" || kind === "SELF_MADE") && provenance) return { ok: true, meta: clone(provenance) };
  // A row the kit reads as self-made with no provenance: as before (L10 records it, or leaves it unrecorded, C06-4).
  if (kind === "SELF_MADE") return { ok: true, meta: null };
  // L11-5 (and L11-1): a repaired file that is a pack's Character gives that pack's changed Character; a row the person
  // confirmed, read as their own (all of L11-3), gives a row of unknown origin that carries the record (carry: true; the
  // caller writes declared-origin.mjs carriedRecord on it). `context` is { imported, digests }, read fresh.
  {
    const declared = declaredOrigin(sourceEntry, entries, context);
    if (declared.state === "PACK") return { ok: true, meta: declared.entry.provenance };
    if (declared.state === "SELF_MADE") return { ok: true, carry: true, meta: { source: "SAKU_EDITED_FROM_UNKNOWN", from_source: rowKind(sourceEntry).kind, from_provenance: provenance ? clone(provenance) : null } };
  }
  // Anything else — a repaired file, a Workspace recovery, a hand-off, a pack whose signature failed, or a kind this table
  // does not know — stays of unknown origin: the kit reads this provenance (no pack_id, no kind) as UNKNOWN (NG-1, NG-10).
  return { ok: true, meta: { source: "SAKU_EDITED_FROM_UNKNOWN", from_source: String(sourceEntry.source || ""), from_provenance: provenance ? clone(provenance) : null } };
}

/** S7-7: the row an export reads. A resolved return reads as that pack's changed Character; an unresolved one as it is
 *  (the kit refuses it: RETURN_PACK_UNKNOWN). L11: a row of unknown origin the person may confirm is read by
 *  declared-origin.mjs — a copy to export, or the row with `export_hold` (the refusal code; the kit is not asked).
 *  `context` is { imported, digests }, read fresh; without it such a row is held as ORIGIN_UNCHECKED. */
export function exportEntryFor(entry, entries, context = {}) {
  const declared = declaredOrigin(entry, entries, context);
  if (declared.state === "PACK" || declared.state === "SELF_MADE") return declared.entry;
  if (declared.state === "HOLD") return { ...entry, export_hold: declared.code };
  if (!entry || originOf(entry).kind !== "AMU_RETURN") return entry;
  const traced = resolveReturnPack(entry, entries);
  return traced.status === "RESOLVED" ? { ...entry, provenance: returnProvenance(traced.packRow, entries) } : entry;
}

/**
 * S7-8: the refusal code of one export of the row a Character was opened from, or null — the same checks as ④, in the
 * same order: the return traced (exportEntryFor), the rows saved with no record (L10, K1・K2), then the kit's table.
 *   sourceEntry  the row (entryForActive); null for a Character loaded into ② from a file or a template, which is read
 *                as a file import would be (no record, checked against K1・K2), or for a row ① opened that is gone
 *   active       the Active SAKU (whether ② was opened from ①)
 *   kind         "text" (.json／.yaml, ②'s character.yaml・Character.json・試験記録) or "zip"
 */
export function exportRefusalCode({ sourceEntry, entries, imported, active, character, kind = "text", digests = null }) {
  if (!sourceEntry && openedFromList(active)) return "ORIGIN_ROW_UNRESOLVED";
  // An unsaved new Character from ① is the person's own (C06-4), like a saved one.
  const row = sourceEntry
    ? (sourceEntry.draft ? { ...sourceEntry, origin_record: SELF_MADE_RECORD } : sourceEntry)
    : { entry_id: "", source: "FILE", provenance: null, character, deleted: false };
  const exported = exportEntryFor(row, entries, { imported, digests });
  if (exported.export_hold) return exported.export_hold;
  const legacy = legacyExportRefusal(exported, entries, imported);
  if (legacy) return legacy.code;
  const verdict = exportPermission(exported, kind);
  return verdict.ok ? null : verdict.code;
}
