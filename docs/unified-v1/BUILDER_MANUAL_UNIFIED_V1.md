# SAKU Builder Unified V1 — Authoring Manual

> これは操作手順書ではなく **Authoring Manual** — 「どの Parameter を変えると、なぜ Behavior が変わるか」を
> Character 設計者が理解するための解説書。ツールは `tools/saku-builder-unified-v1.html`。
> Derived (Expected) Profile の算出は `tools/unified-v1/derived-profile-engine.mjs`（single source）。

---

## 0. SAKU とは何か（境界）

> **SAKU は、AI に人格を与える。SAKU は Portable Character Definition である。**
> **AMU は、その人格に知識と経験、および仕事を与える。**

SAKU Canonical に入れないもの（Builder はこれらを出力しない）:
Runtime Memory / Experience / current Work Context / model selection / Tool permission / Tool execution /
operational Rules / Calibration / **Credential / Mandate / actual Human Binding / endpoint / SLA / routing /
Assignment / Delegation / Approval State** / Audit Runtime / MACHI Organization Runtime。

Builder の出力は `authoring_export`。**実行不可・署名なし**（`execution_eligible: false`）。署名・Memory・
Entitlement・実行コードは下流（Character Pack / AMU）の責務。

---

## 1. Parameter が Behavior に与える方向（全体像）

```
Assistant Composition  → 主に内部で「何を・どう考えやすいか」（思考の形）
15 Axes                → 主にその思考を「どう認知・表現させるか」（認知・表現の方向）
Character Core         → 根本的な人格・価値観・Invariant
Professional Reasoning → 専門家的に「どこを見るか」（資格ではない）
10D                    → optional fine tuning
```

Builder 右ペインの **Expected Character Profile** は、これらの組合せから予測される傾向を表示する。
これは Canonical そのものではなく、設計値からの Preview / Explanation である。

> **重要（能力非保証）**: Expected Strengths / Work Mode Affinity 等は SAKU Character Definition から
> 導出した**設計上の傾向**であり、実際の専門能力・資格・回答正確性・業務成果を保証しない。
> 例: `Legal Analysis affinity ≠ 弁護士資格 ≠ 法的判断能力の保証`。

---

## 2. Character Core（根本人格）

規定するもの: `character_role`（役割の性質）/ `values`（価値観）/ `hard_invariants`（絶対に守る条件）/
`expressive_range`（許される変化と禁止 drift）/ `human_handoff_conditions`（人間に戻す条件）。

- **hard_invariants** は Persona Guard 席の廃止に伴い、逸脱防止の主たる担い手になった（§Seat 参照）。
- **human_handoff_conditions** の `reason_class` は
  `AUTHORITY_REQUIRED / CREDENTIAL_REQUIRED / LEGAL_OR_REGULATORY / SAFETY_CRITICAL /
  EXTERNAL_IRREVERSIBLE / MATERIAL_UNCERTAINTY / CHARACTER_BOUNDARY / OTHER`。
  ここには実 Human 名・endpoint・承認者を入れない（「どの条件で戻すか」まで）。

---

## 3. Assistant Composition（1+7）— 思考の形

新 1+7（Unified V1）。旧 Seat7 = Persona Guard は**廃止**。Persona Guard 責務は
`Character Invariants + Conformance Mechanism` へ移管。

| Seat | Function | Archetype（＝主に内部でどう考えやすいか） |
|---|---|---|
| 1 | FRONT_COORDINATOR | DECISIVE_SELECTOR（一案収束）/ PLURALIST_SYNTHESIZER（少数保持・統合）/ CONTRARIAN_SELECTOR（非主流検討）|
| 2 | SPECIALIST | DEEP_EXPERT（深い専門知）/ SYSTEMS_THINKER（全体構造・因果）/ PRACTITIONER（現場実装性）|
| 3 | FACT_CHECKER | STRICT_VERIFIER（確認済 Fact 重視）/ UNCERTAINTY_MAPPER（不確実性の可視化）/ CONTRADICTION_HUNTER（矛盾探索）|
| 4 | SAFETY_BOUNDARY | GUARDIAN（保守的安全）/ RISK_CALIBRATOR（Risk 比例）/ BOUNDARY_SENTINEL（境界検知）|
| 5 | USER_ADVOCATE | EMPATH（感情理解）/ OUTCOME_CHAMPION（成果最大化）/ OPERATOR_ADVOCATE（現場利用者視点）|
| 6 | RED_TEAM | ADVERSARY（敵対視点）/ FAILURE_HUNTER（失敗様式探索）/ DEVILS_ADVOCATE（意図的反論）|
| 7 | FORWARD_DRIVER | ACCELERATOR（速度・行動量最大化）/ PATHFINDER（制約を変えず Allowed Path 探索）/ STEADY_STEPPER（低 Risk・反復前進）|
| 8 | HUMAN | HUMAN（Logical Human Seat）。intensity を持たない。**AI 化しない。** |

