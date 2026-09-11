# SAKU Builder readiness inventory

Status: IMPLEMENTED_CANDIDATE  
Canonical: NO  
Builder baseline: `wi-tcom/-SAKU-builder@15e7e04e31873952fd80f85135e21d20d42ad797`  
Observed SAKU Canonical main: `wi-tcom/-SAKU-1-7-Character-System@7dfed945959bd90b877f3d98e0203d6fd8f57ee6` (GitHub, 2026-08-21)  

The Builder is an authoring, editing, validation, and explanation tool. It is not Canonical Authority, an Authority/Credential issuer, a Human Approval system, or an AMU/MACHI runtime.

## SUPPORTED_NOW

- `saku.character` / `vnext-1.0` identity and version are retained and displayed.
- Current vNext Character authoring, deterministic structural checks, Expected Profile explanation, JSON/YAML/prompt export, Sample Pack, and locked catalog preview remain supported.
- Compatibility results preserve `INVALID`, `UNKNOWN`, `UNSUPPORTED`, `NOT_CONFIGURED`, and `EXTERNAL_EVIDENCE_REQUIRED` as different states.
- Imported unsupported fields and source schema/revision identity are preserved without interpretation; supported edits are overlaid without silently migrating the source.
- Issues expose code, severity, path, reason, semantic owner, validation layer, expected behavior, suggested correction, AI-inference permission, and Human-decision requirement.
- A sanitized, non-authoritative `support_bundle.json` can be generated without the full Character or private/secret values.
- Existing OSS delivery documents remain present: MPL-2.0 code, CC BY 4.0 docs, trademark separation, security and contribution guidance. Character Catalog data remains a separate `NOT_SPECIFIED` scope.

## PARTIAL_SUPPORT

- Opaque Extension: `OPAQUE_REFERENCE_ONLY` can be authored only as an explicit, feature-gated Candidate overlay. It is never inserted into the Character Canonical export. The Builder does not interpret `owner_private_hint` and does not verify signatures, issuers, entitlement, Authority, Approval, or execution authorization.
- Basic Skill: a future `Basic Skill Tendency` draft can be authored only as a separate Candidate overlay. It is a design tendency, not verified competence; Trainer observations remain separate and start as `NOT_TESTED`.
- Provenance: the Builder displays supplied session/source provenance and preserves absence as `NOT_CONFIGURED`. It does not manufacture authoritative source evidence.
- Operational Integrity: the issue model and deterministic validation layers are compatible with the Candidate principles, but no OI profile is adopted or evaluated by Builder.

## MISSING

- An adopted Character-level compatibility declaration contract and strict unknown-field policy.
- Adopted Opaque Extension placement and schema version.
- Adopted Basic Skill identity, controlled vocabulary, migration, and Trainer observation contract.
- Adopted Operational Integrity profile/version and conformance evidence contract.
- Cryptographic signature verification and issuer/key trust evaluation. These are external-owner evidence, not Builder inference.
- A release decision that closes the existing release/publication governance task.

## BLOCKED_BY_CANONICAL

- Adding `opaque_extensions` to Character Canonical exports.
- Treating an Opaque declaration as valid under an adopted Character schema.
- Adding Basic Skill fields to Character Canonical or presenting tendency as competence.
- Declaring OI overall PASS or embedding an OI profile in Character Canonical.
- Auto-migrating existing Characters, changing Character digests/revisions, or selecting an unknown-field behavior for strict readers.

Observed Candidate state is not adoption evidence:

- Opaque Extension Draft PR #6 head `27f95dd4d25cbab9412ce4b5afc25324560f5c44`.
- Operational Integrity Draft PR #4 head `1b7142e44afb65111ddff791e195aaa28a751e0e`.

## SAFE_TO_IMPLEMENT_NOW

- Deterministic compatibility inspection without modifying imported Character data.
- Human- and AI-readable diagnostic explanations.
- Sanitized support bundle creation.
- Separate feature-gated Candidate overlays for Opaque Reference and Basic Skill readiness.
- UI visibility of unsupported/unconfigured/external-evidence states.
- Tests proving Candidate data is not inserted into Canonical export and AI inference is not used for deterministic validity.

## OSS launch assessment

The implementation is support-ready as a Candidate, but this inventory does not authorize release or public publication. OSS code/document license surfaces are present; Canonical Candidate adoption and the repository's release governance remain separate decisions.
