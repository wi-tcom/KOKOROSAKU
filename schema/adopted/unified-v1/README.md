# SAKU Unified Schema V1 — Public Candidate Set

> `PUBLICATION_CANDIDATE / NOT_RELEASED / NOT_PUBLISHED`

This directory is the bounded public candidate set for the sole Active SAKU Character Schema.

## Active schema

```text
ACTIVE_SCHEMA = SAKU_UNIFIED_SCHEMA_V1
CANONICAL_SOURCE = wi-tcom/-SAKU-1-7-Character-System
CANONICAL_CANDIDATE_SOURCE_REVISION = PR21_HEAD_AFTER_P1_COMMITS
SCHEMA_PATH = schemas/saku-unified-character.v1.schema.json
PUBLIC_CANDIDATE_PATH = schema/adopted/unified-v1/saku-unified-character.v1.schema.json
SCHEMA_SHA256 = 48a7241dac4653c94b0cb82971697deb804c23999548cb9c6b64563813bba817
```

The schema bytes are exact. Embedded Frozen Candidate lifecycle labels are historical bytes; the exact Owner adoption record referenced by `ADOPTION_STATUS.json` establishes the current Canonical status for this exact digest only.

Legacy source formats are `MIGRATION_SOURCE_ONLY` and are not included in this public candidate set. Private migration/provenance sources remain in the Canonical source repository.

## Public support artifacts

- `field-classification-metadata.json`
- `15-axes-layer-mapping.tsv`
- `input-integrity-invariant.json`
- `internal-consistency-semantic-contract.json` — runtime activation remains held
- `digest-profile.schema.json` — support Candidate; not separately adopted
- `character-extension.v1.schema.json` — exact bundled resolver target for the schema's absolute Character Extension `$ref`

The public support contract uses artifact identity plus SHA-256 references and contains no local filesystem path. Inclusion does not activate Internal Consistency runtime behavior.

The 64alpha runtime, package, catalog-release, digest-profile, and overlay contracts are not bundled in this public Candidate set. Their annotation in the Character Schema does not authorize implementation, Authority derivation, network retrieval, or automatic activation. The only bundled dependency required to validate the optional `extensions` property is `character-extension.v1.schema.json`; `ADOPTION_STATUS.json` binds the absolute `$ref` URI to that exact local artifact and digest.

## Seat 7

```text
function = PERSONA_BRAND_GUARD_ASSISTANT
responsibilities =
  PERSONA_CONSISTENCY
  VOICE_CONSISTENCY
  VALUE_CONSISTENCY
  ROLE_SCOPE_CONSISTENCY
  PROHIBITED_DRIFT
  QUALIFICATION_AUTHORITY_MISREPRESENTATION_DETECTION
  UNAUTHORIZED_PERSONA_CHANGE_DETECTION
```

Seat 7's fixed function is not an archetype, intensity, authority, policy role, or approval role.

```text
x-wit-boundary =
Persona/Brand Guard complements machine Conformance.
It does not issue authority, policy, approval, credential, qualification, or mandate.
```

## Boundaries

- Character definition is not Authority, Approval, Credential, Mandate, assignment, routing, or runtime Human Binding.
- SAKU defines semantic contracts; AMU owns actual runtime values and bindings.
- Builder and Trainer are tools, not Canonical Authority.
- Publication authorization does not authorize merge, release, tag creation, or publication execution.

The three CC0 Sample Characters are maintained as separately validated Unified V1 Candidate instances under `samples/oss-launch/unified-v1/`.
