// What the Character File is and how it reaches AMU Studio and MACHI, in one place
// (ライター&SNS 2026-09-27, EN 英語翻訳チーム 依頼 AC1, Wi-t_Site 0445060). It replaces
// the older lines that said AMU/MACHI receive it "only through a signed pack": since
// 2026-09-27 AMU also imports the self-made ZIP (never the JSON itself), and MACHI takes
// the signed pack only.
//
// Shown under the Character File tab (tools/saku-builder.html TAB_PURPOSE.json, which
// must hold the same text; self-made-zip:verify checks it) and in manual P09. No other
// screen text states how the file is delivered.
export const CHARACTER_FILE_PURPOSE = Object.freeze({
  ja: "署名やパックを作るときの元になる JSON です。この SAKU Builder へは読み戻せません。AMU Studio へは「AMU 用 ZIP をダウンロード」で作る ZIP で取り込めます（署名は付かず、署名のない自作の Character として扱われます）。MACHI へは、署名付きのパックにして渡します。",
  en: "This is the JSON used as the source when you make a signature or a pack. It cannot be loaded back into this SAKU Builder. For AMU Studio, import the ZIP made with “Download ZIP for AMU” (it carries no signature, so AMU treats it as an unsigned Character you made yourself). For MACHI, make it into a signed pack and hand over the pack.",
});
