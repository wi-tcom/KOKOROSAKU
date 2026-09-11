# f.html UI Mock → 現行実装 対応表（§22）

> `f.html` は別 AI が作成した **High-Fidelity UI Mock**（UI/UX/Layout/Interaction reference のみ）。
> 機能・Schema・Domain・Derived 計算・Trainer Logic・Character 仕様は **現行実装＋最新 SAKU vNext 仕様が正本**。
> Mock の Character 値・Help 文・Derived 数値・計算式・64体は Production へ持ち込まない（§20）。

| f.html UI element | 現行実装 | 分類 |
|---|---|---|
| Warm editorial palette（off-white/charcoal/moss/amber, thin border, whitespace） | Builder/Trainer の :root トークン | RESTYLE |
| Header（identity / rev / status badge / lang / Quick Profile / Commit） | Builder ヘッダ（既存: 言語+About） | RESTRUCTURE_UI |
| Section Navigation（Core/1+7/Expression/Professional/Expected/Conformance/Diff/Completion） | 既存は単一 2ペイン。機能は collect()/validate()/engine に存在 | RESTRUCTURE_UI |
| Character Catalog（Gallery/Compact/Table + category filter） | Builder に Catalog **ビューア**を追加。Catalog **データは OSS 非同梱**（NOT_SPECIFIED・別管理）。Import で読み込み | UI_MISSING（viewer 追加）/ CONNECT（Import） |
| Catalog の Mock 64 Character | **不使用**。かつ実 64 Catalog も **同梱しない**（事業構造：基盤ソフトのみ Open）。空状態＋Import 案内 | NOT_APPLICABLE（mock も実データ同梱もしない） |
| Seat Row / Accordion（1+7） | 既存 seat 編集（compact grid、archetype+intensity） | RESTRUCTURE_UI |
| Seat8 = HUMAN 固定行 | 既存 Seat8 HUMAN/HUMAN 固定 | KEEP（Mock の Owner/Delegation 等は不採用） |
| Intensity buttons（LOW/MEDIUM/HIGH） | 既存 intensity select | RESTYLE |
| 15 Axes（Group + Card + Segmented choice） | 既存 axes select grid（enum は現行 Schema） | RESTYLE/RESTRUCTURE_UI |
| Core 編集（Text/Textarea/Choice/Tag/Help） | 既存 identity/purpose/core フィールド | RESTYLE |
| ⓘ Help Popover（Meaning/Behavior/Example/Interaction/Caution） | 既存 `help-registry.mjs` + i18n（正本 Help） | KEEP/RESTYLE（Mock Help 文は不採用） |
| Quick Profile Drawer | 既存 Expected（常設右ペイン）を Drawer 化 | RESTRUCTURE_UI/CONNECT |
| Full Expected（独立 Section, Why→Source） | 既存 `deriveExpectedProfile()`（engine, 正本） | CONNECT（Mock の Exploration/Precision 数値・式は不採用） |
| Professional（選択 + Boundary Notice + 10D） | 既存 professional_reasoning / ten_d | RESTYLE |
| Conformance（一覧 PASS/CHECK） | 既存 validate()（構造検証） | CONNECT（Mock の PASS 結果は不採用） |
| Diff（before/after + Expected impact） | 既存 canonical + engine で算出（baseline 対現在） | CONNECT（Mock Diff 内容は不採用） |
| Completion/Export（Export for LLM / Test in Trainer / Use with KOKOROAMU） | 既存 generatePrompt/JSON/YAML export、Trainer tool | CONNECT（KOKOROAMU は未実装の Next Step 表示のみ） |
| Builder → Trainer 導線 | 既存 `saku-trainer-vnext.html` | CONNECT |
| SAKU → KOKOROAMU 導線 | 未実装連携。Completion 付近の控えめな Next Step | UI_MISSING（実装済みに見せない） |
| ja-JP / en-US 切替 | 既存 i18n（`i18n.mjs` + locales JSON） | KEEP（Mock の i18n JS は不採用） |
| 1+7 Structure 図（modal） | 補助 Visualization（Character 内部構造 + Human Handoff 境界の可視化） | UI_MISSING（補助のみ・常設 Editor にしない） |
| Trainer 全体 Architecture | 既存 Expected→Probe→Observed→Diff→Suggestion→Candidate | KEEP（共有 engine は変更せず、02D の段階UIへ接続） |
| Trainer Desktop | Training Progress / Current Round / Trainer Observation の3ペイン | RESTRUCTURE_UI |
| Trainer Mobile | 1ステップ1画面 + 下部固定 Back/Next | RESTRUCTURE_UI |
| Copy/Paste | Full Prompt / Question / Evaluation / Summary / Candidate の個別コピー、回答Paste/Clear | CONNECT |
| Evidence分類 | EXPLICIT / DERIVED / INFERRED / UNKNOWN / CONTRADICTION、回答原文provenance | CONNECT（ObservedはHuman rubric採点のみ） |
| Impact / Export | Current vs Candidate vs Predicted、Human Review gate、Observation Candidate envelope | CONNECT（Canonical非変更・動作保証なし） |

## UI_INTEGRATION_GAP（Domain Contract は変更しない・報告のみ）

- 現状なし（UI は既存 collect()/validate()/engine/i18n/help に接続。Schema/Domain 変更なし）。
