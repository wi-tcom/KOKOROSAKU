// O-11: the titles, button names and fixed bodies of the app's confirmations, in
// one place so the writer team reviews them together. A missing English field
// means it has not been delivered yet; until it is, the Japanese is shown
// (English is never written here by the builder: 英語翻訳チーム via ライター&SNS).
//
// Japanese: ライター&SNS style check 719912d / d5c579e, C's body 2026-09-24.
// English:  英語翻訳チーム request V (Wi-t_Site site-content/manuals/translation/
//           saku-dialogs-badge-V_EN.json, 8840a86 / f6606c4), 25/25.
// A body may carry 〔名前〕 or {N}; `fill` puts the value in.

export const CONFIRM_WORDING_STATUS = "JA_APPROVED_EN_DELIVERED";

export const CONFIRM_WORDING = Object.freeze({
  // A. home: switching the Workspace with an unsaved draft (body: workspaceWording.discardDraft)
  discardDraftAndSwitch: {
    ja: { title: "切り替えの確認", confirm: "捨てて切り替える", cancel: "キャンセル" },
    en: { title: "Switch Workspace", confirm: "Discard and switch", cancel: "Cancel" },
  },
  // B. 01 import: a name already in the list (cancel keeps both)
  replaceSameName: {
    ja: { title: "置き換えの確認", confirm: "置き換える", cancel: "両方残す", body: "同じ名前のキャラクターが既にあります: 〔名前〕" },
    en: { title: "Replace Character", confirm: "Replace", cancel: "Keep both", body: "Already in the list with a matching name: 〔名前〕" },
  },
  // C. 01 「一覧をクリア」
  clearList: {
    ja: { title: "一覧消去の確認", confirm: "消去する", cancel: "キャンセル", body: "一覧の{N}件をすべて消去してよいですか？\n\nこの操作は元に戻せません。" },
    en: { title: "Clear list", confirm: "Clear", cancel: "Cancel", body: "Clear all {N} items in the list?\n\nThis cannot be undone." },
  },
  // D. home 「選択を解除」 with unsaved changes
  clearSelection: {
    ja: { title: "選択解除の確認", confirm: "解除して変更を捨てる", cancel: "キャンセル", body: "未保存の変更があります。選択を解除すると、この変更は失われます。" },
    en: { title: "Deselect Character", confirm: "Deselect and discard changes", cancel: "Cancel", body: "There are unsaved changes. If you deselect, these changes are lost." },
  },
  // E. 02 「記入例から新規作成」 over existing input
  overwriteWithExample: {
    ja: { title: "上書きの確認", confirm: "上書きする", cancel: "キャンセル", body: "現在の入力内容を上書きしてもよいですか？" },
    en: { title: "Overwrite input", confirm: "Overwrite", cancel: "Cancel", body: "Do you want to overwrite the current input?" },
  },
  // G. 02 「入力内容のクリア」 (the Golden page's own question; the second, duplicate one is gone)
  clearInput: {
    ja: { title: "全消去の確認", confirm: "消してやり直す", cancel: "キャンセル", body: "入力内容をすべて消して最初からにしますか？" },
    en: { title: "Erase everything", confirm: "Erase and start over", cancel: "Cancel", body: "Erase all the input and start over?" },
  },
  // H. 02 leaving with unsaved changes (body: the Golden page's question, both languages)
  saveAndContinue: {
    ja: { title: "保存の確認", confirm: "保存して進む", cancel: "編集に戻る" },
    en: { title: "Save before continuing", confirm: "Save and continue", cancel: "Back to editing" },
  },
  // I. 02 applying occupation data over existing input (body: built by the Golden page)
  overwriteWithOccupation: {
    ja: { title: "職種情報による上書きの確認", confirm: "上書きする", cancel: "キャンセル" },
    en: { title: "Overwrite with occupation data", confirm: "Overwrite", cancel: "Cancel" },
  },
});

/** The wording for one confirmation in the display language ("en" or "ja"); a field
 * the English lacks falls back to the Japanese. */
export function confirmWording(key, language = "ja") {
  const entry = CONFIRM_WORDING[key];
  if (!entry) throw new Error(`CONFIRM_WORDING_UNKNOWN ${key}`);
  if (language !== "en" || !entry.en) return { ...entry.ja };
  const merged = { ...entry.ja };
  for (const [field, value] of Object.entries(entry.en)) if (value) merged[field] = value;
  return merged;
}

/** Put 〔名前〕 and {N} into a body. */
export function fill(body, { names = "", count = "" } = {}) {
  return String(body || "").replaceAll("〔名前〕", String(names)).replaceAll("{N}", String(count));
}
