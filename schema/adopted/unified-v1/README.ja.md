# SAKU Unified Schema V1 — 公開セット

> **日本語参考訳**です。Canonicalな文書は[英語README](./README.md)です。

> `PUBLIC / v0.1.0-beta.1 (Pre-release) / wi-tcom/KOKOROSAKU`

このディレクトリは、唯一のActive SAKU Character Schemaのための、範囲を限定した公開Candidateセットです。

本日本語参考訳は、[Creative Commons Attribution 4.0 International（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)で提供されます。

## Active Schema

```text
ACTIVE_SCHEMA = SAKU_UNIFIED_SCHEMA_V1
CANONICAL_SOURCE = wi-tcom/-SAKU-1-7-Character-System
CANONICAL_SOURCE_REVISION = 9ec8ed5f15465c5b3cc59c003f22780310f14ecb
SCHEMA_PATH = schemas/saku-unified-character.v1.schema.json
PUBLIC_CANDIDATE_PATH = schema/adopted/unified-v1/saku-unified-character.v1.schema.json
SCHEMA_SHA256 = 48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817
```

Schemaのbytesはexactです。埋め込まれたFrozen Candidateのlifecycle labelは履歴上のbytesであり、`ADOPTION_STATUS.json`が参照するexact Owner adoption recordが、このexact digestに限って現在のCanonical statusを確立します。

旧形式のsourceは`MIGRATION_SOURCE_ONLY`であり、この公開Candidateセットには含まれません。非公開のmigration／provenance sourceはCanonical source repositoryに保持されます。

## 公開support artifact

- `field-classification-metadata.json`
- `15-axes-layer-mapping.tsv`
- `input-integrity-invariant.json`
- `internal-consistency-semantic-contract.json` — runtime activationは引き続きhold
- `digest-profile.schema.json` — support Candidate。個別にはadoptedではない
- `character-extension.v1.schema.json` — Schemaのabsolute Character Extension `$ref`に対応するexact bundled resolver target

公開support contractはartifact identityとSHA-256 referenceを使用し、local filesystem pathを含みません。同梱はInternal Consistency runtime behaviorをactivateしません。

64alphaのruntime、package、catalog-release、digest-profile、overlay contractは、この公開Candidateセットには同梱されません。Character Schema内のannotationは、implementation、Authority derivation、network retrieval、自動activationを許可しません。任意の`extensions` propertyをvalidateするために同梱される唯一のdependencyは`character-extension.v1.schema.json`です。`ADOPTION_STATUS.json`はabsolute `$ref` URIを、このexact local artifactおよびdigestへbindします。

## Seat 7 — 人格・ブランド整合の補助

```text
function = PERSONA_BRAND_GUARD_ASSISTANT
label_ja = 人格・ブランド整合の補助
responsibilities =
  PERSONA_CONSISTENCY
  VOICE_CONSISTENCY
  VALUE_CONSISTENCY
  ROLE_SCOPE_CONSISTENCY
  PROHIBITED_DRIFT
  QUALIFICATION_AUTHORITY_MISREPRESENTATION_DETECTION
  UNAUTHORIZED_PERSONA_CHANGE_DETECTION
```

Seat 7の固定functionは、archetype、intensity、Authority、policy role、approval roleではありません。

```text
x-wit-boundary =
Persona/Brand Guard complements machine Conformance.
It does not issue authority, policy, approval, credential, qualification, or mandate.
```

## 境界

- Character definitionはAuthority、Approval、Credential、Mandate、assignment、routing、runtime Human Bindingではありません。
- SAKUはsemantic contractを定義し、AMUはactual runtime valueとbindingを所有します。
- BuilderとTrainerはtoolであり、Canonical Authorityではありません。
- Publication authorizationは、merge、release、tag作成、publication executionを許可しません。

3体のCC0 Sample Characterは、`samples/oss-launch/unified-v1/`配下で個別にvalidateされたUnified V1 Candidate instanceとして管理されます。
