# Unified V1 source rename map

Owner decision D-B5 retires the former working name without changing persisted data or handoff contracts. This is a historical migration record; the left column preserves the exact former paths solely to make the rename auditable.

| Former source | Unified V1 source |
| --- | --- |
| `tools/saku-trainer-vnext.html` | `tools/saku-trainer.html` |
| `tools/saku-builder-vnext.html` | `tools/saku-builder-unified-v1.html` |
| `tools/vnext/**` | `tools/unified-v1/**` |
| `docs/vnext/BUILDER_MANUAL_vNext.md` | `docs/unified-v1/BUILDER_MANUAL_UNIFIED_V1.md` |
| `docs/vnext/TRAINER_MANUAL_vNext.md` | `docs/unified-v1/TRAINER_MANUAL_UNIFIED_V1.md` |
| `docs/vnext/VNEXT_DELIVERY_REPORT.md` | `docs/unified-v1/UNIFIED_V1_DELIVERY_REPORT.md` |
| `docs/vnext/**` (all other members) | `docs/unified-v1/**` |
| `scripts/verify_vnext.mjs` | `scripts/verify_unified_v1.mjs` |

All imports, Desktop routes, generated Static destinations, fixtures, relative links, and tests use the right-column paths. Native and Static packaging read explicit manifests from `desktop/resources/manifests/`.

The following contract values are intentionally unchanged and are tested by `scripts/verify_delivery_manifests.mjs`:

- `saku.workspace.active`
- `saku.workspace.draft`
- `saku.workspace.library`
- `saku.desktop.pendingCharacter`
- `saku.desktop.pendingCharacterBinding`
- `saku.desktop.pendingTrainerCharacter`
- `saku.desktop.pendingTrainerCharacterBinding`
- `saku.trainer.ux3`
- `saku.trainer.sessions.*`
- `saku.trainer.pendingChangeCandidates`
- `saku.trainer.pendingChangeCandidateBinding`
- `saku.trainer.builderHandoffContext`

Canonical schema artifacts remain exact-byte copies and are not renamed internally by this source-path migration.
