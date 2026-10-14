// The list badge for a Character row, decided from where the row came from (character-library.mjs originOf).
//
// Owner 2026-10-14: one axis, the WI-T.COM signature — valid / unverified / invalid (modified) / none (self-made).
// A pack Character changed in SAKU is "invalid · modified", not "no signature". An AMU Studio return is a
// candidate, outside the four. The same words are to be used by AMU Studio.
//
// The words are held by ID. WORDING_STATUS stays DRAFT until the Owner approves the wording shared with AMU
// (統括 METHOD 2026-10-14 §3-4); then only BADGES' labels change.
//   Japanese: ライター&SNS, internal wording record (4th edition; Owner 2026-10-14
//             「案Aで進めてください」: all four begin with WI-T.COM署名 — 「WI-T.COM署名無し・自作」)
//   English:  英語翻訳チーム, Wi-t_Site site-content/manuals/translation/2026-10-14_saku-builder-badges_EN.md @58ffbfc
//             (3rd edition, shared with AMU Studio; 無し = "absent" so the four begin alike)
import { originOf } from "./character-library.mjs";

export const WORDING_STATUS = "DRAFT";
export const SAMPLE_PACK_ID = "saku-pack-sample";

const badge = (cls, ja, en, descJa, descEn) => Object.freeze({ class: cls, label: Object.freeze({ ja, en }), description: Object.freeze({ ja: descJa, en: descEn }) });

export const BADGES = Object.freeze({
  B1: badge("VALID", "WI-T.COM署名有効", "WI-T.COM signature valid",
    "WI-T.COM のパックの署名と、キャラクターごとの署名を確かめました。WI-T.COM が署名したときから中身は変わっていません。",
    "The WI-T.COM pack signature and this Character's signature were checked. The contents have not changed since WI-T.COM signed them."),
  B2: badge("VALID", "WI-T.COM署名有効・サンプル", "WI-T.COM signature valid · Sample",
    "WI-T.COM が署名した見本のパックです。署名を確かめました。得意な領域を 1 つに絞った見本です。",
    "A sample pack signed by WI-T.COM. The signature was checked. This sample covers one area of expertise only."),
  B3: badge("UNVERIFIED", "WI-T.COM署名未確認", "WI-T.COM signature unverified",
    "パックの中身の一覧（digest）は合いましたが、この環境では署名そのものを確かめられませんでした。",
    "The list of the pack's contents (digest) matched, but the signature itself could not be checked in this environment."),
  B4: badge("INVALID_MODIFIED", "WI-T.COM署名無効・改変あり", "WI-T.COM signature invalid · Modified",
    "SAKU Builder で編集したため、元の WI-T.COM の署名とは合わなくなりました。元のパックの版は履歴に残っています。",
    "It was edited in SAKU Builder, so it no longer matches the original WI-T.COM signature. The original version of the pack is kept in the history."),
  B5: badge("INVALID_MODIFIED", "WI-T.COM署名無効・改変あり", "WI-T.COM signature invalid · Modified",
    "パックのキャラクターを編集したものです。目録には元のパックとして「{pack}」と書かれていますが、この ZIP に署名は無く、元のパックかどうかは確かめていません（自己申告）。元のパックの使用条件が続きます。再配布はできません。",
    "An edited pack Character. The manifest names “{pack}” as the original pack, but this ZIP has no signature, and whether it really comes from that pack has not been checked (self-reported). The original pack's terms of use still apply. It may not be redistributed."),
  B6: badge("NONE", "WI-T.COM署名無し・自作", "WI-T.COM signature absent · Self-made",
    "署名の無い、自作のキャラクターの ZIP です。目録にパックの記載はありません。出どころは確かめていません。",
    "A self-made Character ZIP with no signature. The manifest does not name a pack. Its origin has not been checked."),
  B7: badge("NONE", "WI-T.COM署名無し・自作", "WI-T.COM signature absent · Self-made",
    "署名の無い個別のファイル（.yaml／.json）です。出どころを書く場所が無いため、パックを編集したものかどうかは分かりません。",
    "A single file (.yaml or .json) with no signature. It has no place to record its origin, so whether it is an edited pack Character is not known."),
  B8: badge("NONE", "WI-T.COM署名無し・自作", "WI-T.COM signature absent · Self-made",
    "この SAKU Builder で新しく作ったキャラクターです。署名はありません。",
    "A Character newly created in this SAKU Builder. It has no signature."),
  B9: badge("CANDIDATE", "AMU Studio からの依頼・候補", "Request from AMU Studio · Candidate",
    "AMU Studio から届いた編集の依頼です。正本には自動で当てず、候補として置いています。",
    "An edit request received from AMU Studio. It is not applied to the authoritative version automatically; it is kept as a candidate."),
});

export const UNKNOWN_LABEL = Object.freeze({ ja: "出どころ不明", en: "Origin unknown" });

const FILE_SOURCES = new Set(["FILE", "FILE_REPAIRED"]);

/** { id: "B1".."B9" | null, class } for a list row. Never a valid badge for anything not passed. */
export function badgeFor(entry) {
  const origin = originOf(entry);
  let id = null;
  if (origin.kind === "PACK") {
    if (origin.signature_state === "PASS") id = origin.pack_id === SAMPLE_PACK_ID ? "B2" : "B1";
    else if (origin.signature_state === "DIGEST_ONLY") id = "B3";
  } else if (origin.kind === "PACK_EDITED") id = "B4";
  else if (origin.kind === "SELF_MADE_ZIP_EDITED") id = "B5";
  else if (origin.kind === "SELF_MADE") {
    const source = entry && entry.source;
    id = source === "SELF_MADE_ZIP" ? "B6" : FILE_SOURCES.has(source) ? "B7" : "B8";
  } else if (origin.kind === "AMU_RETURN") id = "B9";
  return { id, class: id ? BADGES[id].class : "UNKNOWN", pack_id: origin.pack_id || "" };
}

const lang = locale => (locale === "en" || locale === "en-US" ? "en" : "ja");

export function badgeLabel(id, locale = "ja") {
  return id && BADGES[id] ? BADGES[id].label[lang(locale)] : UNKNOWN_LABEL[lang(locale)];
}

export function badgeDescription(id, locale = "ja", { pack = "" } = {}) {
  if (!id || !BADGES[id]) return "";
  return BADGES[id].description[lang(locale)].replace("{pack}", pack);
}
