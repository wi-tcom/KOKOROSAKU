# Bundled Character Data — License scope

SAKU Builder に同梱される **Character Data** は、Builder の **コード（MPL-2.0）とは別 License scope** です。
ソフトウェアコードのライセンスを Character Data に自動適用しません。

| 同梱データ | 種別 | License |
|---|---|---|
| `tools/unified-v1/sample-pack/sample-characters.json` | Built-in Sample Pack（3 Full Character） | **CC0-1.0**（Owner D-B3、2026-09-14）|
| `tools/unified-v1/preview/catalog-preview-index.json` | Commercial 64 の Preview Index（discovery のみ・LOCKED） | **`NOT_SPECIFIED`**（別 scope）|
| `tools/unified-v1/fixtures/*.json` | synthetic テスト入力（実 Character ではない） | コード（MPL-2.0）に従うテストデータ |

- **含めないもの**（Builder 非同梱）: Commercial 64 の **Full Canonical**（1+7・15 Axes・Professional Reasoning 本文・
  Values/Invariants・Prompt）、Owner Packs（ERABAZU Workshop / WI-T.COM Support）の全データ。
- Preview Index からは Full Canonical を **復元できない**（discovery 項目のみ）。
- Sample Pack / Preview の Character Data の再配布・改変・商用利用の可否は権利者（WI-T.COM / TokyoWireless）の
  別途決定に従う（現時点 `NOT_SPECIFIED`）。**MPL-2.0 とは別。**
