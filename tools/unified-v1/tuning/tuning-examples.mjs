// The example for each (symptom × field) the 「AI 動作の調整」 screen offers (Owner 結果 420 ①②; 統括 2026-10-24).
//
// One row per pair the knowledge gives (tuning-knowledge-20: 20 items × their existing fields, 130 pairs). A row says how a
// typed text goes into its field, as previewApply puts it: APPEND (one more line of a list of strings), REPLACE (the whole
// string), CHOICE (one of the field's values, the code itself), NONE (an object or a list of objects: a typed text cannot go
// in, so there is no example and Tab does nothing; the screen says so, and the button opens ② without a change).
// Texts: ライター&SNS 2026-10-24 (the examples, the Tab hint, the NONE note), 英語翻訳チーム 2026-10-24.
import EXAMPLES from "./tuning-examples-20.data.mjs";

export const TUNING_EXAMPLES = EXAMPLES;
export const TUNING_EXAMPLE_WORDS = Object.freeze({
  tabHint: Object.freeze({ ja: "入力欄が空のとき、Tab キーで例文を入れられます。", en: "When the input field is empty, press Tab to enter the example." }),
  noText: Object.freeze({
    ja: "この項目は、ここでは文で入れられません。「この内容でキャラクター編集を開く」を押すと、②キャラクター編集へ移ります。そこで、この項目を直してください。",
    en: "This item cannot be entered as text here. Press “Open in Character editing with this content” to go to ② Edit the Character, and change this item there.",
  }),
});

const byPair = new Map(EXAMPLES.examples.map(row => [`${row.item_id}|${row.field}`, row]));

/** The example of one pair in the screen's language: { kind, text }. A pair the table does not hold is UNKNOWN, with no text. */
export function exampleFor(itemId, field, locale = "ja-JP") {
  const row = byPair.get(`${itemId}|${field}`);
  if (!row) return { kind: "UNKNOWN", text: "" };
  if (row.kind === "NONE") return { kind: "NONE", text: "" };
  return { kind: row.kind, text: String((locale === "en-US" ? row.en : row.ja) || "") };
}

/** 結果 420 ②: Tab on an empty input puts the example in. With input, with Shift, or with no example, Tab moves on as always. */
export function tabFills({ key, shiftKey, value, example }) {
  return key === "Tab" && !shiftKey && String(value ?? "") === "" && Boolean(example);
}