### 各 Archetype の意味・向く用途・Failure tendency（抜粋）

- **DECISIVE_SELECTOR**: 一案へ強く収束。向く: 意思決定・実行。Failure: 収束を急ぎ少数意見を落とす。
- **PLURALIST_SYNTHESIZER**: 少数意見を保持し統合。向く: Facilitation・複雑合意。Failure: 収束しにくい。
- **CONTRARIAN_SELECTOR**: 非主流を意図的に検討。向く: 探索・新規事業。Failure: 逆張りが目的化。
- **STRICT_VERIFIER**: 確認済 Fact 重視。向く: 監査・分析。Failure: 前進が遅れる。
- **UNCERTAINTY_MAPPER**: 既知/未知を分ける。向く: 研究・リスク。Failure: 不確実性を広げ結論が遅れる。
- **GUARDIAN**: 保守的安全確保。向く: 医療情報・信頼性。Failure: 機会を過小評価。
- **ACCELERATOR**: 速度・行動量最大化。向く: 実装推進・営業。Failure: 事実/安全確認が薄くなる。
- **STEADY_STEPPER**: 低 Risk・反復前進。向く: Routine・定型。Failure: 新規探索が弱まる。

（全 Archetype は `assistant-profile.yaml` を正とする。）

### Intensity（LOW / MEDIUM / HIGH）

その席の傾向を**どれだけ強く働かせるか**。`HIGH ≠ Authority`。
高張力（例 GUARDIAN HIGH × ACCELERATOR HIGH）は **MEDIUM へ平均化しない**。Front が統合する。

### Front Control

- **minority_retention**（LOW/MED/HIGH）: 少数意見をどれだけ保持するか。HIGH で多様保持、LOW で圧縮。
- **selection_strength**（LOW/MED/HIGH）: 収束の強さ。HIGH で一案へ強く収束。

`minority_retention HIGH + selection_strength HIGH` は「少数を残しつつ強く収束」で内部張力になる
（Builder が Internal Tension として表示）。

---

## 4. 15 Personality Axes — 認知・表現の方向

| 軸 | 意味 | 表現上の効果 | 認知上の効果 |
|---|---|---|---|
| (a) motif | 象徴 | 雰囲気の基調 | — |
| (b) companion_domain | 伴走の型 | 対話の距離感 | 分解/調律の指向 |
| (c) intelligence_vector | 知の方向 | Logical↔Emotional の軸 | 構造/事実/感情/抽象 のどれで捉えるか |
| (d) socratic_angle | 問いの角度 | 問いの立て方 | Convergent↔Exploratory |
| (e) vocabulary_tone | 語彙 | Hard↔Warm / Direct↔Metaphorical | — |
| (f) acknowledgement | 受け止め方 | 応答の温度 | — |
| (g) pulse | 応答リズム | Quiet↔Energetic | — |
| (h) tactile | 手触り | 質感の比喩 | — |
| (i) thinking_pause_ms | 間（表示専用） | 応答の「溜め」 | ※実推論時間ではない |
| (j) theme_color | 色（表示専用） | 視覚基調 | — |
| (k) whitespace_percent | 余白（表示専用） | 密度 | — |
| (l) weathering（表示専用）| 風合い | 提示の質感 | ※Memory とは無関係 |
| (m) error_narrative | 失敗の語り | 誤り時の語り口 | — |
| (n) crystallization | 結晶化 | Structured↔Associative | 何を「まとめ」とするか |
| (o) closing | 締め | 結びの型 | — |

> **Presentation-only 軸**（a/e/f/g/h/i/j/k/l/m/o）は、Derived Profile の **Thinking / Work-Mode / Strength
> 系トレイトに寄与しない**（`derived-profile-engine.mjs` の `PRESENTATION_AXES`、内部テスト DP-03 が反証で担保）。
> 例: **Theme Color を変えても Strategy 適合は変わらない。**
> (c) intelligence_vector と (d) socratic_angle・(n) crystallization は cognitive/expression 双方に効く。

---

## 5. Professional Reasoning（P01–P08）

専門家らしい「**どこを見るか**」を追加するもの。**Credential ではない。**

```
Professional Reasoning Profile ≠ Credential ≠ Qualification ≠ Authority ≠ Mandate
```

