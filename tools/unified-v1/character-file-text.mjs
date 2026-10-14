// What the Character File is and how it reaches AMU Studio and MACHI, in one place
// (ライター&SNS 2026-09-27, EN 英語翻訳チーム 依頼 AC1, Wi-t_Site 0445060). It replaces
// the older lines that said AMU/MACHI receive it "only through a signed pack": since
// 2026-09-27 AMU also imports the self-made ZIP (never the JSON itself), and MACHI takes
// the signed pack only. 2026-10-14 (Owner 画面改修): the JSON is read back by the individual import, and the
// ZIP is made in ④ 出力. Provisional wording until ライター&SNS / 英語翻訳チーム check it.
//
// Shown under the Character File tab (tools/saku-builder.html TAB_PURPOSE.json, which
// must hold the same text; self-made-zip:verify checks it) and in manual P09. No other
// screen text states how the file is delivered.
export const CHARACTER_FILE_PURPOSE = Object.freeze({
  ja: "署名やパックを作るときの元になる JSON です。この SAKU Builder の「個別ファイルインポート」で読み戻せます。AMU Studio へは「④出力」の「SAKU キャラクターを書き出す（.zip）」で作る ZIP で取り込めます（署名は付かず、署名のない自作の Character として扱われます）。MACHI へは、署名付きのパックにして渡します。",
  en: "This is the JSON used as the source when you make a signature or a pack. It can be imported back into this SAKU Builder with “Import a single file”. For AMU Studio, import the ZIP made with “Export the SAKU Character (.zip)” in ④ Export (it carries no signature and is treated as a self-made Character with no signature). For MACHI, make it a signed pack and hand that over.",
});
