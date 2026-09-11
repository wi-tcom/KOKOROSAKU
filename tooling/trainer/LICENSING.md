# Licensing overview — SAKU Builder / SAKU Trainer

このリポジトリは **複数のライセンスが混在**します。**コード・ドキュメント・Character Catalog・商標を同一
ライセンスとして扱いません。** 適用範囲を取り違えないでください。

| 対象 | ライセンス | 場所 |
|---|---|---|
| **コード**（`tools/`, `scripts/` の実装、`.mjs` / `.html` / `.py` 等） | **MPL-2.0**（Mozilla Public License 2.0） | [`LICENSE`](LICENSE) |
| **ドキュメント**（`docs/`, `README.md`, `*.md` の解説文） | **CC BY 4.0** | [`LICENSE-DOCS.md`](LICENSE-DOCS.md) |
| **Character Catalog**（SAKU Core 側 `catalogs/vnext/` の 64 Character 定義・profile） | **`NOT_SPECIFIED`**（未確定・本 OSS 配布に含めない） | — |
| **商標 / 名称 / ロゴ**（SAKU / KOKOROSAKU / KOKOROAMU / WI-T 等） | ライセンスされない（別扱い） | [`TRADEMARK.md`](TRADEMARK.md) |

## 事業構造：基盤ソフトは Open、Catalog / 商標 / 商用 AMU は別

**SAKU の基盤ソフト（Builder / Trainer）は Open（MPL-2.0）にするが、Character Catalog・商標・商用 AMU を
一緒に Open 化しない。** 本 OSS 配布物（このリポジトリ）には次を **含めない**：

| 含めないもの | 位置づけ |
|---|---|
| **Commercial 64 Character Catalog の Full Canonical**（1+7・15軸・Professional 本文・Values/Invariants・Prompt） | ライセンス `NOT_SPECIFIED`・**別途決定・別管理**。SAKU Core 側にあり、MPL/CC は適用しない。**本リポジトリに Full Canonical を同梱しない**（購入後の Pack Import で解放）。 |
| **同梱される Character Data**（exact three OSS Sample Character data） | **CC0-1.0**。対象は `sample-general-compass` / `sample-erabazu-bridge` / `sample-wit-guide` のデータのみ。他のCharacter dataおよびTrademark/Logo rightsは含まない。 |
| **商標 / 名称 / ロゴ**（KOKOROSAKU / SAKU / KOKOROAMU / WI-T 等） | ライセンスされない。**Trademark / Brand policy として別管理**（[`TRADEMARK.md`](TRADEMARK.md)）。 |
| **商用 AMU**（知識・経験・継続的な仕事を与える上位製品） | 本 OSS 配布に含まれない**別製品・別ライセンス（商用）**。Builder/Trainer は AMU 機能を持たない。 |

補足:

- リポジトリ内の `tools/vnext/fixtures/*.json` は **合成（synthetic）テスト入力**であり、Character Catalog 製品ではない
  （実在 Character の identity を含まない）。ライセンスはコード（MPL-2.0）に従う。
- ドキュメント中に Character 名を例示することがあるが、それは解説（CC BY 4.0）であって Catalog データの配布ではない。
- **MPL-2.0 はファイル単位のコピーレフト**です。改変ファイルの Source を同ライセンスで提供する義務があります
  （詳細は `LICENSE`）。**MPL-2.0 §6 は商標権を付与しません** — 商標は上表のとおり別扱いです。
- **Character Catalog License は `NOT_SPECIFIED`** のまま。勝手に MPL や CC を適用しないでください。
- 第三者コンポーネントの表示は [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。帰属表示は [`NOTICE`](NOTICE)。