Canonical に含む: `profile_id / profile_version / profile_display_name / status=REASONING_PROFILE_ONLY /
issue_spotting / reasoning_tendencies / evidence_focus / risk_sensitivity / communication_tendencies /
handoff_tendencies / prohibited_claims`。`prohibited_claims` は有資格者・権限を主張しないことの保証。
最終 Character は Profile を resolve して**自己完結**する。

内部テスト DP-05: Professional 付与で Credential/Authority スコアを**生成しない**ことを反証で担保。

---

## 6. 10D

optional fine tuning。既存正式 Schema が取得できる場合のみ従う。取れない場合は `ten_d` を **absent**。
`absent ≠ zero ≠ default`。値を創作しない。

---

## 7. Conformance / BlockerReport / Derived Metrics

- **Conformance**: 人格逸脱検査（`expected_strengths / expected_failure_tendencies / must_preserve /
  prohibited_drift`）。Persona Guard 席の代替。`Character Conformance ≠ Policy Judge ≠ Safety Judge ≠ Approval`。
- **BlockerReport（Brake → Path）**: 止める理由（Binding Policy / Missing Fact / Safety / Failure /
  Human Required / Character Boundary）を示し、抜け道を発明せず安全な次アクションへつなぐ。
  `PATHFINDER / Front は binding_level / source_ref を書き換えない`。
- **Derived Metrics**（internal_tension / opinion_variance / front_flattening / minority_insight_retained /
  novel_insight_count）は **Evaluation であり Canonical 入力ではない**。Trainer 側で算出する。

---

## 8. Assistant Interaction Map（増幅・張力・平準化）

代表的な組合せと現れる傾向:

```
ACCELERATOR × CONTRARIAN_SELECTOR × DEVILS_ADVOCATE → 大胆案（前進×逆張り×反論）
PATHFINDER  × FAILURE_HUNTER      × PRACTITIONER    → 障害から現実的な迂回策
STEADY_STEPPER × STRICT_VERIFIER  × BOUNDARY_SENTINEL → 定型・規制作業（精密・低分散）
EMPATH      × PLURALIST_SYNTHESIZER × UNCERTAINTY_MAPPER → Facilitation（受容×多様保持×不確実性可視化）
```

**高張力（平均化しない）**:

```
GUARDIAN HIGH + ACCELERATOR HIGH → 強く前進しつつ安全境界も強く維持（Front が統合）
STRICT_VERIFIER HIGH + ACCELERATOR HIGH → 速度と証拠厳密性の張力
ADVERSARY HIGH + CONTRARIAN_SELECTOR HIGH → 反証が目的化しうる張力
```

**平準化しやすい（避ける）**: Seat1–7 が全 MEDIUM → 優等生化（中庸集中）。Builder が Diversity Warning を出す。

**Failure Tendencies（Builder が Expected に表示）**:
- 全 MEDIUM → 平準化。
- GUARDIAN HIGH + STRICT_VERIFIER HIGH + STEADY_STEPPER HIGH → Explore 低下。
- ACCELERATOR HIGH + DECISIVE_SELECTOR HIGH + Fact influence LOW → 速度優位（事実軽視）。
- ADVERSARY HIGH + CONTRARIAN_SELECTOR HIGH + CONTRADICTION_HUNTER HIGH → 反対目的化。

---

## 9. Derived Profile の計算思想（説明可能性）

Builder は `Derived Trait → Why → Source Parameters` を辿れる形で表示する（ブラックボックス score を出さない）。
例:

```
Strategic / Structural tendency: HIGH
  主要根拠: SYSTEMS_THINKER HIGH / DECISIVE_SELECTOR HIGH / STRUCTURAL_LOGIC
```

算出は heuristic（科学的能力測定ではない）。Parameter → Behavior Map は `PARAM_BEHAVIOR_MAP`
（`derived-profile-engine.mjs`）に明示。Parameter を1つ変えると関連 Trait のみ合理的に変化する
（内部テスト DP-02）。

---

## 10. リアルタイム Preview の読み方（例）

```
Seat7  PATHFINDER MEDIUM → ACCELERATOR HIGH
  ⇒ Forward Progress ↑ / Decision Speed ↑ / reversible-path 探索 ↓
     Risk: Fact/Safety の Influence が弱い構成では前進性が過剰になりうる
```

```
(e) WARM_EMBRACING → SHARP_MINIMAL
  ⇒ 内部 Assistant Composition は不変。外部表現がより直接的・簡潔に。
```

---

## 11. やってはいけない（Builder 不変条件）

- Seat8（人間）を AI 化しない。`self_expand` を許可しない。
- `delivery_boundary` を緩めない（`authoring_export` / `execution_eligible:false` は常に真）。
- Runtime Memory / Tool / AMU 機能を Builder に入れない。
- Expected Strength を能力・資格の保証と書き換えない。
