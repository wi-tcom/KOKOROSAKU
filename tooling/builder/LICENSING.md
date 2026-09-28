# Licensing overview — SAKU Builder / SAKU Trainer

This repository and its release artifacts contain material under different
licenses. Code, documentation, Character data, trademarks, and third-party
components must not be treated as one license scope.

| Material | License | Evidence |
|---|---|---|
| Builder/Trainer and desktop-host code | MPL-2.0 | [LICENSE](LICENSE) |
| Public documentation | CC BY 4.0 | [LICENSE-DOCS.md](LICENSE-DOCS.md) |
| SAKU logo/icon artwork, 著作権が及ぶ範囲において | CC BY 4.0 | [BRAND-ASSET-NOTICE.md](BRAND-ASSET-NOTICE.md) |
| Third-party components | Per-component licenses | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |
| SAKU/KOKOROSAKU/KOKOROAMU/WI-T names and marks | Not licensed by the code/document licenses | [TRADEMARK.md](TRADEMARK.md) |

## SAKU Builder Public Preview scope

The source commit, the installer SHA-256 and the resource profile of each
version are recorded in `docs/releases/<version>/` (`SHA256SUMS`,
`resource-profile.json` and `BUILD_ENVELOPE.json`). This document is
included in the installer, so it cannot state the SHA-256 of the installer
that contains it.

- resource profile: `public-oss`
- distribution boundary: `PUBLIC_OSS_CANDIDATE`

The public artifact contains the public Builder/Trainer/desktop-host code,
approved offline help, public manuals, and public license/notice documents.
Its resource profile has `internal_content_count = 0`.

### Resources included in or excluded from the public artifact

| Resource | Public Preview status | Reason |
|---|---|---|
| Built-in Sample Pack | INCLUDED | The installer bundles sample pack 1.1.0 (three sample-mode Characters) under `LicenseRef-WIT-Sample-1.0`, which is not an OSS license; the terms are in the `LICENSE.md` inside the pack ZIP (decision `D-20260924-sample-pack-1-1-0`). It is not included in the ZIP version you try without installing. |
| 64 Preview Index | NOT_INCLUDED | Character Catalog licensing/publication scope is separate. |
| commercial-preview | NOT_INCLUDED | License/publication authority is not specified. |
| Sample3 | NOT_INCLUDED | `Sample3` is the three open-source sample Characters (CC0-1.0, D-B3), which are no longer distributed as samples (decision `D-20260924-oss-samples-retired`) and are not in the installer. Their data remains in the source and the public tree as test material and stays under CC0-1.0. |
| Full Commercial 64 Character Catalog | NOT_INCLUDED | License is `NOT_SPECIFIED`; separately managed. |
| Owner Packs (ERABAZU 5 / WI-T.COM 3) | NOT_INCLUDED | Separately managed; not part of this public artifact. |
| Commercial AMU | NOT_INCLUDED | Separate product and license scope. |

No absent or internal-only document is incorporated by reference.

## Additional boundaries

- Synthetic test fixtures in source are test inputs, not a Character Catalog product.
- Documentation examples do not grant rights in separately managed Character data.
- MPL-2.0 applies file-by-file to covered code and does not grant trademark rights.
- Character Catalog material remains `NOT_SPECIFIED` unless separate authoritative
  license evidence says otherwise.
- Public Preview is a distribution state, not Canonical Adoption, Authority,
  Approval, Release execution, or Production status.
