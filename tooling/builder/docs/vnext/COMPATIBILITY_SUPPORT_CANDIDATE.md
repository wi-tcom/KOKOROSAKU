# Compatibility validation and support bundle Candidate

Status: IMPLEMENTED_CANDIDATE  
Canonical adoption: NOT_EXECUTED  
Runtime coupling: NONE

## Validation model

Validation is deterministic and uses three explicit layers:

1. `STRUCTURAL_VALIDATION` — input shape and required identity.
2. `DETERMINISTIC_CONFORMANCE` — exact supported schema/version and known-field contracts.
3. `AUTHORING_POLICY_CONFORMANCE` — support-safe authoring guidance and external-evidence boundaries.

Result states are not interchangeable:

- `INVALID`: the supplied structure is deterministically invalid.
- `UNKNOWN`: required identity/context is unresolved.
- `UNSUPPORTED`: the supplied construct is known to lack a Builder support contract.
- `NOT_CONFIGURED`: an optional declaration/evidence source is absent.
- `EXTERNAL_EVIDENCE_REQUIRED`: Builder cannot verify the claim and requires evidence from its semantic owner.

Severity is a display priority and is separate from result state. No generic `ERROR` result replaces these meanings.

Every issue contains:

`code`, `severity`, `status`, `path`, `reason`, `semantic_owner`, `validation_layer`, `expected_behavior`, `suggested_correction`, `ai_inference_permitted`, and `human_decision_required`.

Deterministic validation always sets `ai_inference_permitted=false`.

Imported unsupported fields are retained as uninterpreted source data. The Builder does not rewrite an imported schema version or Character/catalog revision to a locally supported value. Explicitly removing a supported optional field removes only that field; unrelated unsupported extension data remains intact. Preservation is not support, validity, or Canonical adoption.

## `support_bundle.json`

Contract: `schemas/support-bundle.candidate.schema.json`  
Example: `examples/support_bundle.json`

The generated bundle contains Builder/schema/platform identification, validation summary and codes, compatibility result, summarized extension declarations, unsupported features, sanitized error context, and provenance.

It excludes the full Character and therefore excludes Character memory/content by default. Recursive sanitization also removes values under secret/private key names such as API key, password, token, secret bytes, private key, personal memory, and private conversation. An `owner_private_hint` value is never exported; only its presence can be reported.

The bundle is diagnostics, not Canonical, approval, execution permission, trust evidence, or a verified provenance record.

## Opaque Extension authoring

The UI supports `OPAQUE_REFERENCE_ONLY` behind an explicit local feature gate. Output is a separate Candidate overlay with `canonical=NO` and `canonical_export_included=false`.

The Builder may record declared capabilities and Character-level `may_enable` possibilities, but neither means runtime availability, verification, entitlement, Authority, Approval, or execution authorization. `owner_private_hint` is preserved opaquely and marked `DO_NOT_INTERPRET`.

Signed, encrypted, and entitlement-bound capsule authoring is outside this phase. Signature metadata in imported data is reported as requiring external verification evidence; the Builder does not perform or claim cryptographic verification.

## Basic Skill readiness

Basic Skill output is a separate Future Candidate overlay. It contains `claim_scope=DESIGN_TENDENCY_ONLY`, `verified_competence=NOT_CLAIMED`, and a separate Trainer observation initialized to `NOT_TESTED`.

No Basic Skill field is inserted into Character Canonical export before Canonical adoption.

Candidate overlays bind to the current form using an explicitly labeled `BUILDER_DISPLAY_DIGEST` (`FNV1A32`). It is a local change-detection aid, not a cryptographic digest, signature, provenance proof, or integrity claim.

## ERABAZU coordination boundary

The field concepts—stable codes, explicit states, sanitized context, provenance, and unsupported-feature explanation—can be aligned with ERABAZU diagnostics. There is no import, package dependency, shared runtime module, network call, or repository write coupling.
