# SAKU Trainer Unified V1 — Usage & Concept

> ツール: `tools/saku-trainer.html`。評価エンジンは `tools/unified-v1/derived-profile-engine.mjs`（Builder と共有）。

---

## 0. Trainer とは

> **SAKU Builder は人格を作る。SAKU Trainer は人格を試し、磨く。**

SAKU TRAINER は、Character Definition を実際の LLM で試し、**人格再現性・差異・挙動**を評価し、
SAKU 改善 Candidate を作るための試験・調整環境。

AMU との違い: **AMU はその人格に知識と経験、および仕事を与える。** Trainer はそれをやらない
（下記「やらないこと」）。

---

## 1. 製品ループ（今回成立させたもの）

```
SAKU Builder  … 人格を設計
   ↓ Expected Character Profile（設計上の傾向）
SAKU Trainer  … 人格を試す
   ↓ Observed Character Profile（Probe 評価から）
Expected vs Observed 比較
   ↓ 改善 Candidate（parameter 参照の差分説明つき）
SAKU Builder  … 人格を調整
   ↓ New Revision（Human review 後）
```

内部検証: `node scripts/verify_unified_v1.mjs`（LOOP-01..06）でこの一周が成立することを担保。
ブラウザ実機でも load → probe → observed → diff → candidate を確認済み。

---

## 2. 使い方

1. **Character 選択 / 読み込み**: 組み込みサンプル、または Canonical JSON を貼り付け。
2. **Prompt 生成**: Platform（Generic/Claude/Gemini）を選び、Character Prompt + Conformance Probe を生成。
   これを LLM に貼り付けて応答を得る（外部 API を Core 必須にしない。copy/paste で成立する設計）。
3. **Probe 採点 → Observed Profile**: 各 probe の応答を rubric に照らし 0.0–1.0 で採点（人 or rater LLM）。
   `demo: Expected から擬似観測` ボタンは、外部 LLM なしでループを試すための擬似観測（§15 の fixture/mock）。
4. **Expected vs Observed**: trait ごとに Expected（左バー）と Observed（右バー）を比較。⚠ = 乖離（|Δ|≥0.25）。
5. **Difference Explanation → Adjustment**: 乖離を **parameter に戻れる**説明つきで提示し、候補変更を示す。
6. **Builder Candidate**: 改善 Candidate（JSON）を生成。**元 Canonical は変更しない**。

### 2.1 02D UI/UX workflow

現行UIは、外部AIとの copy/paste 往復を次の順序で案内する。

1. Character と観察条件を選ぶ。
2. 現在の未確認領域または矛盾候補から、1つの Conformance Probe を表示する。
3. フルPromptまたは今回の質問だけを1クリックでコピーする。
4. 外部AIの回答を貼り戻す。
5. 回答原文を Evidence として保持し、人が rubric で 0.0–1.0 を採点する。
6. `EXPLICIT / DERIVED / INFERRED / UNKNOWN / CONTRADICTION` を分けてRoundを確認する。
7. Round Summary、Training Summary、Character Impact Previewを確認する。
8. Human Review 5項目を確認後、`SAKU_TRAINER_OBSERVATION_CANDIDATE` をコピーする。

Desktopは Training Progress / Current Round / Trainer Observation の3ペイン。Mobileは3ペインを縮小せず、
1ステップ1画面と下部固定ナビゲーションを使う。

### 2.2 Evidence semantics

- 貼り付けた回答原文の存在は `EXPLICIT`。回答原文からCharacter特性を自動確定しない。
- 人がrubricで付けたscoreから作るObserved傾向は `DERIVED`。
- UIは自動で `INFERRED` を追加しない。
- 回答または人の採点が不足する場合は `UNKNOWN`。Expected値でObservedを補完しない。
- Expectedとの差が0.25以上の場合は `CONTRADICTION` 候補。Canonicalの誤りを意味しない。
- Question Language（ja/en）とUI localeは別状態。どちらもCanonical/digestを変更しない。

### 2.3 Builder Intake envelope

Builder受け渡し用Envelopeは `character_ref / training_session_id / observations / evidence / confidence /
contradictions / unknowns / candidate_adjustments / predicted_character_impact / source_model / source_rounds /
human_review_status` を保持し、共有engineの `BUILDER_CANDIDATE` を内包する。

`canonical_mutation=false` と `predicted_character_impact.behavior_guarantee=false` を明示する。Export完了は
Character更新を意味しない。

---

## 3. Character Conformance（同じ文字列 ≠ 同じ人格）

評価は「同じ文字列を返すか」ではなく **「同じ Character として許容される Behavior か」**。

```
same text ≠ same character
```

見るもの: 判断傾向 / 不確実性への態度 / Character 固有特徴 / 1+7 内部構造 / Human Handoff /
表現傾向 / prohibited drift。

Probe Set（`PROBE_SET`, engine）は上記を測る質問と rubric を持つ。PATHFINDER / Safety / Human Handoff の
probe は挙動契約（PF-01..04）に対応:

- **PB-SAFETY**: Binding Policy を override しない（PF-01）。
- **PB-FWD**: Missing Fact / Risk 時に reversible・smaller path で前進（PF-02/04）。
- **PB-HANDOFF**: Human Required を解除しない（PF-03）。

---

## 4. Derived Metrics（Evaluation であって Canonical ではない）

`internal_tension / opinion_variance / front_flattening / minority_insight_retained / novel_insight_count`
は Trainer 側の **Evaluation**。**Canonical へ自動保存しない**。

```
Probe Result → Evaluation → Change Suggestion → Builder Candidate
```

---

## 5. Trainer → Builder（上書き禁止）

```
SAKU Canonical → TRAINER Probe → Evaluation → Change Suggestion
              → SAKU Builder Candidate → Human review → New Character Revision
```

- **Trainer から Canonical を直接上書きしない**（`buildCandidate` は deep copy し、revision に `-candidate` を付す）。
- 内部テスト LOOP-06 が「Candidate 生成後も元 Canonical 不変」を反証で担保。

---

## 6. Platform 比較

```
Canonical SAKU → Platform-specific Prompt Adapter → Copy/Paste evaluation → Result import
```

同一 SAKU × ChatGPT / Claude / Gemini / Generic の比較に対応できる設計。特定 AI API を Core requirement に
しない。最初から全 Platform API 接続を必須にしない（LLM 差が Character 差より大きい問題は
`INTERNAL_TEST_FINDINGS.md` の Trainer Problems 参照）。

---

## 7. Trainer がやらないこと（AMU 化しない）

禁止: Runtime Long-term Memory / User Memory / 業務 Knowledge 管理 / operational Rules /
Tool execution / Permission / Mandate / Human Binding / Business Workflow / AMU Audit Runtime /
MACHI Organization Runtime。
